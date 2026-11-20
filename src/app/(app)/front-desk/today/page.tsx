import type { Metadata } from 'next';
import { requireContext } from '@/server/context';
import { getTodayBoard } from '@/server/services/frontoffice';
import { formatDayLong } from '@/lib/format';
import { PageHeader } from '@/components/ui/card';
import { ButtonLink } from '@/components/ui/button';
import { TodayBoard } from './today-board';

export const metadata: Metadata = { title: 'Today Check (In-Out)' };

export default async function TodayPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const ctx = await requireContext('bookings.view');
  const { tab } = await searchParams;
  const board = await getTodayBoard(ctx.propertyId, ctx.property.businessDate);
  const data = JSON.parse(JSON.stringify(board)) as typeof board;
  return (
    <div>
      <PageHeader
        eyebrow={formatDayLong(ctx.property.businessDate)}
        title="Today Check (In-Out)"
        description="Arrivals, guests in house and departures. One click to check in or out."
        actions={
          ctx.can('bookings.create') && (
            <ButtonLink href="/front-desk/reservations/new?walkin=1" variant="outline">
              Walk-in
            </ButtonLink>
          )
        }
      />
      <TodayBoard data={data} initialTab={tab === 'departures' ? 'departures' : tab === 'inhouse' ? 'inhouse' : 'arrivals'} businessDate={ctx.property.businessDate} canCheckIn={ctx.can('frontdesk.checkin')} />
    </div>
  );
}
