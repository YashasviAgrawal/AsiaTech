import 'server-only';
import { and, asc, eq, inArray, lte, sql } from 'drizzle-orm';
import { db, type Tx } from '@/db';
import { bookingRooms, bookings, guests, payments, type BookingSource, type PaymentMode } from '@/db/schema';
import { formatINR, nightsBetween, sourceLabel } from '@/lib/format';
import { round2 } from '@/lib/utils';
import { UserError } from '../errors';
import { logActivity, nextCounter, notify } from '../audit';
import type { Actor } from './actor';
import { findOrCreateGuest, type GuestInput } from './guests';
import { releaseInventory, reserveInventory, type ReserveLine } from './inventory';
import { quoteStay, type Discount, type QuoteRoomInput } from './pricing';

export const BOOKING_PREFIX: Record<BookingSource, string> = {
  front_desk: 'FDR',
  walk_in: 'FDR',
  phone: 'FDR',
  agent: 'FDR',
  corporate: 'FDR',
  ota: 'OTA',
  web: 'WEB',
};

export interface CreateBookingInput {
  source: BookingSource;
  channel?: string | null;
  otaRef?: string | null;
  status?: 'confirmed' | 'hold';
  holdUntil?: Date | null;
  guest: GuestInput;
  checkIn: string;
  checkOut: string;
  rooms: (QuoteRoomInput & { roomId?: string | null })[];
  discount?: Discount | null;
  advance?: { amount: number; mode: PaymentMode; reference?: string | null } | null;
  billTo?: 'guest' | 'company' | 'agent' | 'ota';
  billToName?: string | null;
  arrivalTime?: string | null;
  specialRequests?: string | null;
  internalNotes?: string | null;
  /** Manager override: allow selling beyond availability. */
  allowOverbook?: boolean;
  /** For OTA bookings, a pre-agreed total can be imported as-is instead of re-priced. */
  importedTotal?: number | null;
}

/**
 * Create a booking in ONE transaction (PLAN.md §4, rule "no double-selling"):
 * guest → price → lock + reserve inventory → booking number → booking + rooms → advance → log.
 */
export async function createBooking(actor: Actor, input: CreateBookingInput): Promise<{ id: string; bookingNo: string; totalAmount: number }> {
  const nights = nightsBetween(input.checkIn, input.checkOut);
  if (nights <= 0) throw new UserError('Check-out must be after check-in.');
  if (nights > 60) throw new UserError('Stays longer than 60 nights need a manager.');
  if (input.status === 'hold' && !input.holdUntil) throw new UserError('Choose how long to hold the rooms.');

  return db.transaction(async (tx) => {
    const guestId = await findOrCreateGuest(tx, actor.propertyId, input.guest);
    const quote = await quoteStay(tx, actor.propertyId, actor.settings, {
      checkIn: input.checkIn,
      checkOut: input.checkOut,
      rooms: input.rooms,
      discount: input.discount,
    });

    const reserveLines: ReserveLine[] = input.rooms.map((r) => ({ roomTypeId: r.roomTypeId, checkIn: input.checkIn, checkOut: input.checkOut, quantity: 1 }));
    await reserveInventory(tx, actor.propertyId, reserveLines, {
      allowOverbook: input.allowOverbook,
      respectStopSell: input.source === 'web',
    });

    const prefix = BOOKING_PREFIX[input.source];
    const serial = await nextCounter(tx, actor.propertyId, `booking:${prefix}`, 100001);
    const bookingNo = `${prefix}${serial}`;
    const status = input.status ?? 'confirmed';

    let totalAmount = quote.totalAmount;
    let taxAmount = quote.taxAmount;
    let roomAmount = quote.roomAmount;
    // OTA bookings arrive with a total the guest already agreed to; keep it and scale nightly lines to match.
    if (input.importedTotal && input.importedTotal > 0) {
      const factor = input.importedTotal / quote.totalAmount;
      totalAmount = round2(input.importedTotal);
      taxAmount = round2(quote.taxAmount * factor);
      roomAmount = round2(totalAmount - taxAmount + quote.discountAmount);
      for (const room of quote.rooms) {
        room.nightly = room.nightly.map((n) => ({ ...n, amount: round2(n.amount * factor) }));
        room.amount = round2(room.amount * factor);
      }
    }

    const [booking] = await tx
      .insert(bookings)
      .values({
        propertyId: actor.propertyId,
        bookingNo,
        source: input.source,
        channel: input.channel ?? null,
        otaRef: input.otaRef ?? null,
        status,
        holdUntil: status === 'hold' ? input.holdUntil ?? null : null,
        guestId,
        checkIn: input.checkIn,
        checkOut: input.checkOut,
        nights,
        adults: input.rooms.reduce((t, r) => t + r.adults, 0),
        children: input.rooms.reduce((t, r) => t + r.children, 0),
        roomAmount,
        discountAmount: quote.discountAmount,
        taxAmount,
        totalAmount,
        billTo: input.billTo ?? (input.source === 'ota' ? 'ota' : 'guest'),
        billToName: input.billToName ?? (input.source === 'ota' ? sourceLabel('ota', input.channel) : null),
        arrivalTime: input.arrivalTime ?? null,
        specialRequests: input.specialRequests ?? null,
        internalNotes: input.internalNotes ?? null,
        createdBy: actor.userId,
        confirmedAt: status === 'confirmed' ? new Date() : null,
      })
      .returning({ id: bookings.id });

    await tx.insert(bookingRooms).values(
      quote.rooms.map((room, index) => ({
        propertyId: actor.propertyId,
        bookingId: booking.id,
        roomTypeId: room.roomTypeId,
        ratePlanId: room.ratePlanId,
        mealPlan: room.mealPlan,
        roomId: input.rooms[index]?.roomId ?? null,
        checkIn: input.checkIn,
        checkOut: input.checkOut,
        adults: room.adults,
        children: room.children,
        extraBeds: room.extraBeds,
        nightly: room.nightly,
        amount: room.amount,
      })),
    );

    if (input.advance && input.advance.amount > 0) {
      await insertPayment(tx, actor, {
        bookingId: booking.id,
        guestId,
        amount: input.advance.amount,
        mode: input.advance.mode,
        reference: input.advance.reference ?? null,
        kind: 'advance',
      });
    }

    const [guest] = await tx.select({ name: guests.name }).from(guests).where(eq(guests.id, guestId));
    await logActivity(
      {
        propertyId: actor.propertyId,
        userId: actor.userId,
        entityType: 'booking',
        entityId: booking.id,
        action: status === 'hold' ? 'hold' : 'create',
        summary: `${status === 'hold' ? 'Held' : 'Created'} ${bookingNo} for ${guest.name} · ${nights} night${nights > 1 ? 's' : ''} · ${formatINR(totalAmount)}`,
        after: { bookingNo, checkIn: input.checkIn, checkOut: input.checkOut, totalAmount, discount: quote.discountAmount },
      },
      tx,
    );

    if (input.source === 'ota' || input.source === 'web') {
      await notify(tx, {
        propertyId: actor.propertyId,
        type: 'booking_new',
        title: `New ${sourceLabel(input.source, input.channel)} booking ${bookingNo}`,
        body: `${guest.name} · ${input.checkIn} → ${input.checkOut} · ${formatINR(totalAmount)}`,
        href: `/front-desk/bookings/${booking.id}`,
      });
    }

    return { id: booking.id, bookingNo, totalAmount };
  });
}

export async function insertPayment(
  tx: Tx,
  actor: Actor,
  input: {
    bookingId: string | null;
    guestId?: string | null;
    amount: number;
    mode: PaymentMode;
    reference?: string | null;
    kind: 'advance' | 'settlement' | 'refund';
    purpose?: string | null;
  },
) {
  const amount = round2(input.amount);
  if (amount <= 0) throw new UserError('Enter an amount greater than zero.');
  const [row] = await tx
    .insert(payments)
    .values({
      propertyId: actor.propertyId,
      bookingId: input.bookingId,
      guestId: input.guestId ?? null,
      mode: input.mode,
      kind: input.kind,
      amount,
      reference: input.reference ?? null,
      purpose: input.purpose ?? null,
      status: 'success',
      businessDate: actor.businessDate,
      paidAt: new Date(),
      receivedBy: actor.userId,
    })
    .returning({ id: payments.id });
  if (input.bookingId) {
    const delta = input.kind === 'refund' ? -amount : amount;
    await tx
      .update(bookings)
      .set({ paidAmount: sql`${bookings.paidAmount} + ${delta}` })
      .where(eq(bookings.id, input.bookingId));
  }
  return row.id;
}

async function loadBookingForUpdate(tx: Tx, actor: Actor, bookingId: string) {
  const [booking] = await tx
    .select()
    .from(bookings)
    .where(and(eq(bookings.id, bookingId), eq(bookings.propertyId, actor.propertyId)))
    .for('update');
  if (!booking) throw new UserError('Booking not found.');
  const roomsRows = await tx.select().from(bookingRooms).where(eq(bookingRooms.bookingId, bookingId));
  return { booking, rooms: roomsRows };
}

function activeReserveLines(rooms: (typeof bookingRooms.$inferSelect)[]): ReserveLine[] {
  return rooms
    .filter((r) => r.status === 'reserved' || r.status === 'in_house')
    .map((r) => ({ roomTypeId: r.roomTypeId, checkIn: r.checkIn, checkOut: r.checkOut, quantity: 1 }));
}

/** Cancel (or release a hold). Rooms go back to inventory immediately; the log keeps a snapshot for Undo. */
export async function cancelBooking(actor: Actor, bookingId: string, reason: string, opts: { status?: 'cancelled' | 'no_show' } = {}) {
  return db.transaction(async (tx) => {
    const { booking, rooms } = await loadBookingForUpdate(tx, actor, bookingId);
    if (!['confirmed', 'hold'].includes(booking.status)) {
      throw new UserError(`A ${booking.status.replace('_', ' ')} booking cannot be ${opts.status === 'no_show' ? 'marked no-show' : 'cancelled'}.`);
    }
    const status = opts.status ?? 'cancelled';
    await releaseInventory(tx, actor.propertyId, activeReserveLines(rooms));
    await tx
      .update(bookings)
      .set({ status, cancelledAt: new Date(), cancelReason: reason || null, holdUntil: null })
      .where(eq(bookings.id, bookingId));
    await tx
      .update(bookingRooms)
      .set({ status: status === 'no_show' ? 'no_show' : 'cancelled', roomId: null })
      .where(eq(bookingRooms.bookingId, bookingId));
    const logId = await logActivity(
      {
        propertyId: actor.propertyId,
        userId: actor.userId,
        entityType: 'booking',
        entityId: bookingId,
        action: status === 'no_show' ? 'no_show' : booking.status === 'hold' ? 'release' : 'cancel',
        summary: `${status === 'no_show' ? 'Marked no-show' : booking.status === 'hold' ? 'Released hold' : 'Cancelled'} ${booking.bookingNo}${reason ? ` · ${reason}` : ''}`,
        before: { status: booking.status, holdUntil: booking.holdUntil, rooms: rooms.map((r) => ({ id: r.id, roomId: r.roomId, status: r.status })) },
      },
      tx,
    );
    return { logId, bookingNo: booking.bookingNo };
  });
}

/** Undo a cancellation: re-reserve the same rooms if they are still free. */
export async function restoreBooking(actor: Actor, bookingId: string) {
  return db.transaction(async (tx) => {
    const { booking, rooms } = await loadBookingForUpdate(tx, actor, bookingId);
    if (!['cancelled', 'no_show'].includes(booking.status)) throw new UserError('This booking is not cancelled.');
    if (booking.checkOut <= actor.businessDate) throw new UserError('This stay is already in the past.');
    await reserveInventory(
      tx,
      actor.propertyId,
      rooms.map((r) => ({ roomTypeId: r.roomTypeId, checkIn: r.checkIn, checkOut: r.checkOut, quantity: 1 })),
    );
    await tx.update(bookings).set({ status: 'confirmed', cancelledAt: null, cancelReason: null }).where(eq(bookings.id, bookingId));
    await tx.update(bookingRooms).set({ status: 'reserved' }).where(eq(bookingRooms.bookingId, bookingId));
    await logActivity(
      { propertyId: actor.propertyId, userId: actor.userId, entityType: 'booking', entityId: bookingId, action: 'restore', summary: `Restored ${booking.bookingNo}` },
      tx,
    );
    return { bookingNo: booking.bookingNo };
  });
}

export async function confirmHold(actor: Actor, bookingId: string) {
  return db.transaction(async (tx) => {
    const { booking } = await loadBookingForUpdate(tx, actor, bookingId);
    if (booking.status !== 'hold') throw new UserError('Only held bookings can be confirmed.');
    await tx.update(bookings).set({ status: 'confirmed', holdUntil: null, confirmedAt: new Date() }).where(eq(bookings.id, bookingId));
    await logActivity(
      { propertyId: actor.propertyId, userId: actor.userId, entityType: 'booking', entityId: bookingId, action: 'confirm', summary: `Confirmed hold ${booking.bookingNo}` },
      tx,
    );
    return { bookingNo: booking.bookingNo };
  });
}

export async function extendHold(actor: Actor, bookingId: string, until: Date) {
  if (until.getTime() <= Date.now()) throw new UserError('Choose a time in the future.');
  return db.transaction(async (tx) => {
    const { booking } = await loadBookingForUpdate(tx, actor, bookingId);
    if (booking.status !== 'hold') throw new UserError('Only held bookings can be extended.');
    await tx.update(bookings).set({ holdUntil: until }).where(eq(bookings.id, bookingId));
    await logActivity(
      {
        propertyId: actor.propertyId,
        userId: actor.userId,
        entityType: 'booking',
        entityId: bookingId,
        action: 'extend_hold',
        summary: `Extended hold ${booking.bookingNo}`,
        before: { holdUntil: booking.holdUntil },
        after: { holdUntil: until },
      },
      tx,
    );
    return { bookingNo: booking.bookingNo };
  });
}

/** Holds release themselves when their time is up. Called by the worker and lazily when screens load. */
export async function releaseExpiredHolds(actor: Actor): Promise<number> {
  const expired = await db
    .select({ id: bookings.id })
    .from(bookings)
    .where(and(eq(bookings.propertyId, actor.propertyId), eq(bookings.status, 'hold'), lte(bookings.holdUntil, new Date())))
    .orderBy(asc(bookings.holdUntil));
  for (const row of expired) {
    try {
      await cancelBooking({ ...actor, userId: null }, row.id, 'Hold expired');
    } catch {
      /* already handled by a concurrent run */
    }
  }
  return expired.length;
}

/** Room ids (physical rooms) occupied by other stays overlapping [checkIn, checkOut). */
export async function occupiedRoomIds(tx: Tx | typeof db, propertyId: string, checkIn: string, checkOut: string, excludeBookingRoomId?: string) {
  const rows = await tx
    .select({ roomId: bookingRooms.roomId, id: bookingRooms.id })
    .from(bookingRooms)
    .where(
      and(
        eq(bookingRooms.propertyId, propertyId),
        inArray(bookingRooms.status, ['reserved', 'in_house']),
        sql`${bookingRooms.roomId} IS NOT NULL`,
        sql`${bookingRooms.checkIn} < ${checkOut}`,
        sql`${bookingRooms.checkOut} > ${checkIn}`,
      ),
    );
  return new Set(rows.filter((r) => r.id !== excludeBookingRoomId).map((r) => r.roomId!));
}
