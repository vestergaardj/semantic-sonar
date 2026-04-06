using SemanticSonar.Functions.Helpers;
using SemanticSonar.Functions.Models;
using SemanticSonar.Functions.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.Logging;

namespace SemanticSonar.Functions.Functions;

public class WebhooksApi
{
    private readonly CosmosDbService _cosmos;
    private readonly WebhookService _webhookService;
    private readonly ILogger<WebhooksApi> _logger;

    public WebhooksApi(CosmosDbService cosmos, WebhookService webhookService, ILogger<WebhooksApi> logger)
    {
        _cosmos = cosmos;
        _webhookService = webhookService;
        _logger = logger;
    }

    [Function("ListWebhooks")]
    public async Task<IActionResult> ListWebhooks(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "webhooks")] HttpRequest req)
    {
        var tenantId = req.Query["tenantId"].FirstOrDefault();
        var webhooks = await _cosmos.ListWebhooksAsync(tenantId);
        return new OkObjectResult(webhooks);
    }

    [Function("GetWebhook")]
    public async Task<IActionResult> GetWebhook(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "webhooks/{id}")] HttpRequest req,
        string id)
    {
        var wh = await _cosmos.GetWebhookAsync(id);
        return wh is null ? new NotFoundResult() : new OkObjectResult(wh);
    }

    [Function("CreateWebhook")]
    public async Task<IActionResult> CreateWebhook(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "webhooks")] HttpRequest req)
    {
        WebhookConfig? input;
        try { input = await req.ReadFromJsonAsync<WebhookConfig>(); }
        catch { return new BadRequestObjectResult("Invalid JSON body."); }

        if (input is null)
            return new BadRequestObjectResult("Request body is required.");

        var error = Validate(input);
        if (error is not null)
            return new BadRequestObjectResult(error);

        var wh = new WebhookConfig
        {
            Id = Guid.NewGuid().ToString(),
            TenantId = input.TenantId ?? "",
            DisplayName = input.DisplayName.Trim(),
            Url = input.Url.Trim(),
            Secret = input.Secret?.Trim() ?? "",
            Events = input.Events.Distinct().ToList(),
            IsActive = true,
            CreatedAt = DateTime.UtcNow
        };

        var created = await _cosmos.UpsertWebhookAsync(wh);
        await _cosmos.AuditAsync(wh.TenantId, "Webhook", wh.Id, "Created",
            $"'{wh.DisplayName}'", AuthHelper.GetUserEmail(req));
        return new ObjectResult(created) { StatusCode = StatusCodes.Status201Created };
    }

    [Function("UpdateWebhook")]
    public async Task<IActionResult> UpdateWebhook(
        [HttpTrigger(AuthorizationLevel.Anonymous, "put", Route = "webhooks/{id}")] HttpRequest req,
        string id)
    {
        var existing = await _cosmos.GetWebhookAsync(id);
        if (existing is null) return new NotFoundResult();

        WebhookConfig? input;
        try { input = await req.ReadFromJsonAsync<WebhookConfig>(); }
        catch { return new BadRequestObjectResult("Invalid JSON body."); }

        if (input is null)
            return new BadRequestObjectResult("Request body is required.");

        if (!string.IsNullOrWhiteSpace(input.DisplayName))
            existing.DisplayName = input.DisplayName.Trim();
        if (!string.IsNullOrWhiteSpace(input.Url))
        {
            if (!input.Url.Trim().StartsWith("https://", StringComparison.OrdinalIgnoreCase))
                return new BadRequestObjectResult("Webhook URL must use HTTPS.");
            existing.Url = input.Url.Trim();
        }
        if (input.Secret is not null)
            existing.Secret = input.Secret.Trim();
        if (input.Events is not null && input.Events.Count > 0)
        {
            if (input.Events.Any(e => !WebhookEvents.IsValid(e)))
                return new BadRequestObjectResult($"Invalid event type. Valid: {string.Join(", ", WebhookEvents.All)}");
            existing.Events = input.Events.Distinct().ToList();
        }
        existing.IsActive = input.IsActive;

        var updated = await _cosmos.UpsertWebhookAsync(existing);
        await _cosmos.AuditAsync(existing.TenantId, "Webhook", existing.Id, "Updated",
            $"'{existing.DisplayName}'", AuthHelper.GetUserEmail(req));
        return new OkObjectResult(updated);
    }

    [Function("DeleteWebhook")]
    public async Task<IActionResult> DeleteWebhook(
        [HttpTrigger(AuthorizationLevel.Anonymous, "delete", Route = "webhooks/{id}")] HttpRequest req,
        string id)
    {
        var existing = await _cosmos.GetWebhookAsync(id);
        if (existing is null) return new NotFoundResult();

        await _cosmos.DeleteWebhookAsync(id);
        await _cosmos.AuditAsync(existing.TenantId, "Webhook", id, "Deleted",
            $"'{existing.DisplayName}'", AuthHelper.GetUserEmail(req));
        return new NoContentResult();
    }

    [Function("TestWebhook")]
    public async Task<IActionResult> TestWebhook(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "webhooks/{id}/test")] HttpRequest req,
        string id)
    {
        var wh = await _cosmos.GetWebhookAsync(id);
        if (wh is null) return new NotFoundResult();

        var testModel = new SemanticModelConfig
        {
            Id = "test-model",
            TenantId = wh.TenantId,
            DisplayName = "Test Model"
        };

        await _webhookService.FireAsync("model.failed", testModel, "This is a test webhook delivery.");
        return new OkObjectResult(new { status = "sent" });
    }

    private static string? Validate(WebhookConfig wh)
    {
        if (string.IsNullOrWhiteSpace(wh.DisplayName))
            return "displayName is required.";
        if (string.IsNullOrWhiteSpace(wh.Url))
            return "url is required.";
        if (!wh.Url.Trim().StartsWith("https://", StringComparison.OrdinalIgnoreCase))
            return "Webhook URL must use HTTPS.";
        if (wh.Events is null || wh.Events.Count == 0)
            return "At least one event type is required.";
        if (wh.Events.Any(e => !WebhookEvents.IsValid(e)))
            return $"Invalid event type. Valid: {string.Join(", ", WebhookEvents.All)}";
        return null;
    }
}
