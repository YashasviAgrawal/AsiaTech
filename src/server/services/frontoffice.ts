import 'server-only';
import { and, asc, desc, eq, inArray, ne, sql } from 'drizzle-orm';
import { db, type DbOrTx, type Tx } from '@/db';
import {
  activityLog,
  bookingRooms,
  bookings,
  folioLines,
  guests,
  hkTasks,
  invoices,
  payments,
  posOrders,
  properties,
  rooms,
  roomTypes,
  users,
  type InvoiceLine,
  type NightlyRate,
  type PaymentMode,
} from '@/db/schema';
import { addDay, financialYear, formatDayShort, formatINR, nightsBetween, stayDates } from '@/lib/format';
import { SAC_ACCOMMODATION, SAC_RESTAURANT, splitTax } from '@/lib/gst';
import { maskIdNumber, round2 } from '@/lib/utils';
import { UserError } from '../errors';
import { logActivity, nextCounter } from '../audit';
import type { Actor } from './actor';
import { insertPayment, occupiedRoomIds } from './bookings';
import { releaseInventory, reserveInventory } from './inventory';

/* ───────────────────────────── read ───────────────────────────── */

export async function getBookingDetail(propertyId: string, bookingId: string) {
  const [row] = await db
    .select({ booking: bookings, guest: guests })
    .from(bookings)
    .innerJoin(guests, eq(guests.id, bookings.guestId))
    .where(and(eq(bookings.id, bookingId), eq(bookings.propertyId, propertyId)));
  if (!row) return null;

  const [roomRows, paymentRows, folio, invoiceRows, timeline, createdBy, stays] = await Promise.all([
    db
      .select({ br: bookingRooms, typeName: roomTypes.name, typeColor: roomTypes.color, roomNumber: rooms.number, roomHk: rooms.hkStatus })
      .from(bookingRooms)
      .innerJoin(roomTypes, eq(roomTypes.id, bookingRooms.roomTypeId))
      .leftJoin(rooms, eq(rooms.id, bookingRooms.roomId))
      .where(eq(bookingRooms.bookingId, bookingId))
      .orderBy(asc(bookingRooms.createdAt)),
    db.select().from(payments).where(eq(payments.bookingId, bookingId)).orderBy(asc(payments.createdAt)),
    db.select().from(folioLines).where(eq(folioLines.bookingId, bookingId)).orderBy(asc(folioLines.businessDate), asc(folioLines.createdAt)),
    db.select().from(invoices).where(eq(invoices.bookingId, bookingId)).orderBy(desc(invoices.createdAt)),
    db
      .select({ id: activityLog.id, action: activityLog.action, summary: activityLog.summary, createdAt: activityLog.createdAt, userName: users.name })
      .from(activityLog)
      .leftJoin(users, eq(users.id, activityLog.userId))
      .where(and(eq(activityLog.entityType, 'booking'), eq(activityLog.entityId, bookingId)))
      .orderBy(desc(activityLog.createdAt))
      .limit(30),
    row.booking.createdBy ? db.select({ name: users.name }).from(users).where(eq(users.id, row.booking.createdBy)) : Promise.resolve([]),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(bookings)
      .where(and(eq(bookings.guestId, row.guest.id), inArray(bookings.status, ['checked_out', 'checked_in']))),
  ]);

  const totals = computeTotals(row.booking, folio);
  return {
    booking: row.booking,
    guest: row.guest,
    guestStays: stays[0]?.n ?? 0,
    createdByName: createdBy[0]?.name ?? null,
    rooms: roomRows.map((r) => ({ ...r.br, typeName: r.typeName, typeColor: r.typeColor, roomNumber: r.roomNumber, roomHk: r.roomHk })),
    payments: paymentRows,
    folio,
    invoices: invoiceRows,
    timeline,
    totals,
  };
}

export type BookingDetail = NonNullable<Awaited<ReturnType<typeof getBookingDetail>>>;

/**
 * The bill: room charges (the booking value, incl. GST) + extras posted to the folio (restaurant, laundry,
 * discounts) − payments. Posted room lines are a per-night record of the same room charges, so they are not
 * added twice.
 */
export function computeTotals(booking: typeof bookings.$inferSelect, folio: (typeof folioLines.$inferSelect)[]) {
  const live = folio.filter((l) => !l.isVoid);
  const extras = round2(live.filter((l) => l.type !== 'room').reduce((t, l) => t + l.total, 0));
  const roomPosted = round2(live.filter((l) => l.type === 'room').reduce((t, l) => t + l.total, 0));
  const grandTotal = round2(booking.totalAmount + extras);
  const balance = round2(grandTotal - booking.paidAmount);
  return { room: booking.totalAmount, roomPosted, extras, grandTotal, paid: booking.paidAmount, balance };
}

/** Rooms that can be given to a booking room: same type first, free for the whole stay, clean ones on top. */
export async function roomOptions(propertyId: string, bookingRoomId: string) {
  const [br] = await db.select().from(bookingRooms).where(and(eq(bookingRooms.id, bookingRoomId), eq(bookingRooms.propertyId, propertyId)));
  if (!br) return [];
  const occupied = await occupiedRoomIds(db, propertyId, br.checkIn, br.checkOut, br.id);
  const all = await db
    .select({ id: rooms.id, number: rooms.number, floor: rooms.floor, hkStatus: rooms.hkStatus, roomTypeId: rooms.roomTypeId, typeName: roomTypes.name })
    .from(rooms)
    .innerJoin(roomTypes, eq(roomTypes.id, rooms.roomTypeId))
    .where(and(eq(rooms.propertyId, propertyId), eq(rooms.isActive, true), eq(rooms.roomTypeId, br.roomTypeId)))
    .orderBy(asc(rooms.sortOrder), asc(rooms.number));
  const rank = { inspected: 0, clean: 1, dirty: 2, out_of_order: 3 } as const;
  return all
    .map((r) => ({ ...r, free: !occupied.has(r.id) && r.hkStatus !== 'out_of_order', current: r.id === br.roomId }))
    .sort((a, b) => Number(b.free) - Number(a.free) || rank[a.hkStatus] - rank[b.hkStatus] || a.number.localeCompare(b.number, 'en', { numeric: true }));
}

/* ───────────────────────────── room assignment ───────────────────────────── */

async function assertRoomFree(tx: Tx, propertyId: string, br: typeof bookingRooms.$inferSelect, roomId: string) {
  const [room] = await tx.select().from(rooms).where(and(eq(rooms.id, roomId), eq(rooms.propertyId, propertyId))).for('update');
  if (!room || !room.isActive) throw new UserError('Room not found.');
  if (room.roomTypeId !== br.roomTypeId) throw new UserError(`Room ${room.number} is a different room type.`);
  if (room.hkStatus === 'out_of_order') throw new UserError(`Room ${room.number} is out of order.`);
  const occupied = await occupiedRoomIds(tx, propertyId, br.checkIn, br.checkOut, br.id);
  if (occupied.has(roomId)) throw new UserError(`Room ${room.number} is already taken for these dates.`);
  return room;
}

export async function assignRoom(actor: Actor, bookingRoomId: string, roomId: string | null) {
  return db.transaction(async (tx) => {
    const [br] = await tx.select().from(bookingRooms).where(and(eq(bookingRooms.id, bookingRoomId), eq(bookingRooms.propertyId, actor.propertyId))).for('update');
    if (!br) throw new UserError('Booking room not found.');
    if (!['reserved', 'in_house'].includes(br.status)) throw new UserError('This room is no longer active on the booking.');
    let number: string | null = null;
    if (roomId) number = (await assertRoomFree(tx, actor.propertyId, br, roomId)).number;
    const [before] = br.roomId ? await tx.select({ number: rooms.number }).from(rooms).where(eq(rooms.id, br.roomId)) : [];
    await tx.update(bookingRooms).set({ roomId }).where(eq(bookingRooms.id, bookingRoomId));
    if (br.status === 'in_house' && br.roomId && roomId && br.roomId !== roomId) {
      // Room move for an in-house guest: the old room needs cleaning.
      await tx.update(rooms).set({ hkStatus: 'dirty' }).where(eq(rooms.id, br.roomId));
    }
    const [b] = await tx.select({ bookingNo: bookings.bookingNo }).from(bookings).where(eq(bookings.id, br.bookingId));
    await logActivity(
      {
        propertyId: actor.propertyId,
        userId: actor.userId,
        entityType: 'booking',
        entityId: br.bookingId,
        action: 'assign_room',
        summary: roomId ? `${before ? `Moved from room ${before.number} to` : 'Assigned'} room ${number} on ${b.bookingNo}` : `Unassigned room on ${b.bookingNo}`,
      },
      tx,
    );
    return { number };
  });
}

/** Move or extend a stay from the Room Chart (drag a bar). Re-checks inventory for added nights. */
export async function moveStay(actor: Actor, input: { bookingRoomId: string; roomId: string; checkIn: string; checkOut: string }) {
  if (nightsBetween(input.checkIn, input.checkOut) <= 0) throw new UserError('Check-out must be after check-in.');
  return db.transaction(async (tx) => {
    const [br] = await tx.select().from(bookingRooms).where(and(eq(bookingRooms.id, input.bookingRoomId), eq(bookingRooms.propertyId, actor.propertyId))).for('update');
    if (!br) throw new UserError('Stay not found.');
    if (br.status === 'in_house' && input.checkIn !== br.checkIn) throw new UserError('The guest is already in house: only the check-out date or room can change.');
    if (!['reserved', 'in_house'].includes(br.status)) throw new UserError('This stay can no longer be changed.');
    const [booking] = await tx.select().from(bookings).where(eq(bookings.id, br.bookingId)).for('update');
    const otherRooms = await tx.select().from(bookingRooms).where(and(eq(bookingRooms.bookingId, br.bookingId), ne(bookingRooms.id, br.id)));
    if (otherRooms.some((o) => ['reserved', 'in_house'].includes(o.status)) && (input.checkIn !== br.checkIn || input.checkOut !== br.checkOut)) {
      throw new UserError('This booking has several rooms. Change dates from the booking page instead.');
    }
    const [room] = await tx.select().from(rooms).where(and(eq(rooms.id, input.roomId), eq(rooms.propertyId, actor.propertyId)));
    if (!room) throw new UserError('Room not found.');
    if (room.roomTypeId !== br.roomTypeId) throw new UserError(`Room ${room.number} is a different room type. Use "Change room type" on the booking.`);

    const datesChanged = input.checkIn !== br.checkIn || input.checkOut !== br.checkOut;
    if (datesChanged) {
      const oldNights = new Set(stayDates(br.checkIn, br.checkOut));
      const newNights = new Set(stayDates(input.checkIn, input.checkOut));
      const removed = [...oldNights].filter((d) => !newNights.has(d));
      const added = [...newNights].filter((d) => !oldNights.has(d));
      if (removed.length) await releaseInventory(tx, actor.propertyId, removed.map((d) => ({ roomTypeId: br.roomTypeId, checkIn: d, checkOut: addDay(d, 1), quantity: 1 })));
      if (added.length) {
        await reserveInventory(tx, actor.propertyId, added.map((d) => ({ roomTypeId: br.roomTypeId, checkIn: d, checkOut: addDay(d, 1), quantity: 1 })));
      }
      // Re-price: keep the nightly rate already agreed; new nights take the average agreed rate.
      const avg = br.nightly.length ? br.nightly.reduce((t, n) => t + n.amount, 0) / br.nightly.length : 0;
      const template = br.nightly[0];
      const nightly: NightlyRate[] = [...newNights].sort().map((date) => br.nightly.find((n) => n.date === date) ?? { date, rate: template?.rate ?? avg, extraBeds: template?.extraBeds ?? 0, amount: round2(avg), taxRate: template?.taxRate ?? 5 });
      const amount = round2(nightly.reduce((t, n) => t + n.amount, 0));
      const tax = round2(nightly.reduce((t, n) => t + splitTax(n.amount, n.taxRate).tax, 0));
      await tx.update(bookingRooms).set({ checkIn: input.checkIn, checkOut: input.checkOut, nightly, amount }).where(eq(bookingRooms.id, br.id));
      await tx
        .update(bookings)
        .set({ checkIn: input.checkIn, checkOut: input.checkOut, nights: newNights.size, roomAmount: round2(amount + booking.discountAmount), taxAmount: tax, totalAmount: round2(amount + tax) })
        .where(eq(bookings.id, br.bookingId));
    }
    // Room must be free for the (new) dates.
    const occupied = await occupiedRoomIds(tx, actor.propertyId, input.checkIn, input.checkOut, br.id);
    if (occupied.has(input.roomId)) throw new UserError(`Room ${room.number} is taken for some of these nights.`);
    await tx.update(bookingRooms).set({ roomId: input.roomId }).where(eq(bookingRooms.id, br.id));
    await logActivity(
      {
        propertyId: actor.propertyId,
        userId: actor.userId,
        entityType: 'booking',
        entityId: br.bookingId,
        action: 'move',
        summary: `Room Chart: ${booking.bookingNo} → room ${room.number}, ${formatDayShort(input.checkIn)} → ${formatDayShort(input.checkOut)}`,
        before: { roomId: br.roomId, checkIn: br.checkIn, checkOut: br.checkOut },
      },
      tx,
    );
    return { bookingNo: booking.bookingNo };
  });
}

/* ───────────────────────────── check-in ───────────────────────────── */

export interface CheckInInput {
  bookingId: string;
  assignments: { bookingRoomId: string; roomId: string }[];
  idType?: (typeof guests.$inferInsert)['idType'] | null;
  idNumber?: string | null;
  foreign?: {
    passportNumber: string;
    passportExpiry?: string | null;
    visaNumber?: string | null;
    visaType?: string | null;
    visaExpiry?: string | null;
    arrivedFrom?: string | null;
    nextDestination?: string | null;
    arrivalInIndia?: string | null;
    purposeOfVisit?: string | null;
    nationality: string;
  } | null;
  advance?: { amount: number; mode: PaymentMode; reference?: string | null } | null;
}

export async function checkIn(actor: Actor, input: CheckInInput) {
  return db.transaction(async (tx) => {
    const [booking] = await tx.select().from(bookings).where(and(eq(bookings.id, input.bookingId), eq(bookings.propertyId, actor.propertyId))).for('update');
    if (!booking) throw new UserError('Booking not found.');
    if (booking.status === 'hold') throw new UserError('Confirm the hold before checking in.');
    if (booking.status !== 'confirmed') throw new UserError(`This booking is ${booking.status.replace('_', ' ')}.`);
    if (booking.checkIn > actor.businessDate) throw new UserError(`Arrival is on ${formatDayShort(booking.checkIn)}. Change the dates to check in early.`);

    const brs = await tx.select().from(bookingRooms).where(and(eq(bookingRooms.bookingId, booking.id), eq(bookingRooms.status, 'reserved'))).for('update');
    for (const br of brs) {
      const roomId = input.assignments.find((a) => a.bookingRoomId === br.id)?.roomId ?? br.roomId;
      if (!roomId) throw new UserError('Assign a room to every guest room first.');
      const room = await assertRoomFree(tx, actor.propertyId, br, roomId);
      if (room.hkStatus === 'dirty') throw new UserError(`Room ${room.number} is still dirty. Pick a clean room or mark it clean first.`);
      await tx.update(bookingRooms).set({ roomId, status: 'in_house', checkedInAt: new Date() }).where(eq(bookingRooms.id, br.id));
    }

    const guestPatch: Partial<typeof guests.$inferInsert> = {};
    if (input.idType) guestPatch.idType = input.idType;
    if (input.idNumber) guestPatch.idNumberMasked = maskIdNumber(input.idNumber);
    if (input.foreign) {
      Object.assign(guestPatch, {
        isForeign: true,
        nationality: input.foreign.nationality,
        passportNumber: input.foreign.passportNumber,
        passportExpiry: input.foreign.passportExpiry || null,
        visaNumber: input.foreign.visaNumber || null,
        visaType: input.foreign.visaType || null,
        visaExpiry: input.foreign.visaExpiry || null,
        arrivedFrom: input.foreign.arrivedFrom || null,
        nextDestination: input.foreign.nextDestination || null,
        arrivalInIndia: input.foreign.arrivalInIndia || null,
        purposeOfVisit: input.foreign.purposeOfVisit || null,
        idType: 'passport',
      });
    }
    if (Object.keys(guestPatch).length) await tx.update(guests).set(guestPatch).where(eq(guests.id, booking.guestId));

    if (input.advance && input.advance.amount > 0) {
      await insertPayment(tx, actor, { bookingId: booking.id, guestId: booking.guestId, amount: input.advance.amount, mode: input.advance.mode, reference: input.advance.reference, kind: 'advance' });
    }
    await tx.update(bookings).set({ status: 'checked_in' }).where(eq(bookings.id, booking.id));
    const numbers = await tx
      .select({ number: rooms.number })
      .from(bookingRooms)
      .innerJoin(rooms, eq(rooms.id, bookingRooms.roomId))
      .where(eq(bookingRooms.bookingId, booking.id));
    await logActivity(
      {
        propertyId: actor.propertyId,
        userId: actor.userId,
        entityType: 'booking',
        entityId: booking.id,
        action: 'check_in',
        summary: `Checked in ${booking.bookingNo} · room ${numbers.map((n) => n.number).join(', ')}`,
      },
      tx,
    );
    return { bookingNo: booking.bookingNo, rooms: numbers.map((n) => n.number) };
  });
}

/* ───────────────────────────── folio ───────────────────────────── */

export async function postCharge(
  actor: Actor,
  input: { bookingId: string; type: 'extra' | 'discount' | 'adjustment'; description: string; amount: number; taxRate: number; quantity?: number },
) {
  return db.transaction(async (tx) => {
    const [booking] = await tx.select().from(bookings).where(and(eq(bookings.id, input.bookingId), eq(bookings.propertyId, actor.propertyId)));
    if (!booking) throw new UserError('Booking not found.');
    if (['checked_out', 'cancelled', 'no_show'].includes(booking.status)) throw new UserError('This booking is closed. Reopen it to change the bill.');
    const sign = input.type === 'discount' ? -1 : 1;
    const qty = input.quantity ?? 1;
    const taxable = round2(sign * Math.abs(input.amount) * qty);
    const split = splitTax(taxable, input.taxRate);
    const [line] = await tx
      .insert(folioLines)
      .values({
        propertyId: actor.propertyId,
        bookingId: booking.id,
        businessDate: actor.businessDate,
        type: input.type,
        description: input.description,
        quantity: qty,
        amount: split.taxable,
        taxRate: input.taxRate,
        cgst: split.cgst,
        sgst: split.sgst,
        total: split.total,
        hsnSac: input.type === 'extra' ? '999799' : null,
        postedBy: actor.userId,
      })
      .returning({ id: folioLines.id });
    await logActivity(
      {
        propertyId: actor.propertyId,
        userId: actor.userId,
        entityType: 'booking',
        entityId: booking.id,
        action: input.type === 'discount' ? 'discount' : 'charge',
        summary: `${input.type === 'discount' ? 'Discount' : 'Charge'} on ${booking.bookingNo}: ${input.description} ${formatINR(split.total)}`,
      },
      tx,
    );
    return { id: line.id };
  });
}

export async function voidFolioLine(actor: Actor, lineId: string, reason: string) {
  return db.transaction(async (tx) => {
    const [line] = await tx.select().from(folioLines).where(and(eq(folioLines.id, lineId), eq(folioLines.propertyId, actor.propertyId))).for('update');
    if (!line) throw new UserError('Line not found.');
    if (line.isVoid) throw new UserError('Already void.');
    if (line.type === 'room') throw new UserError('Room charges change with the booking dates, not here.');
    const [booking] = await tx.select().from(bookings).where(eq(bookings.id, line.bookingId));
    if (booking.status === 'checked_out') throw new UserError('This booking is closed.');
    await tx.update(folioLines).set({ isVoid: true, voidReason: reason }).where(eq(folioLines.id, lineId));
    if (line.posOrderId) await tx.update(posOrders).set({ status: 'billed', settlementMode: null }).where(eq(posOrders.id, line.posOrderId));
    await logActivity(
      { propertyId: actor.propertyId, userId: actor.userId, entityType: 'booking', entityId: line.bookingId, action: 'void', summary: `Voided "${line.description}" ${formatINR(line.total)} · ${reason}` },
      tx,
    );
  });
}

export async function recordPayment(actor: Actor, input: { bookingId: string; amount: number; mode: PaymentMode; reference?: string | null; refund?: boolean }) {
  return db.transaction(async (tx) => {
    const [booking] = await tx.select().from(bookings).where(and(eq(bookings.id, input.bookingId), eq(bookings.propertyId, actor.propertyId))).for('update');
    if (!booking) throw new UserError('Booking not found.');
    const id = await insertPayment(tx, actor, {
      bookingId: booking.id,
      guestId: booking.guestId,
      amount: input.amount,
      mode: input.mode,
      reference: input.reference,
      kind: input.refund ? 'refund' : booking.status === 'checked_in' || booking.status === 'checked_out' ? 'settlement' : 'advance',
    });
    await logActivity(
      {
        propertyId: actor.propertyId,
        userId: actor.userId,
        entityType: 'booking',
        entityId: booking.id,
        action: input.refund ? 'refund' : 'payment',
        summary: `${input.refund ? 'Refunded' : 'Received'} ${formatINR(input.amount)} by ${input.mode.replace('_', ' ')} on ${booking.bookingNo}`,
      },
      tx,
    );
    return { id };
  });
}

/** Post room charges for every night before `upTo` that has not been posted yet (Night Audit and check-out). */
export async function postRoomCharges(tx: DbOrTx, actor: Actor, bookingRoomId: string, upTo: string): Promise<number> {
  const [br] = await tx
    .select({ br: bookingRooms, typeName: roomTypes.name, roomNumber: rooms.number })
    .from(bookingRooms)
    .innerJoin(roomTypes, eq(roomTypes.id, bookingRooms.roomTypeId))
    .leftJoin(rooms, eq(rooms.id, bookingRooms.roomId))
    .where(eq(bookingRooms.id, bookingRoomId));
  if (!br) return 0;
  const posted = await tx
    .select({ date: folioLines.businessDate })
    .from(folioLines)
    .where(and(eq(folioLines.bookingRoomId, bookingRoomId), eq(folioLines.type, 'room'), eq(folioLines.isVoid, false)));
  const done = new Set(posted.map((p) => p.date));
  const toPost = br.br.nightly.filter((n) => n.date < upTo && !done.has(n.date));
  for (const night of toPost) {
    const split = splitTax(night.amount, night.taxRate);
    await tx.insert(folioLines).values({
      propertyId: actor.propertyId,
      bookingId: br.br.bookingId,
      bookingRoomId,
      businessDate: night.date,
      type: 'room',
      description: `Room ${br.roomNumber ?? ''} · ${br.typeName}`.replace('Room  · ', ''),
      amount: split.taxable,
      taxRate: night.taxRate,
      cgst: split.cgst,
      sgst: split.sgst,
      total: split.total,
      hsnSac: SAC_ACCOMMODATION,
      postedBy: actor.userId,
    });
  }
  return toPost.length;
}

/* ───────────────────────────── check-out + invoice ───────────────────────────── */

export async function checkOut(
  actor: Actor,
  input: { bookingId: string; settle?: { amount: number; mode: PaymentMode; reference?: string | null } | null; allowCredit?: boolean },
) {
  return db.transaction(async (tx) => {
    const [booking] = await tx.select().from(bookings).where(and(eq(bookings.id, input.bookingId), eq(bookings.propertyId, actor.propertyId))).for('update');
    if (!booking) throw new UserError('Booking not found.');
    if (booking.status !== 'checked_in') throw new UserError('Only in-house guests can be checked out.');
    const brs = await tx.select().from(bookingRooms).where(and(eq(bookingRooms.bookingId, booking.id), eq(bookingRooms.status, 'in_house'))).for('update');

    // Early departure: shorten the stay, give unused nights back to inventory and re-total the booking.
    const departure = actor.businessDate < booking.checkOut ? (actor.businessDate > booking.checkIn ? actor.businessDate : addDay(booking.checkIn, 1)) : booking.checkOut;
    if (departure < booking.checkOut) {
      let amount = 0;
      let tax = 0;
      for (const br of brs) {
        const kept = br.nightly.filter((n) => n.date < departure);
        await releaseInventory(tx, actor.propertyId, [{ roomTypeId: br.roomTypeId, checkIn: departure, checkOut: br.checkOut, quantity: 1 }]);
        const brAmount = round2(kept.reduce((t, n) => t + n.amount, 0));
        await tx.update(bookingRooms).set({ checkOut: departure, nightly: kept, amount: brAmount }).where(eq(bookingRooms.id, br.id));
        br.nightly = kept;
        amount += brAmount;
        tax += kept.reduce((t, n) => t + splitTax(n.amount, n.taxRate).tax, 0);
      }
      await tx
        .update(bookings)
        .set({ checkOut: departure, nights: nightsBetween(booking.checkIn, departure), taxAmount: round2(tax), totalAmount: round2(amount + tax), roomAmount: round2(amount + booking.discountAmount) })
        .where(eq(bookings.id, booking.id));
      booking.totalAmount = round2(amount + tax);
      booking.checkOut = departure;
    }

    for (const br of brs) await postRoomCharges(tx, actor, br.id, departure);

    if (input.settle && input.settle.amount > 0) {
      await insertPayment(tx, actor, { bookingId: booking.id, guestId: booking.guestId, amount: input.settle.amount, mode: input.settle.mode, reference: input.settle.reference, kind: 'settlement' });
      booking.paidAmount = round2(booking.paidAmount + input.settle.amount);
    }

    const folio = await tx.select().from(folioLines).where(eq(folioLines.bookingId, booking.id));
    const totals = computeTotals(booking, folio);
    if (totals.balance > 0.5 && !input.allowCredit) {
      throw new UserError(`Balance of ${formatINR(totals.balance)} is still due. Collect it or allow credit (bill to company).`);
    }

    const now = new Date();
    for (const br of brs) {
      await tx.update(bookingRooms).set({ status: 'departed', checkedOutAt: now }).where(eq(bookingRooms.id, br.id));
      if (br.roomId) {
        await tx.update(rooms).set({ hkStatus: 'dirty' }).where(eq(rooms.id, br.roomId));
        await tx.insert(hkTasks).values({ propertyId: actor.propertyId, roomId: br.roomId, type: 'checkout_clean', status: 'pending', priority: 'high', dueDate: actor.businessDate });
      }
    }
    await tx.update(bookings).set({ status: 'checked_out' }).where(eq(bookings.id, booking.id));
    const invoice = await issueInvoice(tx, actor, booking.id);
    await logActivity(
      {
        propertyId: actor.propertyId,
        userId: actor.userId,
        entityType: 'booking',
        entityId: booking.id,
        action: 'check_out',
        summary: `Checked out ${booking.bookingNo} · invoice ${invoice.invoiceNo} · ${formatINR(invoice.total)}${totals.balance > 0.5 ? ` · ${formatINR(totals.balance)} on credit` : ''}`,
      },
      tx,
    );
    return { bookingNo: booking.bookingNo, invoiceId: invoice.id, invoiceNo: invoice.invoiceNo, balance: totals.balance };
  });
}

/** GST invoice from the folio. Numbered per financial year: SRP/26-27/0001 (16 characters or fewer). */
export async function issueInvoice(tx: Tx, actor: Actor, bookingId: string) {
  const [existing] = await tx.select().from(invoices).where(and(eq(invoices.bookingId, bookingId), eq(invoices.status, 'issued')));
  if (existing) return existing;
  const [booking] = await tx.select().from(bookings).where(eq(bookings.id, bookingId));
  const [guest] = await tx.select().from(guests).where(eq(guests.id, booking.guestId));
  const [property] = await tx.select().from(properties).where(eq(properties.id, actor.propertyId));
  const folio = await tx
    .select({ line: folioLines, typeName: roomTypes.name })
    .from(folioLines)
    .leftJoin(bookingRooms, eq(bookingRooms.id, folioLines.bookingRoomId))
    .leftJoin(roomTypes, eq(roomTypes.id, bookingRooms.roomTypeId))
    .where(and(eq(folioLines.bookingId, bookingId), eq(folioLines.isVoid, false)));

  const groups = new Map<string, InvoiceLine>();
  for (const { line, typeName } of folio) {
    const key =
      line.type === 'room' ? `room|${typeName}|${line.taxRate}|${line.amount}` : line.type === 'pos' ? `pos|${line.taxRate}` : `${line.type}|${line.id}`;
    const description =
      line.type === 'room' ? `${typeName ?? 'Room'} · room charge` : line.type === 'pos' ? 'Restaurant & room service' : line.description;
    const g = groups.get(key) ?? { description, hsnSac: line.hsnSac ?? (line.type === 'pos' ? SAC_RESTAURANT : SAC_ACCOMMODATION), quantity: 0, amount: 0, taxRate: line.taxRate, cgst: 0, sgst: 0, igst: 0, total: 0 };
    g.quantity += line.type === 'room' ? 1 : line.quantity;
    g.amount = round2(g.amount + line.amount);
    g.cgst = round2(g.cgst + line.cgst);
    g.sgst = round2(g.sgst + line.sgst);
    g.igst = round2(g.igst + line.igst);
    g.total = round2(g.total + line.total);
    groups.set(key, g);
  }
  const rank = (l: InvoiceLine) => (l.hsnSac === SAC_ACCOMMODATION && l.description.endsWith('room charge') ? 0 : l.hsnSac === SAC_RESTAURANT ? 1 : l.amount < 0 ? 3 : 2);
  const lines = [...groups.values()]
    .sort((a, b) => rank(a) - rank(b))
    .map((l) => (l.description.endsWith('room charge') ? { ...l, description: `${l.description} × ${l.quantity} night${l.quantity === 1 ? '' : 's'}` } : l));
  const subtotal = round2(lines.reduce((t, l) => t + l.amount, 0));
  const cgst = round2(lines.reduce((t, l) => t + l.cgst, 0));
  const sgst = round2(lines.reduce((t, l) => t + l.sgst, 0));
  const igst = round2(lines.reduce((t, l) => t + l.igst, 0));
  const total = round2(subtotal + cgst + sgst + igst);
  const fy = financialYear(actor.businessDate);
  const serial = await nextCounter(tx, actor.propertyId, `invoice:${fy}`);
  const invoiceNo = `${property.settings.invoice.prefix || property.shortCode}/${fy.slice(2)}/${String(serial).padStart(4, '0')}`;
  const buyerGstin = guest.companyGstin || null;
  const [invoice] = await tx
    .insert(invoices)
    .values({
      propertyId: actor.propertyId,
      bookingId,
      invoiceNo,
      financialYear: fy,
      invoiceDate: actor.businessDate,
      buyerName: booking.billTo === 'company' && booking.billToName ? booking.billToName : guest.company && buyerGstin ? guest.company : guest.name,
      buyerGstin,
      buyerAddress: [guest.addressLine, guest.city, guest.state].filter(Boolean).join(', ') || null,
      placeOfSupply: property.state ? `${property.stateCode} - ${property.state}` : null,
      lines,
      subtotal,
      cgst,
      sgst,
      igst,
      total,
      paid: booking.paidAmount,
      createdBy: actor.userId,
    })
    .returning();
  return invoice;
}

export async function markFormC(actor: Actor, bookingId: string, reference: string) {
  await db
    .update(bookings)
    .set({ formCSubmittedAt: new Date(), formCRef: reference })
    .where(and(eq(bookings.id, bookingId), eq(bookings.propertyId, actor.propertyId)));
  await logActivity({ propertyId: actor.propertyId, userId: actor.userId, entityType: 'booking', entityId: bookingId, action: 'form_c', summary: `Form-C submitted to FRRO · ref ${reference}` });
}

/** Today Check (In-Out): arrivals, in-house and departures for the business date. */
export async function getTodayBoard(propertyId: string, bizDate: string) {
  const rows = await db
    .select({
      bookingId: bookings.id,
      bookingNo: bookings.bookingNo,
      status: bookings.status,
      source: bookings.source,
      channel: bookings.channel,
      checkIn: bookings.checkIn,
      checkOut: bookings.checkOut,
      arrivalTime: bookings.arrivalTime,
      totalAmount: bookings.totalAmount,
      paidAmount: bookings.paidAmount,
      guestName: guests.name,
      mobile: guests.mobile,
      isVip: guests.isVip,
      isForeign: guests.isForeign,
      formCSubmittedAt: bookings.formCSubmittedAt,
      brId: bookingRooms.id,
      brStatus: bookingRooms.status,
      checkedInAt: bookingRooms.checkedInAt,
      adults: bookingRooms.adults,
      children: bookingRooms.children,
      typeName: roomTypes.name,
      typeColor: roomTypes.color,
      roomNumber: rooms.number,
      roomHk: rooms.hkStatus,
      extras: sql<number>`(SELECT COALESCE(sum(f.total), 0)::float FROM folio_lines f WHERE f.booking_id = "bookings"."id" AND f.type <> 'room' AND NOT f.is_void)`,
    })
    .from(bookingRooms)
    .innerJoin(bookings, eq(bookings.id, bookingRooms.bookingId))
    .innerJoin(guests, eq(guests.id, bookings.guestId))
    .innerJoin(roomTypes, eq(roomTypes.id, bookingRooms.roomTypeId))
    .leftJoin(rooms, eq(rooms.id, bookingRooms.roomId))
    .where(
      and(
        eq(bookingRooms.propertyId, propertyId),
        sql`(
          (${bookingRooms.checkIn} <= ${bizDate} AND ${bookingRooms.status} = 'reserved' AND ${bookings.status} = 'confirmed')
          OR ${bookingRooms.status} = 'in_house'
          OR (${bookingRooms.checkIn} = ${bizDate} AND ${bookingRooms.status} = 'in_house')
          OR (${bookingRooms.checkOut} = ${bizDate} AND ${bookingRooms.status} = 'departed')
        )`,
      ),
    )
    .orderBy(asc(guests.name));
  const withBalance = rows.map((r) => ({ ...r, balance: round2(r.totalAmount + r.extras - r.paidAmount) }));
  return {
    arrivals: withBalance.filter((r) => r.brStatus === 'reserved' || (r.brStatus === 'in_house' && r.checkIn === bizDate)),
    inHouse: withBalance.filter((r) => r.brStatus === 'in_house'),
    departures: withBalance.filter((r) => (r.brStatus === 'in_house' && r.checkOut <= bizDate) || r.brStatus === 'departed'),
  };
}
