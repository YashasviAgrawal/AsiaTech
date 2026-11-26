import { sql } from 'drizzle-orm';
import { db } from '@/db';

/**
 * Where rate-limit counts live. `memory` (default) is per server process: right for one app server.
 * `postgres` (RATE_LIMIT_STORE=postgres) shares the counts between several app servers through the database,
 * so a login lockout or a webhook limit holds whichever server answers.
 */
export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export interface RateLimitStore {
  /** Count this request if it is within the limit. */
  hit(key: string, limit: number, windowMs: number, now: number): Promise<RateLimitResult>;
  /** Check without counting (login counts only failed attempts, with record()). */
  peek(key: string, limit: number, windowMs: number, now: number): Promise<RateLimitResult>;
  record(key: string, now: number): Promise<void>;
  reset(): Promise<void>;
}

const blocked = (oldest: number, windowMs: number, now: number): RateLimitResult => ({ ok: false, remaining: 0, retryAfterSeconds: Math.max(1, Math.ceil((oldest + windowMs - now) / 1000)) });

/* ───────────────────────────── memory ───────────────────────────── */

export function memoryStore(): RateLimitStore {
  const hits = new Map<string, number[]>();
  let lastSweep = Date.now();
  const recentOf = (key: string, windowMs: number, now: number) => (hits.get(key) ?? []).filter((t) => t > now - windowMs);

  function sweep(now: number, windowMs: number) {
    lastSweep = now;
    const horizon = now - Math.max(windowMs, 60 * 60_000);
    for (const [key, list] of hits) if (!list.length || list[list.length - 1] < horizon) hits.delete(key);
  }

  return {
    async hit(key, limit, windowMs, now) {
      if (now - lastSweep > 60_000 || hits.size > 50_000) sweep(now, windowMs);
      const recent = recentOf(key, windowMs, now);
      if (recent.length >= limit) {
        hits.set(key, recent);
        return blocked(recent[0], windowMs, now);
      }
      recent.push(now);
      hits.set(key, recent);
      return { ok: true, remaining: limit - recent.length, retryAfterSeconds: 0 };
    },
    async peek(key, limit, windowMs, now) {
      const recent = recentOf(key, windowMs, now);
      return recent.length >= limit ? blocked(recent[0], windowMs, now) : { ok: true, remaining: limit - recent.length, retryAfterSeconds: 0 };
    },
    async record(key, now) {
      const list = hits.get(key) ?? [];
      list.push(now);
      hits.set(key, list);
    },
    async reset() {
      hits.clear();
    },
  };
}

/* ───────────────────────────── postgres ───────────────────────────── */

/**
 * Sliding log in `rate_limit_hits`. A transaction-scoped advisory lock on the key makes "count, then add"
 * atomic, so 20 requests arriving together at a limit of 5 let exactly 5 through, across servers.
 */
export function postgresStore(): RateLimitStore {
  async function count(tx: Pick<typeof db, 'execute'>, key: string, windowMs: number, now: number) {
    const { rows } = await tx.execute<{ n: number; oldest: Date | string | null }>(
      sql`SELECT count(*)::int AS n, min(at) AS oldest FROM rate_limit_hits WHERE key = ${key} AND at > ${new Date(now - windowMs).toISOString()}::timestamptz`,
    );
    const oldest = rows[0]?.oldest ? new Date(rows[0].oldest).getTime() : now;
    return { n: rows[0]?.n ?? 0, oldest };
  }

  async function maybeSweep() {
    // Old rows are useless; clearing them now and then keeps the table small without a separate job.
    if (Math.random() < 0.01) await db.execute(sql`DELETE FROM rate_limit_hits WHERE at < now() - interval '1 hour'`);
  }

  return {
    async hit(key, limit, windowMs, now) {
      const result = await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`);
        const { n, oldest } = await count(tx, key, windowMs, now);
        if (n >= limit) return blocked(oldest, windowMs, now);
        await tx.execute(sql`INSERT INTO rate_limit_hits (key, at) VALUES (${key}, ${new Date(now).toISOString()}::timestamptz)`);
        return { ok: true, remaining: limit - n - 1, retryAfterSeconds: 0 };
      });
      await maybeSweep();
      return result;
    },
    async peek(key, limit, windowMs, now) {
      const { n, oldest } = await count(db, key, windowMs, now);
      return n >= limit ? blocked(oldest, windowMs, now) : { ok: true, remaining: limit - n, retryAfterSeconds: 0 };
    },
    async record(key, now) {
      await db.execute(sql`INSERT INTO rate_limit_hits (key, at) VALUES (${key}, ${new Date(now).toISOString()}::timestamptz)`);
      await maybeSweep();
    },
    async reset() {
      await db.execute(sql`DELETE FROM rate_limit_hits`);
    },
  };
}

let store: RateLimitStore | null = null;

export function rateLimitStore(): RateLimitStore {
  if (store) return store;
  const name = process.env.RATE_LIMIT_STORE || 'memory';
  if (name === 'postgres') store = postgresStore();
  else if (name === 'memory') store = memoryStore();
  else throw new Error(`Unknown RATE_LIMIT_STORE "${name}". Use memory or postgres.`);
  return store;
}
