import { NextRequest, NextResponse } from 'next/server';

/**
 * OAuth2 callback handler. Exchanges the authorization code for tokens,
 * extracts the user claims, and sets a cookie mimicking SWA Easy Auth.
 */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const state = req.nextUrl.searchParams.get('state');
  const error = req.nextUrl.searchParams.get('error');

  if (error) {
    const desc = req.nextUrl.searchParams.get('error_description') ?? error;
    return new NextResponse(`Login failed: ${desc}`, { status: 400 });
  }

  if (!code) {
    return new NextResponse('Missing authorization code', { status: 400 });
  }

  // Retrieve PKCE state from cookie
  const pkceCookie = req.cookies.get('auth_pkce')?.value;
  if (!pkceCookie) {
    return new NextResponse('Missing PKCE state cookie — try logging in again.', { status: 400 });
  }

  let pkceData: { codeVerifier: string; postLoginRedirect: string; state: string };
  try {
    pkceData = JSON.parse(pkceCookie);
  } catch {
    return new NextResponse('Invalid PKCE state cookie', { status: 400 });
  }

  if (pkceData.state !== state) {
    return new NextResponse('State mismatch — possible CSRF. Try logging in again.', { status: 400 });
  }

  const tenantId = process.env.NEXT_PUBLIC_MSAL_TENANT_ID ?? 'common';
  const clientId = process.env.NEXT_PUBLIC_MSAL_CLIENT_ID ?? '';
  const clientSecret = process.env.MSAL_CLIENT_SECRET ?? '';
  const origin = req.nextUrl.origin;
  const redirectUri = `${origin}/.auth/login/aad/callback`;

  // Exchange code for tokens
  const tokenParams: Record<string, string> = {
    client_id: clientId,
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    code_verifier: pkceData.codeVerifier,
  };
  if (clientSecret) {
    tokenParams.client_secret = clientSecret;
  }

  const tokenRes = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(tokenParams),
    }
  );

  if (!tokenRes.ok) {
    const body = await tokenRes.text();
    return new NextResponse(`Token exchange failed: ${body}`, { status: 502 });
  }

  const tokens = await tokenRes.json();
  const idToken: string = tokens.id_token;

  // Decode the ID token (we trust it since we just fetched it over TLS from the issuer)
  const payload = JSON.parse(
    Buffer.from(idToken.split('.')[1], 'base64url').toString()
  );

  // Build a ClientPrincipal compatible with SWA Easy Auth format
  const principal = {
    identityProvider: 'aad',
    userId: payload.oid ?? payload.sub,
    userDetails: payload.preferred_username ?? payload.email ?? payload.name ?? '',
    userRoles: ['authenticated', 'anonymous'],
    claims: Object.entries(payload).map(([typ, val]) => ({
      typ,
      val: String(val),
    })),
  };

  const principalBase64 = Buffer.from(JSON.stringify(principal)).toString('base64');

  const response = NextResponse.redirect(new URL(pkceData.postLoginRedirect, origin));

  // Set the principal cookie (mimics SWA Easy Auth)
  response.cookies.set('StaticWebAppsAuthCookie', principalBase64, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 8, // 8 hours
  });

  // Clear the PKCE cookie
  response.cookies.delete('auth_pkce');

  return response;
}
