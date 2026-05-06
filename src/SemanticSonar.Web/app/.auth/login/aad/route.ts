import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * Local dev replacement for SWA Easy Auth login.
 * Redirects to the Entra ID authorization endpoint using PKCE.
 */
export async function GET(req: NextRequest) {
  const tenantId = process.env.NEXT_PUBLIC_MSAL_TENANT_ID ?? 'common';
  const clientId = process.env.NEXT_PUBLIC_MSAL_CLIENT_ID ?? '';

  const postLoginRedirect =
    req.nextUrl.searchParams.get('post_login_redirect_uri') ?? '/';

  // Generate PKCE code verifier and challenge
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto
    .createHash('sha256')
    .update(codeVerifier)
    .digest('base64url');

  // Store verifier + post-login redirect in a cookie
  const state = crypto.randomBytes(16).toString('base64url');
  const statePayload = JSON.stringify({ codeVerifier, postLoginRedirect, state });

  const origin = req.nextUrl.origin;
  const redirectUri = `${origin}/.auth/login/aad/callback`;

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: 'openid profile email',
    response_mode: 'query',
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });

  const authorizeUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?${params}`;

  const response = NextResponse.redirect(authorizeUrl);
  response.cookies.set('auth_pkce', statePayload, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 600, // 10 minutes — enough time to complete login
  });

  return response;
}
