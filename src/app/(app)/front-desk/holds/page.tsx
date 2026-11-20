import type { Metadata } from 'next';
import { and, asc, eq } from 'drizzle-orm';
import { Clock, Plus } from 'lucide-react';
import { db } from '@/db';
import { bookings, guests } from '@/db/schema';
import { requireContext } from '@/server/context';
import { releaseExpiredHolds } from '@/server/services/bookings';
import { actorFromContext } from '@/server/services/actor';
import { Card, EmptyState, PageHeader } from '@/components/ui/card';
import { ButtonLink } from '@/components/ui/button';
import { HoldsList } from './holds-list';

export const metadata: Metadata = { title: 'Hold Booking' };

export default async function HoldsPage() {
  const ctx = await requireContext('bookings.view');
  const released = await releaseExpiredHolds(actorFromContext(ctx));
  const rows = await db
    .select({
      id: bookings.id,
      bookingNo: bookings.bookingNo,
      holdUntil: bookings.holdUntil,
      checkIn: bookings.checkIn,
      checkOut: bookings.checkOut,
      nights: bookings.nights,
      totalAmount: bookings.totalAmount,
      guestName: guests.name,
      mobile: guests.mobile,
      rooms: bookings.adults,
    })
    .from(bookings)
    .innerJoin(guests, eq(guests.id, bookings.guestId))
    .where(and(eq(bookings.propertyId, ctx.propertyId), eq(bookings.status, 'hold')))
    .orderBy(asc(bookings.holdUntil));

  return (
    <div>
      <PageHeader
        eyebrow="Front Desk"
        title="Hold Booking"
        description="Rooms blocked for a while without confirming. They go back on sale automatically when the time runs out."
        actions={
          ctx.can('bookings.create') && (
            <ButtonLink href="/front-desk/reservations/new?hold=1">
              <Plus className="h-4 w-4" /> New hold
            </ButtonLink>
          )
        }
      />
      {released > 0 && <p className="mb-4 text-sm text-ink-500">{released} expired hold{released === 1 ? ' was' : 's were'} released just now.</p>}
      {rows.length === 0 ? (
        <EmptyState icon={<Clock className="h-6 w-6" />} title="No rooms on hold" description="Use a hold when a guest needs time to confirm. The rooms are protected until the time you choose." />
      ) : (
        <Card>
          <HoldsList rows={JSON.parse(JSON.stringify(rows))} canEdit={ctx.can('bookings.create')} canCancel={ctx.can('bookings.cancel')} />
        </Card>
      )}
    </div>
  );
}
