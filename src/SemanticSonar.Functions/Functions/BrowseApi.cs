using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using SemanticSonar.Functions.Helpers;
using SemanticSonar.Functions.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.Logging;

namespace SemanticSonar.Functions.Functions;

public class BrowseApi
{
    private readonly CosmosDbService _cosmos;
    private readonly PowerBiQueryService _powerBi;
    private readonly ILogger<BrowseApi> _logger;
    private readonly IHttpClientFactory _httpClientFactory;

    public BrowseApi(CosmosDbService cosmos, PowerBiQueryService powerBi,
        ILogger<BrowseApi> logger, IHttpClientFactory httpClientFactory)
    {
        _cosmos = cosmos;
        _powerBi = powerBi;
        _logger = logger;
        _httpClientFactory = httpClientFactory;
    }

    [Function("BrowseWorkspaces")]
    public async Task<IActionResult> BrowseWorkspaces(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "tenants/{tenantId}/workspaces")] HttpRequest req,
        string tenantId)
    {
        var authResult = AuthHelper.EnforceAuth(req);
        if (authResult != null) return authResult;

        var tenant = await _cosmos.GetTenantAsync(tenantId);
        if (tenant is null)
            return new NotFoundObjectResult("Tenant not found.");

        try
        {
            var workspaces = await _powerBi.ListWorkspacesAsync(tenant);
            return new OkObjectResult(workspaces);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to list workspaces for tenant {TenantId}.", tenantId);
            return new ObjectResult(new { error = ex.Message }) { StatusCode = 502 };
        }
    }

    [Function("BrowseDatasets")]
    public async Task<IActionResult> BrowseDatasets(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "tenants/{tenantId}/workspaces/{workspaceId}/datasets")] HttpRequest req,
        string tenantId,
        string workspaceId)
    {
        var authResult = AuthHelper.EnforceAuth(req);
        if (authResult != null) return authResult;

        var tenant = await _cosmos.GetTenantAsync(tenantId);
        if (tenant is null)
            return new NotFoundObjectResult("Tenant not found.");

        try
        {
            var datasets = await _powerBi.ListDatasetsInWorkspaceAsync(tenant, workspaceId);
            return new OkObjectResult(datasets);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to list datasets for tenant {TenantId}, workspace {WorkspaceId}.", tenantId, workspaceId);
            return new ObjectResult(new { error = ex.Message }) { StatusCode = 502 };
        }
    }

    [Function("SuggestDax")]
    public async Task<IActionResult> SuggestDax(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get",
            Route = "tenants/{tenantId}/workspaces/{workspaceId}/datasets/{datasetId}/suggest-dax")]
        HttpRequest req,
        string tenantId, string workspaceId, string datasetId)
    {
        var authResult = AuthHelper.EnforceAuth(req);
        if (authResult != null) return authResult;

        var tenant = await _cosmos.GetTenantAsync(tenantId);
        if (tenant is null)
            return new NotFoundObjectResult("Tenant not found.");

        try
        {
            var suggestion = await _powerBi.SuggestDaxAsync(tenant, workspaceId, datasetId);
            return new OkObjectResult(suggestion);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to suggest DAX for tenant {TenantId}, dataset {DatasetId}.",
                tenantId, datasetId);
            return new ObjectResult(new { error = ex.Message }) { StatusCode = 502 };
        }
    }

    [Function("GetRefreshHistory")]
    public async Task<IActionResult> GetRefreshHistory(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get",
            Route = "tenants/{tenantId}/workspaces/{workspaceId}/datasets/{datasetId}/refreshes")]
        HttpRequest req,
        string tenantId, string workspaceId, string datasetId)
    {
        var authResult = AuthHelper.EnforceAuth(req);
        if (authResult != null) return authResult;

        var tenant = await _cosmos.GetTenantAsync(tenantId);
        if (tenant is null)
            return new NotFoundObjectResult("Tenant not found.");

        var topParam = req.Query["top"].FirstOrDefault();
        var top = int.TryParse(topParam, out var t) && t > 0 && t <= 50 ? t : 10;

        try
        {
            var history = await _powerBi.GetRefreshHistoryAsync(tenant, workspaceId, datasetId, top);
            return new OkObjectResult(history);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get refresh history for tenant {TenantId}, dataset {DatasetId}.",
                tenantId, datasetId);
            return new ObjectResult(new { error = ex.Message }) { StatusCode = 502 };
        }
    }

    /// <summary>
    /// Diagnostic endpoint — returns details about SP token and Power BI API responses
    /// to help debug workspace access issues. Remove after troubleshooting.
    /// </summary>
    [Function("DiagnosePowerBi")]
    public async Task<IActionResult> DiagnosePowerBi(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "tenants/{tenantId}/diagnose")] HttpRequest req,
        string tenantId)
    {
        var authResult = AuthHelper.EnforceAuth(req);
        if (authResult != null) return authResult;

        var tenant = await _cosmos.GetTenantAsync(tenantId);
        if (tenant is null)
            return new NotFoundObjectResult("Tenant not found.");

        var diag = new Dictionary<string, object?>
        {
            ["tenantId"] = tenant.Id,
            ["entraId"] = tenant.EntraId,
            ["clientId"] = tenant.ClientId,
        };

        // 1. Acquire token
        string token;
        try
        {
            token = await _powerBi.GetTokenForDiagnosticAsync(tenant);
            diag["tokenAcquired"] = true;

            // Decode JWT payload (middle segment) to inspect claims
            var parts = token.Split('.');
            if (parts.Length >= 2)
            {
                var payload = parts[1];
                // Pad for Base64
                payload = payload.Replace('-', '+').Replace('_', '/');
                switch (payload.Length % 4)
                {
                    case 2: payload += "=="; break;
                    case 3: payload += "="; break;
                }
                var json = Encoding.UTF8.GetString(Convert.FromBase64String(payload));
                var claims = JsonSerializer.Deserialize<Dictionary<string, object>>(json);
                diag["tokenClaims"] = new
                {
                    aud = claims?.GetValueOrDefault("aud")?.ToString(),
                    iss = claims?.GetValueOrDefault("iss")?.ToString(),
                    appid = claims?.GetValueOrDefault("appid")?.ToString(),
                    tid = claims?.GetValueOrDefault("tid")?.ToString(),
                    roles = claims?.GetValueOrDefault("roles")?.ToString(),
                };
            }
        }
        catch (Exception ex)
        {
            diag["tokenAcquired"] = false;
            diag["tokenError"] = ex.Message;
            return new OkObjectResult(diag);
        }

        var http = _httpClientFactory.CreateClient();

        // 2. GET /groups (list workspaces)
        try
        {
            using var groupsReq = new HttpRequestMessage(HttpMethod.Get,
                "https://api.powerbi.com/v1.0/myorg/groups?$top=100");
            groupsReq.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            var groupsResp = await http.SendAsync(groupsReq);
            var groupsBody = await groupsResp.Content.ReadAsStringAsync();
            diag["groups_status"] = (int)groupsResp.StatusCode;
            diag["groups_body"] = groupsBody.Length > 2000
                ? groupsBody[..2000] + "...(truncated)"
                : groupsBody;
        }
        catch (Exception ex) { diag["groups_error"] = ex.Message; }

        // 3. GET specific workspace directly
        var workspaceId = req.Query["workspaceId"].FirstOrDefault();
        if (!string.IsNullOrEmpty(workspaceId))
        {
            try
            {
                using var wsReq = new HttpRequestMessage(HttpMethod.Get,
                    $"https://api.powerbi.com/v1.0/myorg/groups/{workspaceId}");
                wsReq.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
                var wsResp = await http.SendAsync(wsReq);
                var wsBody = await wsResp.Content.ReadAsStringAsync();
                diag["workspace_status"] = (int)wsResp.StatusCode;
                diag["workspace_body"] = wsBody;
            }
            catch (Exception ex) { diag["workspace_error"] = ex.Message; }
        }

        // 4. GET /admin/groups (admin API, requires Tenant.Read.All)
        try
        {
            using var adminReq = new HttpRequestMessage(HttpMethod.Get,
                "https://api.powerbi.com/v1.0/myorg/admin/groups?$top=5");
            adminReq.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            var adminResp = await http.SendAsync(adminReq);
            var adminBody = await adminResp.Content.ReadAsStringAsync();
            diag["admin_groups_status"] = (int)adminResp.StatusCode;
            diag["admin_groups_body"] = adminBody.Length > 2000
                ? adminBody[..2000] + "...(truncated)"
                : adminBody;
        }
        catch (Exception ex) { diag["admin_groups_error"] = ex.Message; }

        return new OkObjectResult(diag);
    }
}
