using Azure.Security.KeyVault.Secrets;
using Microsoft.Extensions.Logging;

namespace SemanticSonar.Functions.Services;

/// <summary>
/// Retrieves secrets from Azure Key Vault using the Function App's Managed Identity.
/// Caches the client secret in memory with a configurable TTL to avoid Key Vault
/// throttling under high invocation rates.
/// </summary>
public class KeyVaultService
{
    private readonly SecretClient _secretClient;
    private readonly ILogger<KeyVaultService> _logger;

    private readonly Dictionary<string, (string Value, DateTime ExpiresAt)> _cachedSecrets = [];
    private readonly TimeSpan _cacheTtl = TimeSpan.FromMinutes(30);
    private readonly SemaphoreSlim _cacheLock = new(1, 1);

    public KeyVaultService(SecretClient secretClient, ILogger<KeyVaultService> logger)
    {
        _secretClient = secretClient;
        _logger = logger;
    }

    /// <summary>
    /// Returns the client secret for a specific tenant's service principal.
    /// Secrets are stored in Key Vault with the naming convention: tenant-{tenantId}-client-secret
    /// </summary>
    public async Task<string> GetTenantClientSecretAsync(string tenantId, CancellationToken ct = default)
    {
        if (_cachedSecrets.TryGetValue(tenantId, out var entry)
            && DateTime.UtcNow < entry.ExpiresAt)
            return entry.Value;

        await _cacheLock.WaitAsync(ct);
        try
        {
            if (_cachedSecrets.TryGetValue(tenantId, out entry)
                && DateTime.UtcNow < entry.ExpiresAt)
                return entry.Value;

            var secretName = $"tenant-{tenantId}-client-secret";
            _logger.LogInformation("Fetching client secret '{SecretName}' from Key Vault.", secretName);

            var secret = await _secretClient.GetSecretAsync(secretName, cancellationToken: ct);
            var value = secret.Value.Value;
            _cachedSecrets[tenantId] = (value, DateTime.UtcNow.Add(_cacheTtl));

            return value;
        }
        finally
        {
            _cacheLock.Release();
        }
    }

    /// <summary>
    /// Creates or updates the client secret for a tenant in Key Vault.
    /// Invalidates the in-memory cache for the tenant.
    /// </summary>
    public async Task SetTenantClientSecretAsync(string tenantId, string clientSecret, CancellationToken ct = default)
    {
        var secretName = $"tenant-{tenantId}-client-secret";
        _logger.LogInformation("Setting client secret '{SecretName}' in Key Vault.", secretName);

        await _secretClient.SetSecretAsync(secretName, clientSecret, ct);

        // Invalidate cache so the next read picks up the new value
        await _cacheLock.WaitAsync(ct);
        try
        {
            _cachedSecrets.Remove(tenantId);
        }
        finally
        {
            _cacheLock.Release();
        }
    }

    /// <summary>
    /// Checks whether a client secret exists in Key Vault for the given tenant.
    /// </summary>
    public async Task<bool> TenantSecretExistsAsync(string tenantId, CancellationToken ct = default)
    {
        try
        {
            var secretName = $"tenant-{tenantId}-client-secret";
            await _secretClient.GetSecretAsync(secretName, cancellationToken: ct);
            return true;
        }
        catch (Azure.RequestFailedException ex) when (ex.Status == 404)
        {
            return false;
        }
    }
}
