import 'server-only';
import { and, asc, eq, gte, inArray, lte } from 'drizzle-orm';
import { db } from '@/db';
import { ratePlans, rates, roomTypes } from '@/db/schema';
import { addDay, dateRange } from '@/lib/format';

export interface RateCell {
  date: string;
  price1: number;
  price2: number;
  price3: number;
  extraBed: number;
  minStay: number;
  stopSell: boolean;
  /** True when a per-date row exists (otherwise the rack rate applies). */
  custom: boolean;
}

export interface RateRow {
  roomType: { id: string; name: string; color: string };
  plan: { id: string; name: string; mealPlan: string; price1: number; price2: number; price3: number; extraBed: number };
  cells: RateCell[];
}

/** Rate Management grid: room type → rate plan → per-date prices and restrictions. */
export async function getRateGrid(propertyId: string, start: string, days: number): Promise<RateRow[]> {
  const end = addDay(start, days - 1);
  const plans = await db
    .select({
      id: ratePlans.id,
      name: ratePlans.name,
      mealPlan: ratePlans.mealPlan,
      price1: ratePlans.price1,
      price2: ratePlans.price2,
      price3: ratePlans.price3,
      extraBed: ratePlans.extraBed,
      roomTypeId: roomTypes.id,
      roomTypeName: roomTypes.name,
      color: roomTypes.color,
    })
    .from(ratePlans)
    .innerJoin(roomTypes, eq(roomTypes.id, ratePlans.roomTypeId))
    .where(and(eq(ratePlans.propertyId, propertyId), eq(ratePlans.isActive, true), eq(roomTypes.isActive, true)))
    .orderBy(asc(roomTypes.sortOrder), asc(ratePlans.sortOrder));
  if (plans.length === 0) return [];
  const rows = await db
    .select()
    .from(rates)
    .where(and(eq(rates.propertyId, propertyId), inArray(rates.ratePlanId, plans.map((p) => p.id)), gte(rates.date, start), lte(rates.date, end)));
  const map = new Map(rows.map((r) => [`${r.ratePlanId}|${r.date}`, r]));
  const dates = dateRange(start, days);
  return plans.map((plan) => ({
    roomType: { id: plan.roomTypeId, name: plan.roomTypeName, color: plan.color },
    plan: { id: plan.id, name: plan.name, mealPlan: plan.mealPlan, price1: plan.price1, price2: plan.price2, price3: plan.price3, extraBed: plan.extraBed },
    cells: dates.map((date) => {
      const row = map.get(`${plan.id}|${date}`);
      return row
        ? { date, price1: row.price1, price2: row.price2, price3: row.price3, extraBed: row.extraBed, minStay: row.minStay, stopSell: row.stopSell, custom: true }
        : { date, price1: plan.price1, price2: plan.price2, price3: plan.price3, extraBed: plan.extraBed, minStay: 1, stopSell: false, custom: false };
    }),
  }));
}
