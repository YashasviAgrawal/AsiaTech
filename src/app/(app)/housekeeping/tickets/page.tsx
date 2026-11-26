import type { Metadata } from 'next';
import { asc, eq } from 'drizzle-orm';
import { Wrench } from 'lucide-react';
import { db } from '@/db';
import { rooms } from '@/db/schema';
import { requireContext } from '@/server/context';
import { getTickets } from '@/server/services/housekeeping';
import { Card, EmptyState, PageHeader } from '@/components/ui/card';
import { Tabs } from '@/components/ui/tabs';
import { TicketList, NewTicketButton } from './ticket-list';

export const metadata: Metadata = { title: 'Repair Tickets' };

export default async function TicketsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const ctx = await requireContext('housekeeping.use');
  const { status = 'open' } = await searchParams;
  const [tickets, roomList] = await Promise.all([
    getTickets(ctx.propertyId, status),
    db.select({ id: rooms.id, number: rooms.number }).from(rooms).where(eq(rooms.propertyId, ctx.propertyId)).orderBy(asc(rooms.number)),
  ]);
  return (
    <div>
      <PageHeader eyebrow="Housekeeping" title="Repair Tickets" description="Problems found during inspection open a ticket automatically. Track them until fixed." actions={<NewTicketButton rooms={roomList} />} />
      <Tabs
        className="mb-4"
        value={status}
        items={[
          { value: 'open', label: 'Open', href: '/housekeeping/tickets?status=open' },
          { value: 'resolved', label: 'Resolved', href: '/housekeeping/tickets?status=resolved' },
          { value: 'all', label: 'All', href: '/housekeeping/tickets?status=all' },
        ]}
      />
      {tickets.length === 0 ? (
        <EmptyState icon={<Wrench className="h-6 w-6" />} title="No repair tickets" description="Nothing needs fixing right now." />
      ) : (
        <Card>
          <TicketList tickets={JSON.parse(JSON.stringify(tickets))} />
        </Card>
      )}
    </div>
  );
}
