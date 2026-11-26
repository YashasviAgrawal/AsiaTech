import { beforeEach, describe, expect, it } from 'vitest';
import { memoryStore, type RateLimitStore } from '../src/server/rate-limit-store';

describe('rate limiting (memory store)', () => {
  let store: RateLimitStore;
  beforeEach(() => {
    store = memoryStore();
  });

  it('allows up to the limit inside the window, then blocks with a retry time', async () => {
    const t = 1_000_000;
    for (let i = 0; i < 3; i++) expect((await store.hit('k', 3, 60_000, t + i)).ok).toBe(true);
    const blocked = await store.hit('k', 3, 60_000, t + 10);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(55);
  });

  it('frees up again once the window has passed (sliding)', async () => {
    const t = 2_000_000;
    await store.hit('s', 1, 1000, t);
    expect((await store.hit('s', 1, 1000, t + 500)).ok).toBe(false);
    expect((await store.hit('s', 1, 1000, t + 1001)).ok).toBe(true);
  });

  it('peek does not count; only recorded failures do', async () => {
    const t = 3_000_000;
    for (let i = 0; i < 5; i++) expect((await store.peek('login', 2, 60_000, t)).ok).toBe(true);
    await store.record('login', t);
    await store.record('login', t);
    expect((await store.peek('login', 2, 60_000, t + 1)).ok).toBe(false);
  });

  it('keeps keys separate', async () => {
    await store.hit('a', 1, 60_000, 1);
    expect((await store.hit('b', 1, 60_000, 2)).ok).toBe(true);
  });
});
