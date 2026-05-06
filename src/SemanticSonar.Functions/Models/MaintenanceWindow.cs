using System.Text.Json.Serialization;

namespace SemanticSonar.Functions.Models;

public class MaintenanceWindow
{
    [JsonPropertyName("startTimeUtc")]
    public string StartTimeUtc { get; set; } = "00:00";

    [JsonPropertyName("endTimeUtc")]
    public string EndTimeUtc { get; set; } = "06:00";

    /// <summary>Days of week: 0=Sunday … 6=Saturday. Empty = every day.</summary>
    [JsonPropertyName("daysOfWeek")]
    public int[] DaysOfWeek { get; set; } = [0, 1, 2, 3, 4, 5, 6];

    /// <summary>When true, failures during this window are still recorded but not surfaced as alerts.</summary>
    [JsonPropertyName("suppressAlerts")]
    public bool SuppressAlerts { get; set; } = true;

    /// <summary>When true, the scheduler skips canary queries entirely during this window.</summary>
    [JsonPropertyName("skipCanary")]
    public bool SkipCanary { get; set; } = false;

    /// <summary>Returns the first matching maintenance window that is currently active, or null.</summary>
    public static MaintenanceWindow? GetActive(List<MaintenanceWindow>? windows, DateTime utcNow)
    {
        if (windows is null || windows.Count == 0) return null;

        var dayOfWeek = (int)utcNow.DayOfWeek;
        var timeOfDay = utcNow.TimeOfDay;

        foreach (var w in windows)
        {
            if (w.DaysOfWeek is { Length: > 0 } && !w.DaysOfWeek.Contains(dayOfWeek))
                continue;

            if (!TimeSpan.TryParse(w.StartTimeUtc, out var start) ||
                !TimeSpan.TryParse(w.EndTimeUtc, out var end))
                continue;

            bool inWindow = start <= end
                ? timeOfDay >= start && timeOfDay < end
                : timeOfDay >= start || timeOfDay < end; // overnight

            if (inWindow) return w;
        }

        return null;
    }
}
