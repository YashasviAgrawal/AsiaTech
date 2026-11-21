import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from 'node:crypto';

/**
 * Secrets at rest (OTA tokens, API keys): AES-256-GCM. The key is CREDENTIALS_KEY (32 bytes, base64 or hex);
 * without it, development derives one from AUTH_SECRET so things still work locally. Rows written before
 * encryption (plain objects) are read as they are and sealed the next time they are saved.
 */
const PREFIX = 'v1';

let cachedKey: Buffer | null = null;
function key(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = process.env.CREDENTIALS_KEY?.trim();
  if (raw) {
    const buf = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
    if (buf.length !== 32) throw new Error('CREDENTIALS_KEY must be 32 bytes (64 hex characters or 44 base64 characters).');
    cachedKey = buf;
  } else {
    if (process.env.NODE_ENV === 'production') throw new Error('Set CREDENTIALS_KEY to encrypt OTA credentials in production.');
    const secret = process.env.AUTH_SECRET || 'dev-only-secret-change-me-dev-only-secret-change-me';
    cachedKey = scryptSync(secret, createHash('sha256').update('hos-credentials').digest(), 32);
  }
  return cachedKey;
}

export type SealedSecrets = { __enc: string };

export function isSealed(value: unknown): value is SealedSecrets {
  return typeof value === 'object' && value !== null && typeof (value as SealedSecrets).__enc === 'string';
}

export function sealSecrets(values: Record<string, string>): SealedSecrets {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(values), 'utf8'), cipher.final()]);
  return { __enc: [PREFIX, iv.toString('base64'), cipher.getAuthTag().toString('base64'), data.toString('base64')].join(':') };
}

export function openSecrets(stored: unknown): Record<string, string> {
  if (!stored || typeof stored !== 'object') return {};
  if (!isSealed(stored)) return stored as Record<string, string>;
  const [version, iv, tag, data] = stored.__enc.split(':');
  if (version !== PREFIX || !iv || !tag || !data) throw new Error('Unknown secrets format');
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8'));
}

/** Like openSecrets, but returns null when the stored value cannot be read (e.g. the key changed). */
export function tryOpenSecrets(stored: unknown): Record<string, string> | null {
  try {
    return openSecrets(stored);
  } catch {
    return null;
  }
}
