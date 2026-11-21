import type { Metadata } from 'next';
import Link from 'next/link';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { posDayCloses } from '@/db/schema';
import { requireContext } from '@/server/context';
import { tx } from '@/i18n/tx';
import { OutletSwitcher } from '../outlet-switcher';
import { RestoreOrderButton } from './restore-button';
import { dayTotals, listOrders, listOutlets } from '@/server/services/pos';
import { formatDateTime, formatINR, formatNumber, monthStart, PAYMENT_MODE_LABELS, titleCase } from '@/lib/format';
import { Card, EmptyState, PageHeader } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/badge';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { FilterBar } from '@/components/ui/filter-bar';
import { CloseDayButton } from './close-day';

export const metadata: Metadata = { title: 'Restaurant orders' };

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ date?: string; from?: string; to?: string; mode?: string; type?: string; status?: string; outlet?: string }> }) {
  const ctx = await requireContext('pos.use');
  const canRestore = ctx.can('pos.void');
  const p = await searchParams;
  const biz = ctx.property.businessDate;
  const from = p.date === 'month' ? monthStart(biz) : p.from ?? biz;
  const to = p.date === 'month' ? biz : p.to ?? biz;
  const outlets = await listOutlets(ctx.propertyId);
  // One outlet: always that one. Several: "All outlets" unless one is picked; day close works per outlet.
  const outlet = outlets.length === 1 ? outlets[0] : outlets.find((o) => o.id === p.outlet) ?? null;
  const orders = await listOrders(ctx.propertyId, { from, to, mode: p.mode, type: p.type, status: p.status, outletId: outlet?.id });
  const keep = new URLSearchParams(Object.entries({ date: p.date, from: p.from, to: p.to, mode: p.mode, type: p.type, status: p.status }).filter((e): e is [string, string] => Boolean(e[1]))).toString();
  const totals = outlet ? await dayTotals(outlet.id, biz) : null;
  const [closed] = outlet ? await db.select().from(posDayCloses).where(and(eq(posDayCloses.outletId, outlet.id), eq(posDayCloses.businessDate, biz))) : [];
  const live = orders.filter((o) => o.status !== 'void');
  const sum = live.reduce((t, o) => t + o.total, 0);

  return (
    <div>
      <PageHeader
        eyebrow="Restaurant"
        title="Orders & day close"
        description="Every bill, with totals by payment mode. Close the day once all orders are settled."
        actions={
          <>
            <OutletSwitcher outlets={outlets} current={outlet?.id ?? null} basePath="/restaurant/orders" allLabel="All outlets" query={keep} />
            {outlet && ctx.can('pos.manage') && <CloseDayButton outletId={outlet.id} closed={Boolean(closed)} totals={totals!} />}
          </>
        }
      />
      {totals && (
        <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          {[
            { label: "Today's total", value: formatINR(totals.total), strong: true },
            { label: 'Cash', value: formatINR(totals.cash) },
            { label: 'UPI', value: formatINR(totals.upi) },
            { label: 'Card', value: formatINR(totals.card) },
            { label: 'Room transfer', value: formatINR(totals.room_transfer) },
            { label: 'Open orders', value: formatNumber(totals.open) },
          ].map((s) => (
            <div key={s.label} className={`rounded-xl border p-4 shadow-card ${s.strong ? 'border-ink-900 bg-ink-900 text-white' : 'border-ink-200 bg-white'}`}>
              <p className={`text-[11px] font-medium tracking-wide uppercase ${s.strong ? 'text-ink-400' : 'text-ink-400'}`}>{s.label}</p>
              <p className="num mt-0.5 text-xl font-bold">{s.value}</p>
            </div>
          ))}
        </div>
      )}
      <FilterBar
        className="mb-4"
        fields={[
          { key: 'from', type: 'date', label: 'From' },
          { key: 'to', type: 'date', label: 'To' },
          { key: 'mode', type: 'select', placeholder: 'Any payment', options: ['cash', 'upi', 'card', 'room_transfer', 'complimentary'].map((m) => ({ value: m, label: PAYMENT_MODE_LABELS[m] })) },
          { key: 'type', type: 'select', placeholder: 'Any order type', options: ['dine_in', 'take_away', 'room', 'in_house'].map((m) => ({ value: m, label: titleCase(m) })) },
          { key: 'status', type: 'select', placeholder: 'Any status', options: ['open', 'billed', 'settled', 'void'].map((m) => ({ value: m, label: titleCase(m) })) },
        ]}
      />
      <Card>
        {orders.length === 0 ? (
          <div className="p-6">
            <EmptyState title="No orders for these filters" />
          </div>
        ) : (
          <>
            <Table minWidth={980}>
              <THead>
                <tr>
                  <Th>Order</Th>
                  <Th>Type</Th>
                  <Th>Items</Th>
                  <Th>Time</Th>
                  <Th>Paid by</Th>
                  <Th className="text-right">Total</Th>
                  <Th>Status</Th>
                </tr>
              </THead>
              <TBody>
                {orders.map((o) => (
                  <Tr key={o.id}>
                    <Td>
                      <p className="font-mono text-[13px] font-semibold text-ink-900">{o.orderNo}</p>
                      {o.billNo && (
                        <Link href={`/print/bill/${o.id}`} target="_blank" className="font-mono text-[11px] text-brand-600 hover:underline">
                          {o.billNo}
                        </Link>
                      )}
                    </Td>
                    <Td className="whitespace-nowrap">
                      {tx(titleCase(o.orderType))}
                      <p className="text-xs text-ink-400">{tx(o.tableName ? `Table ${o.tableName}` : o.roomNumber ? `Room ${o.roomNumber}` : o.guestName ?? '')}</p>
                    </Td>
                    <Td className="max-w-72 truncate text-xs">{o.items}</Td>
                    <Td className="text-xs whitespace-nowrap">{formatDateTime(o.createdAt)}</Td>
                    <Td>{o.settlementMode ? tx(PAYMENT_MODE_LABELS[o.settlementMode]) : '—'}</Td>
                    <Td className="num text-right font-semibold">{formatINR(o.total)}</Td>
                    <Td className="whitespace-nowrap">
                      <StatusBadge status={o.status} />
                      {o.status === 'void' && canRestore && o.businessDate === ctx.property.businessDate && <RestoreOrderButton orderId={o.id} />}
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
            <div className="flex justify-end gap-6 border-t border-ink-200 bg-ink-50/60 px-5 py-3 text-sm">
              <span className="text-ink-500">
                {tx(`${live.length} bills`)} · {tx('Total')} <strong className="num text-ink-900">{formatINR(sum)}</strong>
              </span>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
