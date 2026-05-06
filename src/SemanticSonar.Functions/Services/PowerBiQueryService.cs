using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Azure.Core;
using Azure.Identity;
using SemanticSonar.Functions.Models;
using Microsoft.Extensions.Logging;

namespace SemanticSonar.Functions.Services;

/// <summary>
/// Executes DAX queries against customer Power BI semantic models via
/// the Power BI REST API executeQueries endpoint.
/// Tokens are acquired per-customer-tenant using the shared multi-tenant
/// service principal credential (clientId + clientSecret).
/// </summary>
public class PowerBiQueryService
{
    private const string PowerBiScope = "https://analysis.windows.net/powerbi/api/.default";
    private const string ExecuteQueriesBaseUrl = "https://api.powerbi.com/v1.0/myorg";

    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNameCaseInsensitive = true
    };

    private readonly HttpClient _httpClient;
    private readonly KeyVaultService _keyVault;
    private readonly ILogger<PowerBiQueryService> _logger;

    // Per-tenant token cache keyed by tenantId
    private readonly Dictionary<string, (string Token, DateTimeOffset ExpiresOn)> _tokenCache = [];
    private readonly SemaphoreSlim _tokenLock = new(1, 1);

    // Set before each token acquisition so GetTokenForTenantAsync can read it
    private string? _currentTenantClientId;

    public PowerBiQueryService(
        IHttpClientFactory httpClientFactory,
        KeyVaultService keyVault,
        ILogger<PowerBiQueryService> logger)
    {
        // Create one long-lived HttpClient; auth headers are set per-request, not on the client.
        _httpClient = httpClientFactory.CreateClient("powerbi");
        _keyVault = keyVault;
        _logger = logger;
    }

    public async Task<QueryResult> ExecuteQueryAsync(
        SemanticModelConfig model,
        TenantConfig tenant,
        CancellationToken ct = default)
    {
        var token = await GetTokenForTenantWithClientIdAsync(tenant, ct);

        var url = $"{ExecuteQueriesBaseUrl}/groups/{model.WorkspaceId}/datasets/{model.DatasetId}/executeQueries";

        using var request = new HttpRequestMessage(HttpMethod.Post, url);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

        var body = new
        {
            queries = new[] { new { query = model.DaxQuery } },
            serializerSettings = new { includeNulls = true }
        };

        request.Content = new StringContent(
            JsonSerializer.Serialize(body), Encoding.UTF8, "application/json");

        var response = await _httpClient.SendAsync(request, ct);

        if (!response.IsSuccessStatusCode)
        {
            var error = await response.Content.ReadAsStringAsync(ct);
            throw new InvalidOperationException(
                $"Power BI API returned {(int)response.StatusCode}: {error}");
        }

        var responseJson = await response.Content.ReadAsStringAsync(ct);
        return ParseQueryResult(responseJson);
    }

    // ── Token acquisition ────────────────────────────────────────────────────

    private async Task<string> GetTokenForTenantAsync(string tenantId, CancellationToken ct)
    {
        await _tokenLock.WaitAsync(ct);
        try
        {
            // Return cached token if still valid (with 5-minute buffer)
            if (_tokenCache.TryGetValue(tenantId, out var cached)
                && cached.ExpiresOn > DateTimeOffset.UtcNow.AddMinutes(5))
            {
                return cached.Token;
            }

            var clientId = _currentTenantClientId
                ?? throw new InvalidOperationException($"Client ID not set for tenant {tenantId}.");

            var clientSecret = await _keyVault.GetTenantClientSecretAsync(tenantId, ct);

            var credential = new ClientSecretCredential(tenantId, clientId, clientSecret);
            var tokenRequest = new TokenRequestContext([PowerBiScope]);
            var tokenResult = await credential.GetTokenAsync(tokenRequest, ct);

            _tokenCache[tenantId] = (tokenResult.Token, tokenResult.ExpiresOn);
            _logger.LogDebug("Acquired Power BI token for tenant {TenantId}.", tenantId);

            return tokenResult.Token;
        }
        finally
        {
            _tokenLock.Release();
        }
    }

    // ── Browse: list workspaces and datasets ───────────────────────────────

    public async Task<List<PowerBiWorkspace>> ListWorkspacesAsync(
        TenantConfig tenant, CancellationToken ct = default)
    {
        var token = await GetTokenForTenantWithClientIdAsync(tenant, ct);
        // Only /groups without admin query params — returns only workspaces where the SP is a member.
        // Using $filter=type eq 'Workspace' with Tenant.Read.All would list ALL workspaces,
        // including ones the SP cannot query, leading to PowerBIFolderNotFound on executeQueries.
        using var request = new HttpRequestMessage(HttpMethod.Get,
            $"{ExecuteQueriesBaseUrl}/groups?$top=1000");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

        var response = await _httpClient.SendAsync(request, ct);
        if (!response.IsSuccessStatusCode)
        {
            var error = await response.Content.ReadAsStringAsync(ct);
            throw new InvalidOperationException(
                $"Power BI API returned {(int)response.StatusCode}: {error}");
        }

        var json = await response.Content.ReadAsStringAsync(ct);
        var doc = JsonNode.Parse(json);
        var items = doc?["value"]?.AsArray() ?? [];

        return items.Select(w => new PowerBiWorkspace
        {
            Id = w?["id"]?.GetValue<string>() ?? "",
            Name = w?["name"]?.GetValue<string>() ?? "",
        }).ToList();
    }

    public async Task<List<PowerBiDataset>> ListDatasetsInWorkspaceAsync(
        TenantConfig tenant, string workspaceId, CancellationToken ct = default)
    {
        var token = await GetTokenForTenantWithClientIdAsync(tenant, ct);
        using var request = new HttpRequestMessage(HttpMethod.Get,
            $"{ExecuteQueriesBaseUrl}/groups/{workspaceId}/datasets");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

        var response = await _httpClient.SendAsync(request, ct);
        if (!response.IsSuccessStatusCode)
        {
            var error = await response.Content.ReadAsStringAsync(ct);
            throw new InvalidOperationException(
                $"Power BI API returned {(int)response.StatusCode}: {error}");
        }

        var json = await response.Content.ReadAsStringAsync(ct);
        var doc = JsonNode.Parse(json);
        var items = doc?["value"]?.AsArray() ?? [];

        return items.Select(d => new PowerBiDataset
        {
            Id = d?["id"]?.GetValue<string>() ?? "",
            Name = d?["name"]?.GetValue<string>() ?? "",
            ConfiguredBy = d?["configuredBy"]?.GetValue<string>() ?? "",
        }).ToList();
    }

    public async Task<SuggestDaxResponse> SuggestDaxAsync(
        TenantConfig tenant, string workspaceId, string datasetId, CancellationToken ct = default)
    {
        var token = await GetTokenForTenantWithClientIdAsync(tenant, ct);
        var errors = new List<string>();

        // ── Try each table-discovery DAX in order ────────────────────────────
        // Different engine versions / model types support different functions.
        string?[] discoveryQueries =
        [
            // COLUMNSTATISTICS() — most widely supported on Power BI models
            "EVALUATE TOPN(1, COLUMNSTATISTICS())",
            // Same without TOPN in case that's the issue
            "EVALUATE COLUMNSTATISTICS()",
            // INFO.VIEW.TABLES — newer engine versions
            "EVALUATE SELECTCOLUMNS(INFO.VIEW.TABLES(), \"T\", [Name], \"H\", [IsHidden])",
            // INFO.MEASURES — newest engine versions
            "EVALUATE SELECTCOLUMNS(INFO.MEASURES(), \"Name\", [Name], \"IsHidden\", [IsHidden])",
        ];

        foreach (var dax in discoveryQueries)
        {
            try
            {
                var rows = await ExecuteDaxAndGetRows(token, workspaceId, datasetId, dax!, ct);
                if (rows is null || rows.Count == 0) continue;

                var result = BuildSuggestionFromRows(rows, dax!);
                if (result is not null) return result;
            }
            catch (Exception ex)
            {
                errors.Add($"{dax}: {ex.Message[..Math.Min(ex.Message.Length, 100)]}");
                _logger.LogDebug(ex, "Discovery query failed: {Dax}", dax);
            }
        }

        // ── Try REST tables API (push/streaming datasets) ────────────────────
        try
        {
            var result = await TryTablesViaRest(token, workspaceId, datasetId, ct);
            if (result is not null) return result;
        }
        catch (Exception ex)
        {
            errors.Add($"REST /tables: {ex.Message[..Math.Min(ex.Message.Length, 100)]}");
            _logger.LogDebug(ex, "REST tables API failed.");
        }

        // ── Fallback: EVALUATE ROW("Test", 1) ───────────────────────────────
        // This is universally valid DAX that proves the query engine responds.
        _logger.LogWarning("All discovery strategies failed for dataset {DatasetId}. Errors: {Errors}",
            datasetId, string.Join(" | ", errors));

        return new SuggestDaxResponse
        {
            Dax = "EVALUATE\nROW(\"Test\", 1)",
            Description = "Could not discover model tables or measures. This generic query tests connectivity only — customize it to reference your model's tables.",
            IsFallback = true
        };
    }

    /// <summary>
    /// Given discovery rows from any of the DAX introspection queries, build a suggested DAX.
    /// </summary>
    private static SuggestDaxResponse? BuildSuggestionFromRows(JsonArray rows, string sourceQuery)
    {
        // INFO.MEASURES result → use the measure directly
        if (sourceQuery.Contains("INFO.MEASURES"))
        {
            var visible = rows.FirstOrDefault(r => r?["[IsHidden]"]?.GetValue<bool>() != true);
            if (visible is null) return null;
            var name = visible["[Name]"]?.GetValue<string>() ?? "";
            if (string.IsNullOrEmpty(name)) return null;
            return new SuggestDaxResponse
            {
                Dax = $"EVALUATE\nROW(\"Value\", [{name}])",
                Description = $"Evaluates measure '{name}'"
            };
        }

        // INFO.VIEW.TABLES result → pick first non-hidden table
        if (sourceQuery.Contains("INFO.VIEW.TABLES"))
        {
            var visible = rows.FirstOrDefault(r => r?["[H]"]?.GetValue<bool>() != true);
            if (visible is null) visible = rows[0];
            var tableName = visible?["[T]"]?.GetValue<string>() ?? "";
            if (string.IsNullOrEmpty(tableName)) return null;
            var escaped = tableName.Replace("'", "''");
            return new SuggestDaxResponse
            {
                Dax = $"EVALUATE\nROW(\"RowCount\", COUNTROWS('{escaped}'))",
                Description = $"Counts rows in table '{tableName}'"
            };
        }

        // COLUMNSTATISTICS result → extract [Table Name]
        var firstRow = rows[0];
        var table = firstRow?["[Table Name]"]?.GetValue<string>();
        if (string.IsNullOrEmpty(table)) return null;
        var esc = table.Replace("'", "''");
        return new SuggestDaxResponse
        {
            Dax = $"EVALUATE\nROW(\"RowCount\", COUNTROWS('{esc}'))",
            Description = $"Counts rows in table '{table}'"
        };
    }

    // ── REST tables API (push/streaming datasets) ────────────────────────────

    private async Task<SuggestDaxResponse?> TryTablesViaRest(
        string token, string workspaceId, string datasetId, CancellationToken ct)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get,
            $"{ExecuteQueriesBaseUrl}/groups/{workspaceId}/datasets/{datasetId}/tables");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

        var response = await _httpClient.SendAsync(request, ct);
        if (!response.IsSuccessStatusCode)
            throw new InvalidOperationException(await response.Content.ReadAsStringAsync(ct));

        var json = await response.Content.ReadAsStringAsync(ct);
        var doc = JsonNode.Parse(json);
        var tables = doc?["value"]?.AsArray();
        if (tables is null || tables.Count == 0) return null;

        // Look for measures first (present for push/streaming datasets)
        foreach (var table in tables)
        {
            var measures = table?["measures"]?.AsArray();
            if (measures is null || measures.Count == 0) continue;

            var visible = measures.FirstOrDefault(m => m?["isHidden"]?.GetValue<bool>() != true);
            if (visible is null) continue;

            var name = visible["name"]?.GetValue<string>() ?? "";
            return new SuggestDaxResponse
            {
                Dax = $"EVALUATE\nROW(\"Value\", [{name}])",
                Description = $"Evaluates measure '{name}'"
            };
        }

        // No measures found — use COUNTROWS on the first non-hidden table
        var firstTable = tables
            .FirstOrDefault(t => t?["isHidden"]?.GetValue<bool>() != true)
            ?? tables[0];
        var tableName = firstTable?["name"]?.GetValue<string>() ?? "";
        if (string.IsNullOrEmpty(tableName)) return null;

        var escaped = tableName.Replace("'", "''");
        return new SuggestDaxResponse
        {
            Dax = $"EVALUATE\nROW(\"RowCount\", COUNTROWS('{escaped}'))",
            Description = $"Counts rows in '{tableName}'"
        };
    }

    // ── Shared helper: execute DAX and return rows ───────────────────────────

    private async Task<JsonArray?> ExecuteDaxAndGetRows(
        string token, string workspaceId, string datasetId, string dax, CancellationToken ct)
    {
        var url = $"{ExecuteQueriesBaseUrl}/groups/{workspaceId}/datasets/{datasetId}/executeQueries";

        using var request = new HttpRequestMessage(HttpMethod.Post, url);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

        var body = new
        {
            queries = new[] { new { query = dax } },
            serializerSettings = new { includeNulls = true }
        };

        request.Content = new StringContent(
            JsonSerializer.Serialize(body), Encoding.UTF8, "application/json");

        var response = await _httpClient.SendAsync(request, ct);
        if (!response.IsSuccessStatusCode)
            throw new InvalidOperationException(await response.Content.ReadAsStringAsync(ct));

        var json = await response.Content.ReadAsStringAsync(ct);
        var doc = JsonNode.Parse(json);
        return doc?["results"]?[0]?["tables"]?[0]?["rows"]?.AsArray();
    }

    private async Task<string> GetTokenForTenantWithClientIdAsync(
        TenantConfig tenant, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(tenant.ClientId))
            throw new InvalidOperationException(
                $"Tenant '{tenant.DisplayName}' ({tenant.Id}) has no clientId configured.");

        _currentTenantClientId = tenant.ClientId;
        return await GetTokenForTenantAsync(tenant.EntraId, ct);
    }

    /// <summary>Exposed for diagnostic endpoint. Remove after troubleshooting.</summary>
    public Task<string> GetTokenForDiagnosticAsync(TenantConfig tenant, CancellationToken ct = default)
        => GetTokenForTenantWithClientIdAsync(tenant, ct);

    // ── REST ping (for live-connected AAS/SSAS models) ───────────────────────

    /// <summary>
    /// Pings the dataset via the REST API — fetches dataset metadata and datasource info.
    /// Used for live-connected models where executeQueries is not supported.
    /// Returns a QueryResult with RowCount=1 on success (representing the dataset info).
    /// </summary>
    public async Task<QueryResult> PingDatasetAsync(
        SemanticModelConfig model,
        TenantConfig tenant,
        CancellationToken ct = default)
    {
        var token = await GetTokenForTenantWithClientIdAsync(tenant, ct);

        // Step 1: GET dataset metadata — confirms dataset exists and is reachable
        var datasetUrl = $"{ExecuteQueriesBaseUrl}/groups/{model.WorkspaceId}/datasets/{model.DatasetId}";
        using var dsRequest = new HttpRequestMessage(HttpMethod.Get, datasetUrl);
        dsRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

        var dsResponse = await _httpClient.SendAsync(dsRequest, ct);
        if (!dsResponse.IsSuccessStatusCode)
        {
            var error = await dsResponse.Content.ReadAsStringAsync(ct);
            throw new InvalidOperationException(
                $"Power BI API returned {(int)dsResponse.StatusCode}: {error}");
        }

        var dsJson = await dsResponse.Content.ReadAsStringAsync(ct);
        var dsDoc = JsonNode.Parse(dsJson);
        var dsName = dsDoc?["name"]?.GetValue<string>() ?? "unknown";

        // Step 2: GET datasources — confirms the upstream connection is configured
        var srcUrl = $"{ExecuteQueriesBaseUrl}/groups/{model.WorkspaceId}/datasets/{model.DatasetId}/datasources";
        using var srcRequest = new HttpRequestMessage(HttpMethod.Get, srcUrl);
        srcRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

        var srcResponse = await _httpClient.SendAsync(srcRequest, ct);
        var sourceCount = 0;
        if (srcResponse.IsSuccessStatusCode)
        {
            var srcJson = await srcResponse.Content.ReadAsStringAsync(ct);
            var srcDoc = JsonNode.Parse(srcJson);
            sourceCount = srcDoc?["value"]?.AsArray()?.Count ?? 0;
        }

        return new QueryResult
        {
            RowCount = 1,
            FirstRowJson = $"{{\"dataset\":\"{dsName}\",\"datasources\":{sourceCount}}}"
        };
    }

    // ── Datasource discovery (for dependency map) ─────────────────────────

    public async Task<List<DatasourceInfo>> GetDatasourcesAsync(
        SemanticModelConfig model, TenantConfig tenant, CancellationToken ct = default)
    {
        var token = await GetTokenForTenantWithClientIdAsync(tenant, ct);
        var url = $"{ExecuteQueriesBaseUrl}/groups/{model.WorkspaceId}/datasets/{model.DatasetId}/datasources";
        using var request = new HttpRequestMessage(HttpMethod.Get, url);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

        var response = await _httpClient.SendAsync(request, ct);
        if (!response.IsSuccessStatusCode) return [];

        var json = await response.Content.ReadAsStringAsync(ct);
        var doc = JsonNode.Parse(json);
        var items = doc?["value"]?.AsArray() ?? [];

        return items.Select(d => new DatasourceInfo
        {
            DatasourceType = d?["datasourceType"]?.GetValue<string>() ?? "",
            ConnectionDetails = d?["connectionDetails"]?.ToJsonString() ?? "{}",
            DatasourceId = d?["datasourceId"]?.GetValue<string>(),
            GatewayId = d?["gatewayId"]?.GetValue<string>()
        }).ToList();
    }

    // ── Dataset refresh history ────────────────────────────────────────────

    /// <summary>
    /// Fetches the recent refresh history for a dataset from the Power BI REST API.
    /// GET /groups/{workspaceId}/datasets/{datasetId}/refreshes?$top={top}
    /// </summary>
    public async Task<List<DatasetRefreshEntry>> GetRefreshHistoryAsync(
        TenantConfig tenant, string workspaceId, string datasetId,
        int top = 10, CancellationToken ct = default)
    {
        var token = await GetTokenForTenantWithClientIdAsync(tenant, ct);

        var url = $"{ExecuteQueriesBaseUrl}/groups/{workspaceId}/datasets/{datasetId}/refreshes?$top={top}";
        using var request = new HttpRequestMessage(HttpMethod.Get, url);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

        var response = await _httpClient.SendAsync(request, ct);
        if (!response.IsSuccessStatusCode)
        {
            var error = await response.Content.ReadAsStringAsync(ct);
            throw new InvalidOperationException(
                $"Power BI API returned {(int)response.StatusCode}: {error}");
        }

        var json = await response.Content.ReadAsStringAsync(ct);
        var doc = JsonNode.Parse(json);
        var items = doc?["value"]?.AsArray() ?? [];

        return items.Select(r => new DatasetRefreshEntry
        {
            RequestId = r?["requestId"]?.GetValue<string>() ?? "",
            Status = r?["status"]?.GetValue<string>() ?? "Unknown",
            StartTime = r?["startTime"] is not null ? DateTime.Parse(r["startTime"]!.GetValue<string>()) : null,
            EndTime = r?["endTime"] is not null ? DateTime.Parse(r["endTime"]!.GetValue<string>()) : null,
            RefreshType = r?["refreshType"]?.GetValue<string>(),
            ServiceExceptionJson = r?["serviceExceptionJson"]?.ToJsonString()
        }).ToList();
    }

    // ── Response parsing ─────────────────────────────────────────────────────

    private static QueryResult ParseQueryResult(string responseJson)
    {
        var doc = JsonNode.Parse(responseJson);
        var results = doc?["results"]?[0];
        var tables = results?["tables"]?[0];
        var rows = tables?["rows"]?.AsArray();

        if (rows is null || rows.Count == 0)
            return new QueryResult { RowCount = 0 };

        var firstRow = rows[0]?.ToJsonString();
        return new QueryResult
        {
            RowCount = rows.Count,
            FirstRowJson = firstRow
        };
    }
}
