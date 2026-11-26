import { NextResponse, type NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

const SESSION_COOKIE = 'hos_session';

/** Routes anyone can open without signing in. */
const PUBLIC_PREFIXES = ['/login', '/book', '/api/webhooks', '/api/public', '/pay', '/files/pub', '/i', '/api/print-agent/jobs'];

function secretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  return new TextEncoder().encode(secret && secret.length >= 32 ? secret : 'dev-only-secret-change-me-dev-only-secret-change-me');
}

/**
 * First line of defence: bounce signed-out visitors to /login before any page renders.
 * The full check (user active, membership, permissions) happens in requireContext() on the server.
 */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (PUBLIC_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) return NextResponse.next();

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  let valid = false;
  if (token) {
    try {
      await jwtVerify(token, secretKey(), { algorithms: ['HS256'] });
      valid = true;
    } catch {
      valid = false;
    }
  }

  if (!valid) {
    if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = pathname === '/' ? '' : `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon|apple-icon|manifest.webmanifest|uploads/).*)'],
};
