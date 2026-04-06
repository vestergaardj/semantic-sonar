using System.Text.Json.Serialization;

namespace SemanticSonar.Functions.Models;

public class DatasourceInfo
{
    [JsonPropertyName("datasourceType")]
    public string DatasourceType { get; set; } = "";

    /// <summary>JSON string of connection details (server, database, url, etc.).</summary>
    [JsonPropertyName("connectionDetails")]
    public string ConnectionDetails { get; set; } = "{}";

    [JsonPropertyName("datasourceId")]
    public string? DatasourceId { get; set; }

    [JsonPropertyName("gatewayId")]
    public string? GatewayId { get; set; }
}
