using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace SemanticSonar.Functions.Helpers;

/// <summary>
/// Defence-in-depth authentication check for HTTP-triggered functions.
///
/// The SWA authenticates end users (Easy Auth) and proxies requests via
/// the linked backend, injecting the X-MS-CLIENT-PRINCIPAL header for
/// every authenticated caller.
/// </summary>
public static class AuthHelper
{
    /// <summary>
    /// Enforces that the caller is authenticated and belongs to the configured
    /// Entra tenant (ALLOWED_TENANT_ID environment variable).
    /// Returns an <see cref="IActionResult"/> with the appropriate error status
    /// if the check fails, or <c>null</c> if the request is allowed to proceed.
    /// </summary>
    public static IActionResult? EnforceAuth(HttpRequest req)
    {
        // SWA linked backend injects this header for all authenticated requests
        var principalHeader = req.Headers["X-MS-CLIENT-PRINCIPAL"].FirstOrDefault();
        if (string.IsNullOrEmpty(principalHeader))
            return new UnauthorizedResult();

        // Validate the caller's Entra tenant ID against the configured allowed tenant
        var allowedTenantId = Environment.GetEnvironmentVariable("ALLOWED_TENANT_ID");
        if (!string.IsNullOrEmpty(allowedTenantId))
        {
            var callerTenantId = ExtractTenantId(principalHeader);
            if (callerTenantId is null || !string.Equals(callerTenantId, allowedTenantId, StringComparison.OrdinalIgnoreCase))
                return new ObjectResult(new { error = "Access denied: your account does not belong to the authorized tenant." })
                    { StatusCode = StatusCodes.Status403Forbidden };
        }

        return null;
    }

    /// <summary>Extracts the Entra tenant ID (tid claim) from the Base64-encoded client principal header.</summary>
    private static string? ExtractTenantId(string base64Principal)
    {
        try
        {
            var decoded = Convert.FromBase64String(base64Principal);
            var doc = System.Text.Json.JsonDocument.Parse(decoded);
            if (doc.RootElement.TryGetProperty("claims", out var claims) &&
                claims.ValueKind == System.Text.Json.JsonValueKind.Array)
            {
                foreach (var claim in claims.EnumerateArray())
                {
                    if (claim.TryGetProperty("typ", out var typ) &&
                        typ.GetString() == "tid" &&
                        claim.TryGetProperty("val", out var val))
                        return val.GetString();
                }
            }
            return null;
        }
        catch { return null; }
    }

    public static bool IsAuthenticated(HttpRequest req)
    {
        // SWA linked backend injects this header for all authenticated requests
        var principal = req.Headers["X-MS-CLIENT-PRINCIPAL"].FirstOrDefault();
        return !string.IsNullOrEmpty(principal);
    }

    /// <summary>Extracts the user email/name from SWA headers (best-effort).</summary>
    public static string? GetUserEmail(HttpRequest req)
    {
        // SWA linked backends inject this header directly
        var name = req.Headers["X-MS-CLIENT-PRINCIPAL-NAME"].FirstOrDefault();
        if (!string.IsNullOrEmpty(name)) return name;

        // Fallback: parse the Base64-encoded client principal
        var principal = req.Headers["X-MS-CLIENT-PRINCIPAL"].FirstOrDefault();
        if (string.IsNullOrEmpty(principal)) return null;
        try
        {
            var decoded = Convert.FromBase64String(principal);
            var doc = System.Text.Json.JsonDocument.Parse(decoded);
            if (doc.RootElement.TryGetProperty("userDetails", out var details))
                return details.GetString();
            // Try claims array
            if (doc.RootElement.TryGetProperty("claims", out var claims) && claims.ValueKind == System.Text.Json.JsonValueKind.Array)
            {
                foreach (var claim in claims.EnumerateArray())
                {
                    if (claim.TryGetProperty("typ", out var typ) &&
                        typ.GetString() is "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress" or
                                            "preferred_username" or "email" or "name" &&
                        claim.TryGetProperty("val", out var val))
                        return val.GetString();
                }
            }
            return null;
        }
        catch { return null; }
    }
}
