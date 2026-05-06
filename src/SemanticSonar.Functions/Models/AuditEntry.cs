using System.Text.Json.Serialization;

namespace SemanticSonar.Functions.Models;

public class AuditEntry
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = Guid.NewGuid().ToString();

    /// <summary>Partition key. For tenant-scoped actions use the tenant ID; for global use "system".</summary>
    [JsonPropertyName("tenantId")]
    public string TenantId { get; set; } = "";

    [JsonPropertyName("entityType")]
    public string EntityType { get; set; } = ""; // Tenant, Model

    [JsonPropertyName("entityId")]
    public string EntityId { get; set; } = "";

    [JsonPropertyName("action")]
    public string Action { get; set; } = ""; // Created, Updated, Deleted, Enabled, Disabled, SecretSet

    [JsonPropertyName("details")]
    public string? Details { get; set; }

    [JsonPropertyName("timestamp")]
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;

    [JsonPropertyName("userId")]
    public string? UserId { get; set; }

    [JsonPropertyName("type")]
    public string Type { get; } = "AuditEntry";

    /// <summary>90-day TTL.</summary>
    [JsonPropertyName("ttl")]
    public int Ttl { get; } = 7_776_000;
}
