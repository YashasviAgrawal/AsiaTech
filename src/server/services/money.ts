import 'server-only';
import { and, asc, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { db } from '@/db';
import { bookings, guests, payments, pettyCash, users, type PaymentMode } from '@/db/schema';
import { formatINR, nightsBetween } from '@/lib/format';
import { round2 } from '@/lib/utils';
import { UserError } from '../errors';
import { logActivity, notify } from '../audit';
import type { Actor } from './actor';
import { createPaymentLink } from '../adapters/payments';
import { sendMessage } from './messaging';
import { paymentLinkText } from './templates';

/* ───────────────────────────── payments ledger ───────────────────────────── */

export async function listPayments(propertyId: string, filters: { from: string; to: string; mode?: string; kind?: string }) {
  const rows = await db
    .select({
      id: payments.id,
      bookingId: payments.bookingId,
      bookingNo: bookings.bookingNo,
      guestName: sql<string | null>`COALESCE(${guests.name}, ${payments.payerName})`,
      mode: payments.mode,
      kind: payments.kind,
      amount: payments.amount,
      reference: payments.reference,
      status: payments.status,
      purpose: payments.purpose,
      businessDate: payments.businessDate,
      paidAt: payments.paidAt,
      createdAt: payments.createdAt,
      receivedBy: users.name,
      linkUrl: payments.linkUrl,
    })
    .from(payments)
    .leftJoin(bookings, eq(bookings.id, payments.bookingId))
    .leftJoin(guests, eq(guests.id, sql`COALESCE(${payments.guestId}, ${bookings.guestId})`))
    .leftJoin(users, eq(users.id, payments.receivedBy))
    .where(
      and(
        eq(payments.propertyId, propertyId),
        gte(payments.businessDate, filters.from),
        lte(payments.businessDate, filters.to),
        filters.mode ? sql`${payments.mode} = ${filters.mode}` : undefined,
        filters.kind ? sql`${payments.kind} = ${filters.kind}` : undefined,
      ),
    )
    .orderBy(desc(payments.createdAt))
    .limit(500);
  const ok = rows.filter((r) => r.status === 'success');
  const byMode: Record<string, number> = {};
  for (const r of ok) byMode[r.mode] = round2((byMode[r.mode] ?? 0) + (r.kind === 'refund' ? -r.amount : r.amount));
  return { rows, byMode, total: round2(Object.values(byMode).reduce((t, v) => t + v, 0)) };
}

/* ───────────────────────────── request money ───────────────────────────── */

export async function requestMoney(
  actor: Actor & { hotelName: string },
  input: { bookingId?: string | null; name: string; mobile?: string | null; email?: string | null; amount: number; purpose: string; channel: 'whatsapp' | 'sms' | 'none'; expiresInHours: number },
) {
  if (input.amount <= 0) throw new UserError('Enter an amount.');
  let guestId: string | null = null;
  if (input.bookingId) {
    const [b] = await db.select({ guestId: bookings.guestId }).from(bookings).where(and(eq(bookings.id, input.bookingId), eq(bookings.propertyId, actor.propertyId)));
    if (!b) throw new UserError('Booking not found.');
    guestId = b.guestId;
  }
  const expiresAt = new Date(Date.now() + input.expiresInHours * 3600_000);
  const [row] = await db
    .insert(payments)
    .values({
      propertyId: actor.propertyId,
      bookingId: input.bookingId ?? null,
      guestId,
      mode: 'link',
      kind: 'request',
      amount: round2(input.amount),
      purpose: input.purpose,
      status: 'pending',
      payerName: input.name,
      payerMobile: input.mobile ?? null,
      businessDate: actor.businessDate,
      linkExpiresAt: expiresAt,
      receivedBy: actor.userId,
    })
    .returning({ id: payments.id });
  const link = await createPaymentLink({ amount: input.amount, description: input.purpose, customer: { name: input.name, contact: input.mobile, email: input.email }, referenceId: row.id, expiresAt });
  await db.update(payments).set({ linkId: link.id, linkUrl: link.url }).where(eq(payments.id, row.id));

  if (input.channel !== 'none' && input.mobile) {
    await sendMessage({
      propertyId: actor.propertyId,
      channel: input.channel,
      to: input.mobile,
      template: 'payment_link',
      body: paymentLinkText({ hotelName: actor.hotelName, guestName: input.name, amount: input.amount, purpose: input.purpose, url: link.url }),
      entityType: 'payment',
      entityId: row.id,
      sentBy: actor.userId,
    });
  }
  await logActivity({ propertyId: actor.propertyId, userId: actor.userId, entityType: 'payment', entityId: row.id, action: 'request', summary: `Requested ${formatINR(input.amount)} from ${input.name} · ${input.purpose}` });
  return { id: row.id, url: link.url };
}

/**
 * A payment link was paid (webhook or the mock page). The money is added to the guest's bill automatically.
 * Idempotent: a second call for the same link does nothing.
 */
export async function markLinkPaid(linkId: string, reference: string) {
  return db.transaction(async (tx) => {
    const [p] = await tx.select().from(payments).where(eq(payments.linkId, linkId)).for('update');
    if (!p) throw new UserError('Payment link not found.');
    if (p.status === 'success') return { alreadyPaid: true, paymentId: p.id };
    if (p.status !== 'pending') throw new UserError(`This link is ${p.status}.`);
    await tx.update(payments).set({ status: 'success', reference, paidAt: new Date(), kind: p.bookingId ? 'advance' : 'request' }).where(eq(payments.id, p.id));
    if (p.bookingId) await tx.update(bookings).set({ paidAmount: sql`${bookings.paidAmount} + ${p.amount}` }).where(eq(bookings.id, p.bookingId));
    await notify(tx, { propertyId: p.propertyId, type: 'payment', title: `${formatINR(p.amount)} received online`, body: `${p.payerName ?? 'Guest'} · ${p.purpose ?? ''}`, href: p.bookingId ? `/front-desk/bookings/${p.bookingId}` : '/money/request' });
    await logActivity({ propertyId: p.propertyId, userId: null, entityType: 'payment', entityId: p.id, action: 'paid', summary: `Payment link paid: ${formatINR(p.amount)} by ${p.payerName ?? 'guest'} · ref ${reference}` }, tx);
    if (p.bookingId) await logActivity({ propertyId: p.propertyId, userId: null, entityType: 'booking', entityId: p.bookingId, action: 'payment', summary: `Online payment ${formatINR(p.amount)} received (link)` }, tx);
    return { alreadyPaid: false, paymentId: p.id };
  });
}

export async function cancelLink(actor: Actor, paymentId: string) {
  await db
    .update(payments)
    .set({ status: 'expired' })
    .where(and(eq(payments.id, paymentId), eq(payments.propertyId, actor.propertyId), eq(payments.status, 'pending')));
}

/* ───────────────────────────── petty cash ───────────────────────────── */

export async function pettyCashLedger(propertyId: string, from: string, to: string) {
  const [opening] = await db
    .select({
      balance: sql<number>`COALESCE(sum(CASE WHEN ${pettyCash.type} = 'expense' THEN -${pettyCash.amount} ELSE ${pettyCash.amount} END), 0)::float`,
    })
    .from(pettyCash)
    .where(and(eq(pettyCash.propertyId, propertyId), sql`${pettyCash.entryDate} < ${from}`, eq(pettyCash.status, 'approved')));
  const rows = await db
    .select({ entry: pettyCash, createdByName: users.name })
    .from(pettyCash)
    .leftJoin(users, eq(users.id, pettyCash.createdBy))
    .where(and(eq(pettyCash.propertyId, propertyId), gte(pettyCash.entryDate, from), lte(pettyCash.entryDate, to)))
    .orderBy(asc(pettyCash.entryDate), asc(pettyCash.createdAt));
  let balance = opening.balance;
  const entries = rows.map(({ entry, createdByName }) => {
    if (entry.status === 'approved') balance = round2(balance + (entry.type === 'expense' ? -entry.amount : entry.amount));
    return { ...entry, createdByName, balance };
  });
  const spent = round2(rows.filter((r) => r.entry.type === 'expense' && r.entry.status === 'approved').reduce((t, r) => t + r.entry.amount, 0));
  const added = round2(rows.filter((r) => r.entry.type !== 'expense' && r.entry.status === 'approved').reduce((t, r) => t + r.entry.amount, 0));
  return { openingBalance: round2(opening.balance), entries, closingBalance: round2(balance), spent, added, pending: rows.filter((r) => r.entry.status === 'pending').length };
}

export async function addPettyCash(
  actor: Actor & { canApprove: boolean },
  input: { type: 'opening' | 'top_up' | 'expense'; amount: number; category?: string | null; paidTo?: string | null; description?: string | null; billPhotoUrl?: string | null; entryDate?: string | null },
) {
  if (input.amount <= 0) throw new UserError('Enter an amount.');
  if (input.type === 'expense' && !input.description && !input.category) throw new UserError('Say what the money was spent on.');
  // Expenses above ₹2,000 by non-managers wait for approval.
  const needsApproval = input.type === 'expense' && !actor.canApprove && input.amount > 2000;
  const [row] = await db
    .insert(pettyCash)
    .values({
      propertyId: actor.propertyId,
      entryDate: input.entryDate || actor.businessDate,
      type: input.type,
      amount: round2(input.amount),
      category: input.category || null,
      paidTo: input.paidTo || null,
      description: input.description || null,
      billPhotoUrl: input.billPhotoUrl || null,
      status: needsApproval ? 'pending' : 'approved',
      approvedBy: needsApproval ? null : actor.userId,
      createdBy: actor.userId,
    })
    .returning({ id: pettyCash.id });
  await logActivity({ propertyId: actor.propertyId, userId: actor.userId, entityType: 'petty_cash', entityId: row.id, action: input.type, summary: `Petty cash ${input.type.replace('_', ' ')} ${formatINR(input.amount)}${input.description ? ` · ${input.description}` : ''}` });
  return { id: row.id, pending: needsApproval };
}

export async function reviewPettyCash(actor: Actor, id: string, approve: boolean) {
  await db
    .update(pettyCash)
    .set({ status: approve ? 'approved' : 'rejected', approvedBy: actor.userId })
    .where(and(eq(pettyCash.id, id), eq(pettyCash.propertyId, actor.propertyId), eq(pettyCash.status, 'pending')));
}

/* ───────────────────────────── credit report ───────────────────────────── */

export const AGE_BUCKETS = ['0–30', '31–60', '61–90', '90+'] as const;

/** Money still owed after check-out (and by in-house guests), grouped by who pays and aged by days. */
export async function creditReport(propertyId: string, bizDate: string) {
  const rows = await db
    .select({
      id: bookings.id,
      bookingNo: bookings.bookingNo,
      status: bookings.status,
      billTo: bookings.billTo,
      billToName: bookings.billToName,
      checkIn: bookings.checkIn,
      checkOut: bookings.checkOut,
      totalAmount: bookings.totalAmount,
      paidAmount: bookings.paidAmount,
      guestName: guests.name,
      mobile: guests.mobile,
      company: guests.company,
      channel: bookings.channel,
      extras: sql<number>`(SELECT COALESCE(sum(f.total), 0)::float FROM folio_lines f WHERE f.booking_id = "bookings"."id" AND f.type <> 'room' AND NOT f.is_void)`,
    })
    .from(bookings)
    .innerJoin(guests, eq(guests.id, bookings.guestId))
    .where(and(eq(bookings.propertyId, propertyId), inArray(bookings.status, ['checked_out', 'checked_in'])));

  const owed = rows
    .map((r) => {
      const balance = round2(r.totalAmount + r.extras - r.paidAmount);
      const days = r.status === 'checked_out' ? Math.max(0, nightsBetween(r.checkOut, bizDate)) : 0;
      const bucket: (typeof AGE_BUCKETS)[number] = days <= 30 ? '0–30' : days <= 60 ? '31–60' : days <= 90 ? '61–90' : '90+';
      const debtor = r.billTo === 'guest' ? r.guestName : r.billToName ?? r.company ?? r.guestName;
      return { ...r, balance, days, bucket, debtor };
    })
    .filter((r) => r.balance > 0.5 && (r.status === 'checked_out' || r.billTo !== 'guest'));

  const groups = (['guest', 'company', 'agent', 'ota'] as const).map((billTo) => {
    const list = owed.filter((o) => o.billTo === billTo).sort((a, b) => b.days - a.days);
    const buckets = Object.fromEntries(AGE_BUCKETS.map((b) => [b, round2(list.filter((l) => l.bucket === b).reduce((t, l) => t + l.balance, 0))])) as Record<(typeof AGE_BUCKETS)[number], number>;
    return { billTo, list, buckets, total: round2(list.reduce((t, l) => t + l.balance, 0)) };
  });
  const buckets = Object.fromEntries(AGE_BUCKETS.map((b) => [b, round2(owed.filter((l) => l.bucket === b).reduce((t, l) => t + l.balance, 0))])) as Record<(typeof AGE_BUCKETS)[number], number>;
  return { groups, buckets, total: round2(owed.reduce((t, l) => t + l.balance, 0)), count: owed.length };
}

export type { PaymentMode };
