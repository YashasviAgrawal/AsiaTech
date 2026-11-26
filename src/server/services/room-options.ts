import 'server-only';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { ratePlans, roomTypes } from '@/db/schema';

/** Room types with their sellable rate plans, for the booking forms. */
export interface RoomTypeOption {
  id: string;
  name: string;
  code: string;
  color: string;
  maxAdults: number;
  maxChildren: number;
  maxExtraBeds: number;
  baseOccupancy: number;
  plans: { id: string; name: string; mealPlan: string; price2: number; isDefault: boolean }[];
}

export async function getRoomTypeOptions(propertyId: string): Promise<RoomTypeOption[]> {
  const [types, plans] = await Promise.all([
    db.select().from(roomTypes).where(and(eq(roomTypes.propertyId, propertyId), eq(roomTypes.isActive, true))).orderBy(asc(roomTypes.sortOrder)),
    db.select().from(ratePlans).where(and(eq(ratePlans.propertyId, propertyId), eq(ratePlans.isActive, true))).orderBy(asc(ratePlans.sortOrder)),
  ]);
  return types.map((t) => ({
    id: t.id,
    name: t.name,
    code: t.code,
    color: t.color,
    maxAdults: t.maxAdults,
    maxChildren: t.maxChildren,
    maxExtraBeds: t.maxExtraBeds,
    baseOccupancy: t.baseOccupancy,
    plans: plans.filter((p) => p.roomTypeId === t.id).map((p) => ({ id: p.id, name: p.name, mealPlan: p.mealPlan, price2: p.price2, isDefault: p.isDefault })),
  }));
}
