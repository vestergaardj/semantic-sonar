using SemanticSonar.Functions.Helpers;
using SemanticSonar.Functions.Models;
using SemanticSonar.Functions.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.Logging;

namespace SemanticSonar.Functions.Functions;

public class TenantsApi
{
    private readonly CosmosDbService _cosmos;
    private readonly KeyVaultService _keyVault;
    private readonly ILogger<TenantsApi> _logger;

    public TenantsApi(CosmosDbService cosmos, KeyVaultService keyVault, ILogger<TenantsApi> logger)
    {
        _cosmos = cosmos;
        _keyVault = keyVault;
        _logger = logger;
    }

    [Function("ListTenants")]
    public async Task<IActionResult> ListTenants(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "tenants")] HttpRequest req)
    {
        var authResult = AuthHelper.EnforceAuth(req);
        if (authResult != null) return authResult;

        var tenants = await _cosmos.ListTenantsAsync();
        return new OkObjectResult(tenants);
    }

    [Function("GetTenant")]
    public async Task<IActionResult> GetTenant(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "tenants/{id}")] HttpRequest req,
        string id)
    {
        var authResult = AuthHelper.EnforceAuth(req);
        if (authResult != null) return authResult;

        var tenant = await _cosmos.GetTenantAsync(id);
        return tenant is null ? new NotFoundResult() : new OkObjectResult(tenant);
    }

    [Function("CreateTenant")]
    public async Task<IActionResult> CreateTenant(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "tenants")] HttpRequest req)
    {
        var authResult = AuthHelper.EnforceAuth(req);
        if (authResult != null) return authResult;

        TenantConfig? input;
        try
        {
            input = await req.ReadFromJsonAsync<TenantConfig>();
        }
        catch
        {
            return new BadRequestObjectResult("Invalid JSON body.");
        }

        if (input is null || string.IsNullOrWhiteSpace(input.DisplayName)
                          || string.IsNullOrWhiteSpace(input.EntraId)
                          || string.IsNullOrWhiteSpace(input.ClientId))
        {
            return new BadRequestObjectResult("displayName, entraId, and clientId are required.");
        }

        // Generate a stable ID from the Entra tenant GUID
        var tenant = new TenantConfig
        {
            Id = $"tenant-{input.EntraId.ToLowerInvariant()}",
            DisplayName = input.DisplayName.Trim(),
            EntraId = input.EntraId.Trim(),
            ClientId = input.ClientId.Trim(),
            IsActive = true,
            AddedAt = DateTime.UtcNow
        };

        var created = await _cosmos.UpsertTenantAsync(tenant);
        await _cosmos.AuditAsync(tenant.Id, "Tenant", tenant.Id, "Created",
            $"'{tenant.DisplayName}'", AuthHelper.GetUserEmail(req));
        return new ObjectResult(created) { StatusCode = StatusCodes.Status201Created };
    }

    [Function("UpdateTenant")]
    public async Task<IActionResult> UpdateTenant(
        [HttpTrigger(AuthorizationLevel.Anonymous, "put", Route = "tenants/{id}")] HttpRequest req,
        string id)
    {
        var authResult = AuthHelper.EnforceAuth(req);
        if (authResult != null) return authResult;

        var existing = await _cosmos.GetTenantAsync(id);
        if (existing is null)
            return new NotFoundResult();

        TenantConfig? input;
        try
        {
            input = await req.ReadFromJsonAsync<TenantConfig>();
        }
        catch
        {
            return new BadRequestObjectResult("Invalid JSON body.");
        }

        if (input is null)
            return new BadRequestObjectResult("Request body is required.");

        existing.DisplayName = input.DisplayName?.Trim() ?? existing.DisplayName;
        existing.ClientId = input.ClientId?.Trim() ?? existing.ClientId;
        existing.IsActive = input.IsActive;

        var updated = await _cosmos.UpsertTenantAsync(existing);
        await _cosmos.AuditAsync(existing.Id, "Tenant", existing.Id, "Updated",
            $"'{existing.DisplayName}'", AuthHelper.GetUserEmail(req));
        return new OkObjectResult(updated);
    }

    [Function("DeleteTenant")]
    public async Task<IActionResult> DeleteTenant(
        [HttpTrigger(AuthorizationLevel.Anonymous, "delete", Route = "tenants/{id}")] HttpRequest req,
        string id)
    {
        var authResult = AuthHelper.EnforceAuth(req);
        if (authResult != null) return authResult;

        var existing = await _cosmos.GetTenantAsync(id);
        if (existing is null)
            return new NotFoundResult();

        var deletedModelCount = await _cosmos.DeleteModelsForTenantAsync(id);
        await _cosmos.DeleteTenantAsync(id);

        await _cosmos.AuditAsync(id, "Tenant", id, "Deleted",
            $"'{existing.DisplayName}' + {deletedModelCount} models", AuthHelper.GetUserEmail(req));
        _logger.LogInformation("Deleted tenant {TenantId} and {ModelCount} associated models.", id, deletedModelCount);
        return new OkObjectResult(new { deletedModels = deletedModelCount });
    }

    [Function("SetTenantSecret")]
    public async Task<IActionResult> SetTenantSecret(
        [HttpTrigger(AuthorizationLevel.Anonymous, "put", Route = "tenants/{id}/secret")] HttpRequest req,
        string id)
    {
        var authResult = AuthHelper.EnforceAuth(req);
        if (authResult != null) return authResult;

        var tenant = await _cosmos.GetTenantAsync(id);
        if (tenant is null)
            return new NotFoundResult();

        SecretPayload? input;
        try
        {
            input = await req.ReadFromJsonAsync<SecretPayload>();
        }
        catch
        {
            return new BadRequestObjectResult("Invalid JSON body.");
        }

        if (input is null || string.IsNullOrWhiteSpace(input.ClientSecret))
            return new BadRequestObjectResult("clientSecret is required.");

        try
        {
            await _keyVault.SetTenantClientSecretAsync(tenant.EntraId, input.ClientSecret.Trim());
            await _cosmos.AuditAsync(tenant.Id, "Tenant", id, "SecretUpdated",
                null, AuthHelper.GetUserEmail(req));
            _logger.LogInformation("Set client secret for tenant {TenantId}.", id);
            return new OkObjectResult(new { status = "saved" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to set secret for tenant {TenantId}.", id);
            return new ObjectResult(new { error = ex.Message }) { StatusCode = 502 };
        }
    }

    [Function("GetTenantSecretStatus")]
    public async Task<IActionResult> GetTenantSecretStatus(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "tenants/{id}/secret/status")] HttpRequest req,
        string id)
    {
        var authResult = AuthHelper.EnforceAuth(req);
        if (authResult != null) return authResult;

        var tenant = await _cosmos.GetTenantAsync(id);
        if (tenant is null)
            return new NotFoundResult();

        var exists = await _keyVault.TenantSecretExistsAsync(tenant.EntraId);
        return new OkObjectResult(new { exists });
    }

    private class SecretPayload
    {
        public string ClientSecret { get; set; } = "";
    }
}
