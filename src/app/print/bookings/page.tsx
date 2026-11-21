import type { Metadata } from 'next';
import { requireContext } from '@/server/context';
import { searchBookings, type BookingFilters } from '@/server/services/reports-bookings';
import { formatDateTime, formatDay, formatINR, sourceLabel, titleCase } from '@/lib/format';

export const metadata: Metadata = { title: 'Booking Report' };

const DATE_FIELD: Record<string, string> = { check_in: 'Check-in', check_out: 'Check-out', created: 'Booked on', stay: 'Staying' };

/** Booking Report on paper (A4 landscape) or "Save as PDF": the same filters as the screen, up to 2,000 rows. */
export default async function PrintBookingReport({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await requireContext('bookings.view');
  const params = await searchParams;
  const { rows, summary, truncated } = await searchBookings(ctx.propertyId, params as BookingFilters, 2000);

  const filters = [
    params.q && `Search “${params.q}”`,
    params.status && `Status: ${params.status === 'active' ? 'Active' : titleCase(params.status)}`,
    params.source && `Source: ${sourceLabel(params.source)}`,
    params.channel && `Channel: ${titleCase(params.channel)}`,
    (params.from || params.to) && `${DATE_FIELD[params.dateField ?? 'check_in'] ?? 'Dates'}: ${params.from ? formatDay(params.from) : '…'} – ${params.to ? formatDay(params.to) : '…'}`,
    params.created === 'today' && 'Booked today',
    params.created === 'month' && 'Booked this month',
  ].filter(Boolean);

  return (
    <article className="mx-auto w-full max-w-[297mm] bg-white p-8 text-[11px] text-ink-800 shadow-lift print:max-w-none print:p-0 print:shadow-none">
      <style>{'@page { size: A4 landscape; margin: 10mm; }'}</style>
      <header className="flex items-end justify-between border-b-2 border-ink-900 pb-3">
        <div>
          <p className="text-lg font-extrabold text-ink-900">{ctx.property.name}</p>
          <p className="text-sm font-semibold text-ink-600">Booking Report</p>
        </div>
        <div className="text-right text-[10px] text-ink-500">
          <p>{filters.length ? filters.join(' · ') : 'All bookings'}</p>
          <p>
            Printed {formatDateTime(new Date())} by {ctx.user.name}
          </p>
        </div>
      </header>

      <section className="mt-3 grid grid-cols-5 gap-2">
        {[
          ['Bookings', String(summary.count)],
          ['Room nights', String(summary.roomNights)],
          ['Booking value', formatINR(summary.revenue)],
          ['Received', formatINR(summary.paid)],
          ['Balance due', formatINR(summary.balance)],
        ].map(([label, value]) => (
          <div key={label} className="rounded border border-ink-200 px-3 py-2">
            <p className="text-[9px] font-semibold tracking-wider text-ink-400 uppercase">{label}</p>
            <p className="num text-sm font-bold text-ink-900">{value}</p>
          </div>
        ))}
      </section>

      <table className="mt-3 w-full border-collapse">
        <thead>
          <tr className="border-b border-ink-900 text-left text-[9px] tracking-wider text-ink-500 uppercase">
            <th className="py-1.5 pr-2">Booking</th>
            <th className="py-1.5 pr-2">Guest</th>
            <th className="py-1.5 pr-2">Source</th>
            <th className="py-1.5 pr-2">Stay</th>
            <th className="py-1.5 pr-2 text-right">Nts</th>
            <th className="py-1.5 pr-2">Room type</th>
            <th className="py-1.5 pr-2">Room</th>
            <th className="py-1.5 pr-2 text-right">Total</th>
            <th className="py-1.5 pr-2 text-right">Paid</th>
            <th className="py-1.5 pr-2 text-right">Balance</th>
            <th className="py-1.5">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const off = r.status === 'cancelled' || r.status === 'no_show';
            return (
              <tr key={r.id} className={off ? 'border-b border-ink-100 text-ink-400 line-through decoration-ink-300' : 'border-b border-ink-100'} style={{ breakInside: 'avoid' }}>
                <td className="num py-1 pr-2 font-semibold whitespace-nowrap">{r.bookingNo}</td>
                <td className="py-1 pr-2">
                  {r.guestName}
                  {r.mobile && <span className="text-ink-400"> · {r.mobile}</span>}
                </td>
                <td className="py-1 pr-2 whitespace-nowrap">{sourceLabel(r.source, r.channel)}</td>
                <td className="num py-1 pr-2 whitespace-nowrap">
                  {formatDay(r.checkIn)} → {formatDay(r.checkOut)}
                </td>
                <td className="num py-1 pr-2 text-right">{r.nights}</td>
                <td className="py-1 pr-2">{r.roomTypes}</td>
                <td className="num py-1 pr-2">{r.roomNumbers ?? '—'}</td>
                <td className="num py-1 pr-2 text-right">{formatINR(r.totalAmount + r.extras)}</td>
                <td className="num py-1 pr-2 text-right">{formatINR(r.paidAmount)}</td>
                <td className={`num py-1 pr-2 text-right ${!off && r.balance > 0.5 ? 'font-semibold text-ink-900' : ''}`}>{formatINR(Math.max(0, r.balance))}</td>
                <td className="py-1 whitespace-nowrap capitalize">{r.status.replace('_', ' ')}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {rows.length === 0 && <p className="py-10 text-center text-sm text-ink-500">No bookings match these filters.</p>}
      {truncated && <p className="mt-3 text-[10px] text-amber-700">Only the first 2,000 bookings are printed. Use Export Excel for everything.</p>}
      <p className="mt-4 text-[9px] text-ink-400">Cancelled and no-show bookings are struck through and not counted in the totals.</p>
    </article>
  );
}
