import { createHmac, timingSafeEqual } from 'node:crypto';
import { appUrl } from './app-url';

/**
 * Links a guest can open without signing in (their GST invoice). The token is the record id plus an HMAC,
 * so links cannot be guessed or edited to reach another guest's invoice, and nothing extra is stored.
 * Rotating AUTH_SECRET invalidates every link already sent.
 */
function signingKey(): Buffer {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    if (process.env.NODE_ENV === 'production') throw new Error('AUTH_SECRET must be set (32+ characters)');
  }
  return createHmac('sha256', secret && secret.length >= 32 ? secret : 'dev-only-secret-change-me-dev-only-secret-change-me')
    .update('hos-share-link-v1')
    .digest();
}

const toBase64Url = (buf: Buffer) => buf.toString('base64url');

function signature(kind: string, id: string) {
  return createHmac('sha256', signingKey()).update(`${kind}:${id}`).digest().subarray(0, 16);
}

/** uuid → 22-character id + "." + 22-character signature (45 characters, fits a WhatsApp line). */
export function createShareToken(kind: 'invoice', id: string): string {
  const hex = id.replace(/-/g, '');
  if (!/^[0-9a-f]{32}$/i.test(hex)) throw new Error('Share links need a uuid');
  return `${toBase64Url(Buffer.from(hex, 'hex'))}.${toBase64Url(signature(kind, id.toLowerCase()))}`;
}

/** Returns the uuid when the token is genuine, otherwise null. */
export function readShareToken(kind: 'invoice', token: string): string | null {
  const match = /^([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{22})$/.exec(token);
  if (!match) return null;
  const hex = Buffer.from(match[1], 'base64url').toString('hex');
  if (hex.length !== 32) return null;
  const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  const given = Buffer.from(match[2], 'base64url');
  const expected = signature(kind, id);
  return given.length === expected.length && timingSafeEqual(given, expected) ? id : null;
}

export function invoiceShareUrl(invoiceId: string) {
  return appUrl(`/i/${createShareToken('invoice', invoiceId)}`);
}
