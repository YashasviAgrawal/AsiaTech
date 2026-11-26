import './helpers';
import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { db } from '@/db';
import { guests } from '@/db/schema';
import { istDayStart, onIstDays } from '@/db/ist';
import { recentDuplicatePairs } from '@/server/services/guests';
import { porticoActor } from './helpers';

/** Queries rewritten to stay fast with years of data must still answer the same. */
describe('lookups that stay fast on large hotels', () => {
  it('counts a timestamp on the India-time day it falls on, whatever the session time zone', async () => {
    const hits = await db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL TIME ZONE 'America/New_York'`);
      const check = async (instant: string, day: string, to?: string) =>
        (await tx.execute<{ hit: boolean }>(sql`SELECT ${onIstDays(sql`${instant}::timestamptz`, day, to)} AS hit`)).rows[0].hit;
      // 23:59:59 on 25 Nov in India is 18:29:59 UTC; the 26th starts at 18:30 UTC.
      return [
        await check('2026-11-25T18:29:59Z', '2026-11-26'),
        await check('2026-11-25T18:30:00Z', '2026-11-26'),
        await check('2026-11-26T18:29:59Z', '2026-11-26'),
        await check('2026-11-26T18:30:00Z', '2026-11-26'),
        await check('2026-11-26T18:30:00Z', '2026-11-26', '2026-11-27'),
      ];
    });
    expect(hits).toEqual([false, true, true, false, true]);
    const [{ start }] = (await db.execute<{ start: string }>(sql`SELECT ${istDayStart('2026-11-26')} AS start`)).rows;
    expect(new Date(start).toISOString()).toBe('2026-11-25T18:30:00.000Z');
  });

  it('finds the seeded near-duplicate guests among recent ones, older profile first', async () => {
    const actor = await porticoActor();
    const pairs = await recentDuplicatePairs(actor.propertyId);
    const vivek = pairs.find((p) => [p.a.name, p.b.name].sort().join(' / ') === 'Vivek Agewal / Vivek Agrawal');
    expect(vivek?.reason).toBe('Very similar names');
    // Each pair once, never a guest with itself.
    const keys = pairs.map((p) => [p.a.id, p.b.id].sort().join(':'));
    expect(new Set(keys).size).toBe(keys.length);
    expect(pairs.every((p) => p.a.id !== p.b.id)).toBe(true);
  });

  it('still matches a new guest against a profile made years ago', async () => {
    const actor = await porticoActor();
    const [old] = await db
      .insert(guests)
      .values({ propertyId: actor.propertyId, name: 'Kavita Raghunathan', nameKey: 'kavitaraghunathan', mobile: '9800011111', createdAt: new Date('2023-01-10T10:00:00Z') })
      .returning();
    const [fresh] = await db.insert(guests).values({ propertyId: actor.propertyId, name: 'Kavita Raghunatan', nameKey: 'kavitaraghunatan', mobile: '9800011112' }).returning();
    const pairs = await recentDuplicatePairs(actor.propertyId);
    expect(pairs.find((p) => p.b.id === fresh.id)).toMatchObject({ a: { id: old.id }, reason: 'Very similar names' });
    // Two old profiles alone are not re-checked on every visit.
    const later = await recentDuplicatePairs(actor.propertyId, new Date(Date.now() + 120 * 86_400_000));
    expect(later.find((p) => p.b.id === fresh.id || p.a.id === fresh.id)).toBeUndefined();
  });
});
