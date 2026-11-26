import { describe, expect, it } from 'vitest';
import { createResetToken, readResetToken, RESET_LINK_MINUTES } from '@/server/password-reset-token';

const id = '3f1c2b4a-9d8e-4f7a-b6c5-0123456789ab';
const now = Date.UTC(2026, 10, 26, 12, 0, 0);

describe('password reset links', () => {
  it('round-trips the user and session version', () => {
    const token = createResetToken(id, 7, now);
    expect(token.length).toBeLessThan(80);
    expect(readResetToken(token, now + 60_000)).toEqual({ ok: true, userId: id, sessionVersion: 7 });
  });

  it(`expires after ${RESET_LINK_MINUTES} minutes`, () => {
    const token = createResetToken(id, 1, now);
    expect(readResetToken(token, now + (RESET_LINK_MINUTES - 1) * 60_000).ok).toBe(true);
    expect(readResetToken(token, now + (RESET_LINK_MINUTES + 1) * 60_000)).toEqual({ ok: false, reason: 'expired' });
  });

  it('refuses edited versions, expiries, ids and signatures', () => {
    const [user, expires, version, sig] = createResetToken(id, 3, now).split('.');
    expect(readResetToken([user, expires, '4', sig].join('.'), now).ok).toBe(false);
    expect(readResetToken([user, (parseInt(expires, 36) + 3600).toString(36), version, sig].join('.'), now).ok).toBe(false);
    const other = createResetToken('00000000-0000-4000-8000-000000000000', 3, now).split('.')[0];
    expect(readResetToken([other, expires, version, sig].join('.'), now).ok).toBe(false);
    expect(readResetToken([user, expires, version, sig.slice(0, -1) + (sig.endsWith('A') ? 'B' : 'A')].join('.'), now)).toEqual({ ok: false, reason: 'invalid' });
    expect(readResetToken('not-a-token', now)).toEqual({ ok: false, reason: 'invalid' });
  });

  it('is not an invoice link', async () => {
    const { createShareToken, readShareToken } = await import('@/server/share-links');
    expect(readResetToken(createShareToken('invoice', id), now).ok).toBe(false);
    expect(readShareToken('invoice', createResetToken(id, 1, now))).toBeNull();
  });
});
