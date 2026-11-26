import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { and, desc, eq } from 'drizzle-orm';
import { ArrowLeft } from 'lucide-react';
import { db } from '@/db';
import { bookings, guests } from '@/db/schema';
import { requireContext } from '@/server/context';
import { formatDay, formatINR, sourceLabel } from '@/lib/format';
import { Card, CardHeader } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/badge';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { GuestEditor } from './guest-editor';
import { tx } from '@/i18n/tx';

export const metadata: Metadata = { title: 'Guest' };

export default async function GuestPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireContext('bookings.view');
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [guest] = await db.select().from(guests).where(and(eq(guests.id, id), eq(guests.propertyId, ctx.propertyId)));
  if (!guest) notFound();
  const stays = await db.select().from(bookings).where(eq(bookings.guestId, id)).orderBy(desc(bookings.checkIn));
  const spend = stays.reduce((t, b) => t + b.paidAmount, 0);

  return (
    <div className="space-y-6">
      <Link href="/front-desk/guests" className="inline-flex items-center gap-1 text-sm font-medium text-ink-500 hover:text-ink-800">
        <ArrowLeft className="h-4 w-4" /> {tx('Guests')}
      </Link>
      {guest.mergedIntoId && (
        <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          {tx('This profile was merged.')} <Link href={`/front-desk/guests/${guest.mergedIntoId}`} className="font-semibold underline">{tx('Open the kept profile')}</Link>
        </p>
      )}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
        <GuestEditor
          guest={{ id: guest.id, name: guest.name, mobile: guest.mobile, email: guest.email, city: guest.city, company: guest.company, companyGstin: guest.companyGstin, isVip: guest.isVip, notes: guest.notes }}
          stats={{ stays: stays.filter((s) => ['checked_out', 'checked_in'].includes(s.status)).length, spend }}
          canEdit={ctx.can('bookings.edit')}
          meta={{ nationality: guest.nationality, id: guest.idType ? `${guest.idType.replace('_', ' ')} ${guest.idNumberMasked ?? ''}` : null, passport: guest.passportNumber }}
        />
        <Card>
          <CardHeader title="Stays" description={`${stays.length} booking${stays.length === 1 ? '' : 's'} · ${formatINR(spend)} paid`} />
          <Table minWidth={640}>
            <THead>
              <tr>
                <Th>Booking</Th>
                <Th>Dates</Th>
                <Th>Source</Th>
                <Th className="text-right">Total</Th>
                <Th>Status</Th>
              </tr>
            </THead>
            <TBody>
              {stays.map((b) => (
                <Tr key={b.id}>
                  <Td>
                    <Link href={`/front-desk/bookings/${b.id}`} className="font-mono text-[13px] font-semibold text-ink-900 hover:text-brand-600">
                      {b.bookingNo}
                    </Link>
                  </Td>
                  <Td>
                    {formatDay(b.checkIn)} → {formatDay(b.checkOut)}
                  </Td>
                  <Td>{sourceLabel(b.source, b.channel)}</Td>
                  <Td className="num text-right font-semibold">{formatINR(b.totalAmount)}</Td>
                  <Td>
                    <StatusBadge status={b.status} />
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </Card>
      </div>
    </div>
  );
}
