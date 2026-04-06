using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using SemanticSonar.Functions.Models;
using Microsoft.Extensions.Logging;

namespace SemanticSonar.Functions.Services;

/// <summary>
/// Sends webhook notifications for model state transitions.
/// Webhooks are signed with HMAC-SHA256 via the X-Signature header.
/// </summary>
public class WebhookService
{
    private readonly CosmosDbService _cosmos;
    private readonly IHttpClientFactory _httpFactory;
    private readonly ILogger<WebhookService> _logger;

    public WebhookService(CosmosDbService cosmos, IHttpClientFactory httpFactory, ILogger<WebhookService> logger)
    {
        _cosmos = cosmos;
        _httpFactory = httpFactory;
        _logger = logger;
    }

    /// <summary>Fires matching webhooks for a given event. Best-effort — never throws.</summary>
    public async Task FireAsync(string eventType, SemanticModelConfig model, string? details = null)
    {
        try
        {
            var webhooks = await _cosmos.ListWebhooksAsync(model.TenantId);
            var matching = webhooks
                .Where(w => w.IsActive && w.Events.Contains(eventType))
                .ToList();

            if (matching.Count == 0) return;

            var payload = new WebhookPayload
            {
                Event = eventType,
                Timestamp = DateTime.UtcNow,
                ModelId = model.Id,
                ModelName = model.DisplayName,
                TenantId = model.TenantId,
                Details = details
            };

            var json = JsonSerializer.Serialize(payload);
            var client = _httpFactory.CreateClient("webhooks");
            client.Timeout = TimeSpan.FromSeconds(10);

            foreach (var wh in matching)
            {
                try
                {
                    var request = new HttpRequestMessage(HttpMethod.Post, wh.Url)
                    {
                        Content = new StringContent(json, Encoding.UTF8, "application/json")
                    };

                    if (!string.IsNullOrEmpty(wh.Secret))
                    {
                        var signature = ComputeSignature(json, wh.Secret);
                        request.Headers.Add("X-Signature", signature);
                    }

                    request.Headers.Add("X-Webhook-Event", eventType);

                    var response = await client.SendAsync(request);
                    wh.LastTriggeredAt = DateTime.UtcNow;
                    wh.LastStatus = (int)response.StatusCode;
                    await _cosmos.UpsertWebhookAsync(wh);

                    _logger.LogInformation("Webhook {WebhookId} fired {Event} for model {ModelId} → {StatusCode}",
                        wh.Id, eventType, model.Id, (int)response.StatusCode);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Webhook {WebhookId} delivery failed for {Event}.", wh.Id, eventType);
                    wh.LastTriggeredAt = DateTime.UtcNow;
                    wh.LastStatus = 0;
                    try { await _cosmos.UpsertWebhookAsync(wh); } catch { /* best-effort */ }
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to fire webhooks for event {Event} on model {ModelId}.", eventType, model.Id);
        }
    }

    private static string ComputeSignature(string payload, string secret)
    {
        var keyBytes = Encoding.UTF8.GetBytes(secret);
        var payloadBytes = Encoding.UTF8.GetBytes(payload);
        var hash = HMACSHA256.HashData(keyBytes, payloadBytes);
        return $"sha256={Convert.ToHexString(hash).ToLowerInvariant()}";
    }
}
