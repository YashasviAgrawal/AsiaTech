import type { Metadata } from 'next';
import Link from 'next/link';
import { Download, Plus } from 'lucide-react';
import { requireContext } from '@/server/context';
import { roomTypeList, searchBookings, type BookingFilters } from '@/server/services/reports-bookings';
import { formatDay, formatINR, formatNumber, OTA_LABELS, sourceLabel, SOURCE_LABELS } from '@/lib/format';
import { Card, EmptyState, PageHeader } from '@/components/ui/card';
import { buttonClasses } from '@/components/ui/button-styles';
import { StatusBadge } from '@/components/ui/badge';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { FilterBar } from '@/components/ui/filter-bar';

export const metadata: Metadata = { title: 'Booking Report' };

export default async function BookingReportPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requireContext('bookings.view');
  const params = await searchParams;
  const filters: BookingFilters = {
    q: params.q,
    status: (params.status as BookingFilters['status']) ?? '',
    source: (params.source as BookingFilters['source']) ?? '',
    channel: params.channel,
    roomTypeId: params.roomTypeId,
    dateField: (params.dateField as BookingFilters['dateField']) ?? 'check_in',
    from: params.from,
    to: params.to,
    created: (params.created as BookingFilters['created']) ?? '',
    sort: (params.sort as BookingFilters['sort']) ?? (params.created ? 'created' : 'check_in'),
  };
  const [{ rows, summary, truncated }, types] = await Promise.all([searchBookings(ctx.propertyId, filters), roomTypeList(ctx.propertyId)]);
  const exportQuery = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]).toString();

  return (
    <div>
      <PageHeader
        eyebrow="Front Desk"
        title="Booking Report"
        description={params.created === 'today' ? 'Bookings made today.' : params.created === 'month' ? 'Bookings made this month.' : 'Search and export every booking.'}
        actions={
          <>
            <a href={`/api/exports/bookings?${exportQuery}`} className={buttonClasses('outline')}>
              <Download className="h-4 w-4" /> Export Excel
            </a>
            {ctx.can('bookings.create') && (
              <Link href="/front-desk/reservations/new" className={buttonClasses('primary')}>
                <Plus className="h-4 w-4" /> New booking
              </Link>
            )}
          </>
        }
      />

      <FilterBar
        className="mb-4"
        fields={[
          { key: 'q', type: 'search', placeholder: 'Booking ID, OTA ref, guest or mobile' },
          {
            key: 'status',
            type: 'select',
            placeholder: 'Any status',
            options: [
              { value: 'active', label: 'Active (upcoming + in house)' },
              { value: 'confirmed', label: 'Confirmed' },
              { value: 'hold', label: 'On hold' },
              { value: 'checked_in', label: 'Checked in' },
              { value: 'checked_out', label: 'Checked out' },
              { value: 'cancelled', label: 'Cancelled' },
              { value: 'no_show', label: 'No-show' },
            ],
          },
          { key: 'source', type: 'select', placeholder: 'Any source', options: Object.entries(SOURCE_LABELS).map(([value, label]) => ({ value, label })) },
          { key: 'channel', type: 'select', placeholder: 'Any OTA', options: Object.entries(OTA_LABELS).map(([value, label]) => ({ value, label })) },
          { key: 'roomTypeId', type: 'select', placeholder: 'Any room type', options: types.map((t) => ({ value: t.id, label: t.name })) },
          {
            key: 'dateField',
            type: 'select',
            placeholder: 'Check-in date',
            options: [
              { value: 'check_out', label: 'Check-out date' },
              { value: 'stay', label: 'Staying on' },
              { value: 'created', label: 'Booked on' },
            ],
          },
          { key: 'from', type: 'date', label: 'From' },
          { key: 'to', type: 'date', label: 'To' },
        ]}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[
          { label: 'Bookings', value: formatNumber(summary.count) },
          { label: 'Room nights', value: formatNumber(summary.roomNights) },
          { label: 'Revenue', value: formatINR(summary.revenue) },
          { label: 'Collected', value: formatINR(summary.paid) },
          { label: 'Balance due', value: formatINR(summary.balance) },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-ink-200 bg-white px-4 py-3 shadow-card">
            <p className="text-[11px] font-medium tracking-wide text-ink-400 uppercase">{s.label}</p>
            <p className="num mt-0.5 text-lg font-bold text-ink-900">{s.value}</p>
          </div>
        ))}
      </div>

      <Card>
        {rows.length === 0 ? (
          <div className="p-6">
            <EmptyState title="No bookings match these filters" description="Try a wider date range or clear the filters." />
          </div>
        ) : (
          <Table minWidth={1100}>
            <THead>
              <tr>
                <Th>Booking ID</Th>
                <Th>Guest</Th>
                <Th>Source</Th>
                <Th>Check in</Th>
                <Th>Check out</Th>
                <Th>Room</Th>
                <Th className="text-right">Total</Th>
                <Th className="text-right">Balance</Th>
                <Th>Status</Th>
              </tr>
            </THead>
            <TBody>
              {rows.map((r) => (
                <Tr key={r.id}>
                  <Td>
                    <Link href={`/front-desk/bookings/${r.id}`} className="font-mono text-[13px] font-semibold text-ink-900 hover:text-brand-600">
                      {r.bookingNo}
                    </Link>
                    {r.otaRef && <p className="font-mono text-[11px] text-ink-400">{r.otaRef}</p>}
                  </Td>
                  <Td>
                    <p className="font-medium text-ink-900">{r.guestName}</p>
                    {r.mobile && <p className="num text-xs text-ink-400">{r.mobile}</p>}
                  </Td>
                  <Td className="whitespace-nowrap">{sourceLabel(r.source, r.channel)}</Td>
                  <Td className="whitespace-nowrap">{formatDay(r.checkIn)}</Td>
                  <Td className="whitespace-nowrap">
                    {formatDay(r.checkOut)}
                    <p className="text-xs text-ink-400">{r.nights}N</p>
                  </Td>
                  <Td className="max-w-52">
                    <p className="truncate">{r.roomTypes}</p>
                    {r.roomNumbers && <p className="num text-xs font-semibold text-ink-500">Room {r.roomNumbers}</p>}
                  </Td>
                  <Td className="num text-right font-semibold text-ink-900">{formatINR(r.totalAmount + r.extras)}</Td>
                  <Td className="num text-right font-semibold">
                    {['cancelled', 'no_show'].includes(r.status) ? <span className="text-ink-300">—</span> : r.balance > 0.5 ? <span className="text-amber-700">{formatINR(r.balance)}</span> : <span className="text-emerald-600">Paid</span>}
                  </Td>
                  <Td>
                    <StatusBadge status={r.status} />
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
        {truncated && <p className="border-t border-ink-100 px-5 py-3 text-xs text-ink-500">Showing the first 200. Narrow the filters or export to Excel for everything.</p>}
      </Card>
    </div>
  );
}
