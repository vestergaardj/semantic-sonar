namespace SemanticSonar.Functions.Models;

/// <summary>Parsed result from the Power BI executeQueries REST API.</summary>
public class QueryResult
{
    public int RowCount { get; init; }
    public string? FirstRowJson { get; init; }
}

/// <summary>Aggregated dashboard statistics.</summary>
public class DashboardSummary
{
    public int TotalModels { get; init; }
    public int ActiveModels { get; init; }
    public int DisabledModels { get; init; }
    public int FailingModels { get; init; }
    public List<RecentFailureItem> RecentFailures { get; init; } = [];
    public List<AtRiskModelItem> AtRiskModels { get; init; } = [];
}

public class RecentFailureItem
{
    public required string ModelId { get; init; }
    public required string ModelName { get; init; }
    public required string TenantId { get; init; }
    public string TenantName { get; init; } = "";
    public DateTime FailedAt { get; init; }
    public string? ErrorMessage { get; init; }
    public long LatencyMs { get; init; }
}

public class AtRiskModelItem
{
    public required string ModelId { get; init; }
    public required string ModelName { get; init; }
    public required string TenantId { get; init; }
    public string TenantName { get; init; } = "";
    public int ConsecutiveFailureCount { get; init; }
}

/// <summary>Uptime / SLA statistics for a single model across rolling windows.</summary>
public class ModelUptimeStats
{
    public required string ModelId { get; init; }
    public required string ModelName { get; init; }
    public required string TenantId { get; init; }
    public string TenantName { get; init; } = "";
    public bool IsActive { get; init; }
    /// <summary>Total checks, successes, and uptime % for 24h window.</summary>
    public UptimeWindow Last24h { get; init; } = new();
    /// <summary>Total checks, successes, and uptime % for 7-day window.</summary>
    public UptimeWindow Last7d { get; init; } = new();
    /// <summary>Total checks, successes, and uptime % for 30-day window.</summary>
    public UptimeWindow Last30d { get; init; } = new();
}

public class UptimeWindow
{
    public int TotalChecks { get; set; }
    public int Successes { get; set; }
    /// <summary>Availability percentage (0–100), null if no checks in window.</summary>
    public double? UptimePercent { get; set; }
}

/// <summary>Latency trend data for a single model.</summary>
public class ModelLatencyTrend
{
    public required string ModelId { get; init; }
    public required string ModelName { get; init; }
    public required string TenantId { get; init; }
    public string TenantName { get; init; } = "";
    /// <summary>p50 latency (ms) over the recent 7 days.</summary>
    public long? P50Recent { get; init; }
    /// <summary>p95 latency (ms) over the recent 7 days.</summary>
    public long? P95Recent { get; init; }
    /// <summary>p50 latency (ms) over the prior 7 days (days 8–14).</summary>
    public long? P50Prior { get; init; }
    /// <summary>p95 latency (ms) over the prior 7 days (days 8–14).</summary>
    public long? P95Prior { get; init; }
    /// <summary>% change in p95 from prior to recent. Positive = regression.</summary>
    public double? P95ChangePercent { get; init; }
    /// <summary>True when p95 increased by ≥ 50% and recent p95 ≥ 500ms.</summary>
    public bool Alert { get; init; }
    /// <summary>Number of successful checks in the recent 7 days.</summary>
    public int RecentCheckCount { get; init; }
    /// <summary>Daily p95 values for the last 14 days (oldest first). Null entries = no data that day.</summary>
    public List<DailyLatencyPoint> DailyP95 { get; init; } = [];
}

public class DailyLatencyPoint
{
    public string Date { get; set; } = "";
    public long? P95 { get; set; }
}

/// <summary>Composite health score for a single model.</summary>
public class ModelHealthScore
{
    public required string ModelId { get; init; }
    public required string ModelName { get; init; }
    public required string TenantId { get; init; }
    public string TenantName { get; init; } = "";
    public int Score { get; init; }
    public string Grade { get; init; } = "";
    public int UptimePoints { get; init; }
    public int LatencyPoints { get; init; }
    public int RefreshPoints { get; init; }
    public int ActivityPoints { get; init; }
    /// <summary>Estimated days until Power BI auto-pauses scheduled refreshes (null if REST mode or unknown).</summary>
    public int? DaysUntilPause { get; init; }
    public bool IsAnomaly { get; init; }
    public string? AnomalyReason { get; init; }
}

public class DependencyMapEntry
{
    public required string ModelId { get; init; }
    public required string ModelName { get; init; }
    public required string TenantId { get; init; }
    public string TenantName { get; init; } = "";
    public bool IsActive { get; init; }
    public List<DatasourceInfo> Datasources { get; init; } = [];
}
