import 'server-only';
import { and, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { db, type DbOrTx } from '@/db';
import { bookings, guests, payments } from '@/db/schema';
import { editDistance, maskIdNumber, nameKey, normaliseMobile } from '@/lib/utils';
import { UserError } from '../errors';
import { logActivity } from '../audit';

export interface GuestInput {
  id?: string | null;
  name: string;
  mobile?: string | null;
  email?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  nationality?: string | null;
  company?: string | null;
  companyGstin?: string | null;
  idType?: (typeof guests.$inferInsert)['idType'] | null;
  idNumber?: string | null;
}

/**
 * Reuse a guest when we know them (explicit id, or the same mobile number), otherwise create a new profile.
 * Typing a mobile number on the reservation form fills in a returning guest's details (rule 5).
 */
export async function findOrCreateGuest(tx: DbOrTx, propertyId: string, input: GuestInput): Promise<string> {
  const name = input.name.trim();
  if (name.length < 2) throw new UserError('Enter the guest name.');
  const mobile = normaliseMobile(input.mobile);
  const isForeign = Boolean(input.nationality && !/^indian?$/i.test(input.nationality.trim()));

  const patch = {
    name,
    nameKey: nameKey(name),
    mobile,
    email: input.email?.trim().toLowerCase() || null,
    city: input.city?.trim() || null,
    state: input.state?.trim() || null,
    company: input.company?.trim() || null,
    companyGstin: input.companyGstin?.trim().toUpperCase() || null,
    ...(input.nationality ? { nationality: input.nationality.trim(), isForeign } : {}),
    ...(input.country ? { country: input.country.trim() } : {}),
    ...(input.idType ? { idType: input.idType } : {}),
    ...(input.idNumber ? { idNumberMasked: maskIdNumber(input.idNumber) } : {}),
  };

  if (input.id) {
    const [existing] = await tx.select({ id: guests.id }).from(guests).where(and(eq(guests.id, input.id), eq(guests.propertyId, propertyId)));
    if (!existing) throw new UserError('Guest not found.');
    await tx.update(guests).set(stripEmpty(patch)).where(eq(guests.id, input.id));
    return input.id;
  }

  if (mobile && mobile.length === 10) {
    const [returning] = await tx
      .select({ id: guests.id })
      .from(guests)
      .where(and(eq(guests.propertyId, propertyId), eq(guests.mobile, mobile), isNull(guests.mergedIntoId)))
      .orderBy(desc(guests.updatedAt))
      .limit(1);
    if (returning) {
      await tx.update(guests).set(stripEmpty(patch)).where(eq(guests.id, returning.id));
      return returning.id;
    }
  }

  const [created] = await tx
    .insert(guests)
    .values({ propertyId, ...patch, nationality: input.nationality?.trim() || 'Indian', isForeign })
    .returning({ id: guests.id });
  return created.id;
}

function stripEmpty<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== null && v !== undefined && v !== '')) as Partial<T>;
}

export interface GuestLookup {
  id: string;
  name: string;
  mobile: string | null;
  email: string | null;
  city: string | null;
  nationality: string;
  company: string | null;
  companyGstin: string | null;
  isVip: boolean;
  stays: number;
  lastStay: string | null;
}

/** Look up a returning guest by mobile (exact) or name (prefix). */
export async function lookupGuests(propertyId: string, query: string): Promise<GuestLookup[]> {
  const q = query.trim();
  if (q.length < 3) return [];
  const mobile = normaliseMobile(q);
  const byMobile = mobile && mobile.length >= 6;
  const rows = await db
    .select({
      id: guests.id,
      name: guests.name,
      mobile: guests.mobile,
      email: guests.email,
      city: guests.city,
      nationality: guests.nationality,
      company: guests.company,
      companyGstin: guests.companyGstin,
      isVip: guests.isVip,
      stays: sql<number>`(SELECT count(*)::int FROM bookings b WHERE b.guest_id = ${guests.id} AND b.status IN ('checked_out','checked_in','confirmed'))`,
      lastStay: sql<string | null>`(SELECT max(b.check_in)::text FROM bookings b WHERE b.guest_id = ${guests.id})`,
    })
    .from(guests)
    .where(
      and(
        eq(guests.propertyId, propertyId),
        isNull(guests.mergedIntoId),
        byMobile ? sql`${guests.mobile} LIKE ${`%${mobile}%`}` : sql`${guests.name} ILIKE ${`${q}%`}`,
      ),
    )
    .limit(6);
  return rows;
}

export interface DuplicateCandidate {
  id: string;
  name: string;
  mobile: string | null;
  reason: string;
}

/**
 * Near-duplicate guests (e.g. "Vivek Agrawal" vs "Vivek Agewal", or the same mobile with another name).
 * Shown as a warning on the reservation form with a Merge option.
 */
export async function findDuplicateGuests(propertyId: string, name: string, mobile?: string | null, excludeId?: string): Promise<DuplicateCandidate[]> {
  const key = nameKey(name);
  if (key.length < 4) return [];
  const m = normaliseMobile(mobile);
  const firstToken = name.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
  const candidates = await db
    .select({ id: guests.id, name: guests.name, mobile: guests.mobile, nameKey: guests.nameKey })
    .from(guests)
    .where(
      and(
        eq(guests.propertyId, propertyId),
        isNull(guests.mergedIntoId),
        or(m && m.length === 10 ? eq(guests.mobile, m) : undefined, sql`lower(${guests.name}) LIKE ${`${firstToken}%`}`),
      ),
    )
    .limit(50);

  const threshold = key.length >= 10 ? 3 : 2;
  return candidates
    .filter((c) => c.id !== excludeId)
    .flatMap((c) => {
      if (m && c.mobile === m && c.nameKey !== key) return [{ id: c.id, name: c.name, mobile: c.mobile, reason: 'Same mobile, different name' }];
      const distance = editDistance(c.nameKey, key);
      if (distance > 0 && distance <= threshold) return [{ id: c.id, name: c.name, mobile: c.mobile, reason: 'Very similar name' }];
      if (distance === 0 && (!m || c.mobile !== m)) return [{ id: c.id, name: c.name, mobile: c.mobile, reason: 'Same name' }];
      return [];
    })
    .slice(0, 5);
}

/** Merge `mergeId` into `keepId`: move bookings and payments, then mark the duplicate as merged. */
export async function mergeGuests(actor: { propertyId: string; userId: string }, keepId: string, mergeId: string) {
  if (keepId === mergeId) throw new UserError('Choose two different guests.');
  await db.transaction(async (tx) => {
    const both = await tx
      .select()
      .from(guests)
      .where(and(eq(guests.propertyId, actor.propertyId), inArray(guests.id, [keepId, mergeId])));
    const keep = both.find((g) => g.id === keepId);
    const merge = both.find((g) => g.id === mergeId);
    if (!keep || !merge) throw new UserError('Guest not found.');
    await tx.update(bookings).set({ guestId: keepId }).where(eq(bookings.guestId, mergeId));
    await tx.update(payments).set({ guestId: keepId }).where(eq(payments.guestId, mergeId));
    await tx
      .update(guests)
      .set({
        mobile: keep.mobile ?? merge.mobile,
        email: keep.email ?? merge.email,
        city: keep.city ?? merge.city,
        idType: keep.idType ?? merge.idType,
        idNumberMasked: keep.idNumberMasked ?? merge.idNumberMasked,
      })
      .where(eq(guests.id, keepId));
    await tx.update(guests).set({ mergedIntoId: keepId, mobile: null }).where(eq(guests.id, mergeId));
    await logActivity(
      {
        propertyId: actor.propertyId,
        userId: actor.userId,
        entityType: 'guest',
        entityId: keepId,
        action: 'merge',
        summary: `Merged guest "${merge.name}" into "${keep.name}"`,
        before: { merged: merge },
      },
      tx,
    );
  });
}
