import { NextRequest, NextResponse } from 'next/server';

/**
 * Local dev replacement for SWA's /.auth/logout endpoint.
 * Clears the auth cookie and redirects.
 */
export async function GET(req: NextRequest) {
  const postLogoutRedirect =
    req.nextUrl.searchParams.get('post_logout_redirect_uri') ?? '/';

  const response = NextResponse.redirect(new URL(postLogoutRedirect, req.nextUrl.origin));
  response.cookies.delete('StaticWebAppsAuthCookie');
  return response;
}
