using System.Text.Json.Serialization;

namespace SemanticSonar.Functions.Models;

public class SemanticModelConfig
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = "";

    /// <summary>Partition key — references TenantConfig.Id.</summary>
    [JsonPropertyName("tenantId")]
    public string TenantId { get; set; } = "";

    [JsonPropertyName("workspaceId")]
    public string WorkspaceId { get; set; } = "";

    [JsonPropertyName("datasetId")]
    public string DatasetId { get; set; } = "";

    [JsonPropertyName("displayName")]
    public string DisplayName { get; set; } = "";

    /// <summary>
    /// DAX query to execute. Should be lightweight — e.g.
    /// EVALUATE ROW("SalesTotal", [Sum of Sales Value])
    /// Only used when QueryMode is "dax".
    /// </summary>
    [JsonPropertyName("daxQuery")]
    public string DaxQuery { get; set; } = "";

    /// <summary>
    /// "dax" (default): runs a DAX query via executeQueries.
    /// "rest": pings the dataset via the REST API (for live-connected AAS/SSAS models
    /// where executeQueries is blocked).
    /// </summary>
    [JsonPropertyName("queryMode")]
    public string QueryMode { get; set; } = "dax";

    /// <summary>How often to run the query, in minutes. Range: 60–43200.</summary>
    [JsonPropertyName("intervalMinutes")]
    public int IntervalMinutes { get; set; } = 60;

    /// <summary>Next scheduled execution time (UTC).</summary>
    [JsonPropertyName("nextRunTime")]
    public DateTime NextRunTime { get; set; } = DateTime.UtcNow;

    /// <summary>
    /// When false the scheduler skips this model.
    /// Automatically set to false after 30 consecutive failures.
    /// </summary>
    [JsonPropertyName("isActive")]
    public bool IsActive { get; set; } = true;

    /// <summary>Consecutive failure counter. Resets to 0 on first success.</summary>
    [JsonPropertyName("consecutiveFailureCount")]
    public int ConsecutiveFailureCount { get; set; } = 0;

    [JsonPropertyName("createdAt")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [JsonPropertyName("lastRunAt")]
    public DateTime? LastRunAt { get; set; }

    [JsonPropertyName("lastRunSuccess")]
    public bool? LastRunSuccess { get; set; }

    /// <summary>Status of the most recent Power BI dataset refresh (Unknown, Completed, Failed, Disabled).</summary>
    [JsonPropertyName("lastRefreshStatus")]
    public string? LastRefreshStatus { get; set; }

    /// <summary>When the most recent Power BI dataset refresh started.</summary>
    [JsonPropertyName("lastRefreshTime")]
    public DateTime? LastRefreshTime { get; set; }

    /// <summary>Maintenance windows controlling alert suppression and canary skip.</summary>
    [JsonPropertyName("maintenanceWindows")]
    public List<MaintenanceWindow>? MaintenanceWindows { get; set; }

    /// <summary>User-defined tags for grouping and filtering.</summary>
    [JsonPropertyName("tags")]
    public List<string> Tags { get; set; } = [];

    /// <summary>Datasources cached from the Power BI API by the canary worker.</summary>
    [JsonPropertyName("cachedDatasources")]
    public List<DatasourceInfo>? CachedDatasources { get; set; }

    [JsonPropertyName("datasourcesCachedAt")]
    public DateTime? DatasourcesCachedAt { get; set; }

    // ── Performance Budget ────────────────────────────────────────────────

    /// <summary>
    /// Number of recent successful executions used to compute the rolling baseline.
    /// The window is split: the older half becomes the baseline, the newer half is current.
    /// Defaults to 20 if null.
    /// </summary>
    [JsonPropertyName("latencyBudgetSampleSize")]
    public int? LatencyBudgetSampleSize { get; set; }

    /// <summary>
    /// Multiplier above the baseline P50 at which a latency WARN alert is raised.
    /// Defaults to 2.0 (i.e. 2× baseline) if null.
    /// </summary>
    [JsonPropertyName("latencyBudgetWarnMultiplier")]
    public double? LatencyBudgetWarnMultiplier { get; set; }

    /// <summary>
    /// Multiplier above the baseline P50 at which a latency CRITICAL alert is raised.
    /// Defaults to 5.0 (i.e. 5× baseline) if null.
    /// </summary>
    [JsonPropertyName("latencyBudgetCriticalMultiplier")]
    public double? LatencyBudgetCriticalMultiplier { get; set; }

    [JsonPropertyName("type")]
    public string Type { get; } = "SemanticModel";
}
