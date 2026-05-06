import { NextRequest, NextResponse } from 'next/server';

/**
 * Middleware that injects the X-MS-CLIENT-PRINCIPAL header into /api/* requests
 * when running in local development. This mimics what SWA does in production.
 */
export function middleware(req: NextRequest) {
  // Only intercept /api/* calls (proxied to Azure Functions)
  if (!req.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  const cookie = req.cookies.get('StaticWebAppsAuthCookie')?.value;
  if (!cookie) {
    return NextResponse.next();
  }

  // Clone request headers and inject the principal header
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('X-MS-CLIENT-PRINCIPAL', cookie);

  // Also inject user details header for AuthHelper.GetUserEmail()
  try {
    const decoded = Buffer.from(cookie, 'base64').toString();
    const principal = JSON.parse(decoded);
    if (principal.userDetails) {
      requestHeaders.set('X-MS-CLIENT-PRINCIPAL-NAME', principal.userDetails);
    }
  } catch {
    // ignore parse errors
  }

  return NextResponse.next({
    request: { headers: requestHeaders },
  });
}

export const config = {
  matcher: '/api/:path*',
};
