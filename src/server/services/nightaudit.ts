import 'server-only';
import { and, asc, desc, eq, inArray, lte, sql } from 'drizzle-orm';
import { db } from '@/db';
import {
  bookingRooms,
  bookings,
  folioLines,
  guests,
  inventory,
  nightAudits,
  payments,
  pettyCash,
  posDayCloses,
  posOrders,
  posOutlets,
  properties,
  users,
  type NightAuditStep,
} from '@/db/schema';
import { addDay, formatDay, formatINR } from '@/lib/format';
import { round2 } from '@/lib/utils';
import { UserError } from '../errors';
import { logActivity } from '../audit';
import type { Actor } from './actor';
import { cancelBooking, releaseExpiredHolds } from './bookings';
import { postRoomCharges } from './frontoffice';
import { sendMessage } from './messaging';

export const AUDIT_STEPS: { key: NightAuditStep['key']; title: string; description: string }[] = [
  { key: 'no_shows', title: 'Mark no-shows', description: 'Arrivals that never came. Their rooms go back on sale.' },
  { key: 'room_charges', title: 'Post room charges', description: "Tonight's room rent goes on every in-house guest's bill." },
  { key: 'pos_closed', title: 'Restaurant day closed', description: 'Every outlet must close its day first.' },
  { key: 'cash_match', title: 'Match cash', description: 'Count the cash drawer and compare with the system.' },
  { key: 'lock_day', title: 'Lock the day', description: 'The business date moves to tomorrow. Nothing more can be posted to today.' },
  { key: 'email_report', title: 'Email the report', description: 'A summary goes to the owner.' },
];

export async function getAuditState(propertyId: string, bizDate: string) {
  const [pendingArrivals, dueOuts, inHouse, outlets, closes, cash, posCash, petty, openPos, audit] = await Promise.all([
    db
      .select({ id: bookings.id, bookingNo: bookings.bookingNo, guestName: guests.name, checkIn: bookings.checkIn, source: bookings.source, channel: bookings.channel, paid: bookings.paidAmount })
      .from(bookings)
      .innerJoin(guests, eq(guests.id, bookings.guestId))
      .where(and(eq(bookings.propertyId, propertyId), eq(bookings.status, 'confirmed'), lte(bookings.checkIn, bizDate)))
      .orderBy(asc(guests.name)),
    db
      .select({ id: bookings.id, bookingNo: bookings.bookingNo, guestName: guests.name })
      .from(bookings)
      .innerJoin(guests, eq(guests.id, bookings.guestId))
      .where(and(eq(bookings.propertyId, propertyId), eq(bookings.status, 'checked_in'), lte(bookings.checkOut, bizDate))),
    db
      .select({
        id: bookingRooms.id,
        posted: sql<boolean>`EXISTS (SELECT 1 FROM folio_lines f WHERE f.booking_room_id = "booking_rooms"."id" AND f.type = 'room' AND f.business_date = ${bizDate} AND NOT f.is_void)`,
      })
      .from(bookingRooms)
      .where(and(eq(bookingRooms.propertyId, propertyId), eq(bookingRooms.status, 'in_house'), sql`${bookingRooms.checkIn} <= ${bizDate}`, sql`${bookingRooms.checkOut} > ${bizDate}`)),
    db.select({ id: posOutlets.id, name: posOutlets.name }).from(posOutlets).where(and(eq(posOutlets.propertyId, propertyId), eq(posOutlets.isActive, true))),
    db.select({ outletId: posDayCloses.outletId }).from(posDayCloses).where(and(eq(posDayCloses.propertyId, propertyId), eq(posDayCloses.businessDate, bizDate))),
    db
      .select({ total: sql<number>`COALESCE(sum(CASE WHEN ${payments.kind} = 'refund' THEN -${payments.amount} ELSE ${payments.amount} END), 0)::float` })
      .from(payments)
      .where(and(eq(payments.propertyId, propertyId), eq(payments.businessDate, bizDate), eq(payments.mode, 'cash'), eq(payments.status, 'success'))),
    db
      .select({ total: sql<number>`COALESCE(sum(${posOrders.total}), 0)::float` })
      .from(posOrders)
      .where(and(eq(posOrders.propertyId, propertyId), eq(posOrders.businessDate, bizDate), eq(posOrders.status, 'settled'), eq(posOrders.settlementMode, 'cash'))),
    db
      .select({ total: sql<number>`COALESCE(sum(${pettyCash.amount}), 0)::float` })
      .from(pettyCash)
      .where(and(eq(pettyCash.propertyId, propertyId), eq(pettyCash.entryDate, bizDate), eq(pettyCash.type, 'expense'), eq(pettyCash.status, 'approved'))),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(posOrders)
      .where(and(eq(posOrders.propertyId, propertyId), eq(posOrders.businessDate, bizDate), inArray(posOrders.status, ['open', 'billed']))),
    db.select().from(nightAudits).where(and(eq(nightAudits.propertyId, propertyId), eq(nightAudits.businessDate, bizDate))),
  ]);
  const closedSet = new Set(closes.map((c) => c.outletId));
  return {
    pendingArrivals,
    dueOuts,
    roomCharges: { total: inHouse.length, posted: inHouse.filter((r) => r.posted).length },
    outlets: outlets.map((o) => ({ ...o, closed: closedSet.has(o.id) })),
    openPosOrders: openPos[0]?.n ?? 0,
    cash: { frontDesk: round2(cash[0]?.total ?? 0), restaurant: round2(posCash[0]?.total ?? 0), pettyExpenses: round2(petty[0]?.total ?? 0) },
    audit: audit[0] ?? null,
  };
}

async function startAudit(actor: Actor) {
  const [existing] = await db.select().from(nightAudits).where(and(eq(nightAudits.propertyId, actor.propertyId), eq(nightAudits.businessDate, actor.businessDate)));
  if (existing) return existing;
  const [row] = await db
    .insert(nightAudits)
    .values({ propertyId: actor.propertyId, businessDate: actor.businessDate, runBy: actor.userId, steps: AUDIT_STEPS.map((s) => ({ key: s.key, status: 'pending' as const })) })
    .returning();
  return row;
}

async function markStep(actor: Actor, key: NightAuditStep['key'], detail: string, status: NightAuditStep['status'] = 'done', summary?: Record<string, number | string>) {
  const audit = await startAudit(actor);
  const steps = audit.steps.map((s) => (s.key === key ? { ...s, status, detail, at: new Date().toISOString() } : s));
  await db
    .update(nightAudits)
    .set({ steps, summary: summary ? { ...audit.summary, ...summary } : audit.summary })
    .where(eq(nightAudits.id, audit.id));
}

export async function auditNoShows(actor: Actor, bookingIds: string[]) {
  for (const id of bookingIds) await cancelBooking(actor, id, 'No-show (Night Audit)', { status: 'no_show' });
  await markStep(actor, 'no_shows', `${bookingIds.length} marked no-show`, 'done', { noShows: bookingIds.length });
  return { count: bookingIds.length };
}

export async function auditPostRoomCharges(actor: Actor) {
  const inHouse = await db
    .select({ id: bookingRooms.id })
    .from(bookingRooms)
    .where(and(eq(bookingRooms.propertyId, actor.propertyId), eq(bookingRooms.status, 'in_house'), sql`${bookingRooms.checkIn} <= ${actor.businessDate}`, sql`${bookingRooms.checkOut} > ${actor.businessDate}`));
  let posted = 0;
  await db.transaction(async (tx) => {
    for (const br of inHouse) posted += await postRoomCharges(tx, actor, br.id, addDay(actor.businessDate, 1));
  });
  const [{ revenue }] = await db
    .select({ revenue: sql<number>`COALESCE(sum(${folioLines.amount}), 0)::float` })
    .from(folioLines)
    .where(and(eq(folioLines.propertyId, actor.propertyId), eq(folioLines.businessDate, actor.businessDate), eq(folioLines.type, 'room'), eq(folioLines.isVoid, false)));
  await markStep(actor, 'room_charges', `${posted} night(s) posted · room revenue ${formatINR(revenue)}`, 'done', { roomRevenue: round2(revenue), roomsSold: inHouse.length });
  return { posted };
}

export async function auditCheckPos(actor: Actor) {
  const state = await getAuditState(actor.propertyId, actor.businessDate);
  const open = state.outlets.filter((o) => !o.closed);
  if (open.length) throw new UserError(`Close the restaurant day first: ${open.map((o) => o.name).join(', ')}.`);
  await markStep(actor, 'pos_closed', 'All outlets closed');
  return { ok: true };
}

export async function auditCashMatch(actor: Actor, counted: number, note?: string | null) {
  const state = await getAuditState(actor.propertyId, actor.businessDate);
  const expected = round2(state.cash.frontDesk + state.cash.restaurant - state.cash.pettyExpenses);
  const difference = round2(counted - expected);
  await markStep(actor, 'cash_match', `Expected ${formatINR(expected)}, counted ${formatINR(counted)}${difference ? ` · ${difference > 0 ? 'excess' : 'short'} ${formatINR(Math.abs(difference))}` : ' · matched'}${note ? ` · ${note}` : ''}`, 'done', {
    cashExpected: expected,
    cashCounted: round2(counted),
    cashDifference: difference,
  });
  return { expected, difference };
}

/**
 * Lock the day: summarise it, move the business date forward and release expired holds. After this, nothing
 * can be posted to the closed date.
 */
export async function auditLockDay(actor: Actor & { emails: string[]; hotelName: string }) {
  const audit = await startAudit(actor);
  const required: NightAuditStep['key'][] = ['no_shows', 'room_charges', 'pos_closed', 'cash_match'];
  const missing = required.filter((k) => audit.steps.find((s) => s.key === k)?.status === 'pending');
  if (missing.length) throw new UserError(`Finish these steps first: ${missing.map((k) => AUDIT_STEPS.find((s) => s.key === k)!.title).join(', ')}.`);

  const biz = actor.businessDate;
  const [occ] = await db
    .select({ total: sql<number>`COALESCE(sum(${inventory.total} - ${inventory.blocked}), 0)::int`, booked: sql<number>`COALESCE(sum(${inventory.booked}), 0)::int` })
    .from(inventory)
    .where(and(eq(inventory.propertyId, actor.propertyId), eq(inventory.date, biz)));
  const [pos] = await db
    .select({ total: sql<number>`COALESCE(sum(${posOrders.total}), 0)::float` })
    .from(posOrders)
    .where(and(eq(posOrders.propertyId, actor.propertyId), eq(posOrders.businessDate, biz), eq(posOrders.status, 'settled')));
  const [collected] = await db
    .select({ total: sql<number>`COALESCE(sum(CASE WHEN ${payments.kind} = 'refund' THEN -${payments.amount} ELSE ${payments.amount} END), 0)::float` })
    .from(payments)
    .where(and(eq(payments.propertyId, actor.propertyId), eq(payments.businessDate, biz), eq(payments.status, 'success')));
  const roomRevenue = Number(audit.summary.roomRevenue ?? 0);
  const roomsSold = Number(audit.summary.roomsSold ?? occ.booked);
  const summary: Record<string, number | string> & { occupancy: number; adr: number; revpar: number; restaurantRevenue: number; collected: number } = {
    ...audit.summary,
    occupancy: occ.total > 0 ? Math.round((roomsSold / occ.total) * 100) : 0,
    adr: roomsSold > 0 ? Math.round(roomRevenue / roomsSold) : 0,
    revpar: occ.total > 0 ? Math.round(roomRevenue / occ.total) : 0,
    restaurantRevenue: round2(pos.total),
    collected: round2(collected.total),
  };
  const next = addDay(biz, 1);
  await db.transaction(async (tx) => {
    const steps = audit.steps.map((s) => (s.key === 'lock_day' ? { ...s, status: 'done' as const, at: new Date().toISOString(), detail: `Business date moved to ${formatDay(next)}` } : s));
    await tx.update(nightAudits).set({ steps, summary }).where(eq(nightAudits.id, audit.id));
    await tx.update(properties).set({ businessDate: next }).where(eq(properties.id, actor.propertyId));
    await logActivity({ propertyId: actor.propertyId, userId: actor.userId, entityType: 'night_audit', entityId: audit.id, action: 'lock', summary: `Night Audit closed ${formatDay(biz)} · occupancy ${summary.occupancy}% · room revenue ${formatINR(roomRevenue)}` }, tx);
  });
  await releaseExpiredHolds({ ...actor, businessDate: next });

  // Email the report (console provider in development).
  const body = [
    `Night Audit · ${actor.hotelName} · ${formatDay(biz)}`,
    `Occupancy ${summary.occupancy}% · ADR ${formatINR(summary.adr)} · RevPAR ${formatINR(summary.revpar)}`,
    `Room revenue ${formatINR(roomRevenue)} · Restaurant ${formatINR(summary.restaurantRevenue)} · Collected ${formatINR(summary.collected)}`,
    `Cash expected ${formatINR(Number(summary.cashExpected ?? 0))}, counted ${formatINR(Number(summary.cashCounted ?? 0))}`,
  ].join('\n');
  for (const email of actor.emails) {
    await sendMessage({ propertyId: actor.propertyId, channel: 'email', to: email, template: 'night_audit', body, entityType: 'night_audit', entityId: audit.id, sentBy: actor.userId });
  }
  const after = (await db.select().from(nightAudits).where(eq(nightAudits.id, audit.id)))[0];
  await db
    .update(nightAudits)
    .set({
      status: 'completed',
      completedAt: new Date(),
      steps: after.steps.map((s) => (s.key === 'email_report' ? { ...s, status: actor.emails.length ? ('done' as const) : ('skipped' as const), at: new Date().toISOString(), detail: actor.emails.length ? `Sent to ${actor.emails.join(', ')}` : 'No email set in Settings' } : s)),
    })
    .where(eq(nightAudits.id, audit.id));
  return { nextBusinessDate: next, summary };
}

export async function auditHistory(propertyId: string) {
  return db
    .select({ audit: nightAudits, runBy: users.name })
    .from(nightAudits)
    .leftJoin(users, eq(users.id, nightAudits.runBy))
    .where(eq(nightAudits.propertyId, propertyId))
    .orderBy(desc(nightAudits.businessDate))
    .limit(14);
}

