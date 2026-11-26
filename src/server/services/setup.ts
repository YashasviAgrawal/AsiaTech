import 'server-only';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { channels, ratePlans, rooms, roomTypes } from '@/db/schema';
import type { AppContext } from '../context';

export type SetupStepKey = 'hotel' | 'rooms' | 'rates' | 'ota';

export interface SetupStep {
  key: SetupStepKey;
  title: string;
  done: boolean;
  detail: string;
  href: string;
}

/** Guided setup (rule 9): hotel → rooms → rates → OTA → go live. Shared by the Setup Wizard and the Home card. */
export async function getSetupProgress(ctx: AppContext) {
  const pid = ctx.propertyId;
  const [[types], [roomCount], [plans], [connected]] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(roomTypes).where(eq(roomTypes.propertyId, pid)),
    db.select({ n: sql<number>`count(*)::int` }).from(rooms).where(and(eq(rooms.propertyId, pid), eq(rooms.isActive, true))),
    db.select({ n: sql<number>`count(*)::int` }).from(ratePlans).where(and(eq(ratePlans.propertyId, pid), eq(ratePlans.isActive, true))),
    db.select({ n: sql<number>`count(*)::int` }).from(channels).where(and(eq(channels.propertyId, pid), eq(channels.status, 'connected'))),
  ]);
  const p = ctx.property;
  const steps: SetupStep[] = [
    { key: 'hotel', title: 'Hotel details', done: Boolean(p.gstin && p.city && p.stateCode), detail: p.gstin ? `GSTIN ${p.gstin} · ${p.city}` : 'Name, GSTIN, address, check-in time', href: '/settings/hotel' },
    { key: 'rooms', title: 'Rooms', done: types.n > 0 && roomCount.n > 0, detail: types.n ? `${types.n} room types · ${roomCount.n} rooms` : 'Room types and room numbers', href: '/rooms/setup' },
    { key: 'rates', title: 'Rates', done: plans.n > 0, detail: plans.n ? `${plans.n} rate plans (EP / CP / MAP / AP)` : 'Prices and meal plans', href: '/rooms/setup' },
    { key: 'ota', title: 'OTA connection', done: connected.n > 0, detail: connected.n ? `${connected.n} channel(s) connected` : 'MakeMyTrip, Goibibo, Booking.com…', href: '/channels' },
  ];
  const live = p.status === 'live';
  const ready = steps.every((s) => s.done);
  const doneCount = steps.filter((s) => s.done).length + (live ? 1 : 0);
  return { steps, live, ready, doneCount, total: 5, next: steps.find((s) => !s.done) ?? null };
}
