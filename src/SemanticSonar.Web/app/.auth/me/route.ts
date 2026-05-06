import { NextRequest, NextResponse } from 'next/server';

/**
 * Local dev replacement for SWA's /.auth/me endpoint.
 * Reads the auth cookie and returns the client principal.
 */
export async function GET(req: NextRequest) {
  const cookie = req.cookies.get('StaticWebAppsAuthCookie')?.value;

  if (!cookie) {
    return NextResponse.json({ clientPrincipal: null });
  }

  try {
    const decoded = Buffer.from(cookie, 'base64').toString();
    const principal = JSON.parse(decoded);
    return NextResponse.json({ clientPrincipal: principal });
  } catch {
    return NextResponse.json({ clientPrincipal: null });
  }
}
