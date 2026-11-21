import { describe, expect, it } from 'vitest';
import { cancelBooking, createBooking } from '@/server/services/bookings';
import { modifyBooking } from '@/server/services/modify';
import { ensureInventory } from '@/server/services/inventory';
import { db } from '@/db';
import { available, freeStay, guest, inventoryMismatches, porticoActor } from './helpers';

describe('inventory (no double-selling)', () => {
  it('sells the last rooms exactly once under concurrent requests', async () => {
    const actor = await porticoActor();
    const stay = await freeStay(actor, 'DDB', 120);
    await db.transaction((tx) => ensureInventory(tx, actor.propertyId, stay.checkIn, stay.checkIn));
    const free = await available(actor, stay.roomTypeId, stay.checkIn);
    expect(free).toBeGreaterThan(0);

    const attempts = free + 4;
    const results = await Promise.allSettled(
      Array.from({ length: attempts }, (_, i) =>
        createBooking(actor, { source: 'front_desk', guest: guest(i), checkIn: stay.checkIn, checkOut: stay.checkOut, rooms: [{ roomTypeId: stay.roomTypeId, ratePlanId: stay.ratePlanId, adults: 2, children: 0, extraBeds: 0 }] }),
      ),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(free);
    expect(await available(actor, stay.roomTypeId, stay.checkIn)).toBe(0);
    expect(await inventoryMismatches(actor)).toEqual([]);
  });

  it('changing a booking moves its nights and keeps inventory consistent; cancelling releases them', async () => {
    const actor = await porticoActor();
    const stay = await freeStay(actor, 'SDB', 140, 2);
    const other = await freeStay(actor, 'SFB', 140, 3);
    const booking = await createBooking(actor, { source: 'front_desk', guest: guest(901), checkIn: stay.checkIn, checkOut: stay.checkOut, rooms: [{ roomTypeId: stay.roomTypeId, ratePlanId: stay.ratePlanId, adults: 2, children: 0, extraBeds: 0 }] });
    const sdbBefore = await available(actor, stay.roomTypeId, stay.checkIn);
    const sfbBefore = await available(actor, other.roomTypeId, other.checkIn);

    const [room] = await db.query.bookingRooms.findMany({ where: (br, { eq }) => eq(br.bookingId, booking.id) });
    const result = await modifyBooking(actor, {
      bookingId: booking.id,
      checkIn: stay.checkIn,
      checkOut: other.checkOut,
      pricing: 'keep',
      rooms: [
        { id: room.id, roomTypeId: stay.roomTypeId, ratePlanId: stay.ratePlanId, adults: 2, children: 0, extraBeds: 0 },
        { roomTypeId: other.roomTypeId, ratePlanId: other.ratePlanId, adults: 2, children: 1, extraBeds: 0 },
      ],
    });
    expect(result.totalAmount).toBeGreaterThan(booking.totalAmount);
    expect(await available(actor, stay.roomTypeId, stay.checkIn)).toBe(sdbBefore);
    expect(await available(actor, other.roomTypeId, other.checkIn)).toBe(sfbBefore - 1);
    expect(await inventoryMismatches(actor)).toEqual([]);

    await cancelBooking(actor, booking.id, 'Integration test');
    expect(await available(actor, stay.roomTypeId, stay.checkIn)).toBe(sdbBefore + 1);
    expect(await available(actor, other.roomTypeId, other.checkIn)).toBe(sfbBefore);
    expect(await inventoryMismatches(actor)).toEqual([]);
  });

  it('refuses a change that needs a sold-out room and leaves everything as it was', async () => {
    const actor = await porticoActor();
    const stay = await freeStay(actor, 'SDB', 160);
    const ddb = await freeStay(actor, 'DDB', 160);
    await db.transaction((tx) => ensureInventory(tx, actor.propertyId, ddb.checkIn, ddb.checkIn));
    // Fill every Deluxe Double that night.
    for (let i = 0, free = await available(actor, ddb.roomTypeId, ddb.checkIn); i < free; i++) {
      await createBooking(actor, { source: 'front_desk', guest: guest(950 + i), checkIn: ddb.checkIn, checkOut: ddb.checkOut, rooms: [{ roomTypeId: ddb.roomTypeId, ratePlanId: ddb.ratePlanId, adults: 2, children: 0, extraBeds: 0 }] });
    }
    const booking = await createBooking(actor, { source: 'front_desk', guest: guest(990), checkIn: stay.checkIn, checkOut: stay.checkOut, rooms: [{ roomTypeId: stay.roomTypeId, ratePlanId: stay.ratePlanId, adults: 2, children: 0, extraBeds: 0 }] });
    const [room] = await db.query.bookingRooms.findMany({ where: (br, { eq }) => eq(br.bookingId, booking.id) });
    const sdbBefore = await available(actor, stay.roomTypeId, stay.checkIn);

    await expect(
      modifyBooking(actor, { bookingId: booking.id, checkIn: stay.checkIn, checkOut: stay.checkOut, pricing: 'current', rooms: [{ id: room.id, roomTypeId: ddb.roomTypeId, ratePlanId: ddb.ratePlanId, adults: 2, children: 0, extraBeds: 0 }] }),
    ).rejects.toThrow();
    expect(await available(actor, stay.roomTypeId, stay.checkIn)).toBe(sdbBefore);
    expect(await inventoryMismatches(actor)).toEqual([]);
  });
});
