import type { Metadata } from 'next';
import Link from 'next/link';
import { requireContext } from '@/server/context';
import { listPayments } from '@/server/services/money';
import { addDay, formatDateTime, formatINR, PAYMENT_MODE_LABELS, titleCase } from '@/lib/format';
import { Card, EmptyState, PageHeader } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/badge';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { FilterBar } from '@/components/ui/filter-bar';

export const metadata: Metadata = { title: 'Payments' };

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; mode?: string; kind?: string }> }) {
  const ctx = await requireContext('money.view');
  const p = await searchParams;
  const to = p.to ?? ctx.property.businessDate;
  const from = p.from ?? addDay(to, -6);
  const { rows, byMode, total } = await listPayments(ctx.propertyId, { from, to, mode: p.mode, kind: p.kind });

  return (
    <div>
      <PageHeader eyebrow="Money" title="Payments" description="Every rupee received or refunded at the front desk, by mode. Restaurant bills are under Restaurant → Orders." />
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <div className="rounded-xl border border-ink-900 bg-ink-900 p-4 text-white shadow-card">
          <p className="text-[11px] font-medium tracking-wide text-ink-400 uppercase">Collected</p>
          <p className="num mt-0.5 text-xl font-bold">{formatINR(total)}</p>
        </div>
        {['cash', 'upi', 'card', 'bank_transfer', 'link'].map((m) => (
          <div key={m} className="rounded-xl border border-ink-200 bg-white p-4 shadow-card">
            <p className="text-[11px] font-medium tracking-wide text-ink-400 uppercase">{PAYMENT_MODE_LABELS[m]}</p>
            <p className="num mt-0.5 text-xl font-bold text-ink-900">{formatINR(byMode[m] ?? 0)}</p>
          </div>
        ))}
      </div>
      <FilterBar
        className="mb-4"
        fields={[
          { key: 'from', type: 'date', label: 'From' },
          { key: 'to', type: 'date', label: 'To' },
          { key: 'mode', type: 'select', placeholder: 'Any mode', options: ['cash', 'upi', 'card', 'bank_transfer', 'link'].map((m) => ({ value: m, label: PAYMENT_MODE_LABELS[m] })) },
          { key: 'kind', type: 'select', placeholder: 'Any type', options: ['advance', 'settlement', 'refund', 'request'].map((m) => ({ value: m, label: titleCase(m) })) },
        ]}
      />
      <Card>
        {rows.length === 0 ? (
          <div className="p-6">
            <EmptyState title="No payments in this period" />
          </div>
        ) : (
          <Table minWidth={900}>
            <THead>
              <tr>
                <Th>When</Th>
                <Th>Guest / booking</Th>
                <Th>Type</Th>
                <Th>Mode</Th>
                <Th>Reference</Th>
                <Th className="text-right">Amount</Th>
                <Th>Status</Th>
              </tr>
            </THead>
            <TBody>
              {rows.map((r) => (
                <Tr key={r.id}>
                  <Td className="text-xs whitespace-nowrap">{formatDateTime(r.paidAt ?? r.createdAt)}</Td>
                  <Td>
                    <p className="font-medium text-ink-900">{r.guestName ?? '—'}</p>
                    {r.bookingId && (
                      <Link href={`/front-desk/bookings/${r.bookingId}`} className="font-mono text-xs text-brand-600 hover:underline">
                        {r.bookingNo}
                      </Link>
                    )}
                  </Td>
                  <Td>{titleCase(r.kind)}</Td>
                  <Td>{PAYMENT_MODE_LABELS[r.mode]}</Td>
                  <Td className="max-w-40 truncate font-mono text-xs">{r.reference ?? '—'}</Td>
                  <Td className={`num text-right font-semibold ${r.kind === 'refund' ? 'text-rose-600' : 'text-ink-900'}`}>
                    {r.kind === 'refund' ? '−' : ''}
                    {formatINR(r.amount)}
                  </Td>
                  <Td>
                    <StatusBadge status={r.status} />
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
