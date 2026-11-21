import type { Metadata } from 'next';
import { requireContext } from '@/server/context';
import { getRoomChart } from '@/server/services/roomchart';
import { addDay } from '@/lib/format';
import { PageHeader } from '@/components/ui/card';
import { DateNav } from '@/components/ui/date-nav';
import { RoomChart } from './room-chart';

export const metadata: Metadata = { title: 'Room Chart' };

const DAYS = 14;

export default async function RoomChartPage({ searchParams }: { searchParams: Promise<{ start?: string; room?: string }> }) {
  const ctx = await requireContext('inventory.view');
  const { start: startParam, room } = await searchParams;
  const today = ctx.property.businessDate;
  const start = startParam && /^\d{4}-\d{2}-\d{2}$/.test(startParam) ? startParam : addDay(today, -1);
  const data = await getRoomChart(ctx.propertyId, start, DAYS);

  return (
    <div>
      <PageHeader
        eyebrow="Rooms & Rates"
        title="Room Chart"
        description="Who stays where. Drag a stay to move it, drag its right edge to extend, or click an empty cell to book."
      />
      <div className="mb-4">
        <DateNav start={start} days={DAYS} today={addDay(today, -1)} />
      </div>
      <RoomChart
        rooms={data.rooms}
        stays={data.stays}
        unassigned={data.unassigned}
        start={start}
        days={DAYS}
        today={today}
        highlight={room ?? null}
        canEdit={ctx.can('frontdesk.checkin')}
        canBook={ctx.can('bookings.create')}
      />
    </div>
  );
}
