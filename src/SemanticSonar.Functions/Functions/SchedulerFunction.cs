using SemanticSonar.Functions.Models;
using SemanticSonar.Functions.Services;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.Logging;

namespace SemanticSonar.Functions.Functions;

/// <summary>
/// Runs every minute and enqueues a canary job for every active model
/// whose nextRunTime is at or before the current UTC time.
///
/// Update nextRunTime BEFORE enqueuing to minimise duplicate scheduling
/// across scaled-out instances (optimistic approach — rare duplicate in
/// worst-case crash scenario is acceptable for monitoring workloads).
/// </summary>
public class SchedulerFunction
{
    private readonly CosmosDbService _cosmos;
    private readonly QueueService _queue;
    private readonly ILogger<SchedulerFunction> _logger;

    public SchedulerFunction(
        CosmosDbService cosmos,
        QueueService queue,
        ILogger<SchedulerFunction> logger)
    {
        _cosmos = cosmos;
        _queue = queue;
        _logger = logger;
    }

    [Function("Scheduler")]
    public async Task Run(
        [TimerTrigger("0 * * * * *")] TimerInfo timer,
        FunctionContext context)
    {
        var now = DateTime.UtcNow;
        _logger.LogInformation("Scheduler fired at {Time}", now);

        var dueModels = await _cosmos.GetDueModelsAsync(now);

        if (dueModels.Count == 0)
        {
            _logger.LogDebug("No models due for execution.");
            return;
        }

        _logger.LogInformation("{Count} model(s) due for canary execution.", dueModels.Count);

        foreach (var model in dueModels)
        {
            // Skip models that are in a maintenance window with skipCanary enabled
            var activeWindow = MaintenanceWindow.GetActive(model.MaintenanceWindows, now);
            if (activeWindow?.SkipCanary == true)
            {
                model.NextRunTime = now.AddMinutes(model.IntervalMinutes);
                await _cosmos.UpsertModelAsync(model);
                _logger.LogDebug("Model {ModelId} ({Name}) in skip-canary maintenance window — skipped.",
                    model.Id, model.DisplayName);
                continue;
            }

            // Advance nextRunTime first to prevent re-queuing on the next tick
            model.NextRunTime = now.AddMinutes(model.IntervalMinutes);
            await _cosmos.UpsertModelAsync(model);

            await _queue.EnqueueJobAsync(new Models.CanaryJob
            {
                ModelId = model.Id,
                TenantId = model.TenantId,
                ForceRun = false
            });

            _logger.LogDebug("Scheduled model {ModelId} ({Name}), next run at {Next}.",
                model.Id, model.DisplayName, model.NextRunTime);
        }
    }
}
