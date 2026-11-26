import './helpers';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { db } from '@/db';
import { bookings, folioLines, invoices, payments } from '@/db/schema';
import { createBooking, restoreBooking } from '@/server/services/bookings';
import { cancelWithAdvance, heldAdvances, settleUnstayedAdvance } from '@/server/services/cancellation';
import { computeTotals } from '@/server/services/frontoffice';
import { creditReport } from '@/server/services/money';
import { available, freeStay, guest, porticoActor } from './helpers';

async function bookWithAdvance(n: number, offsetDays: number, advance: number) {
  const actor = await porticoActor();
  const stay = await freeStay(actor, 'SDB', offsetDays, 1);
  const booking = await createBooking(actor, {
    source: 'front_desk',
    guest: guest(n),
    checkIn: stay.checkIn,
    checkOut: stay.checkOut,
    rooms: [{ roomTypeId: stay.roomTypeId, ratePlanId: stay.ratePlanId, adults: 2, children: 0, extraBeds: 0 }],
    advance: { amount: advance, mode: 'cash' },
  });
  return { actor, stay, booking };
}

async function load(id: string) {
  const [booking] = await db.select().from(bookings).where(eq(bookings.id, id));
  const folio = await db.select().from(folioLines).where(eq(folioLines.bookingId, id));
  return { booking, folio, totals: computeTotals(booking, folio) };
}

/** Money paid on a stay that will not happen: refunded, kept as a charge with a GST invoice, or listed on Home. */
describe('advances on cancelled and no-show bookings', () => {
  it('a cancelled booking owes no room charges; its advance is held, listed on Home, and Undo still works', async () => {
    const { actor, booking } = await bookWithAdvance(1201, 201, 1500);
    await cancelWithAdvance(actor, booking.id, 'Plans changed', {}, null);
    const { totals } = await load(booking.id);
    expect(totals).toMatchObject({ room: 0, grandTotal: 0, paid: 1500, balance: -1500, held: 1500 });
    expect((await heldAdvances(actor.propertyId)).find((h) => h.id === booking.id)?.held).toBe(1500);

    // Undo puts the stay back with its advance; nothing is held any more.
    await restoreBooking(actor, booking.id);
    const after = await load(booking.id);
    expect(after.booking.status).toBe('confirmed');
    expect(after.totals.balance).toBe(booking.totalAmount - 1500);
    expect((await heldAdvances(actor.propertyId)).some((h) => h.id === booking.id)).toBe(false);
  });

  it('a no-show keeps part as a GST-inclusive charge with an invoice and refunds the rest in the same step', async () => {
    const { actor, stay, booking } = await bookWithAdvance(1202, 202, 2000);
    const free = await available(actor, stay.roomTypeId, stay.checkIn);
    const result = await cancelWithAdvance(actor, booking.id, 'Guest did not arrive', { status: 'no_show' }, { keep: 500, refund: 1500, mode: 'upi', reference: 'UPI-1' });
    expect(result.money).toMatchObject({ kept: 500, refunded: 1500 });
    expect(await available(actor, stay.roomTypeId, stay.checkIn)).toBe(free + 1);

    const { booking: b, folio, totals } = await load(booking.id);
    expect(b.status).toBe('no_show');
    expect(b.paidAmount).toBe(500);
    expect(totals).toMatchObject({ grandTotal: 500, balance: 0, held: 0 });
    // ₹500 kept at the room's 5% slab: ₹476.19 taxable + ₹23.81 GST, accommodation SAC.
    const [charge] = folio.filter((l) => l.type === 'cancellation');
    expect(charge).toMatchObject({ total: 500, amount: 476.19, taxRate: 5, hsnSac: '996311' });
    expect(charge.cgst + charge.sgst).toBeCloseTo(23.81, 2);
    expect(charge.description).toMatch(/^No-show charge · stay /);

    const refunds = await db.select().from(payments).where(eq(payments.bookingId, booking.id));
    expect(refunds.filter((p) => p.kind === 'refund').map((p) => [p.amount, p.mode, p.reference, p.status])).toEqual([[1500, 'upi', 'UPI-1', 'success']]);
    const [invoice] = await db.select().from(invoices).where(eq(invoices.bookingId, booking.id));
    expect(invoice).toMatchObject({ id: result.money?.invoiceId, status: 'issued', total: 500, paid: 500 });
    expect(invoice.lines).toHaveLength(1);

    // An invoiced charge cannot be undone by restoring; it is not money held or owed either.
    await expect(restoreBooking(actor, booking.id)).rejects.toThrow(/invoiced on this booking/);
    expect((await heldAdvances(actor.propertyId)).some((h) => h.id === booking.id)).toBe(false);
    const credit = await creditReport(actor.propertyId, actor.businessDate);
    expect(credit.groups.flatMap((g) => g.list).some((l) => l.id === booking.id)).toBe(false);
  });

  it('a charge above the advance is owed on the credit report; refunds beyond what is held are refused', async () => {
    const { actor, booking } = await bookWithAdvance(1203, 203, 1000);
    await cancelWithAdvance(actor, booking.id, 'Late cancellation', {}, null);
    await expect(settleUnstayedAdvance(actor, booking.id, { keep: 0, refund: 1200, mode: 'cash' })).rejects.toThrow('Only ₹1,000 can be refunded.');
    await expect(settleUnstayedAdvance(actor, booking.id, { keep: 0, refund: 0, mode: 'cash' })).rejects.toThrow('Enter an amount to refund or keep.');

    await settleUnstayedAdvance(actor, booking.id, { keep: 1500, refund: 0, mode: 'cash' });
    expect((await load(booking.id)).totals).toMatchObject({ grandTotal: 1500, paid: 1000, balance: 500, held: 0 });
    const credit = await creditReport(actor.propertyId, actor.businessDate);
    const row = credit.groups.find((g) => g.billTo === 'guest')?.list.find((l) => l.id === booking.id);
    expect(row).toMatchObject({ balance: 500, days: 0 });

    await expect(settleUnstayedAdvance(actor, booking.id, { keep: 100, refund: 0, mode: 'cash' })).rejects.toThrow('already has a cancellation charge');
    await expect(settleUnstayedAdvance(actor, booking.id, { keep: 0, refund: 1, mode: 'cash' })).rejects.toThrow('Nothing is left to refund.');
  });

  it('nothing changes when part of the step fails: the booking stays confirmed and keeps its rooms', async () => {
    const { actor, stay, booking } = await bookWithAdvance(1204, 204, 800);
    const free = await available(actor, stay.roomTypeId, stay.checkIn);
    await expect(cancelWithAdvance(actor, booking.id, 'Oops', {}, { keep: 0, refund: 900, mode: 'cash' })).rejects.toThrow('Only ₹800 can be refunded.');
    const { booking: b } = await load(booking.id);
    expect(b).toMatchObject({ status: 'confirmed', paidAmount: 800 });
    expect(await available(actor, stay.roomTypeId, stay.checkIn)).toBe(free);
    expect(await db.select().from(payments).where(eq(payments.bookingId, booking.id))).toHaveLength(1);
  });

  it('only cancelled or no-show bookings can keep or refund an advance this way', async () => {
    const { actor, booking } = await bookWithAdvance(1205, 205, 500);
    await expect(settleUnstayedAdvance(actor, booking.id, { keep: 0, refund: 500, mode: 'cash' })).rejects.toThrow('Only a cancelled or no-show booking');
  });
});
