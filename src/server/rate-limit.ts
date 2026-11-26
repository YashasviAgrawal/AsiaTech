import 'server-only';
import { headers } from 'next/headers';
import { UserError } from './errors';
import { rateLimitStore, type RateLimitResult } from './rate-limit-store';

export type { RateLimitResult };

/**
 * Sliding-window rate limits for public entry points (login, booking engine, invoice links, webhooks, print
 * agent). Counts live in memory for one app server, or in Postgres with RATE_LIMIT_STORE=postgres so several
 * servers share them (see rate-limit-store.ts).
 */
export function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()): Promise<RateLimitResult> {
  return rateLimitStore().hit(key, limit, windowMs, now);
}

/** Test helper. */
export function resetRateLimits() {
  return rateLimitStore().reset();
}

export function ipFrom(getHeader: (name: string) => string | null): string {
  return getHeader('x-forwarded-for')?.split(',')[0]?.trim() || getHeader('x-real-ip') || 'local';
}

export async function clientIp(): Promise<string> {
  const list = await headers();
  return ipFrom((name) => list.get(name));
}

/** For server actions: throws a friendly error when the caller is going too fast. */
export async function enforceRateLimit(scope: string, limit: number, windowMs: number, extraKey?: string) {
  const ip = await clientIp();
  const result = await rateLimit(`${scope}:${extraKey ?? ip}`, limit, windowMs);
  if (!result.ok) throw new UserError(`Too many tries. Please wait ${result.retryAfterSeconds} seconds and try again.`);
}

/** For route handlers: a 429 response, or null when the request may go ahead. */
export async function limitRequest(request: Request, scope: string, limit: number, windowMs: number): Promise<Response | null> {
  const ip = ipFrom((name) => request.headers.get(name));
  const result = await rateLimit(`${scope}:${ip}`, limit, windowMs);
  if (result.ok) return null;
  return new Response(JSON.stringify({ error: 'Too many requests' }), { status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': String(result.retryAfterSeconds) } });
}

/** Check a limit without counting this call (count failures only with recordHit). */
export function peekLimit(key: string, limit: number, windowMs: number, now = Date.now()): Promise<RateLimitResult> {
  return rateLimitStore().peek(key, limit, windowMs, now);
}

export function recordHit(key: string, now = Date.now()): Promise<void> {
  return rateLimitStore().record(key, now);
}
