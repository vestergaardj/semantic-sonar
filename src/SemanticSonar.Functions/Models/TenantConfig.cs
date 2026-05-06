using System.Text.Json.Serialization;

namespace SemanticSonar.Functions.Models;

public class TenantConfig
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = "";

    [JsonPropertyName("displayName")]
    public string DisplayName { get; set; } = "";

    /// <summary>The customer's Azure AD / Entra tenant ID (GUID).</summary>
    [JsonPropertyName("entraId")]
    public string EntraId { get; set; } = "";

    /// <summary>Application (client) ID of the service principal registered in the customer's tenant.</summary>
    [JsonPropertyName("clientId")]
    public string ClientId { get; set; } = "";

    [JsonPropertyName("isActive")]
    public bool IsActive { get; set; } = true;

    [JsonPropertyName("addedAt")]
    public DateTime AddedAt { get; set; } = DateTime.UtcNow;

    // Cosmos DB discriminator — keeps partition scans targeted
    [JsonPropertyName("type")]
    public string Type { get; } = "Tenant";
}
