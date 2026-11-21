import { describe, expect, it } from 'vitest';
import { isSealed, openSecrets, sealSecrets } from '../src/server/secrets';

describe('secrets at rest', () => {
  it('round-trips and never stores the plain value', () => {
    const sealed = sealSecrets({ accessToken: 'mmt-live-123' });
    expect(isSealed(sealed)).toBe(true);
    expect(JSON.stringify(sealed)).not.toContain('mmt-live-123');
    expect(openSecrets(sealed)).toEqual({ accessToken: 'mmt-live-123' });
  });

  it('uses a fresh IV every time', () => {
    expect(sealSecrets({ a: '1' }).__enc).not.toBe(sealSecrets({ a: '1' }).__enc);
  });

  it('rejects tampered data', () => {
    const sealed = sealSecrets({ accessToken: 'x' });
    const parts = sealed.__enc.split(':');
    parts[3] = Buffer.from('tampered').toString('base64');
    expect(() => openSecrets({ __enc: parts.join(':') })).toThrow();
  });

  it('reads rows saved before encryption', () => {
    expect(openSecrets({ accessToken: 'legacy' })).toEqual({ accessToken: 'legacy' });
    expect(openSecrets(null)).toEqual({});
  });
});
