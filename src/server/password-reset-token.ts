import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Password reset links: user id, expiry and the user's session version, signed with a key derived from
 * AUTH_SECRET. Nothing is stored. A link stops working when it expires, after it is used (using it moves the
 * session version on), when the person signs out other devices or changes their password, and when
 * AUTH_SECRET rotates.
 */
export const RESET_LINK_MINUTES = 30;

function signingKey(): Buffer {
  const secret = process.env.AUTH_SECRET;
  if ((!secret || secret.length < 32) && process.env.NODE_ENV === 'production') throw new Error('AUTH_SECRET must be set (32+ characters)');
  return createHmac('sha256', secret && secret.length >= 32 ? secret : 'dev-only-secret-change-me-dev-only-secret-change-me')
    .update('hos-password-reset-v1')
    .digest();
}

function sign(id: string, expires: number, version: number): Buffer {
  return createHmac('sha256', signingKey()).update(`reset:${id}:${expires}:${version}`).digest().subarray(0, 18);
}

/** "<id>.<expiry>.<version>.<signature>", URL-safe. */
export function createResetToken(userId: string, sessionVersion: number, now = Date.now()): string {
  const hex = userId.replace(/-/g, '').toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(hex)) throw new Error('Reset links need a uuid');
  const expires = Math.floor(now / 1000) + RESET_LINK_MINUTES * 60;
  return [Buffer.from(hex, 'hex').toString('base64url'), expires.toString(36), sessionVersion.toString(36), sign(userId.toLowerCase(), expires, sessionVersion).toString('base64url')].join('.');
}

export type ResetTokenResult = { ok: true; userId: string; sessionVersion: number } | { ok: false; reason: 'invalid' | 'expired' };

export function readResetToken(token: string, now = Date.now()): ResetTokenResult {
  const match = /^([A-Za-z0-9_-]{22})\.([0-9a-z]{1,10})\.([0-9a-z]{1,8})\.([A-Za-z0-9_-]{24})$/.exec(token);
  if (!match) return { ok: false, reason: 'invalid' };
  const hex = Buffer.from(match[1], 'base64url').toString('hex');
  if (hex.length !== 32) return { ok: false, reason: 'invalid' };
  const userId = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  const expires = parseInt(match[2], 36);
  const sessionVersion = parseInt(match[3], 36);
  const given = Buffer.from(match[4], 'base64url');
  const expected = sign(userId, expires, sessionVersion);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return { ok: false, reason: 'invalid' };
  if (Math.floor(now / 1000) > expires) return { ok: false, reason: 'expired' };
  return { ok: true, userId, sessionVersion };
}
