import type { NextRequest } from 'next/server';
import { getContext } from '@/server/context';
import { searchBookings, type BookingFilters } from '@/server/services/reports-bookings';
import { buildWorkbook, NUM_FMT, xlsxResponse } from '@/server/exports/excel';
import { formatDateTime, formatDay, sourceLabel, todayIST } from '@/lib/format';

export async function GET(request: NextRequest) {
  const ctx = await getContext();
  if (!ctx || !ctx.can('bookings.view')) return new Response('Unauthorised', { status: 401 });
  const p = Object.fromEntries(request.nextUrl.searchParams);
  const { rows } = await searchBookings(ctx.propertyId, p as BookingFilters, 20000);
  const buffer = await buildWorkbook([
    {
      name: 'Bookings',
      title: `${ctx.property.name} · Booking Report · exported ${formatDateTime(new Date())}`,
      columns: [
        { header: 'Booking ID', key: 'bookingNo', width: 14 },
        { header: 'OTA ref', key: 'otaRef', width: 16 },
        { header: 'Guest', key: 'guestName', width: 24 },
        { header: 'Mobile', key: 'mobile', width: 13 },
        { header: 'Source', key: 'source', width: 14 },
        { header: 'Check in', key: 'checkIn', width: 13 },
        { header: 'Check out', key: 'checkOut', width: 13 },
        { header: 'Nights', key: 'nights', width: 8 },
        { header: 'Room type', key: 'roomTypes', width: 28 },
        { header: 'Room no.', key: 'roomNumbers', width: 10 },
        { header: 'Discount', key: 'discountAmount', numFmt: NUM_FMT.inr },
        { header: 'GST', key: 'taxAmount', numFmt: NUM_FMT.inr },
        { header: 'Total', key: 'total', numFmt: NUM_FMT.inr },
        { header: 'Paid', key: 'paidAmount', numFmt: NUM_FMT.inr },
        { header: 'Balance', key: 'balance', numFmt: NUM_FMT.inr },
        { header: 'Status', key: 'status', width: 12 },
        { header: 'Booked on', key: 'createdAt', width: 20 },
      ],
      rows: rows.map((r) => ({
        ...r,
        source: sourceLabel(r.source, r.channel),
        checkIn: formatDay(r.checkIn),
        checkOut: formatDay(r.checkOut),
        total: r.totalAmount + r.extras,
        status: r.status.replace('_', ' '),
        createdAt: formatDateTime(r.createdAt),
      })),
    },
  ]);
  return xlsxResponse(buffer, `bookings-${ctx.property.slug}-${todayIST()}.xlsx`);
}
