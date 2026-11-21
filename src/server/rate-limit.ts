import 'server-only';
import { headers } from 'next/headers';
import { UserError } from './errors';

/**
 * Sliding-window rate limiter for public entry points (login, booking engine, payment links, webhooks).
 * In-memory per server process: enough for one instance. With several instances, swap the store for Redis
 * (same function signature) so limits are shared.
 */
const hits = new Map<string, number[]>();
let lastSweep = Date.now();

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()): RateLimitResult {
  if (now - lastSweep > 60_000 || hits.size > 50_000) sweep(now, windowMs);
  const recent = (hits.get(key) ?? []).filter((t) => t > now - windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return { ok: false, remaining: 0, retryAfterSeconds: Math.max(1, Math.ceil((recent[0] + windowMs - now) / 1000)) };
  }
  recent.push(now);
  hits.set(key, recent);
  return { ok: true, remaining: limit - recent.length, retryAfterSeconds: 0 };
}

function sweep(now: number, windowMs: number) {
  lastSweep = now;
  const horizon = now - Math.max(windowMs, 60 * 60_000);
  for (const [key, list] of hits) if (!list.length || list[list.length - 1] < horizon) hits.delete(key);
}

/** Test helper. */
export function resetRateLimits() {
  hits.clear();
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
  const result = rateLimit(`${scope}:${extraKey ?? ip}`, limit, windowMs);
  if (!result.ok) throw new UserError(`Too many tries. Please wait ${result.retryAfterSeconds} seconds and try again.`);
}

/** For route handlers: a 429 response, or null when the request may go ahead. */
export function limitRequest(request: Request, scope: string, limit: number, windowMs: number): Response | null {
  const ip = ipFrom((name) => request.headers.get(name));
  const result = rateLimit(`${scope}:${ip}`, limit, windowMs);
  if (result.ok) return null;
  return new Response(JSON.stringify({ error: 'Too many requests' }), { status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': String(result.retryAfterSeconds) } });
}

/** Check a limit without counting this call (count failures only with recordHit). */
export function peekLimit(key: string, limit: number, windowMs: number, now = Date.now()): RateLimitResult {
  const recent = (hits.get(key) ?? []).filter((t) => t > now - windowMs);
  if (recent.length >= limit) return { ok: false, remaining: 0, retryAfterSeconds: Math.max(1, Math.ceil((recent[0] + windowMs - now) / 1000)) };
  return { ok: true, remaining: limit - recent.length, retryAfterSeconds: 0 };
}

export function recordHit(key: string, now = Date.now()) {
  const list = hits.get(key) ?? [];
  list.push(now);
  hits.set(key, list);
}
