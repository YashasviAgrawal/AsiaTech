import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireContext } from '@/server/context';
import { getBookingDetail } from '@/server/services/frontoffice';
import { getRoomTypeOptions } from '@/server/services/room-options';
import { BookingView } from './booking-view';

export const metadata: Metadata = { title: 'Booking' };

export default async function BookingPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ do?: string }> }) {
  const ctx = await requireContext('bookings.view');
  const { id } = await params;
  const { do: intent } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [detail, roomTypes] = await Promise.all([getBookingDetail(ctx.propertyId, id), ctx.can('bookings.edit') ? getRoomTypeOptions(ctx.propertyId) : []]);
  if (!detail) notFound();

  // Dates go to the client as ISO strings.
  const data = JSON.parse(JSON.stringify(detail)) as typeof detail;
  return (
    <BookingView
      data={data}
      intent={intent ?? null}
      roomTypes={roomTypes}
      businessDate={ctx.property.businessDate}
      hotel={{ name: ctx.property.name, upiId: ctx.property.settings.invoice.upiId }}
      can={{
        checkin: ctx.can('frontdesk.checkin'),
        cancel: ctx.can('bookings.cancel'),
        edit: ctx.can('bookings.edit'),
        create: ctx.can('bookings.create'),
        requestMoney: ctx.can('money.manage'),
      }}
    />
  );
}
