import 'server-only';
import { and, eq, gte, inArray, lt } from 'drizzle-orm';
import { db, type DbOrTx } from '@/db';
import { ratePlans, rates, roomTypes, type NightlyRate, type PropertySettings } from '@/db/schema';
import { roomTaxRate, splitTax, taxableFromInclusive } from '@/lib/gst';
import { stayDates } from '@/lib/format';
import { round2 } from '@/lib/utils';
import { UserError } from '../errors';

export interface QuoteRoomInput {
  roomTypeId: string;
  ratePlanId: string;
  adults: number;
  children: number;
  extraBeds: number;
  /** Front desk can override the nightly price (e.g. a negotiated corporate rate). */
  rateOverride?: number | null;
}

export interface QuotedRoom extends QuoteRoomInput {
  roomTypeName: string;
  ratePlanName: string;
  mealPlan: 'EP' | 'CP' | 'MAP' | 'AP';
  nightly: NightlyRate[];
  /** Taxable value after discount. */
  amount: number;
  tax: number;
  total: number;
}

export interface Quote {
  checkIn: string;
  checkOut: string;
  nights: number;
  rooms: QuotedRoom[];
  /** Room charges before discount (taxable). */
  roomAmount: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
  /** Tax broken down by rate: { 5: 1234.5, 18: 0 } */
  taxByRate: Record<string, number>;
  /** Rate restrictions this stay breaks (min stay, stop-sell, closed to arrival). */
  restrictions: Restriction[];
}

export interface Restriction {
  ratePlanId: string;
  kind: 'min_stay' | 'stop_sell' | 'closed_to_arrival';
  message: string;
}

export interface Discount {
  type: 'percent' | 'flat';
  value: number;
}

/**
 * Price a stay: per-night rates (date row or rack rate), occupancy, extra beds, booking discount, and the
 * GST slab per room per night (5% ≤ ₹7,500, 18% above, from property settings).
 */
export async function quoteStay(
  tx: DbOrTx,
  propertyId: string,
  settings: PropertySettings,
  input: { checkIn: string; checkOut: string; rooms: QuoteRoomInput[]; discount?: Discount | null },
): Promise<Quote> {
  const dates = stayDates(input.checkIn, input.checkOut);
  if (dates.length === 0) throw new UserError('Check-out must be after check-in.');
  if (input.rooms.length === 0) throw new UserError('Add at least one room.');

  const planIds = [...new Set(input.rooms.map((r) => r.ratePlanId))];
  const plans = await tx
    .select({
      id: ratePlans.id,
      name: ratePlans.name,
      mealPlan: ratePlans.mealPlan,
      roomTypeId: ratePlans.roomTypeId,
      price1: ratePlans.price1,
      price2: ratePlans.price2,
      price3: ratePlans.price3,
      extraBed: ratePlans.extraBed,
      childPrice: ratePlans.childPrice,
      roomTypeName: roomTypes.name,
    })
    .from(ratePlans)
    .innerJoin(roomTypes, eq(roomTypes.id, ratePlans.roomTypeId))
    .where(and(eq(ratePlans.propertyId, propertyId), inArray(ratePlans.id, planIds)));
  const planMap = new Map(plans.map((p) => [p.id, p]));

  const dateRows = await tx
    .select()
    .from(rates)
    .where(and(eq(rates.propertyId, propertyId), inArray(rates.ratePlanId, planIds), gte(rates.date, dates[0]), lt(rates.date, input.checkOut)));
  const rateMap = new Map(dateRows.map((r) => [`${r.ratePlanId}|${r.date}`, r]));

  // 1) Gross nightly prices.
  // Restrictions are checked per rate plan: min stay and closed-to-arrival on the arrival date, stop-sell on any night.
  const restrictions: Restriction[] = [];
  for (const planId of planIds) {
    const plan = planMap.get(planId);
    if (!plan) continue;
    const label = `${plan.roomTypeName} · ${plan.name}`;
    const arrival = rateMap.get(`${planId}|${dates[0]}`);
    if (arrival && arrival.minStay > dates.length) {
      restrictions.push({ ratePlanId: planId, kind: 'min_stay', message: `${label} needs at least ${arrival.minStay} nights from this date.` });
    }
    if (arrival?.closedToArrival) restrictions.push({ ratePlanId: planId, kind: 'closed_to_arrival', message: `${label} is closed to arrival on this date.` });
    const stopped = dates.find((d) => rateMap.get(`${planId}|${d}`)?.stopSell);
    if (stopped) restrictions.push({ ratePlanId: planId, kind: 'stop_sell', message: `${label} is on stop-sell on ${stopped}.` });
  }

  const gross = input.rooms.map((room) => {
    const plan = planMap.get(room.ratePlanId);
    if (!plan || plan.roomTypeId !== room.roomTypeId) throw new UserError('Please choose a valid rate plan for this room type.');
    const nights = dates.map((date) => {
      const day = rateMap.get(`${plan.id}|${date}`);
      const p1 = day?.price1 ?? plan.price1;
      const p2 = day?.price2 ?? plan.price2;
      const p3 = day?.price3 ?? plan.price3;
      const extraBedRate = day?.extraBed ?? plan.extraBed;
      const base = room.rateOverride ?? (room.adults <= 1 ? p1 : room.adults === 2 ? p2 : p3);
      const amount = round2(base + room.extraBeds * extraBedRate + room.children * plan.childPrice);
      return { date, rate: base, extraBeds: room.extraBeds, amount };
    });
    return { room, plan, nights };
  });

  const roomAmountGross = round2(gross.reduce((t, g) => t + g.nights.reduce((s, n) => s + n.amount, 0), 0));
  const discountAmount = !input.discount || input.discount.value <= 0
    ? 0
    : round2(Math.min(roomAmountGross, input.discount.type === 'percent' ? (roomAmountGross * input.discount.value) / 100 : input.discount.value));
  const discountFactor = roomAmountGross > 0 ? (roomAmountGross - discountAmount) / roomAmountGross : 1;

  // 2) Apply the discount proportionally, then pick the GST slab on what the guest actually pays per night.
  const taxByRate: Record<string, number> = {};
  const quoted: QuotedRoom[] = gross.map(({ room, plan, nights }) => {
    let amount = 0;
    let tax = 0;
    const nightly: NightlyRate[] = nights.map((night) => {
      const net = round2(night.amount * discountFactor);
      let taxable = net;
      let rate = roomTaxRate(net, settings.tax.roomSlabs);
      if (settings.tax.ratesIncludeTax) {
        taxable = taxableFromInclusive(net, rate);
        rate = roomTaxRate(taxable, settings.tax.roomSlabs);
        taxable = taxableFromInclusive(net, rate);
      }
      const split = splitTax(taxable, rate);
      amount += split.taxable;
      tax += split.tax;
      taxByRate[rate] = round2((taxByRate[rate] ?? 0) + split.tax);
      return { date: night.date, rate: night.rate, extraBeds: night.extraBeds, amount: split.taxable, taxRate: rate };
    });
    return {
      ...room,
      roomTypeName: plan.roomTypeName,
      ratePlanName: plan.name,
      mealPlan: plan.mealPlan,
      nightly,
      amount: round2(amount),
      tax: round2(tax),
      total: round2(amount + tax),
    };
  });

  const taxAmount = round2(quoted.reduce((t, r) => t + r.tax, 0));
  const netAmount = round2(quoted.reduce((t, r) => t + r.amount, 0));
  return {
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    nights: dates.length,
    rooms: quoted,
    roomAmount: settings.tax.ratesIncludeTax ? round2(netAmount + discountAmount) : roomAmountGross,
    discountAmount,
    taxAmount,
    totalAmount: round2(netAmount + taxAmount),
    taxByRate,
    restrictions,
  };
}

export async function quote(propertyId: string, settings: PropertySettings, input: Parameters<typeof quoteStay>[3]) {
  return quoteStay(db, propertyId, settings, input);
}
