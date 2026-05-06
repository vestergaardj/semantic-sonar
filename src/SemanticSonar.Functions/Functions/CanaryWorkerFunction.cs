using System.Diagnostics;
using SemanticSonar.Functions.Models;
using SemanticSonar.Functions.Services;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.Logging;

namespace SemanticSonar.Functions.Functions;

/// <summary>
/// Dequeues and processes canary jobs.
///
/// Failure handling contract:
///  - Logical failures (bad DAX, permission denied, model offline): caught here,
///    recorded in Cosmos DB, NOT re-thrown. The queue message is deleted.
///  - Infrastructure failures (Cosmos DB unreachable, Key Vault unavailable):
///    re-thrown so the Functions runtime retries via the queue dead-letter mechanism
///    (maxDequeueCount = 3 in host.json).
///
/// After 30 consecutive logical failures the model is automatically disabled.
/// </summary>
public class CanaryWorkerFunction
{
    private const int DisableThreshold = 30;

    private readonly CosmosDbService _cosmos;
    private readonly PowerBiQueryService _powerBi;
    private readonly WebhookService _webhooks;
    private readonly ILogger<CanaryWorkerFunction> _logger;

    public CanaryWorkerFunction(
        CosmosDbService cosmos,
        PowerBiQueryService powerBi,
        WebhookService webhooks,
        ILogger<CanaryWorkerFunction> logger)
    {
        _cosmos = cosmos;
        _powerBi = powerBi;
        _webhooks = webhooks;
        _logger = logger;
    }

    [Function("CanaryWorker")]
    public async Task Run(
        [QueueTrigger("canary-jobs", Connection = "AzureWebJobsStorage")] CanaryJob job,
        FunctionContext context)
    {
        _logger.LogInformation("Processing canary job for model {ModelId} (tenant {TenantId}).",
            job.ModelId, job.TenantId);

        // ── Infrastructure reads (can throw → triggers queue retry) ──────────
        var model = await _cosmos.GetModelAsync(job.ModelId, job.TenantId);
        if (model is null)
        {
            _logger.LogWarning("Model {ModelId} not found — job discarded.", job.ModelId);
            return;
        }

        if (!model.IsActive && !job.ForceRun)
        {
            _logger.LogInformation("Model {ModelId} is inactive — job discarded.", job.ModelId);
            return;
        }

        var tenant = await _cosmos.GetTenantAsync(job.TenantId);
        if (tenant is null)
        {
            _logger.LogWarning("Tenant {TenantId} not found — job discarded.", job.TenantId);
            return;
        }

        // ── Execute the canary check ────────────────────────────────────────
        var activeWindow = MaintenanceWindow.GetActive(model.MaintenanceWindows, DateTime.UtcNow);
        var isRestMode = string.Equals(model.QueryMode, "rest", StringComparison.OrdinalIgnoreCase);
        var sw = Stopwatch.StartNew();
        QueryResult? queryResult = null;
        string? errorMessage = null;

        try
        {
            queryResult = isRestMode
                ? await _powerBi.PingDatasetAsync(model, tenant)
                : await _powerBi.ExecuteQueryAsync(model, tenant);
            sw.Stop();
        }
        catch (Exception ex)
        {
            sw.Stop();
            errorMessage = ex.Message;
            _logger.LogWarning(ex, "Canary query FAILED for model {ModelId} ({Name}).",
                model.Id, model.DisplayName);
        }

        var success = errorMessage is null;
        var previousFailureCount = model.ConsecutiveFailureCount;

        // ── Update model state (consecutive failure counter) ──────────────────
        if (success)
        {
            model.ConsecutiveFailureCount = 0;
            model.LastRunSuccess = true;

            // Fire recovery webhook only on actual transition (was failing → now OK)
            if (previousFailureCount > 0)
                await _webhooks.FireAsync(WebhookEvents.ModelRecovered, model,
                    $"Recovered after {previousFailureCount} consecutive failure(s).");
        }
        else
        {
            model.ConsecutiveFailureCount++;
            model.LastRunSuccess = false;

            if (model.ConsecutiveFailureCount >= DisableThreshold)
            {
                model.IsActive = false;
                _logger.LogWarning(
                    "Model {ModelId} ({Name}) DISABLED after {Count} consecutive failures.",
                    model.Id, model.DisplayName, model.ConsecutiveFailureCount);

                await _webhooks.FireAsync(WebhookEvents.ModelAutoDisabled, model,
                    $"Auto-disabled after {model.ConsecutiveFailureCount} consecutive failures.");
            }
            else if (previousFailureCount == 0)
            {
                // First failure — transition from healthy to failing
                await _webhooks.FireAsync(WebhookEvents.ModelFailed, model, errorMessage);
            }
        }

        model.LastRunAt = DateTime.UtcNow;

        // ── Check latest dataset refresh status (best-effort) ─────────────
        try
        {
            var refreshes = await _powerBi.GetRefreshHistoryAsync(tenant, model.WorkspaceId, model.DatasetId, top: 1);
            if (refreshes.Count > 0)
            {
                model.LastRefreshStatus = refreshes[0].Status;
                model.LastRefreshTime = refreshes[0].StartTime;
            }
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "Could not fetch refresh status for model {ModelId}.", model.Id);
        }

        // ── Cache datasources periodically (every 24h, best-effort) ────────
        if (model.DatasourcesCachedAt is null || (DateTime.UtcNow - model.DatasourcesCachedAt.Value).TotalHours > 24)
        {
            try
            {
                model.CachedDatasources = await _powerBi.GetDatasourcesAsync(model, tenant);
                model.DatasourcesCachedAt = DateTime.UtcNow;
            }
            catch (Exception ex)
            {
                _logger.LogDebug(ex, "Could not cache datasources for model {ModelId}.", model.Id);
            }
        }

        // Infrastructure writes — let exceptions bubble up for queue retry
        await _cosmos.UpsertModelAsync(model);

        await _cosmos.CreateResultAsync(new CanaryResult
        {
            Id = Guid.NewGuid().ToString(),
            ModelId = model.Id,
            TenantId = model.TenantId,
            ExecutedAt = DateTime.UtcNow,
            Success = success,
            LatencyMs = sw.ElapsedMilliseconds,
            RowCount = queryResult?.RowCount,
            FirstRowJson = queryResult?.FirstRowJson,
            ErrorMessage = errorMessage,
            DuringMaintenance = activeWindow?.SuppressAlerts == true
        });

        // ── Performance budget alerting (best-effort) ──────────────────────
        if (success)
        {
            try
            {
                await CheckLatencyBudgetAsync(model, sw.ElapsedMilliseconds);
            }
            catch (Exception ex)
            {
                _logger.LogDebug(ex, "Performance budget check failed for model {ModelId} — skipped.", model.Id);
            }
        }

        if (success)
        {
            _logger.LogInformation(
                "Canary OK for model {ModelId} ({Name}) — {LatencyMs}ms, {Rows} row(s).",
                model.Id, model.DisplayName, sw.ElapsedMilliseconds, queryResult!.RowCount);
        }
    }

    /// <summary>
    /// Compares the most recent latency against a rolling P50 baseline and fires
    /// a latency budget webhook if the warn or critical threshold is exceeded.
    /// </summary>
    private async Task CheckLatencyBudgetAsync(SemanticModelConfig model, long currentLatencyMs)
    {
        var sampleSize = model.LatencyBudgetSampleSize ?? 20;
        var warnMult = model.LatencyBudgetWarnMultiplier ?? 2.0;
        var critMult = model.LatencyBudgetCriticalMultiplier ?? 5.0;

        // Fetch the last (2×N + 1) successful results for this model.
        // The +1 accounts for the result we just wrote.
        var recentResults = await _cosmos.GetResultsForModelAsync(
            model.Id, limit: sampleSize * 2 + 1);

        var latencies = recentResults
            .Where(r => r.Success)
            .Select(r => r.LatencyMs)
            .ToList(); // already newest-first from Cosmos query

        if (latencies.Count < 5)
            return; // not enough history for a reliable baseline

        var window = latencies.Take(2 * sampleSize).ToList();
        var baselineHalf = window.Skip(sampleSize).ToList();
        var baselineSource = baselineHalf.Count >= 5 ? baselineHalf : window;
        var sorted = baselineSource.OrderBy(v => v).ToList();
        var idx = (int)Math.Ceiling(50 / 100.0 * sorted.Count) - 1;
        var baselineP50 = sorted[Math.Max(0, idx)];

        var warnThreshold = (long)(baselineP50 * warnMult);
        var critThreshold = (long)(baselineP50 * critMult);

        if (currentLatencyMs >= critThreshold)
        {
            await _webhooks.FireAsync(WebhookEvents.LatencyBudgetCritical, model,
                $"Latency {currentLatencyMs}ms exceeds CRITICAL threshold {critThreshold}ms " +
                $"({critMult}× baseline P50 of {baselineP50}ms).");
        }
        else if (currentLatencyMs >= warnThreshold)
        {
            await _webhooks.FireAsync(WebhookEvents.LatencyBudgetWarn, model,
                $"Latency {currentLatencyMs}ms exceeds WARN threshold {warnThreshold}ms " +
                $"({warnMult}× baseline P50 of {baselineP50}ms).");
        }
    }
}
