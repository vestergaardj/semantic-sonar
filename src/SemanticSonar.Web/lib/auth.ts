'use client';

// ── SWA Easy Auth helpers ────────────────────────────────────────────────────

export interface ClientPrincipal {
  identityProvider: string;
  userId: string;
  userDetails: string;
  userRoles: string[];
  claims?: { typ: string; val: string }[];
  /** Resolved display name (extracted from claims or userDetails) */
  displayName?: string;
}

/**
 * Returns the authenticated user from SWA Easy Auth, or null if not
 * authenticated.  Requires SWA CLI locally (`swa start`).
 */
function resolveDisplayName(principal: ClientPrincipal): string {
  const claims = principal.claims ?? [];
  const get = (typ: string) => claims.find((c) => c.typ === typ)?.val;
  return (
    get('name') ??
    get('preferred_username') ??
    get('http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name') ??
    get('http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress') ??
    principal.userDetails
  );
}

export async function getClientPrincipal(): Promise<ClientPrincipal | null> {
  // Always try the SWA Easy Auth endpoint first — works in production and
  // when running locally via SWA CLI (which emulates /.auth/* endpoints).
  try {
    const res = await fetch('/.auth/me');
    if (res.ok) {
      const data: { clientPrincipal: ClientPrincipal | null } = await res.json();
      if (data.clientPrincipal) {
        const principal = data.clientPrincipal;
        principal.displayName = resolveDisplayName(principal);
        return principal;
      }
    }
  } catch {
    // /.auth/me not available — user is not authenticated.
  }

  return null;
}

export function getLoginUrl(redirectTo?: string): string {
  const postLoginRedirect = redirectTo
    ? encodeURIComponent(redirectTo)
    : encodeURIComponent('/');
  return `/.auth/login/aad?post_login_redirect_uri=${postLoginRedirect}`;
}

export function getLogoutUrl(): string {
  const tenantId = process.env.NEXT_PUBLIC_MSAL_TENANT_ID;
  const swaClearSession = '/.auth/logout';
  if (!tenantId) return swaClearSession;
  // After clearing the SWA session, redirect to AAD global sign-out so the
  // browser session is actually terminated and the user isn't immediately
  // re-authenticated by the SWA auth redirect.
  const aadLogout = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/logout`;
  return `${swaClearSession}?post_logout_redirect_uri=${encodeURIComponent(aadLogout)}`;
}
