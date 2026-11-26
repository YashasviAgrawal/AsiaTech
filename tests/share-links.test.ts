import { describe, expect, it } from 'vitest';
import { createShareToken, readShareToken } from '@/server/share-links';

const id = '3f1c2b4a-9d8e-4f7a-b6c5-0123456789ab';

describe('signed guest links', () => {
  it('round-trips a uuid in a 45-character token', () => {
    const token = createShareToken('invoice', id);
    expect(token).toHaveLength(45);
    expect(readShareToken('invoice', token)).toBe(id);
  });

  it('accepts upper-case uuids as the same record', () => {
    expect(readShareToken('invoice', createShareToken('invoice', id.toUpperCase()))).toBe(id);
  });

  it('refuses a changed signature, a swapped id and junk', () => {
    const token = createShareToken('invoice', id);
    const [idPart, sig] = token.split('.');
    const flipped = sig.slice(0, -1) + (sig.endsWith('A') ? 'B' : 'A');
    expect(readShareToken('invoice', `${idPart}.${flipped}`)).toBeNull();
    const other = createShareToken('invoice', '00000000-0000-4000-8000-000000000000');
    expect(readShareToken('invoice', `${other.split('.')[0]}.${sig}`)).toBeNull();
    expect(readShareToken('invoice', 'hello')).toBeNull();
    expect(readShareToken('invoice', `${idPart}.${sig}x`)).toBeNull();
  });
});
