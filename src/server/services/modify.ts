import 'server-only';
import { and, asc, eq, gte, inArray, lte } from 'drizzle-orm';
import { db, type DbOrTx } from '@/db';
import { bookingRooms, bookings, inventory, roomTypes } from '@/db/schema';
import { formatDayShort, formatINR, nightsBetween, stayDates } from '@/lib/format';
import { round2 } from '@/lib/utils';
import { UserError } from '../errors';
import { logActivity } from '../audit';
import type { Actor } from './actor';
import { ensureInventory, releaseInventory, reserveInventory } from './inventory';
import { quoteStay, type Discount, type Quote } from './pricing';
import { occupiedRoomIds } from './bookings';

export interface ModifyRoomInput {
  /** Existing booking room id; empty for a room being added. */
  id?: string | null;
  roomTypeId: string;
  ratePlanId: string;
  adults: number;
  children: number;
  extraBeds: number;
}

export interface ModifyInput {
  bookingId: string;
  checkIn: string;
  checkOut: string;
  rooms: ModifyRoomInput[];
  discount?: Discount | null;
  /**
   * 'keep': rooms that keep their type and plan keep the price agreed for nights they already had; only new nights
   * and changed rooms take today's rates. 'current': re-price everything at today's rates.
   */
  pricing: 'keep' | 'current';
}

type BookingRow = typeof bookings.$inferSelect;
type BookingRoomRow = typeof bookingRooms.$inferSelect;

async function loadForModify(tx: DbOrTx, actor: Actor, bookingId: string, lock: boolean) {
  const query = tx.select().from(bookings).where(and(eq(bookings.id, bookingId), eq(bookings.propertyId, actor.propertyId)));
  const [booking] = lock ? await query.for('update') : await query;
  if (!booking) throw new UserError('Booking not found.');
  if (!['hold', 'confirmed', 'checked_in'].includes(booking.status)) {
    throw new UserError(`A ${booking.status.replace('_', ' ')} booking cannot be changed.`);
  }
  const rows = await tx.select().from(bookingRooms).where(eq(bookingRooms.bookingId, bookingId)).orderBy(asc(bookingRooms.createdAt));
  return { booking, active: rows.filter((r) => r.status === 'reserved' || r.status === 'in_house') };
}

function validate(booking: BookingRow, active: BookingRoomRow[], input: ModifyInput, businessDate: string) {
  if (nightsBetween(input.checkIn, input.checkOut) <= 0) throw new UserError('Check-out must be after check-in.');
  if (nightsBetween(input.checkIn, input.checkOut) > 90) throw new UserError('A stay can be at most 90 nights.');
  if (input.rooms.length === 0) throw new UserError('Keep at least one room. To drop the whole stay, cancel the booking.');
  if (input.rooms.length > 20) throw new UserError('At most 20 rooms per booking.');
  for (const r of input.rooms) {
    if (r.id && !active.some((a) => a.id === r.id)) throw new UserError('One of the rooms is no longer on this booking. Reload and try again.');
    if (r.adults < 1) throw new UserError('Every room needs at least 1 adult.');
  }
  if (booking.status === 'checked_in') {
    // In house: the stay has started, so only the departure, plan and occupancy can change.
    if (input.checkIn !== booking.checkIn) throw new UserError('The guest is in house, so the arrival date cannot change.');
    if (input.checkOut <= businessDate) throw new UserError(`Check-out must be after ${formatDayShort(businessDate)}, today's business date.`);
    if (input.rooms.length !== active.length || input.rooms.some((r) => !r.id)) {
      throw new UserError('Rooms cannot be added or removed while the guest is in house. Make a new booking for an extra room.');
    }
    for (const r of input.rooms) {
      const before = active.find((a) => a.id === r.id)!;
      if (before.roomTypeId !== r.roomTypeId) throw new UserError('To upgrade an in-house guest, move them to the new room from the Room Chart.');
    }
  } else if (input.checkIn < businessDate) {
    throw new UserError(`Check-in cannot be before ${formatDayShort(businessDate)}, today's business date.`);
  }
}

function priceInput(active: BookingRoomRow[], input: ModifyInput) {
  return {
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    discount: input.discount ?? null,
    rooms: input.rooms.map((r) => {
      const before = r.id ? active.find((a) => a.id === r.id) : null;
      // OTA rooms without a mapped plan (ratePlanId null) still keep the price the OTA sold them at.
      const keep = input.pricing === 'keep' && before && before.roomTypeId === r.roomTypeId && (before.ratePlanId === r.ratePlanId || before.ratePlanId === null);
      return {
        roomTypeId: r.roomTypeId,
        ratePlanId: r.ratePlanId,
        adults: r.adults,
        children: r.children,
        extraBeds: r.extraBeds,
        nightlyOverride: keep ? Object.fromEntries(before.nightly.map((n) => [n.date, n.rate])) : null,
      };
    }),
  };
}

/** Availability for the new shape, counting this booking's own nights as free (they are released first). */
async function availabilityProblems(tx: DbOrTx, actor: Actor, active: BookingRoomRow[], input: ModifyInput) {
  const nights = stayDates(input.checkIn, input.checkOut);
  const typeIds = [...new Set(input.rooms.map((r) => r.roomTypeId))];
  await ensureInventory(tx, actor.propertyId, nights[0], nights[nights.length - 1]);
  const rows = await tx
    .select({ roomTypeId: inventory.roomTypeId, date: inventory.date, total: inventory.total, booked: inventory.booked, blocked: inventory.blocked, name: roomTypes.name })
    .from(inventory)
    .innerJoin(roomTypes, eq(roomTypes.id, inventory.roomTypeId))
    .where(and(eq(inventory.propertyId, actor.propertyId), inArray(inventory.roomTypeId, typeIds), gte(inventory.date, nights[0]), lte(inventory.date, nights[nights.length - 1])));
  const problems: string[] = [];
  for (const typeId of typeIds) {
    const need = input.rooms.filter((r) => r.roomTypeId === typeId).length;
    for (const date of nights) {
      const row = rows.find((r) => r.roomTypeId === typeId && r.date === date);
      if (!row) continue;
      const own = active.filter((a) => a.roomTypeId === typeId && a.checkIn <= date && a.checkOut > date).length;
      const available = row.total - row.booked - row.blocked + own;
      if (available < need) {
        problems.push(available <= 0 ? `${row.name} is sold out on ${formatDayShort(date)}.` : `Only ${available} ${row.name} left on ${formatDayShort(date)}.`);
        break;
      }
    }
  }
  return problems;
}

function describeChanges(booking: BookingRow, active: BookingRoomRow[], input: ModifyInput, quote: Quote) {
  const parts: string[] = [];
  if (input.checkIn !== booking.checkIn || input.checkOut !== booking.checkOut) {
    parts.push(`${formatDayShort(booking.checkIn)}–${formatDayShort(booking.checkOut)} → ${formatDayShort(input.checkIn)}–${formatDayShort(input.checkOut)}`);
  }
  if (input.rooms.length !== active.length) parts.push(`${active.length} → ${input.rooms.length} room(s)`);
  const typeChanged = input.rooms.some((r) => {
    const before = r.id ? active.find((a) => a.id === r.id) : null;
    return before && (before.roomTypeId !== r.roomTypeId || before.ratePlanId !== r.ratePlanId);
  });
  if (typeChanged) parts.push('room type / plan changed');
  parts.push(`${formatINR(booking.totalAmount)} → ${formatINR(quote.totalAmount)}`);
  return parts;
}

export interface ModificationPreview {
  quote: Quote;
  problems: string[];
  before: number;
  after: number;
  difference: number;
  paid: number;
  changes: string[];
}

export async function previewModification(actor: Actor, input: ModifyInput): Promise<ModificationPreview> {
  const { booking, active } = await loadForModify(db, actor, input.bookingId, false);
  validate(booking, active, input, actor.businessDate);
  const [quote, problems] = await Promise.all([
    quoteStay(db, actor.propertyId, actor.settings, priceInput(active, input)),
    availabilityProblems(db, actor, active, input),
  ]);
  return {
    quote,
    problems,
    before: booking.totalAmount,
    after: quote.totalAmount,
    difference: round2(quote.totalAmount - booking.totalAmount),
    paid: booking.paidAmount,
    changes: describeChanges(booking, active, input, quote),
  };
}

/**
 * Apply the change in ONE transaction: release the booking's current nights, reserve the new nights under row
 * locks (any sold-out night rolls the whole change back), re-price and rewrite the booking rooms.
 */
export async function modifyBooking(actor: Actor, input: ModifyInput & { allowOverbook?: boolean }) {
  return db.transaction(async (tx) => {
    const { booking, active } = await loadForModify(tx, actor, input.bookingId, true);
    validate(booking, active, input, actor.businessDate);
    const quote = await quoteStay(tx, actor.propertyId, actor.settings, priceInput(active, input));

    await releaseInventory(tx, actor.propertyId, active.map((r) => ({ roomTypeId: r.roomTypeId, checkIn: r.checkIn, checkOut: r.checkOut, quantity: 1 })));
    await reserveInventory(
      tx,
      actor.propertyId,
      input.rooms.map((r) => ({ roomTypeId: r.roomTypeId, checkIn: input.checkIn, checkOut: input.checkOut, quantity: 1 })),
      { allowOverbook: input.allowOverbook },
    );

    const unassigned: string[] = [];
    for (const [index, room] of input.rooms.entries()) {
      const q = quote.rooms[index];
      const before = room.id ? active.find((a) => a.id === room.id) : null;
      let roomId = before?.roomId ?? null;
      if (roomId && before && (before.roomTypeId !== room.roomTypeId || before.checkIn !== input.checkIn || before.checkOut !== input.checkOut)) {
        // Keep the assigned room only if it is the same type and still free for the new dates.
        const taken = await occupiedRoomIds(tx, actor.propertyId, input.checkIn, input.checkOut, before.id);
        if (before.roomTypeId !== room.roomTypeId || taken.has(roomId)) {
          if (before.status === 'in_house') throw new UserError(`The guest's room is taken by another booking on the new dates. Move them from the Room Chart first.`);
          roomId = null;
          unassigned.push(`${q.roomTypeName} (room ${index + 1})`);
        }
      }
      const values = {
        roomTypeId: room.roomTypeId,
        ratePlanId: room.ratePlanId,
        mealPlan: q.mealPlan,
        roomId,
        checkIn: input.checkIn,
        checkOut: input.checkOut,
        adults: room.adults,
        children: room.children,
        extraBeds: room.extraBeds,
        nightly: q.nightly,
        amount: q.amount,
      };
      if (before) await tx.update(bookingRooms).set(values).where(eq(bookingRooms.id, before.id));
      else await tx.insert(bookingRooms).values({ ...values, propertyId: actor.propertyId, bookingId: booking.id, status: 'reserved' });
    }
    const removed = active.filter((a) => !input.rooms.some((r) => r.id === a.id));
    if (removed.length) {
      await tx.update(bookingRooms).set({ status: 'cancelled', roomId: null }).where(inArray(bookingRooms.id, removed.map((r) => r.id)));
    }

    await tx
      .update(bookings)
      .set({
        checkIn: input.checkIn,
        checkOut: input.checkOut,
        nights: quote.nights,
        adults: input.rooms.reduce((t, r) => t + r.adults, 0),
        children: input.rooms.reduce((t, r) => t + r.children, 0),
        roomAmount: quote.roomAmount,
        discountAmount: quote.discountAmount,
        taxAmount: quote.taxAmount,
        totalAmount: quote.totalAmount,
        updatedAt: new Date(),
      })
      .where(eq(bookings.id, booking.id));

    const changes = describeChanges(booking, active, input, quote);
    await logActivity(
      {
        propertyId: actor.propertyId,
        userId: actor.userId,
        entityType: 'booking',
        entityId: booking.id,
        action: 'modify',
        summary: `Changed ${booking.bookingNo}: ${changes.join(' · ')}`,
        before: {
          checkIn: booking.checkIn,
          checkOut: booking.checkOut,
          totalAmount: booking.totalAmount,
          rooms: active.map((a) => ({ id: a.id, roomTypeId: a.roomTypeId, ratePlanId: a.ratePlanId, adults: a.adults, children: a.children, extraBeds: a.extraBeds })),
        },
        after: { checkIn: input.checkIn, checkOut: input.checkOut, totalAmount: quote.totalAmount, rooms: input.rooms.length },
      },
      tx,
    );
    return { bookingNo: booking.bookingNo, totalAmount: quote.totalAmount, difference: round2(quote.totalAmount - booking.totalAmount), unassigned };
  });
}
