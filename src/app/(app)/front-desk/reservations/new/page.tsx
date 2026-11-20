import type { Metadata } from 'next';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { ratePlans, roomTypes } from '@/db/schema';
import { requireContext } from '@/server/context';
import { getStayAvailability } from '@/server/services/inventory';
import { addDay } from '@/lib/format';
import { PageHeader } from '@/components/ui/card';
import { ReservationForm, type RoomTypeOption } from './reservation-form';

export const metadata: Metadata = { title: 'Make A Reservation' };

export default async function NewReservationPage({
  searchParams,
}: {
  searchParams: Promise<{ guest?: string; walkin?: string; checkIn?: string; checkOut?: string; roomTypeId?: string; roomId?: string; hold?: string }>;
}) {
  const ctx = await requireContext('bookings.create');
  const params = await searchParams;
  const today = ctx.property.businessDate;
  const checkIn = params.checkIn && params.checkIn >= today ? params.checkIn : today;
  const checkOut = params.checkOut && params.checkOut > checkIn ? params.checkOut : addDay(checkIn, 1);

  const [types, plans, availability] = await Promise.all([
    db
      .select()
      .from(roomTypes)
      .where(and(eq(roomTypes.propertyId, ctx.propertyId), eq(roomTypes.isActive, true)))
      .orderBy(asc(roomTypes.sortOrder)),
    db
      .select()
      .from(ratePlans)
      .where(and(eq(ratePlans.propertyId, ctx.propertyId), eq(ratePlans.isActive, true)))
      .orderBy(asc(ratePlans.sortOrder)),
    getStayAvailability(ctx.propertyId, checkIn, checkOut),
  ]);

  const options: RoomTypeOption[] = types.map((t) => ({
    id: t.id,
    name: t.name,
    code: t.code,
    color: t.color,
    maxAdults: t.maxAdults,
    maxChildren: t.maxChildren,
    maxExtraBeds: t.maxExtraBeds,
    baseOccupancy: t.baseOccupancy,
    plans: plans
      .filter((p) => p.roomTypeId === t.id)
      .map((p) => ({ id: p.id, name: p.name, mealPlan: p.mealPlan, price2: p.price2, isDefault: p.isDefault })),
  }));

  const walkIn = params.walkin === '1';
  return (
    <div>
      <PageHeader
        eyebrow="Front Desk"
        title={walkIn ? 'Walk-in guest' : params.hold === '1' ? 'Hold Booking' : 'Make A Reservation'}
        description="One page: dates, rooms, guest, payment. The price and GST update as you go."
      />
      <ReservationForm
        roomTypes={options}
        initialAvailability={Object.fromEntries(availability)}
        defaults={{
          checkIn,
          checkOut,
          source: walkIn ? 'walk_in' : 'front_desk',
          guestName: params.guest ?? '',
          roomTypeId: params.roomTypeId ?? null,
          roomId: params.roomId ?? null,
          hold: params.hold === '1',
        }}
        businessDate={today}
        holdMinutesDefault={ctx.property.settings.booking.holdMinutesDefault}
        canOverbook={['owner', 'manager'].includes(ctx.role.key)}
      />
    </div>
  );
}
