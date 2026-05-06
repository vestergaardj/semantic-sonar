using System.Text.Json.Serialization;

namespace SemanticSonar.Functions.Models;

public class TagDefinition
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = Guid.NewGuid().ToString();

    /// <summary>Canonical display name with intended casing.</summary>
    [JsonPropertyName("name")]
    public string Name { get; set; } = "";

    [JsonPropertyName("createdAt")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [JsonPropertyName("type")]
    public string Type { get; } = "Tag";
}
