using System.Collections.ObjectModel;
using SemanticSonar.Functions.Models;
using Microsoft.Azure.Cosmos;
using Microsoft.Extensions.Logging;

namespace SemanticSonar.Functions.Services;

/// <summary>
/// All Cosmos DB operations for Fabric Bridge.
/// CosmosClient is injected as a singleton per sdk-singleton-client best practice.
/// </summary>
public class CosmosDbService
{
    private const int ConsecutiveFailureThreshold = 30;
    private const int AtRiskThreshold = 10;

    private readonly CosmosClient _client;
    private readonly string _databaseName;
    private readonly ILogger<CosmosDbService> _logger;

    private Container TenantsContainer => _client.GetContainer(_databaseName, "tenants");
    private Container ModelsContainer => _client.GetContainer(_databaseName, "models");
    private Container ResultsContainer => _client.GetContainer(_databaseName, "results");
    private Container AuditContainer => _client.GetContainer(_databaseName, "audit");
    private Container TagsContainer => _client.GetContainer(_databaseName, "tags");

    public CosmosDbService(CosmosClient client, ILogger<CosmosDbService> logger)
    {
        _client = client;
        _databaseName = Environment.GetEnvironmentVariable("COSMOS_DATABASE_NAME") ?? "FabricSonar";
        _logger = logger;
    }

    // ── Initialisation ──────────────────────────────────────────────────────

    public async Task EnsureContainersExistAsync()
    {
        var db = await _client.CreateDatabaseIfNotExistsAsync(_databaseName);

        await db.Database.CreateContainerIfNotExistsAsync(new ContainerProperties
        {
            Id = "tenants",
            PartitionKeyPath = "/id"
        });

        await db.Database.CreateContainerIfNotExistsAsync(new ContainerProperties
        {
            Id = "models",
            PartitionKeyPath = "/tenantId",
            IndexingPolicy = new IndexingPolicy
            {
                CompositeIndexes =
                {
                    // Supports: WHERE isActive = true AND nextRunTime <= @now ORDER BY nextRunTime
                    new Collection<CompositePath>
                    {
                        new CompositePath { Path = "/isActive", Order = CompositePathSortOrder.Ascending },
                        new CompositePath { Path = "/nextRunTime", Order = CompositePathSortOrder.Ascending }
                    }
                }
            }
        });

        await db.Database.CreateContainerIfNotExistsAsync(new ContainerProperties
        {
            Id = "results",
            PartitionKeyPath = "/modelId",
            DefaultTimeToLive = -1
        });

        await db.Database.CreateContainerIfNotExistsAsync(new ContainerProperties
        {
            Id = "audit",
            PartitionKeyPath = "/tenantId",
            DefaultTimeToLive = -1
        });

        await db.Database.CreateContainerIfNotExistsAsync(new ContainerProperties
        {
            Id = "tags",
            PartitionKeyPath = "/id"
        });
    }

    // ── Tenants ─────────────────────────────────────────────────────────────

    public async Task<TenantConfig?> GetTenantAsync(string id, CancellationToken ct = default)
    {
        try
        {
            var response = await TenantsContainer.ReadItemAsync<TenantConfig>(
                id, new PartitionKey(id), cancellationToken: ct);
            return response.Resource;
        }
        catch (CosmosException ex) when (ex.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            return null;
        }
    }

    public async Task<List<TenantConfig>> ListTenantsAsync(CancellationToken ct = default)
    {
        var query = new QueryDefinition("SELECT * FROM c ORDER BY c.displayName");
        return await ExecuteQueryAsync<TenantConfig>(TenantsContainer, query, ct: ct);
    }

    public async Task<TenantConfig> UpsertTenantAsync(TenantConfig tenant, CancellationToken ct = default)
    {
        var response = await TenantsContainer.UpsertItemAsync(
            tenant, new PartitionKey(tenant.Id), cancellationToken: ct);
        return response.Resource;
    }

    public async Task DeleteTenantAsync(string id, CancellationToken ct = default)
    {
        await TenantsContainer.DeleteItemAsync<TenantConfig>(
            id, new PartitionKey(id), cancellationToken: ct);
    }

    // ── Semantic Models ─────────────────────────────────────────────────────

    public async Task<SemanticModelConfig?> GetModelAsync(string id, string tenantId, CancellationToken ct = default)
    {
        try
        {
            var response = await ModelsContainer.ReadItemAsync<SemanticModelConfig>(
                id, new PartitionKey(tenantId), cancellationToken: ct);
            return response.Resource;
        }
        catch (CosmosException ex) when (ex.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            return null;
        }
    }

    public async Task<List<SemanticModelConfig>> ListModelsAsync(
        string? tenantId = null, CancellationToken ct = default)
    {
        QueryDefinition query;
        QueryRequestOptions? options = null;

        if (tenantId is not null)
        {
            // Single-partition query — most efficient
            query = new QueryDefinition(
                "SELECT * FROM c ORDER BY c.displayName");
            options = new QueryRequestOptions { PartitionKey = new PartitionKey(tenantId) };
        }
        else
        {
            // Cross-partition — used for dashboard overview
            query = new QueryDefinition(
                "SELECT * FROM c ORDER BY c.displayName");
        }

        return await ExecuteQueryAsync<SemanticModelConfig>(ModelsContainer, query, options, ct);
    }

    /// <summary>
    /// Returns all active models whose nextRunTime is at or before <paramref name="now"/>.
    /// Uses a composite index on (isActive, nextRunTime) for efficiency.
    /// </summary>
    public async Task<List<SemanticModelConfig>> GetDueModelsAsync(
        DateTime now, CancellationToken ct = default)
    {
        var query = new QueryDefinition(
            "SELECT * FROM c WHERE c.isActive = true AND c.nextRunTime <= @now")
            .WithParameter("@now", now.ToString("O"));

        return await ExecuteQueryAsync<SemanticModelConfig>(ModelsContainer, query, ct: ct);
    }

    public async Task<SemanticModelConfig> UpsertModelAsync(
        SemanticModelConfig model, CancellationToken ct = default)
    {
        var response = await ModelsContainer.UpsertItemAsync(
            model, new PartitionKey(model.TenantId), cancellationToken: ct);
        return response.Resource;
    }

    public async Task DeleteModelAsync(string id, string tenantId, CancellationToken ct = default)
    {
        await ModelsContainer.DeleteItemAsync<SemanticModelConfig>(
            id, new PartitionKey(tenantId), cancellationToken: ct);
    }

    /// <summary>
    /// Deletes all models belonging to a tenant. Returns the count of deleted models.
    /// </summary>
    public async Task<int> DeleteModelsForTenantAsync(string tenantId, CancellationToken ct = default)
    {
        var models = await ListModelsAsync(tenantId, ct);
        foreach (var model in models)
        {
            await ModelsContainer.DeleteItemAsync<SemanticModelConfig>(
                model.Id, new PartitionKey(tenantId), cancellationToken: ct);
        }
        return models.Count;
    }

    // ── Canary Results ──────────────────────────────────────────────────────

    public async Task<CanaryResult> CreateResultAsync(CanaryResult result, CancellationToken ct = default)
    {
        var response = await ResultsContainer.CreateItemAsync(
            result, new PartitionKey(result.ModelId), cancellationToken: ct);
        return response.Resource;
    }

    public async Task<List<CanaryResult>> GetResultsForModelAsync(
        string modelId, int limit = 50, CancellationToken ct = default)
    {
        var query = new QueryDefinition(
            "SELECT TOP @limit * FROM c ORDER BY c.executedAt DESC")
            .WithParameter("@limit", limit);

        return await ExecuteQueryAsync<CanaryResult>(
            ResultsContainer, query,
            new QueryRequestOptions { PartitionKey = new PartitionKey(modelId) },
            ct);
    }

    public async Task<List<CanaryResult>> GetRecentFailuresAsync(
        int limit = 20, CancellationToken ct = default)
    {
        var query = new QueryDefinition(
            "SELECT TOP @limit * FROM c WHERE c.success = false ORDER BY c.executedAt DESC")
            .WithParameter("@limit", limit);

        return await ExecuteQueryAsync<CanaryResult>(ResultsContainer, query, ct: ct);
    }

    public async Task<DashboardSummary> GetDashboardSummaryAsync(CancellationToken ct = default)
    {
        // Fetch model statistics using targeted projections
        var statQuery = new QueryDefinition(
            "SELECT c.id, c.tenantId, c.displayName, c.isActive, c.consecutiveFailureCount FROM c");

        var allModels = await ExecuteQueryAsync<SemanticModelConfig>(ModelsContainer, statQuery, ct: ct);

        // Fetch tenant names for display
        var tenantQuery = new QueryDefinition("SELECT c.id, c.displayName FROM c");
        var allTenants = await ExecuteQueryAsync<TenantConfig>(TenantsContainer, tenantQuery, ct: ct);
        var tenantLookup = allTenants.ToDictionary(t => t.Id, t => t.DisplayName);

        var total = allModels.Count;
        var active = allModels.Count(m => m.IsActive);
        var disabled = allModels.Count(m => !m.IsActive);
        var failing = allModels.Count(m => m.IsActive && m.ConsecutiveFailureCount > 0);

        var atRisk = allModels
            .Where(m => m.IsActive && m.ConsecutiveFailureCount >= AtRiskThreshold)
            .OrderByDescending(m => m.ConsecutiveFailureCount)
            .Take(10)
            .Select(m => new AtRiskModelItem
            {
                ModelId = m.Id,
                ModelName = m.DisplayName,
                TenantId = m.TenantId,
                TenantName = tenantLookup.TryGetValue(m.TenantId, out var tn) ? tn : m.TenantId,
                ConsecutiveFailureCount = m.ConsecutiveFailureCount
            })
            .ToList();

        var recentFailureResults = await GetRecentFailuresAsync(20, ct);
        var modelLookup = allModels.ToDictionary(m => m.Id);

        var recentFailures = recentFailureResults.Select(r => new RecentFailureItem
        {
            ModelId = r.ModelId,
            ModelName = modelLookup.TryGetValue(r.ModelId, out var m) ? m.DisplayName : r.ModelId,
            TenantId = r.TenantId,
            TenantName = tenantLookup.TryGetValue(r.TenantId, out var tn) ? tn : r.TenantId,
            FailedAt = r.ExecutedAt,
            ErrorMessage = r.ErrorMessage,
            LatencyMs = r.LatencyMs
        }).ToList();

        return new DashboardSummary
        {
            TotalModels = total,
            ActiveModels = active,
            DisabledModels = disabled,
            FailingModels = failing,
            RecentFailures = recentFailures,
            AtRiskModels = atRisk
        };
    }

    // ── Uptime / SLA ────────────────────────────────────────────────────────

    public async Task<List<ModelUptimeStats>> GetUptimeStatsAsync(CancellationToken ct = default)
    {
        var now = DateTime.UtcNow;
        var cutoff30d = now.AddDays(-30);

        // Fetch all models for metadata
        var allModels = await ExecuteQueryAsync<SemanticModelConfig>(
            ModelsContainer, new QueryDefinition("SELECT * FROM c"), ct: ct);

        // Fetch tenant names
        var tenantQuery = new QueryDefinition("SELECT c.id, c.displayName FROM c");
        var allTenants = await ExecuteQueryAsync<TenantConfig>(TenantsContainer, tenantQuery, ct: ct);
        var tenantLookup = allTenants.ToDictionary(t => t.Id, t => t.DisplayName);

        // Fetch results from the last 30 days (cross-partition; results are partitioned by modelId)
        var resultsQuery = new QueryDefinition(
            "SELECT c.modelId, c.success, c.executedAt FROM c WHERE c.executedAt >= @cutoff")
            .WithParameter("@cutoff", cutoff30d.ToString("O"));

        var results = await ExecuteQueryAsync<CanaryResult>(ResultsContainer, resultsQuery, ct: ct);

        // Group results by model
        var resultsByModel = results.GroupBy(r => r.ModelId).ToDictionary(g => g.Key, g => g.ToList());

        var cutoff24h = now.AddHours(-24);
        var cutoff7d = now.AddDays(-7);

        return allModels.Select(m =>
        {
            var modelResults = resultsByModel.GetValueOrDefault(m.Id, []);

            static UptimeWindow ComputeWindow(List<CanaryResult> results, DateTime since)
            {
                var inWindow = results.Where(r => r.ExecutedAt >= since).ToList();
                var total = inWindow.Count;
                var successes = inWindow.Count(r => r.Success);
                return new UptimeWindow
                {
                    TotalChecks = total,
                    Successes = successes,
                    UptimePercent = total > 0 ? Math.Round(100.0 * successes / total, 2) : null
                };
            }

            return new ModelUptimeStats
            {
                ModelId = m.Id,
                ModelName = m.DisplayName,
                TenantId = m.TenantId,
                TenantName = tenantLookup.TryGetValue(m.TenantId, out var tn) ? tn : m.TenantId,
                IsActive = m.IsActive,
                Last24h = ComputeWindow(modelResults, cutoff24h),
                Last7d = ComputeWindow(modelResults, cutoff7d),
                Last30d = ComputeWindow(modelResults, cutoff30d)
            };
        })
        .OrderBy(u => u.Last30d.UptimePercent ?? 200) // Models with worst uptime first, no-data last
        .ThenBy(u => u.ModelName)
        .ToList();
    }

    // ── Latency Trends ──────────────────────────────────────────────────────

    public async Task<List<ModelLatencyTrend>> GetLatencyTrendsAsync(CancellationToken ct = default)
    {
        var now = DateTime.UtcNow;
        var cutoff14d = now.AddDays(-14);
        var cutoff7d = now.AddDays(-7);

        // Fetch models
        var allModels = await ExecuteQueryAsync<SemanticModelConfig>(
            ModelsContainer, new QueryDefinition("SELECT * FROM c WHERE c.isActive = true"), ct: ct);

        // Tenant names
        var tenantQuery = new QueryDefinition("SELECT c.id, c.displayName FROM c");
        var allTenants = await ExecuteQueryAsync<TenantConfig>(TenantsContainer, tenantQuery, ct: ct);
        var tenantLookup = allTenants.ToDictionary(t => t.Id, t => t.DisplayName);

        // Successful results from last 14 days (only successes have meaningful latency)
        var resultsQuery = new QueryDefinition(
            "SELECT c.modelId, c.latencyMs, c.executedAt FROM c WHERE c.success = true AND c.executedAt >= @cutoff")
            .WithParameter("@cutoff", cutoff14d.ToString("O"));

        var results = await ExecuteQueryAsync<CanaryResult>(ResultsContainer, resultsQuery, ct: ct);
        var resultsByModel = results.GroupBy(r => r.ModelId).ToDictionary(g => g.Key, g => g.ToList());

        // Build 14-day date list for sparkline
        var dates = Enumerable.Range(0, 14).Select(i => now.AddDays(-13 + i).Date).ToList();

        return allModels.Select(m =>
        {
            var all = resultsByModel.GetValueOrDefault(m.Id, []);
            var recent = all.Where(r => r.ExecutedAt >= cutoff7d).Select(r => r.LatencyMs).ToList();
            var prior = all.Where(r => r.ExecutedAt < cutoff7d).Select(r => r.LatencyMs).ToList();

            var p50Recent = Percentile(recent, 50);
            var p95Recent = Percentile(recent, 95);
            var p50Prior = Percentile(prior, 50);
            var p95Prior = Percentile(prior, 95);

            double? changePercent = null;
            if (p95Prior.HasValue && p95Prior.Value > 0 && p95Recent.HasValue)
                changePercent = Math.Round(100.0 * (p95Recent.Value - p95Prior.Value) / p95Prior.Value, 1);

            var alert = changePercent.HasValue && changePercent.Value >= 50 && p95Recent >= 500;

            // Daily p95
            var daily = dates.Select(d =>
            {
                var dayResults = all.Where(r => r.ExecutedAt.Date == d).Select(r => r.LatencyMs).ToList();
                return new DailyLatencyPoint
                {
                    Date = d.ToString("yyyy-MM-dd"),
                    P95 = Percentile(dayResults, 95)
                };
            }).ToList();

            return new ModelLatencyTrend
            {
                ModelId = m.Id,
                ModelName = m.DisplayName,
                TenantId = m.TenantId,
                TenantName = tenantLookup.TryGetValue(m.TenantId, out var tn) ? tn : m.TenantId,
                P50Recent = p50Recent,
                P95Recent = p95Recent,
                P50Prior = p50Prior,
                P95Prior = p95Prior,
                P95ChangePercent = changePercent,
                Alert = alert,
                RecentCheckCount = recent.Count,
                DailyP95 = daily
            };
        })
        .OrderByDescending(t => t.Alert)
        .ThenByDescending(t => t.P95ChangePercent ?? -999)
        .ToList();
    }

    private static long? Percentile(List<long> values, int p)
    {
        if (values.Count == 0) return null;
        var sorted = values.OrderBy(v => v).ToList();
        var index = (int)Math.Ceiling(p / 100.0 * sorted.Count) - 1;
        return sorted[Math.Max(0, index)];
    }

    // ── Performance Budgets ─────────────────────────────────────────────────

    /// <summary>
    /// Computes per-model latency budget status by comparing a rolling baseline
    /// (older half of the sample window) to recent execution P50.
    /// </summary>
    public async Task<List<PerformanceBudgetResult>> GetPerformanceBudgetsAsync(CancellationToken ct = default)
    {
        // Fetch all models + tenant names
        var allModels = await ExecuteQueryAsync<SemanticModelConfig>(
            ModelsContainer, new QueryDefinition("SELECT * FROM c WHERE c.isActive = true"), ct: ct);

        var tenantQuery = new QueryDefinition("SELECT c.id, c.displayName FROM c");
        var allTenants = await ExecuteQueryAsync<TenantConfig>(TenantsContainer, tenantQuery, ct: ct);
        var tenantLookup = allTenants.ToDictionary(t => t.Id, t => t.DisplayName);

        // Determine largest sample window needed across all models (cap at 200)
        int maxSample = allModels.Count > 0
            ? Math.Min(200, allModels.Max(m => (m.LatencyBudgetSampleSize ?? 20)) * 2)
            : 40;

        // Fetch the most recent successful results across all models from the last 90 days.
        // Using a 90-day window ensures enough history even for infrequently-run models.
        var cutoff = DateTime.UtcNow.AddDays(-90).ToString("O");
        var resultsQuery = new QueryDefinition(
            "SELECT c.modelId, c.latencyMs, c.executedAt FROM c WHERE c.success = true AND c.executedAt >= @cutoff")
            .WithParameter("@cutoff", cutoff);

        var rawResults = await ExecuteQueryAsync<CanaryResult>(ResultsContainer, resultsQuery, ct: ct);

        // Group by model, sorted descending (most recent first)
        var resultsByModel = rawResults
            .GroupBy(r => r.ModelId)
            .ToDictionary(
                g => g.Key,
                g => g.OrderByDescending(r => r.ExecutedAt).Select(r => r.LatencyMs).ToList());

        var budgets = new List<PerformanceBudgetResult>();

        foreach (var model in allModels)
        {
            var sampleSize = model.LatencyBudgetSampleSize ?? 20;
            var warnMult = model.LatencyBudgetWarnMultiplier ?? 2.0;
            var critMult = model.LatencyBudgetCriticalMultiplier ?? 5.0;

            resultsByModel.TryGetValue(model.Id, out var latenciesDesc);
            latenciesDesc ??= [];

            if (latenciesDesc.Count < 5)
            {
                // Not enough data to compute a meaningful baseline
                budgets.Add(new PerformanceBudgetResult
                {
                    ModelId = model.Id,
                    ModelName = model.DisplayName,
                    TenantId = model.TenantId,
                    TenantName = tenantLookup.GetValueOrDefault(model.TenantId, model.TenantId),
                    Status = "insufficient-data",
                    SampleSize = sampleSize,
                    WarnMultiplier = warnMult,
                    CriticalMultiplier = critMult,
                    RecentLatencies = latenciesDesc.AsEnumerable().Reverse().ToList()
                });
                continue;
            }

            // Take up to 2×sampleSize entries (desc). Split: first half = recent, second half = baseline.
            var window = latenciesDesc.Take(2 * sampleSize).ToList();
            var recentHalf = window.Take(sampleSize).ToList();   // most recent
            var baselineHalf = window.Skip(sampleSize).ToList(); // older

            // Use baseline half; fall back to full window if not enough older data
            var baselineSource = baselineHalf.Count >= 5 ? baselineHalf : window;
            var baselineP50 = Percentile(baselineSource, 50)!.Value;
            var currentP50 = Percentile(recentHalf, 50)!.Value;
            var latestLatency = recentHalf[0];

            var warnThreshold = (long)(baselineP50 * warnMult);
            var critThreshold = (long)(baselineP50 * critMult);

            var status = latestLatency >= critThreshold ? "critical"
                : latestLatency >= warnThreshold ? "warn"
                : "ok";

            budgets.Add(new PerformanceBudgetResult
            {
                ModelId = model.Id,
                ModelName = model.DisplayName,
                TenantId = model.TenantId,
                TenantName = tenantLookup.GetValueOrDefault(model.TenantId, model.TenantId),
                Status = status,
                BaselineP50Ms = baselineP50,
                CurrentP50Ms = currentP50,
                LatestLatencyMs = latestLatency,
                WarnThresholdMs = warnThreshold,
                CriticalThresholdMs = critThreshold,
                SampleSize = sampleSize,
                WarnMultiplier = warnMult,
                CriticalMultiplier = critMult,
                // Return in chronological order (oldest → newest) for sparkline
                RecentLatencies = recentHalf.AsEnumerable().Reverse().ToList()
            });
        }

        return budgets
            .OrderBy(b => b.Status switch
            {
                "critical" => 0,
                "warn" => 1,
                "ok" => 2,
                _ => 3
            })
            .ThenBy(b => b.ModelName)
            .ToList();
    }

    // ── Audit Log ─────────────────────────────────────────────────────────

    public async Task AuditAsync(string tenantId, string entityType, string entityId,
        string action, string? details, string? userId)
    {
        try
        {
            await AuditContainer.CreateItemAsync(new AuditEntry
            {
                TenantId = tenantId,
                EntityType = entityType,
                EntityId = entityId,
                Action = action,
                Details = details,
                UserId = userId
            }, new PartitionKey(tenantId));
        }
        catch
        {
            // Audit is best-effort; don't fail the primary operation
        }
    }

    public async Task<List<AuditEntry>> ListAuditEntriesAsync(
        string? tenantId = null, string? entityId = null, int limit = 50,
        CancellationToken ct = default)
    {
        var conditions = new List<string>();
        if (tenantId is not null) conditions.Add("c.tenantId = @tenantId");
        if (entityId is not null) conditions.Add("c.entityId = @entityId");

        var sql = "SELECT TOP @limit * FROM c";
        if (conditions.Count > 0) sql += " WHERE " + string.Join(" AND ", conditions);
        sql += " ORDER BY c.timestamp DESC";

        var query = new QueryDefinition(sql).WithParameter("@limit", limit);
        if (tenantId is not null) query = query.WithParameter("@tenantId", tenantId);
        if (entityId is not null) query = query.WithParameter("@entityId", entityId);

        var options = tenantId is not null
            ? new QueryRequestOptions { PartitionKey = new PartitionKey(tenantId) }
            : null;

        return await ExecuteQueryAsync<AuditEntry>(AuditContainer, query, options, ct);
    }

    // ── Webhooks ──────────────────────────────────────────────────────────

    public async Task<List<WebhookConfig>> ListWebhooksAsync(string? tenantId = null, CancellationToken ct = default)
    {
        var sql = "SELECT * FROM c WHERE c.type = 'Webhook'";
        if (tenantId is not null)
            sql += " AND (c.tenantId = @tenantId OR c.tenantId = '')";

        var query = new QueryDefinition(sql);
        if (tenantId is not null)
            query = query.WithParameter("@tenantId", tenantId);

        return await ExecuteQueryAsync<WebhookConfig>(TenantsContainer, query, null, ct);
    }

    public async Task<WebhookConfig?> GetWebhookAsync(string id, CancellationToken ct = default)
    {
        try
        {
            var resp = await TenantsContainer.ReadItemAsync<WebhookConfig>(id, new PartitionKey(id), cancellationToken: ct);
            return resp.Resource;
        }
        catch (CosmosException ex) when (ex.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            return null;
        }
    }

    public async Task<WebhookConfig> UpsertWebhookAsync(WebhookConfig wh, CancellationToken ct = default)
    {
        var resp = await TenantsContainer.UpsertItemAsync(wh, new PartitionKey(wh.Id), cancellationToken: ct);
        return resp.Resource;
    }

    public async Task DeleteWebhookAsync(string id, CancellationToken ct = default)
    {
        await TenantsContainer.DeleteItemAsync<WebhookConfig>(id, new PartitionKey(id), cancellationToken: ct);
    }

    // ── Health Scores & Anomaly Detection ────────────────────────────────

    public async Task<List<ModelHealthScore>> GetHealthScoresAsync(CancellationToken ct = default)
    {
        var now = DateTime.UtcNow;
        var cutoff30d = now.AddDays(-30);
        var cutoff7d = now.AddDays(-7);

        var allModels = await ExecuteQueryAsync<SemanticModelConfig>(
            ModelsContainer, new QueryDefinition("SELECT * FROM c"), ct: ct);

        var tenants = await ExecuteQueryAsync<TenantConfig>(
            TenantsContainer, new QueryDefinition("SELECT c.id, c.displayName FROM c"), ct: ct);
        var tenantLookup = tenants.ToDictionary(t => t.Id, t => t.DisplayName);

        var resultsQuery = new QueryDefinition(
            "SELECT c.modelId, c.success, c.latencyMs, c.executedAt, c.duringMaintenance FROM c WHERE c.executedAt >= @cutoff")
            .WithParameter("@cutoff", cutoff30d.ToString("O"));
        var allResults = await ExecuteQueryAsync<CanaryResult>(ResultsContainer, resultsQuery, ct: ct);
        var resultsByModel = allResults.GroupBy(r => r.ModelId).ToDictionary(g => g.Key, g => g.ToList());

        return allModels.Select(m =>
        {
            var modelResults = resultsByModel.GetValueOrDefault(m.Id, []);
            // Exclude maintenance-window results from health calculations
            var effective = modelResults.Where(r => !r.DuringMaintenance).ToList();
            var results7d = effective.Where(r => r.ExecutedAt >= cutoff7d).ToList();
            var successful = effective.Where(r => r.Success).ToList();

            // ── Uptime (0-40) ──
            var total7d = results7d.Count;
            var success7d = results7d.Count(r => r.Success);
            var uptimePct = total7d > 0 ? 100.0 * success7d / total7d : 100.0;
            var uptimePoints = (int)Math.Round(uptimePct * 0.4);

            // ── Latency stability (0-20) ──
            var recentLatencies = results7d.Where(r => r.Success).Select(r => r.LatencyMs).ToList();
            var priorLatencies = effective.Where(r => r.Success && r.ExecutedAt < cutoff7d)
                .Select(r => r.LatencyMs).ToList();
            int latencyPoints;
            if (recentLatencies.Count == 0 || priorLatencies.Count == 0)
                latencyPoints = 15;
            else
            {
                var recentP95 = Percentile(recentLatencies, 95) ?? 0;
                var priorP95 = Percentile(priorLatencies, 95) ?? 0;
                if (priorP95 == 0) latencyPoints = 15;
                else
                {
                    var change = (double)(recentP95 - priorP95) / priorP95;
                    latencyPoints = change <= 0 ? 20 : change < 0.25 ? 15 : change < 0.5 ? 10 : change < 1.0 ? 5 : 0;
                }
            }

            // ── Refresh status (0-20) ──
            var refreshPoints = m.LastRefreshStatus switch
            {
                "Completed" => 20,
                "Failed" or "Disabled" => 0,
                _ => 10
            };

            // ── Activity recency (0-20) ──
            int activityPoints;
            if (m.LastRunAt is null)
                activityPoints = 0;
            else
            {
                var daysSinceRun = (now - m.LastRunAt.Value).TotalDays;
                activityPoints = daysSinceRun < 1 ? 20 : daysSinceRun < 3 ? 15 : daysSinceRun < 7 ? 10 : daysSinceRun < 14 ? 5 : 0;
            }

            var score = Math.Clamp(uptimePoints + latencyPoints + refreshPoints + activityPoints, 0, 100);
            var grade = score >= 90 ? "A" : score >= 80 ? "B" : score >= 70 ? "C" : score >= 50 ? "D" : "F";

            // ── Anomaly detection (z-score on latency) ──
            bool isAnomaly = false;
            string? anomalyReason = null;
            if (successful.Count >= 10 && recentLatencies.Count >= 3)
            {
                var allLat = successful.Select(r => (double)r.LatencyMs).ToList();
                var mean = allLat.Average();
                var stddev = Math.Sqrt(allLat.Sum(x => (x - mean) * (x - mean)) / allLat.Count);
                if (stddev > 0)
                {
                    var recentAvg = recentLatencies.Average();
                    var zScore = (recentAvg - mean) / stddev;
                    if (zScore > 3)
                    {
                        isAnomaly = true;
                        anomalyReason = $"Latency z-score {zScore:F1} (avg {recentAvg:F0}ms vs baseline {mean:F0}ms ± {stddev:F0}ms)";
                    }
                }
            }

            // ── Inactivity countdown (60-day Power BI auto-pause) ──
            int? daysUntilPause = null;
            if (m.IsActive && !string.Equals(m.QueryMode, "rest", StringComparison.OrdinalIgnoreCase))
            {
                var lastSuccess = successful.OrderByDescending(r => r.ExecutedAt).FirstOrDefault();
                if (lastSuccess is not null)
                    daysUntilPause = Math.Max(0, (int)Math.Ceiling(60 - (now - lastSuccess.ExecutedAt).TotalDays));
            }

            return new ModelHealthScore
            {
                ModelId = m.Id,
                ModelName = m.DisplayName,
                TenantId = m.TenantId,
                TenantName = tenantLookup.TryGetValue(m.TenantId, out var tn) ? tn : m.TenantId,
                Score = score,
                Grade = grade,
                UptimePoints = uptimePoints,
                LatencyPoints = latencyPoints,
                RefreshPoints = refreshPoints,
                ActivityPoints = activityPoints,
                DaysUntilPause = daysUntilPause,
                IsAnomaly = isAnomaly,
                AnomalyReason = anomalyReason,
                Tag = m.Tags?.FirstOrDefault() ?? ""
            };
        })
        .OrderBy(h => h.Score)
        .ThenBy(h => h.ModelName)
        .ToList();
    }

    // ── Dependency Map ──────────────────────────────────────────────────────

    public async Task<List<DependencyMapEntry>> GetDependencyMapAsync(CancellationToken ct = default)
    {
        var allModels = await ExecuteQueryAsync<SemanticModelConfig>(
            ModelsContainer, new QueryDefinition("SELECT * FROM c"), ct: ct);

        var tenants = await ExecuteQueryAsync<TenantConfig>(
            TenantsContainer, new QueryDefinition("SELECT c.id, c.displayName FROM c"), ct: ct);
        var tenantLookup = tenants.ToDictionary(t => t.Id, t => t.DisplayName);

        return allModels
            .Select(m => new DependencyMapEntry
            {
                ModelId = m.Id,
                ModelName = m.DisplayName,
                TenantId = m.TenantId,
                TenantName = tenantLookup.TryGetValue(m.TenantId, out var tn) ? tn : m.TenantId,
                IsActive = m.IsActive,
                Datasources = m.CachedDatasources ?? []
            })
            .OrderBy(e => e.ModelName)
            .ToList();
    }

    // ── Tags ────────────────────────────────────────────────────────────────

    public async Task<List<TagDefinition>> ListTagsAsync(CancellationToken ct = default)
    {
        var query = new QueryDefinition("SELECT * FROM c ORDER BY c.name");
        return await ExecuteQueryAsync<TagDefinition>(TagsContainer, query, ct: ct);
    }

    public async Task<TagDefinition?> GetTagAsync(string id, CancellationToken ct = default)
    {
        try
        {
            var resp = await TagsContainer.ReadItemAsync<TagDefinition>(
                id, new PartitionKey(id), cancellationToken: ct);
            return resp.Resource;
        }
        catch (CosmosException ex) when (ex.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            return null;
        }
    }

    public async Task<TagDefinition> CreateTagAsync(TagDefinition tag, CancellationToken ct = default)
    {
        var resp = await TagsContainer.CreateItemAsync(tag, new PartitionKey(tag.Id), cancellationToken: ct);
        return resp.Resource;
    }

    public async Task<TagDefinition> UpdateTagAsync(TagDefinition tag, CancellationToken ct = default)
    {
        var resp = await TagsContainer.UpsertItemAsync(tag, new PartitionKey(tag.Id), cancellationToken: ct);
        return resp.Resource;
    }

    public async Task DeleteTagAsync(string id, CancellationToken ct = default)
    {
        await TagsContainer.DeleteItemAsync<TagDefinition>(id, new PartitionKey(id), cancellationToken: ct);
    }

    /// <summary>
    /// Renames a tag across all model documents. Returns the number of models updated.
    /// </summary>
    public async Task<int> RenameTagOnModelsAsync(string oldName, string newName, CancellationToken ct = default)
    {
        var allModels = await ListModelsAsync(null, ct);
        var affectedModels = allModels.Where(m =>
            m.Tags.Any(t => string.Equals(t, oldName, StringComparison.OrdinalIgnoreCase))).ToList();

        foreach (var model in affectedModels)
        {
            model.Tags = model.Tags
                .Select(t => string.Equals(t, oldName, StringComparison.OrdinalIgnoreCase) ? newName : t)
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();
            await UpsertModelAsync(model, ct);
        }

        return affectedModels.Count;
    }

    /// <summary>
    /// Removes a tag from all model documents. Returns the number of models updated.
    /// </summary>
    public async Task<int> RemoveTagFromModelsAsync(string tagName, CancellationToken ct = default)
    {
        var allModels = await ListModelsAsync(null, ct);
        var affectedModels = allModels.Where(m =>
            m.Tags.Any(t => string.Equals(t, tagName, StringComparison.OrdinalIgnoreCase))).ToList();

        foreach (var model in affectedModels)
        {
            model.Tags = model.Tags
                .Where(t => !string.Equals(t, tagName, StringComparison.OrdinalIgnoreCase))
                .ToList();
            await UpsertModelAsync(model, ct);
        }

        return affectedModels.Count;
    }

    /// <summary>
    /// Returns the count of models using a specific tag name (case-insensitive).
    /// </summary>
    public async Task<int> GetTagUsageCountAsync(string tagName, CancellationToken ct = default)
    {
        var allModels = await ListModelsAsync(null, ct);
        return allModels.Count(m =>
            m.Tags.Any(t => string.Equals(t, tagName, StringComparison.OrdinalIgnoreCase)));
    }

    /// <summary>
    /// Seeds tag definitions from existing model tags (for migration).
    /// Only creates definitions that don't already exist.
    /// </summary>
    public async Task<int> SeedTagsFromModelsAsync(CancellationToken ct = default)
    {
        var existingTags = await ListTagsAsync(ct);
        var existingNames = new HashSet<string>(existingTags.Select(t => t.Name), StringComparer.OrdinalIgnoreCase);

        var allModels = await ListModelsAsync(null, ct);
        var distinctTags = allModels
            .Where(m => m.Tags is not null)
            .SelectMany(m => m.Tags)
            .Where(t => !string.IsNullOrWhiteSpace(t))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        int created = 0;
        foreach (var tagName in distinctTags)
        {
            if (existingNames.Contains(tagName)) continue;
            await CreateTagAsync(new TagDefinition { Name = tagName }, ct);
            existingNames.Add(tagName);
            created++;
        }

        return created;
    }

    // ── Tag Group Summary ───────────────────────────────────────────────────

    public async Task<List<TagGroupSummary>> GetTagGroupSummaryAsync(CancellationToken ct = default)
    {
        var allModels = await ExecuteQueryAsync<SemanticModelConfig>(
            ModelsContainer, new QueryDefinition("SELECT * FROM c"), ct: ct);

        var healthScores = await GetHealthScoresAsync(ct);
        var healthLookup = healthScores.ToDictionary(h => h.ModelId);

        var groups = allModels
            .GroupBy(m => m.Tags.FirstOrDefault() ?? "(Untagged)")
            .Select(g =>
            {
                var modelsInGroup = g.ToList();
                var scores = modelsInGroup
                    .Where(m => healthLookup.ContainsKey(m.Id))
                    .Select(m => healthLookup[m.Id])
                    .ToList();

                var avgScore = scores.Count > 0 ? scores.Average(s => s.Score) : 0;
                var avgGrade = avgScore >= 90 ? "A" : avgScore >= 80 ? "B" : avgScore >= 70 ? "C" : avgScore >= 50 ? "D" : "F";

                return new TagGroupSummary
                {
                    Tag = g.Key,
                    TotalModels = modelsInGroup.Count,
                    ActiveModels = modelsInGroup.Count(m => m.IsActive),
                    FailingModels = modelsInGroup.Count(m => m.IsActive && m.ConsecutiveFailureCount > 0),
                    AvgHealthScore = Math.Round(avgScore, 1),
                    AvgGrade = avgGrade,
                    AvgUptimePercent = scores.Count > 0
                        ? Math.Round(scores.Average(s => s.UptimePoints / 0.4), 1)
                        : 0
                };
            })
            .OrderBy(g => g.Tag == "(Untagged)" ? 1 : 0) // Untagged at bottom
            .ThenBy(g => g.AvgHealthScore)
            .ToList();

        return groups;
    }

    // ── Private helpers ─────────────────────────────────────────────────────

    private static async Task<List<T>> ExecuteQueryAsync<T>(
        Container container,
        QueryDefinition query,
        QueryRequestOptions? options = null,
        CancellationToken ct = default)
    {
        var iterator = container.GetItemQueryIterator<T>(query, requestOptions: options);
        var results = new List<T>();

        while (iterator.HasMoreResults)
        {
            var page = await iterator.ReadNextAsync(ct);
            results.AddRange(page);
        }

        return results;
    }
}
