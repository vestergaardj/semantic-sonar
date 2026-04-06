using System.Text.Json.Serialization;

namespace SemanticSonar.Functions.Models;

public class CanaryResult
{
    [JsonPropertyName("id")]
    public required string Id { get; set; }

    /// <summary>Partition key — references SemanticModelConfig.Id.</summary>
    [JsonPropertyName("modelId")]
    public required string ModelId { get; set; }

    [JsonPropertyName("tenantId")]
    public required string TenantId { get; set; }

    [JsonPropertyName("executedAt")]
    public DateTime ExecutedAt { get; set; } = DateTime.UtcNow;

    [JsonPropertyName("success")]
    public bool Success { get; set; }

    [JsonPropertyName("latencyMs")]
    public long LatencyMs { get; set; }

    [JsonPropertyName("rowCount")]
    public int? RowCount { get; set; }

    /// <summary>JSON representation of the first returned row.</summary>
    [JsonPropertyName("firstRowJson")]
    public string? FirstRowJson { get; set; }

    [JsonPropertyName("errorMessage")]
    public string? ErrorMessage { get; set; }

    /// <summary>True when the check ran during a maintenance window with suppressAlerts enabled.</summary>
    [JsonPropertyName("duringMaintenance")]
    public bool DuringMaintenance { get; set; }

    [JsonPropertyName("type")]
    public string Type { get; } = "CanaryResult";

    /// <summary>Cosmos DB TTL: 90 days. Container must have defaultTtl = -1.</summary>
    [JsonPropertyName("ttl")]
    public int Ttl { get; } = 7_776_000; // 90 days in seconds
}
