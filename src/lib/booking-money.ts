import type { NightlyRate } from '@/db/schema/reservations';
import { taxableFromInclusive } from './gst';
import { round2 } from './utils';

/** Bookings whose stay never happened: the room value is not owed, only what was posted to the bill. */
export const UNSTAYED_STATUSES = ['cancelled', 'no_show'] as const;

export function isUnstayed(status: string): boolean {
  return (UNSTAYED_STATUSES as readonly string[]).includes(status);
}

/**
 * What is still owed on a booking. A cancelled or no-show stay owes only what was posted to its bill (a cancellation
 * charge, extras); a negative result is an advance the hotel still holds for the guest.
 */
export function bookingBalance(b: { status: string; totalAmount: number; extras: number; paidAmount: number }): number {
  return round2((isUnstayed(b.status) ? 0 : b.totalAmount) + b.extras - b.paidAmount);
}

/**
 * GST on a cancellation or no-show charge follows the room it was for (the charge is consideration for that
 * accommodation): the highest slab among the booked nights. Without nightly prices, the booking's own tax share.
 */
export function cancellationTaxRate(rooms: { nightly: NightlyRate[] }[], booking: { totalAmount: number; taxAmount: number }): number {
  const rates = rooms.flatMap((r) => r.nightly.map((n) => n.taxRate));
  if (rates.length > 0) return Math.max(...rates);
  const taxable = booking.totalAmount - booking.taxAmount;
  return taxable > 0 ? Math.round((booking.taxAmount / taxable) * 100) : 0;
}

/** A charge kept from the guest's money includes GST: ₹500 at 5% is ₹476.19 + ₹23.81. */
export function splitInclusiveCharge(total: number, rate: number): { taxable: number; tax: number } {
  const taxable = taxableFromInclusive(total, rate);
  return { taxable, tax: round2(total - taxable) };
}
