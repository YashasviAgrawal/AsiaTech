import 'server-only';
import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';
import { secureCookies } from '../app-url';

export const SESSION_COOKIE = 'hos_session';
const SESSION_DAYS = 7;

export interface SessionPayload {
  /** User id */
  sub: string;
  /** Active property id */
  pid: string | null;
  /** users.session_version at sign-in; bumping it logs the user out everywhere. */
  v: number;
}

function secretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    if (process.env.NODE_ENV === 'production') throw new Error('AUTH_SECRET must be set (32+ characters)');
    return new TextEncoder().encode('dev-only-secret-change-me-dev-only-secret-change-me');
  }
  return new TextEncoder().encode(secret);
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ pid: payload.pid, v: payload.v })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secretKey());
}

export async function verifySession(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ['HS256'] });
    if (!payload.sub) return null;
    return { sub: payload.sub, pid: (payload.pid as string | null) ?? null, v: Number(payload.v ?? 1) };
  } catch {
    return null;
  }
}

export async function readSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  return verifySession(store.get(SESSION_COOKIE)?.value);
}

export async function writeSession(payload: SessionPayload): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, await signSession(payload), {
    httpOnly: true,
    sameSite: 'lax',
    secure: secureCookies(),
    path: '/',
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function clearSession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}
