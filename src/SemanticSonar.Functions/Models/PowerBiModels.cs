namespace SemanticSonar.Functions.Models;

public class PowerBiWorkspace
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
}

public class PowerBiDataset
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public string ConfiguredBy { get; set; } = "";
}

public class SuggestDaxResponse
{
    public string Dax { get; set; } = "";
    public string Description { get; set; } = "";
    public bool IsFallback { get; set; }
}

public class DatasetRefreshEntry
{
    public string RequestId { get; set; } = "";
    public string Status { get; set; } = "";
    public DateTime? StartTime { get; set; }
    public DateTime? EndTime { get; set; }
    public string? RefreshType { get; set; }
    public string? ServiceExceptionJson { get; set; }
}
