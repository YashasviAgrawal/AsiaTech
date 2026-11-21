import { beforeEach, describe, expect, it } from 'vitest';
import { peekLimit, rateLimit, recordHit, resetRateLimits } from '../src/server/rate-limit';

describe('rate limiting', () => {
  beforeEach(() => resetRateLimits());

  it('allows up to the limit inside the window, then blocks with a retry time', () => {
    const t = 1_000_000;
    for (let i = 0; i < 3; i++) expect(rateLimit('k', 3, 60_000, t + i).ok).toBe(true);
    const blocked = rateLimit('k', 3, 60_000, t + 10);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(55);
  });

  it('slides: old hits expire', () => {
    const t = 2_000_000;
    rateLimit('s', 1, 1000, t);
    expect(rateLimit('s', 1, 1000, t + 500).ok).toBe(false);
    expect(rateLimit('s', 1, 1000, t + 1001).ok).toBe(true);
  });

  it('peek does not count; recordHit does (failed logins only)', () => {
    const t = 3_000_000;
    for (let i = 0; i < 5; i++) expect(peekLimit('login', 2, 60_000, t).ok).toBe(true);
    recordHit('login', t);
    recordHit('login', t);
    expect(peekLimit('login', 2, 60_000, t + 1).ok).toBe(false);
  });

  it('keys are independent', () => {
    rateLimit('a', 1, 60_000, 1);
    expect(rateLimit('b', 1, 60_000, 2).ok).toBe(true);
  });
});
