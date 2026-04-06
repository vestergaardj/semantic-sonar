'use client';

import {
  Configuration,
  PublicClientApplication,
  type AccountInfo,
} from '@azure/msal-browser';

// ── MSAL configuration (used only in local dev without SWA Easy Auth) ─────────

const msalConfig: Configuration = {
  auth: {
    clientId: process.env.NEXT_PUBLIC_MSAL_CLIENT_ID ?? '',
    authority: `https://login.microsoftonline.com/${process.env.NEXT_PUBLIC_MSAL_TENANT_ID ?? 'common'}`,
    redirectUri: typeof window !== 'undefined' ? window.location.origin : '/',
  },
  cache: {
    cacheLocation: 'sessionStorage',
    storeAuthStateInCookie: false,
  },
};

export const msalInstance = new PublicClientApplication(msalConfig);

// ── SWA Easy Auth helpers (production) ───────────────────────────────────────

export interface ClientPrincipal {
  identityProvider: string;
  userId: string;
  userDetails: string;
  userRoles: string[];
}

/**
 * In production (SWA), returns the user info injected by Easy Auth.
 * In local development, returns a mock principal so the UI renders correctly.
 */
export async function getClientPrincipal(): Promise<ClientPrincipal | null> {
  if (process.env.NODE_ENV === 'development') {
    return {
      identityProvider: 'dev',
      userId: 'dev-user',
      userDetails: 'developer@catmansolution.com',
      userRoles: ['authenticated'],
    };
  }

  try {
    const res = await fetch('/.auth/me');
    if (!res.ok) return null;
    const data: { clientPrincipal: ClientPrincipal | null } = await res.json();
    return data.clientPrincipal;
  } catch {
    return null;
  }
}

export function getLoginUrl(redirectTo?: string): string {
  const postLoginRedirect = redirectTo
    ? encodeURIComponent(redirectTo)
    : encodeURIComponent('/');
  return `/.auth/login/aad?post_login_redirect_uri=${postLoginRedirect}`;
}

export function getLogoutUrl(): string {
  return '/.auth/logout?post_logout_redirect_uri=/';
}
