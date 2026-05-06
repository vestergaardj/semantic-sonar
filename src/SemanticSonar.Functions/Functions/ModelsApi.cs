using SemanticSonar.Functions.Helpers;
using SemanticSonar.Functions.Models;
using SemanticSonar.Functions.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.Logging;

namespace SemanticSonar.Functions.Functions;

public class ModelsApi
{
    private const int MinIntervalMinutes = 60;
    private const int MaxIntervalMinutes = 43_200; // 30 days

    private readonly CosmosDbService _cosmos;
    private readonly QueueService _queue;
    private readonly ILogger<ModelsApi> _logger;

    public ModelsApi(CosmosDbService cosmos, QueueService queue, ILogger<ModelsApi> logger)
    {
        _cosmos = cosmos;
        _queue = queue;
        _logger = logger;
    }

    [Function("ListModels")]
    public async Task<IActionResult> ListModels(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "models")] HttpRequest req)
    {
        var authResult = AuthHelper.EnforceAuth(req);
        if (authResult != null) return authResult;

        var tenantId = req.Query["tenantId"].FirstOrDefault();
        var models = await _cosmos.ListModelsAsync(tenantId);
        return new OkObjectResult(models);
    }

    [Function("GetModel")]
    public async Task<IActionResult> GetModel(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "models/{id}")] HttpRequest req,
        string id)
    {
        var authResult = AuthHelper.EnforceAuth(req);
        if (authResult != null) return authResult;

        var tenantId = req.Query["tenantId"].FirstOrDefault();
        if (string.IsNullOrEmpty(tenantId))
            return new BadRequestObjectResult("tenantId query parameter is required.");

        var model = await _cosmos.GetModelAsync(id, tenantId);
        return model is null ? new NotFoundResult() : new OkObjectResult(model);
    }

    [Function("CreateModel")]
    public async Task<IActionResult> CreateModel(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "models")] HttpRequest req)
    {
        var authResult = AuthHelper.EnforceAuth(req);
        if (authResult != null) return authResult;

        SemanticModelConfig? input;
        try
        {
            input = await req.ReadFromJsonAsync<SemanticModelConfig>();
        }
        catch
        {
            return new BadRequestObjectResult("Invalid JSON body.");
        }

        if (input is null)
            return new BadRequestObjectResult("Request body is required.");

        var validationError = ValidateModel(input);
        if (validationError is not null)
            return new BadRequestObjectResult(validationError);

        // Ensure the tenant exists
        var tenant = await _cosmos.GetTenantAsync(input.TenantId);
        if (tenant is null)
            return new BadRequestObjectResult($"Tenant '{input.TenantId}' does not exist.");

        var model = new SemanticModelConfig
        {
            Id = Guid.NewGuid().ToString(),
            TenantId = input.TenantId,
            WorkspaceId = input.WorkspaceId.Trim(),
            DatasetId = input.DatasetId.Trim(),
            DisplayName = input.DisplayName.Trim(),
            DaxQuery = input.DaxQuery?.Trim() ?? "",
            QueryMode = string.Equals(input.QueryMode, "rest", StringComparison.OrdinalIgnoreCase) ? "rest" : "dax",
            IntervalMinutes = input.IntervalMinutes,
            NextRunTime = DateTime.UtcNow, // schedule immediately
            IsActive = true,
            ConsecutiveFailureCount = 0,
            CreatedAt = DateTime.UtcNow,
            MaintenanceWindows = input.MaintenanceWindows,
            Tags = NormalizeTags(input.Tags)
        };

        var created = await _cosmos.UpsertModelAsync(model);
        await _cosmos.AuditAsync(model.TenantId, "Model", model.Id, "Created",
            $"'{model.DisplayName}'", AuthHelper.GetUserEmail(req));
        return new ObjectResult(created) { StatusCode = StatusCodes.Status201Created };
    }

    /// <summary>Bulk-creates multiple models in one call (used by workspace import).</summary>
    [Function("BulkCreateModels")]
    public async Task<IActionResult> BulkCreateModels(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "models/bulk")] HttpRequest req)
    {
        var authResult = AuthHelper.EnforceAuth(req);
        if (authResult != null) return authResult;

        List<SemanticModelConfig>? inputs;
        try
        {
            inputs = await req.ReadFromJsonAsync<List<SemanticModelConfig>>();
        }
        catch
        {
            return new BadRequestObjectResult("Invalid JSON body. Expected an array of model objects.");
        }

        if (inputs is null || inputs.Count == 0)
            return new BadRequestObjectResult("Request body must be a non-empty array.");

        if (inputs.Count > 50)
            return new BadRequestObjectResult("Maximum 50 models per bulk import.");

        // Validate all first
        var tenantCache = new Dictionary<string, bool>();
        for (int i = 0; i < inputs.Count; i++)
        {
            var validationError = ValidateModel(inputs[i]);
            if (validationError is not null)
                return new BadRequestObjectResult($"Item {i}: {validationError}");

            if (!tenantCache.ContainsKey(inputs[i].TenantId))
            {
                var tenant = await _cosmos.GetTenantAsync(inputs[i].TenantId);
                tenantCache[inputs[i].TenantId] = tenant is not null;
            }
            if (!tenantCache[inputs[i].TenantId])
                return new BadRequestObjectResult($"Item {i}: Tenant '{inputs[i].TenantId}' does not exist.");
        }

        var created = new List<SemanticModelConfig>();
        foreach (var input in inputs)
        {
            var model = new SemanticModelConfig
            {
                Id = Guid.NewGuid().ToString(),
                TenantId = input.TenantId,
                WorkspaceId = input.WorkspaceId.Trim(),
                DatasetId = input.DatasetId.Trim(),
                DisplayName = input.DisplayName.Trim(),
                DaxQuery = input.DaxQuery?.Trim() ?? "",
                QueryMode = string.Equals(input.QueryMode, "rest", StringComparison.OrdinalIgnoreCase) ? "rest" : "dax",
                IntervalMinutes = input.IntervalMinutes,
                NextRunTime = DateTime.UtcNow,
                IsActive = true,
                ConsecutiveFailureCount = 0,
                CreatedAt = DateTime.UtcNow,
                MaintenanceWindows = input.MaintenanceWindows,
                Tags = NormalizeTags(input.Tags)
            };

            var result = await _cosmos.UpsertModelAsync(model);
            await _cosmos.AuditAsync(model.TenantId, "Model", model.Id, "Created",
                $"Bulk import '{model.DisplayName}'", AuthHelper.GetUserEmail(req));
            created.Add(result);
        }

        _logger.LogInformation("Bulk created {Count} models.", created.Count);
        return new ObjectResult(created) { StatusCode = StatusCodes.Status201Created };
    }

    [Function("UpdateModel")]
    public async Task<IActionResult> UpdateModel(
        [HttpTrigger(AuthorizationLevel.Anonymous, "put", Route = "models/{id}")] HttpRequest req,
        string id)
    {
        var authResult = AuthHelper.EnforceAuth(req);
        if (authResult != null) return authResult;

        var tenantId = req.Query["tenantId"].FirstOrDefault();
        if (string.IsNullOrEmpty(tenantId))
            return new BadRequestObjectResult("tenantId query parameter is required.");

        var existing = await _cosmos.GetModelAsync(id, tenantId);
        if (existing is null)
            return new NotFoundResult();

        SemanticModelConfig? input;
        try
        {
            input = await req.ReadFromJsonAsync<SemanticModelConfig>();
        }
        catch
        {
            return new BadRequestObjectResult("Invalid JSON body.");
        }

        if (input is null)
            return new BadRequestObjectResult("Request body is required.");

        // Apply allowed updates
        if (!string.IsNullOrWhiteSpace(input.DisplayName))
            existing.DisplayName = input.DisplayName.Trim();
        if (!string.IsNullOrWhiteSpace(input.DaxQuery))
            existing.DaxQuery = input.DaxQuery.Trim();
        if (!string.IsNullOrWhiteSpace(input.QueryMode))
            existing.QueryMode = string.Equals(input.QueryMode, "rest", StringComparison.OrdinalIgnoreCase) ? "rest" : "dax";
        if (input.IntervalMinutes >= MinIntervalMinutes && input.IntervalMinutes <= MaxIntervalMinutes)
        {
            existing.IntervalMinutes = input.IntervalMinutes;
            // Re-schedule based on new interval
            existing.NextRunTime = DateTime.UtcNow.AddMinutes(input.IntervalMinutes);
        }
        if (input.MaintenanceWindows is not null)
            existing.MaintenanceWindows = input.MaintenanceWindows;
        if (input.Tags is not null)
            existing.Tags = NormalizeTags(input.Tags);

        var updated = await _cosmos.UpsertModelAsync(existing);
        await _cosmos.AuditAsync(existing.TenantId, "Model", existing.Id, "Updated",
            $"'{existing.DisplayName}'", AuthHelper.GetUserEmail(req));
        return new OkObjectResult(updated);
    }

    [Function("DeleteModel")]
    public async Task<IActionResult> DeleteModel(
        [HttpTrigger(AuthorizationLevel.Anonymous, "delete", Route = "models/{id}")] HttpRequest req,
        string id)
    {
        var authResult = AuthHelper.EnforceAuth(req);
        if (authResult != null) return authResult;

        var tenantId = req.Query["tenantId"].FirstOrDefault();
        if (string.IsNullOrEmpty(tenantId))
            return new BadRequestObjectResult("tenantId query parameter is required.");

        var existing = await _cosmos.GetModelAsync(id, tenantId);
        if (existing is null)
            return new NotFoundResult();

        await _cosmos.DeleteModelAsync(id, tenantId);
        await _cosmos.AuditAsync(tenantId, "Model", id, "Deleted",
            $"'{existing.DisplayName}'", AuthHelper.GetUserEmail(req));
        return new NoContentResult();
    }

    /// <summary>Immediately enqueues a canary job, bypassing the schedule.</summary>
    [Function("RunModelNow")]
    public async Task<IActionResult> RunModelNow(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "models/{id}/run")] HttpRequest req,
        string id)
    {
        var authResult = AuthHelper.EnforceAuth(req);
        if (authResult != null) return authResult;

        var tenantId = req.Query["tenantId"].FirstOrDefault();
        if (string.IsNullOrEmpty(tenantId))
            return new BadRequestObjectResult("tenantId query parameter is required.");

        var model = await _cosmos.GetModelAsync(id, tenantId);
        if (model is null)
            return new NotFoundResult();

        await _queue.EnqueueJobAsync(new CanaryJob
        {
            ModelId = model.Id,
            TenantId = model.TenantId,
            ForceRun = true
        });

        _logger.LogInformation("Manual run triggered for model {ModelId} by dashboard user.", id);
        return new AcceptedResult();
    }

    /// <summary>Manually disables a model.</summary>
    [Function("DisableModel")]
    public async Task<IActionResult> DisableModel(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "models/{id}/disable")] HttpRequest req,
        string id)
    {
        var authResult = AuthHelper.EnforceAuth(req);
        if (authResult != null) return authResult;

        var tenantId = req.Query["tenantId"].FirstOrDefault();
        if (string.IsNullOrEmpty(tenantId))
            return new BadRequestObjectResult("tenantId query parameter is required.");

        var model = await _cosmos.GetModelAsync(id, tenantId);
        if (model is null)
            return new NotFoundResult();

        model.IsActive = false;

        var updated = await _cosmos.UpsertModelAsync(model);
        await _cosmos.AuditAsync(model.TenantId, "Model", id, "Disabled",
            $"'{model.DisplayName}'", AuthHelper.GetUserEmail(req));
        _logger.LogInformation("Model {ModelId} manually disabled by dashboard user.", id);
        return new OkObjectResult(updated);
    }

    /// <summary>Re-enables a model that was automatically disabled after 30 failures.</summary>
    [Function("EnableModel")]
    public async Task<IActionResult> EnableModel(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "models/{id}/enable")] HttpRequest req,
        string id)
    {
        var authResult = AuthHelper.EnforceAuth(req);
        if (authResult != null) return authResult;

        var tenantId = req.Query["tenantId"].FirstOrDefault();
        if (string.IsNullOrEmpty(tenantId))
            return new BadRequestObjectResult("tenantId query parameter is required.");

        var model = await _cosmos.GetModelAsync(id, tenantId);
        if (model is null)
            return new NotFoundResult();

        model.IsActive = true;
        model.ConsecutiveFailureCount = 0;
        model.NextRunTime = DateTime.UtcNow.AddMinutes(model.IntervalMinutes);

        var updated = await _cosmos.UpsertModelAsync(model);
        await _cosmos.AuditAsync(model.TenantId, "Model", id, "Enabled",
            $"'{model.DisplayName}'", AuthHelper.GetUserEmail(req));
        _logger.LogInformation("Model {ModelId} re-enabled by dashboard user.", id);
        return new OkObjectResult(updated);
    }

    // ── Validation ───────────────────────────────────────────────────────────

    private static string? ValidateModel(SemanticModelConfig m)
    {
        if (string.IsNullOrWhiteSpace(m.TenantId)) return "tenantId is required.";
        if (string.IsNullOrWhiteSpace(m.WorkspaceId)) return "workspaceId is required.";
        if (string.IsNullOrWhiteSpace(m.DatasetId)) return "datasetId is required.";
        if (string.IsNullOrWhiteSpace(m.DisplayName)) return "displayName is required.";
        var isRest = string.Equals(m.QueryMode, "rest", StringComparison.OrdinalIgnoreCase);
        if (!isRest && string.IsNullOrWhiteSpace(m.DaxQuery)) return "daxQuery is required for DAX mode.";
        if (m.IntervalMinutes < MinIntervalMinutes || m.IntervalMinutes > MaxIntervalMinutes)
            return $"intervalMinutes must be between {MinIntervalMinutes} and {MaxIntervalMinutes}.";
        if (m.Tags is not null && m.Tags.Count > 1)
            return "Maximum 1 tag per model.";
        if (m.Tags is not null && m.Tags.Any(t => t.Length > 50))
            return "Each tag must be 50 characters or fewer.";
        return null;
    }

    private static List<string> NormalizeTags(List<string>? tags) =>
        tags?.Where(t => !string.IsNullOrWhiteSpace(t))
            .Select(t => t.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Take(1)
            .ToList() ?? [];
}
