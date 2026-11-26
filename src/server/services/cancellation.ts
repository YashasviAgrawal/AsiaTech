import 'server-only';
import { and, desc, eq, gt, inArray, sql } from 'drizzle-orm';
import { db, type Tx } from '@/db';
import { bookingRooms, bookings, folioLines, guests, type PaymentMode } from '@/db/schema';
import { cancellationTaxRate, isUnstayed, splitInclusiveCharge, UNSTAYED_STATUSES } from '@/lib/booking-money';
import { formatDayShort, formatINR, PAYMENT_MODE_LABELS } from '@/lib/format';
import { SAC_ACCOMMODATION } from '@/lib/gst';
import { round2 } from '@/lib/utils';
import { UserError } from '../errors';
import { logActivity } from '../audit';
import type { Actor } from './actor';
import { cancelBookingInTx, insertPayment } from './bookings';
import { issueInvoice } from './frontoffice';

/**
 * What happens to money paid on a booking that will not be stayed (cancelled or no-show).
 * `keep` becomes a cancellation / no-show charge, GST included, with a GST invoice: under GST a retained advance is
 * the price of the room that was held, taxed at the same rate. `refund` is paid back to the guest now.
 */
export interface AdvanceDecision {
  keep: number;
  refund: number;
  mode: PaymentMode;
  reference?: string | null;
}

export interface AdvanceOutcome {
  refunded: number;
  kept: number;
  invoiceId: string | null;
  invoiceNo: string | null;
}

async function settleInTx(tx: Tx, actor: Actor, bookingId: string, decision: AdvanceDecision): Promise<AdvanceOutcome> {
  const [booking] = await tx
    .select()
    .from(bookings)
    .where(and(eq(bookings.id, bookingId), eq(bookings.propertyId, actor.propertyId)))
    .for('update');
  if (!booking) throw new UserError('Booking not found.');
  if (!isUnstayed(booking.status)) throw new UserError('Only a cancelled or no-show booking can keep or refund its advance.');
  const keep = round2(decision.keep);
  const refund = round2(decision.refund);
  if (keep < 0 || refund < 0 || keep + refund <= 0) throw new UserError('Enter an amount to refund or keep.');

  const lines = await tx.select().from(folioLines).where(and(eq(folioLines.bookingId, booking.id), eq(folioLines.isVoid, false)));
  if (keep > 0 && lines.some((l) => l.type === 'cancellation')) throw new UserError('This booking already has a cancellation charge.');
  const posted = round2(lines.filter((l) => l.type !== 'room').reduce((t, l) => t + l.total, 0));
  const refundable = round2(booking.paidAmount - posted - keep);
  if (refund > 0 && refund > refundable + 0.005) {
    throw new UserError(refundable > 0.5 ? `Only ${formatINR(refundable)} can be refunded.` : 'Nothing is left to refund.');
  }

  const noShow = booking.status === 'no_show';
  const what = noShow ? 'no-show' : 'cancellation';
  if (refund > 0) {
    await insertPayment(tx, actor, {
      bookingId: booking.id,
      guestId: booking.guestId,
      amount: refund,
      mode: decision.mode,
      reference: decision.reference || null,
      kind: 'refund',
      purpose: noShow ? 'No-show refund' : 'Cancellation refund',
    });
    await logActivity(
      {
        propertyId: actor.propertyId,
        userId: actor.userId,
        entityType: 'booking',
        entityId: booking.id,
        action: 'refund',
        summary: `Refunded ${formatINR(refund)} by ${PAYMENT_MODE_LABELS[decision.mode] ?? decision.mode} on ${booking.bookingNo}`,
      },
      tx,
    );
  }

  let invoice: { id: string; invoiceNo: string } | null = null;
  if (keep > 0) {
    const rooms = await tx.select({ nightly: bookingRooms.nightly }).from(bookingRooms).where(eq(bookingRooms.bookingId, booking.id));
    const rate = cancellationTaxRate(rooms, booking);
    const { taxable, tax } = splitInclusiveCharge(keep, rate);
    const cgst = round2(tax / 2);
    await tx.insert(folioLines).values({
      propertyId: actor.propertyId,
      bookingId: booking.id,
      businessDate: actor.businessDate,
      type: 'cancellation',
      description: `${noShow ? 'No-show' : 'Cancellation'} charge · stay ${formatDayShort(booking.checkIn)} – ${formatDayShort(booking.checkOut)}`,
      quantity: 1,
      amount: taxable,
      taxRate: rate,
      cgst,
      sgst: round2(tax - cgst),
      total: keep,
      hsnSac: SAC_ACCOMMODATION,
      postedBy: actor.userId,
    });
    invoice = await issueInvoice(tx, actor, booking.id);
    await logActivity(
      {
        propertyId: actor.propertyId,
        userId: actor.userId,
        entityType: 'booking',
        entityId: booking.id,
        action: 'cancellation_charge',
        summary: `Kept ${formatINR(keep)} as ${what} charge on ${booking.bookingNo} · invoice ${invoice.invoiceNo}`,
      },
      tx,
    );
  }
  return { refunded: refund, kept: keep, invoiceId: invoice?.id ?? null, invoiceNo: invoice?.invoiceNo ?? null };
}

/** Refund or keep the advance of a booking that is already cancelled or a no-show (Home lists the ones waiting). */
export async function settleUnstayedAdvance(actor: Actor, bookingId: string, decision: AdvanceDecision) {
  return db.transaction(async (tx) => {
    const outcome = await settleInTx(tx, actor, bookingId, decision);
    const [b] = await tx.select({ bookingNo: bookings.bookingNo }).from(bookings).where(eq(bookings.id, bookingId));
    return { bookingNo: b.bookingNo, ...outcome };
  });
}

/** Cancel or mark no-show and, in the same step, decide about the advance. Nothing changes if any part fails. */
export async function cancelWithAdvance(
  actor: Actor,
  bookingId: string,
  reason: string,
  opts: { status?: 'cancelled' | 'no_show' },
  decision: AdvanceDecision | null,
) {
  return db.transaction(async (tx) => {
    const cancelled = await cancelBookingInTx(tx, actor, bookingId, reason, opts);
    const money = decision ? await settleInTx(tx, actor, bookingId, decision) : null;
    return { ...cancelled, money };
  });
}

/** Advances still held on cancelled and no-show bookings: each one is either paid back or kept with an invoice. */
export async function heldAdvances(propertyId: string, limit = 30) {
  const rows = await db
    .select({
      id: bookings.id,
      bookingNo: bookings.bookingNo,
      status: bookings.status,
      name: guests.name,
      paid: bookings.paidAmount,
      posted: sql<number>`(SELECT COALESCE(sum(f.total), 0)::float FROM folio_lines f WHERE f.booking_id = ${bookings.id} AND f.type <> 'room' AND NOT f.is_void)`,
    })
    .from(bookings)
    .innerJoin(guests, eq(guests.id, bookings.guestId))
    .where(and(eq(bookings.propertyId, propertyId), inArray(bookings.status, [...UNSTAYED_STATUSES]), gt(bookings.paidAmount, 0.5)))
    .orderBy(desc(bookings.cancelledAt))
    .limit(200);
  return rows
    .map((r) => ({ ...r, held: round2(r.paid - r.posted) }))
    .filter((r) => r.held > 0.5)
    .slice(0, limit);
}
