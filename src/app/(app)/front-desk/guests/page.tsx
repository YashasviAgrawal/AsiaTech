import type { Metadata } from 'next';
import Link from 'next/link';
import { and, desc, eq, ilike, isNull, or, sql } from 'drizzle-orm';
import { Crown, Globe2, Users } from 'lucide-react';
import { db } from '@/db';
import { guests } from '@/db/schema';
import { requireContext } from '@/server/context';
import { normaliseMobile } from '@/lib/utils';
import { recentDuplicatePairs } from '@/server/services/guests';
import { formatDay, formatINR } from '@/lib/format';
import { Card, EmptyState, PageHeader } from '@/components/ui/card';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { FilterBar } from '@/components/ui/filter-bar';
import { DuplicatePairs } from './duplicate-pairs';

export const metadata: Metadata = { title: 'Guests' };

export default async function GuestsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const ctx = await requireContext('bookings.view');
  const { q } = await searchParams;
  const mobile = normaliseMobile(q);

  const rows = await db
    .select({
      id: guests.id,
      name: guests.name,
      nameKey: guests.nameKey,
      mobile: guests.mobile,
      email: guests.email,
      city: guests.city,
      isVip: guests.isVip,
      isForeign: guests.isForeign,
      stays: sql<number>`(SELECT count(*)::int FROM bookings b WHERE b.guest_id = "guests"."id" AND b.status IN ('checked_out','checked_in'))`,
      lastStay: sql<string | null>`(SELECT max(b.check_in)::text FROM bookings b WHERE b.guest_id = "guests"."id")`,
      spend: sql<number>`(SELECT COALESCE(sum(b.paid_amount), 0)::float FROM bookings b WHERE b.guest_id = "guests"."id")`,
    })
    .from(guests)
    .where(
      and(
        eq(guests.propertyId, ctx.propertyId),
        isNull(guests.mergedIntoId),
        q ? or(ilike(guests.name, `%${q}%`), mobile && mobile.length >= 4 ? ilike(guests.mobile, `%${mobile}%`) : undefined, ilike(guests.email, `%${q}%`)) : undefined,
      ),
    )
    .orderBy(desc(sql`(SELECT max(b.check_in) FROM bookings b WHERE b.guest_id = "guests"."id")`))
    .limit(150);

  const pairs = ctx.can('bookings.edit') ? await recentDuplicatePairs(ctx.propertyId) : [];

  return (
    <div>
      <PageHeader eyebrow="Front Desk" title="Guests" description="Everyone who has stayed or booked, with their stay history." />
      {pairs.length > 0 && ctx.can('bookings.edit') && <DuplicatePairs pairs={pairs.slice(0, 6)} total={pairs.length} />}
      <FilterBar className="mb-4" fields={[{ key: 'q', type: 'search', placeholder: 'Name, mobile or email' }]} />
      <Card>
        {rows.length === 0 ? (
          <div className="p-6">
            <EmptyState icon={<Users className="h-6 w-6" />} title="No guests found" />
          </div>
        ) : (
          <Table minWidth={760}>
            <THead>
              <tr>
                <Th>Guest</Th>
                <Th>Mobile</Th>
                <Th>City</Th>
                <Th className="text-right">Stays</Th>
                <Th>Last stay</Th>
                <Th className="text-right">Paid to date</Th>
              </tr>
            </THead>
            <TBody>
              {rows.map((g) => (
                <Tr key={g.id}>
                  <Td>
                    <Link href={`/front-desk/guests/${g.id}`} className="flex items-center gap-1.5 font-semibold text-ink-900 hover:text-brand-600">
                      {g.name}
                      {g.isVip && <Crown className="h-3.5 w-3.5 text-amber-500" />}
                      {g.isForeign && <Globe2 className="h-3.5 w-3.5 text-sky-500" />}
                    </Link>
                    {g.email && <p className="text-xs text-ink-400">{g.email}</p>}
                  </Td>
                  <Td className="num">{g.mobile ?? '—'}</Td>
                  <Td>{g.city ?? '—'}</Td>
                  <Td className="num text-right font-semibold">{g.stays}</Td>
                  <Td>{g.lastStay ? formatDay(g.lastStay) : '—'}</Td>
                  <Td className="num text-right">{formatINR(g.spend)}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
