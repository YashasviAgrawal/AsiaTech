import './helpers';
import { eq, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { db } from '@/db';
import { bookings, guests, properties } from '@/db/schema';
import { runInTenant } from '@/db/tenant';

/**
 * Row-level security through the app's own pool: a query that forgets its property filter still only sees
 * the hotel the request is for.
 */
async function hotels() {
  const rows = await db.select({ id: properties.id, slug: properties.slug }).from(properties);
  const portico = rows.find((r) => r.slug === 'shri-ram-portico')!;
  const other = rows.find((r) => r.slug !== 'shri-ram-portico');
  if (other) return { portico: portico.id, other: other.id };
  // The test database may have one hotel: add a second, empty one.
  const [source] = await db.select().from(properties).where(eq(properties.id, portico.id));
  const [created] = await db
    .insert(properties)
    .values({ organizationId: source.organizationId, name: 'RLS Test Hotel', slug: 'rls-test-hotel', businessDate: source.businessDate, settings: source.settings, branding: source.branding })
    .returning({ id: properties.id });
  return { portico: portico.id, other: created.id };
}

describe('row-level security', () => {
  it('a lookup by id without a property filter only finds rows of the scoped hotel', async () => {
    const { portico, other } = await hotels();
    const [booking] = await db.select({ id: bookings.id }).from(bookings).where(eq(bookings.propertyId, portico)).limit(1);
    // Drizzle queries run when awaited, so await inside the scope (as request code always does).
    const find = async () => await db.select({ id: bookings.id }).from(bookings).where(eq(bookings.id, booking.id));
    expect(await runInTenant(portico, find)).toHaveLength(1);
    expect(await runInTenant(other, find)).toHaveLength(0);
    expect(await find()).toHaveLength(1); // no scope: worker, webhooks, seed
  });

  it('refuses writes into another hotel, inside transactions too', async () => {
    const { portico, other } = await hotels();
    const error = await runInTenant(other, async () => await db.insert(guests).values({ propertyId: portico, name: 'RLS probe', nameKey: 'rlsprobe' })).then(
      () => null,
      (e: Error & { cause?: Error }) => e,
    );
    expect(error?.cause?.message).toMatch(/row-level security policy for table "guests"/);
    await expect(
      runInTenant(other, () => db.transaction(async (tx) => tx.update(guests).set({ name: 'changed' }).where(eq(guests.propertyId, portico)).returning({ id: guests.id }))),
    ).resolves.toHaveLength(0);
  });

  it('stamps each pooled connection with the right hotel under concurrency', async () => {
    const { portico, other } = await hotels();
    const counts = await Promise.all(
      Array.from({ length: 24 }, (_, i) => {
        const hotel = i % 2 ? portico : other;
        return runInTenant(hotel, async () => {
          const [{ n, stamp }] = (await db.execute(sql`select count(*)::int as n, current_setting('app.property_id', true) as stamp from bookings`)).rows as { n: number; stamp: string }[];
          return { hotel, n, stamp };
        });
      }),
    );
    const total = (await db.select({ n: sql<number>`count(*)::int` }).from(bookings))[0].n;
    for (const c of counts) {
      expect(c.stamp).toBe(c.hotel);
      if (c.hotel === other) expect(c.n).toBe(0);
      else expect(c.n).toBe(total);
    }
    // Back outside any scope the stamp is cleared again.
    const [{ stamp }] = (await db.execute(sql`select current_setting('app.property_id', true) as stamp`)).rows as { stamp: string }[];
    expect(stamp).toBe('');
  });
});
