import './helpers';
import { sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db';
import { postgresStore } from '@/server/rate-limit-store';

/** RATE_LIMIT_STORE=postgres: the counts several app servers share. */
describe('rate limiting (postgres store)', () => {
  const store = postgresStore();
  beforeEach(() => store.reset());
  afterAll(() => store.reset());

  it('lets exactly the limit through when 20 requests arrive at once', async () => {
    const now = Date.now();
    const results = await Promise.all(Array.from({ length: 20 }, () => store.hit('burst', 5, 60_000, now)));
    expect(results.filter((r) => r.ok)).toHaveLength(5);
    const blocked = results.find((r) => !r.ok)!;
    expect(blocked.retryAfterSeconds).toBeGreaterThan(55);
    const [{ n }] = (await db.execute(sql`select count(*)::int as n from rate_limit_hits where key = 'burst'`)).rows as { n: number }[];
    expect(n).toBe(5);
  });

  it('slides: old hits stop counting after the window', async () => {
    const t = Date.now();
    expect((await store.hit('slide', 1, 1000, t - 5000)).ok).toBe(true);
    expect((await store.hit('slide', 1, 1000, t)).ok).toBe(true);
    expect((await store.hit('slide', 1, 1000, t + 10)).ok).toBe(false);
  });

  it('peek does not count; record does (failed sign-ins)', async () => {
    const t = Date.now();
    for (let i = 0; i < 3; i++) expect((await store.peek('login:x', 2, 60_000, t)).ok).toBe(true);
    await store.record('login:x', t);
    await store.record('login:x', t);
    expect((await store.peek('login:x', 2, 60_000, t + 1)).ok).toBe(false);
    expect((await store.peek('login:y', 2, 60_000, t + 1)).ok).toBe(true);
  });

  it('the table is unlogged', async () => {
    const [{ persistence }] = (await db.execute(sql`select relpersistence as persistence from pg_class where relname = 'rate_limit_hits'`)).rows as { persistence: string }[];
    expect(persistence).toBe('u');
  });
});
