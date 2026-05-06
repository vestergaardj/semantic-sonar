using SemanticSonar.Functions.Helpers;
using SemanticSonar.Functions.Models;
using SemanticSonar.Functions.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.Logging;

namespace SemanticSonar.Functions.Functions;

public class TagsApi
{
    private readonly CosmosDbService _cosmos;
    private readonly ILogger<TagsApi> _logger;

    public TagsApi(CosmosDbService cosmos, ILogger<TagsApi> logger)
    {
        _cosmos = cosmos;
        _logger = logger;
    }

    [Function("ListTagDefinitions")]
    public async Task<IActionResult> ListTags(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "tag-definitions")] HttpRequest req)
    {
        var authResult = AuthHelper.EnforceAuth(req);
        if (authResult != null) return authResult;

        var tags = await _cosmos.ListTagsAsync();
        return new OkObjectResult(tags);
    }

    [Function("CreateTagDefinition")]
    public async Task<IActionResult> CreateTag(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "tag-definitions")] HttpRequest req)
    {
        var authResult = AuthHelper.EnforceAuth(req);
        if (authResult != null) return authResult;

        TagDefinition? input;
        try
        {
            input = await req.ReadFromJsonAsync<TagDefinition>();
        }
        catch
        {
            return new BadRequestObjectResult("Invalid JSON body.");
        }

        if (input is null || string.IsNullOrWhiteSpace(input.Name))
            return new BadRequestObjectResult("name is required.");

        if (input.Name.Trim().Length > 50)
            return new BadRequestObjectResult("Tag name must be 50 characters or fewer.");

        // Check for duplicates (case-insensitive)
        var existing = await _cosmos.ListTagsAsync();
        if (existing.Any(t => string.Equals(t.Name, input.Name.Trim(), StringComparison.OrdinalIgnoreCase)))
            return new ConflictObjectResult($"A tag named '{input.Name.Trim()}' already exists.");

        var tag = new TagDefinition { Name = input.Name.Trim() };
        var created = await _cosmos.CreateTagAsync(tag);
        _logger.LogInformation("Tag '{TagName}' created.", created.Name);
        return new ObjectResult(created) { StatusCode = StatusCodes.Status201Created };
    }

    [Function("UpdateTagDefinition")]
    public async Task<IActionResult> UpdateTag(
        [HttpTrigger(AuthorizationLevel.Anonymous, "put", Route = "tag-definitions/{id}")] HttpRequest req,
        string id)
    {
        var authResult = AuthHelper.EnforceAuth(req);
        if (authResult != null) return authResult;

        TagDefinition? input;
        try
        {
            input = await req.ReadFromJsonAsync<TagDefinition>();
        }
        catch
        {
            return new BadRequestObjectResult("Invalid JSON body.");
        }

        if (input is null || string.IsNullOrWhiteSpace(input.Name))
            return new BadRequestObjectResult("name is required.");

        if (input.Name.Trim().Length > 50)
            return new BadRequestObjectResult("Tag name must be 50 characters or fewer.");

        var existing = await _cosmos.GetTagAsync(id);
        if (existing is null)
            return new NotFoundResult();

        var oldName = existing.Name;
        var newName = input.Name.Trim();

        // Check for duplicates if name changed (case-insensitive)
        if (!string.Equals(oldName, newName, StringComparison.OrdinalIgnoreCase))
        {
            var allTags = await _cosmos.ListTagsAsync();
            if (allTags.Any(t => t.Id != id && string.Equals(t.Name, newName, StringComparison.OrdinalIgnoreCase)))
                return new ConflictObjectResult($"A tag named '{newName}' already exists.");
        }

        existing.Name = newName;
        var updated = await _cosmos.UpdateTagAsync(existing);

        // Cascade rename across all models
        if (!string.Equals(oldName, newName, StringComparison.Ordinal))
        {
            var affected = await _cosmos.RenameTagOnModelsAsync(oldName, newName);
            _logger.LogInformation("Tag renamed '{OldName}' → '{NewName}', updated {Count} models.", oldName, newName, affected);
        }

        return new OkObjectResult(updated);
    }

    [Function("DeleteTagDefinition")]
    public async Task<IActionResult> DeleteTag(
        [HttpTrigger(AuthorizationLevel.Anonymous, "delete", Route = "tag-definitions/{id}")] HttpRequest req,
        string id)
    {
        var authResult = AuthHelper.EnforceAuth(req);
        if (authResult != null) return authResult;

        var existing = await _cosmos.GetTagAsync(id);
        if (existing is null)
            return new NotFoundResult();

        var force = string.Equals(req.Query["force"].FirstOrDefault(), "true", StringComparison.OrdinalIgnoreCase);
        var usage = await _cosmos.GetTagUsageCountAsync(existing.Name);

        if (usage > 0 && !force)
            return new BadRequestObjectResult($"Tag '{existing.Name}' is used by {usage} model(s). Pass ?force=true to delete and remove from all models.");

        if (usage > 0)
        {
            var removed = await _cosmos.RemoveTagFromModelsAsync(existing.Name);
            _logger.LogInformation("Removed tag '{TagName}' from {Count} models.", existing.Name, removed);
        }

        await _cosmos.DeleteTagAsync(id);
        _logger.LogInformation("Tag '{TagName}' deleted.", existing.Name);
        return new NoContentResult();
    }

    [Function("GetTagUsage")]
    public async Task<IActionResult> GetTagUsage(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "tag-definitions/{id}/usage")] HttpRequest req,
        string id)
    {
        var authResult = AuthHelper.EnforceAuth(req);
        if (authResult != null) return authResult;

        var existing = await _cosmos.GetTagAsync(id);
        if (existing is null)
            return new NotFoundResult();

        var count = await _cosmos.GetTagUsageCountAsync(existing.Name);
        return new OkObjectResult(new { tagId = id, tagName = existing.Name, usageCount = count });
    }

    /// <summary>Seeds tag definitions from existing model tags. Idempotent.</summary>
    [Function("SeedTags")]
    public async Task<IActionResult> SeedTags(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "tag-definitions/seed")] HttpRequest req)
    {
        var authResult = AuthHelper.EnforceAuth(req);
        if (authResult != null) return authResult;

        var created = await _cosmos.SeedTagsFromModelsAsync();
        _logger.LogInformation("Seeded {Count} tag definition(s) from existing models.", created);
        return new OkObjectResult(new { seeded = created });
    }

    /// <summary>Returns tag-grouped health summary for the dashboard.</summary>
    [Function("GetTagGroupSummary")]
    public async Task<IActionResult> GetTagGroupSummary(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "tag-groups")] HttpRequest req)
    {
        var authResult = AuthHelper.EnforceAuth(req);
        if (authResult != null) return authResult;

        var groups = await _cosmos.GetTagGroupSummaryAsync();
        return new OkObjectResult(groups);
    }
}
