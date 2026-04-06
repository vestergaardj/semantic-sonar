using Microsoft.AspNetCore.Http;

namespace SemanticSonar.Functions.Helpers;

/// <summary>
/// Defence-in-depth authentication check for HTTP-triggered functions.
///
/// In production the SWA authenticates end users (Easy Auth) and proxies
/// requests via the linked backend, injecting the X-MS-CLIENT-PRINCIPAL
/// header for every authenticated caller.
///
/// In local development (AZURE_FUNCTIONS_ENVIRONMENT == "Development"),
/// the check is bypassed so the dashboard can be tested locally.
/// </summary>
public static class AuthHelper
{
    public static bool IsAuthenticated(HttpRequest req)
    {
        // Skip auth in local development
        if (Environment.GetEnvironmentVariable("AZURE_FUNCTIONS_ENVIRONMENT") == "Development")
            return true;

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
