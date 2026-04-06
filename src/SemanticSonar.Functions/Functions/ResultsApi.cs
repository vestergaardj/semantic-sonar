using SemanticSonar.Functions.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.Logging;

namespace SemanticSonar.Functions.Functions;

public class ResultsApi
{
    private readonly CosmosDbService _cosmos;
    private readonly ILogger<ResultsApi> _logger;

    public ResultsApi(CosmosDbService cosmos, ILogger<ResultsApi> logger)
    {
        _cosmos = cosmos;
        _logger = logger;
    }

    [Function("GetResults")]
    public async Task<IActionResult> GetResults(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "results")] HttpRequest req)
    {
        var modelId = req.Query["modelId"].FirstOrDefault();
        if (string.IsNullOrEmpty(modelId))
            return new BadRequestObjectResult("modelId query parameter is required.");

        if (!int.TryParse(req.Query["limit"].FirstOrDefault() ?? "50", out var limit))
            limit = 50;
        limit = Math.Clamp(limit, 1, 200);

        var results = await _cosmos.GetResultsForModelAsync(modelId, limit);
        return new OkObjectResult(results);
    }

    [Function("GetDashboardSummary")]
    public async Task<IActionResult> GetDashboardSummary(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "summary")] HttpRequest req)
    {
        var summary = await _cosmos.GetDashboardSummaryAsync();
        return new OkObjectResult(summary);
    }

    [Function("GetUptimeStats")]
    public async Task<IActionResult> GetUptimeStats(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "uptime")] HttpRequest req)
    {
        var stats = await _cosmos.GetUptimeStatsAsync();
        return new OkObjectResult(stats);
    }

    [Function("GetLatencyTrends")]
    public async Task<IActionResult> GetLatencyTrends(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "latency-trends")] HttpRequest req)
    {
        var trends = await _cosmos.GetLatencyTrendsAsync();
        return new OkObjectResult(trends);
    }

    [Function("GetHealthScores")]
    public async Task<IActionResult> GetHealthScores(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "health-scores")] HttpRequest req)
    {
        var scores = await _cosmos.GetHealthScoresAsync();
        return new OkObjectResult(scores);
    }

    [Function("GetDependencyMap")]
    public async Task<IActionResult> GetDependencyMap(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "dependency-map")] HttpRequest req)
    {
        var map = await _cosmos.GetDependencyMapAsync();
        return new OkObjectResult(map);
    }
}
