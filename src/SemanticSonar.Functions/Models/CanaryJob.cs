using System.Text.Json.Serialization;

namespace SemanticSonar.Functions.Models;

/// <summary>Message placed on the Storage Queue by the Scheduler.</summary>
public class CanaryJob
{
    [JsonPropertyName("modelId")]
    public required string ModelId { get; set; }

    [JsonPropertyName("tenantId")]
    public required string TenantId { get; set; }

    /// <summary>When true the worker runs even if the model is inactive (Run Now button).</summary>
    [JsonPropertyName("forceRun")]
    public bool ForceRun { get; set; } = false;
}
