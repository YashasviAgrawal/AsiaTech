import type { NextRequest } from 'next/server';
import { getContext } from '@/server/context';
import { getAvailabilityGrid } from '@/server/services/inventory';
import { buildWorkbook, xlsxResponse } from '@/server/exports/excel';
import { addDay, formatDay, weekdayShort } from '@/lib/format';

/** Download Inventory: the Availability Calendar as Excel (one row per room type per date). */
export async function GET(request: NextRequest) {
  const ctx = await getContext();
  if (!ctx || !ctx.can('inventory.view')) return new Response('Unauthorised', { status: 401 });
  const start = request.nextUrl.searchParams.get('start') ?? ctx.property.businessDate;
  const days = Math.min(Number(request.nextUrl.searchParams.get('days') ?? 60), 400);
  const grid = await getAvailabilityGrid(ctx.propertyId, start, days);

  const rows = grid.flatMap((row) =>
    row.cells.map((cell) => ({
      roomType: row.roomType.name,
      date: formatDay(cell.date),
      day: weekdayShort(cell.date),
      total: cell.total,
      booked: cell.booked,
      blocked: cell.blocked,
      available: cell.available,
      stopSell: cell.stopSell ? 'Yes' : '',
    })),
  );

  const buffer = await buildWorkbook([
    {
      name: 'Inventory',
      title: `${ctx.property.name} · Inventory ${formatDay(start)} to ${formatDay(addDay(start, days - 1))}`,
      columns: [
        { header: 'Room type', key: 'roomType', width: 28 },
        { header: 'Date', key: 'date', width: 14 },
        { header: 'Day', key: 'day', width: 8 },
        { header: 'Total', key: 'total' },
        { header: 'Booked', key: 'booked' },
        { header: 'Blocked', key: 'blocked' },
        { header: 'Available', key: 'available' },
        { header: 'Stop-sell', key: 'stopSell' },
      ],
      rows,
      fill: (row, key) => {
        if (key !== 'available') return undefined;
        const available = Number(row.available);
        if (available <= 0) return 'FFFECDD3';
        if (available < Number(row.total)) return 'FFFEF3C7';
        return 'FFD1FAE5';
      },
    },
  ]);
  return xlsxResponse(buffer, `inventory-${ctx.property.slug}-${start}.xlsx`);
}
