using System.Text.Json.Serialization;

namespace SemanticSonar.Functions.Models;

/// <summary>
/// Stored in the tenants container with Type = "Webhook".
/// Partition key: id.
/// </summary>
public class WebhookConfig
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = "";

    /// <summary>The tenant this webhook belongs to (empty = global).</summary>
    [JsonPropertyName("tenantId")]
    public string TenantId { get; set; } = "";

    [JsonPropertyName("displayName")]
    public string DisplayName { get; set; } = "";

    /// <summary>HTTPS URL to POST events to.</summary>
    [JsonPropertyName("url")]
    public string Url { get; set; } = "";

    /// <summary>Shared secret for HMAC-SHA256 signature (X-Signature header).</summary>
    [JsonPropertyName("secret")]
    public string Secret { get; set; } = "";

    /// <summary>Which event types to fire for.</summary>
    [JsonPropertyName("events")]
    public List<string> Events { get; set; } = [];

    [JsonPropertyName("isActive")]
    public bool IsActive { get; set; } = true;

    [JsonPropertyName("createdAt")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [JsonPropertyName("lastTriggeredAt")]
    public DateTime? LastTriggeredAt { get; set; }

    [JsonPropertyName("lastStatus")]
    public int? LastStatus { get; set; }

    [JsonPropertyName("type")]
    public string Type { get; } = "Webhook";
}

/// <summary>Valid webhook event types.</summary>
public static class WebhookEvents
{
    public const string ModelFailed = "model.failed";
    public const string ModelRecovered = "model.recovered";
    public const string ModelAutoDisabled = "model.autoDisabled";
    public const string LatencyBudgetWarn = "latency.budget.warn";
    public const string LatencyBudgetCritical = "latency.budget.critical";

    public static readonly string[] All =
    [
        ModelFailed, ModelRecovered, ModelAutoDisabled,
        LatencyBudgetWarn, LatencyBudgetCritical
    ];

    public static bool IsValid(string e) => All.Contains(e);
}

/// <summary>Payload sent to webhook endpoints.</summary>
public class WebhookPayload
{
    [JsonPropertyName("event")]
    public string Event { get; set; } = "";

    [JsonPropertyName("timestamp")]
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;

    [JsonPropertyName("modelId")]
    public string ModelId { get; set; } = "";

    [JsonPropertyName("modelName")]
    public string ModelName { get; set; } = "";

    [JsonPropertyName("tenantId")]
    public string TenantId { get; set; } = "";

    [JsonPropertyName("details")]
    public string? Details { get; set; }
}
