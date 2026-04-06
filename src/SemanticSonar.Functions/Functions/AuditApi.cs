using SemanticSonar.Functions.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;

namespace SemanticSonar.Functions.Functions;

public class AuditApi
{
    private readonly CosmosDbService _cosmos;

    public AuditApi(CosmosDbService cosmos) => _cosmos = cosmos;

    [Function("ListAuditEntries")]
    public async Task<IActionResult> ListAuditEntries(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "audit")] HttpRequest req)
    {
        var tenantId = req.Query["tenantId"].FirstOrDefault();
        var entityId = req.Query["entityId"].FirstOrDefault();
        if (!int.TryParse(req.Query["limit"].FirstOrDefault() ?? "50", out var limit))
            limit = 50;
        limit = Math.Clamp(limit, 1, 200);

        var entries = await _cosmos.ListAuditEntriesAsync(tenantId, entityId, limit);
        return new OkObjectResult(entries);
    }
}
