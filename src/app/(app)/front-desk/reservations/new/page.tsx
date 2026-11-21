import type { Metadata } from 'next';
import { requireContext } from '@/server/context';
import { getStayAvailability } from '@/server/services/inventory';
import { getRoomTypeOptions } from '@/server/services/room-options';
import { addDay } from '@/lib/format';
import { PageHeader } from '@/components/ui/card';
import { ReservationForm } from './reservation-form';

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

  const [options, availability] = await Promise.all([getRoomTypeOptions(ctx.propertyId), getStayAvailability(ctx.propertyId, checkIn, checkOut)]);

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
