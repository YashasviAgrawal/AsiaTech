import type { Metadata } from 'next';
import Link from 'next/link';
import { Building2, Globe, Plane, User } from 'lucide-react';
import { requireContext } from '@/server/context';
import { ExportButton } from '@/components/ui/export-button';
import { AGE_BUCKETS, creditReport } from '@/server/services/money';
import { formatDay, formatINR, OTA_LABELS } from '@/lib/format';
import { Card, EmptyState, PageHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { tx } from '@/i18n/tx';

export const metadata: Metadata = { title: 'Credit Report' };

const GROUP_META = {
  guest: { label: 'Guests', icon: User },
  company: { label: 'Companies', icon: Building2 },
  agent: { label: 'Travel agents', icon: Plane },
  ota: { label: 'OTAs', icon: Globe },
} as const;

export default async function CreditPage() {
  const ctx = await requireContext('money.view');
  const report = await creditReport(ctx.propertyId, ctx.property.businessDate);
  return (
    <div>
      <PageHeader
        eyebrow="Money"
        title="Credit Report"
        description="Who still owes money, grouped by guest, company, travel agent and OTA, and aged by days since check-out."
        actions={<ExportButton href="/api/exports/money/credit" />}
      />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <div className="rounded-xl bg-ink-900 p-4 text-white shadow-card">
          <p className="text-[11px] font-medium tracking-wide text-ink-400 uppercase">{tx('Total owed')}</p>
          <p className="num mt-1 text-2xl font-extrabold">{formatINR(report.total)}</p>
          <p className="text-xs text-ink-400">{report.count} bills</p>
        </div>
        {AGE_BUCKETS.map((b, i) => (
          <div key={b} className="rounded-xl border border-ink-200 bg-white p-4 shadow-card">
            <p className="flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-ink-400 uppercase">
              <span className={['h-2 w-2 rounded-full bg-emerald-500', 'h-2 w-2 rounded-full bg-amber-400', 'h-2 w-2 rounded-full bg-orange-500', 'h-2 w-2 rounded-full bg-rose-600'][i]} />
              {b} days
            </p>
            <p className="num mt-1 text-2xl font-bold text-ink-900">{formatINR(report.buckets[b])}</p>
          </div>
        ))}
      </div>

      {report.count === 0 ? (
        <EmptyState title="Nobody owes you money" description="Every checked-out bill is settled." />
      ) : (
        <div className="space-y-6">
          {report.groups
            .filter((g) => g.list.length > 0)
            .map((group) => {
              const meta = GROUP_META[group.billTo];
              return (
                <Card key={group.billTo}>
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 px-5 py-3.5">
                    <p className="flex items-center gap-2 font-bold text-ink-900">
                      <meta.icon className="h-4 w-4 text-brand-600" /> {meta.label} <Badge>{group.list.length}</Badge>
                    </p>
                    <div className="flex flex-wrap gap-4 text-xs text-ink-500">
                      {AGE_BUCKETS.map((b) => (
                        <span key={b}>
                          {b}: <strong className="num text-ink-800">{formatINR(group.buckets[b])}</strong>
                        </span>
                      ))}
                      <span>
                        Total <strong className="num text-ink-900">{formatINR(group.total)}</strong>
                      </span>
                    </div>
                  </div>
                  <Table minWidth={760}>
                    <THead>
                      <tr>
                        <Th>Owed by</Th>
                        <Th>Booking</Th>
                        <Th>Stay</Th>
                        <Th className="text-right">Days</Th>
                        <Th className="text-right">Balance</Th>
                        <Th />
                      </tr>
                    </THead>
                    <TBody>
                      {group.list.map((row) => (
                        <Tr key={row.id}>
                          <Td>
                            <p className="font-semibold text-ink-900">{row.billTo === 'ota' ? OTA_LABELS[row.channel ?? ''] ?? row.debtor : row.debtor}</p>
                            {row.debtor !== row.guestName && (
                              <p className="text-xs text-ink-400">
                                {tx('Guest:')} {row.guestName}
                              </p>
                            )}
                          </Td>
                          <Td>
                            <Link href={`/front-desk/bookings/${row.id}`} className="font-mono text-[13px] font-semibold text-ink-900 hover:text-brand-600">
                              {row.bookingNo}
                            </Link>
                          </Td>
                          <Td className="whitespace-nowrap">
                            {formatDay(row.checkIn)} → {formatDay(row.checkOut)}
                          </Td>
                          <Td className="num text-right">
                            <Badge tone={row.days > 60 ? 'danger' : row.days > 30 ? 'warning' : 'success'}>{row.status === 'checked_in' ? 'In house' : `${row.days} d`}</Badge>
                          </Td>
                          <Td className="num text-right font-bold text-ink-900">{formatINR(row.balance)}</Td>
                          <Td className="text-right">
                            {ctx.can('money.manage') && (
                              <Link href={`/money/request?booking=${row.id}`} className="text-xs font-semibold text-brand-600 hover:text-brand-700">
                                {tx('Request →')}
                              </Link>
                            )}
                          </Td>
                        </Tr>
                      ))}
                    </TBody>
                  </Table>
                </Card>
              );
            })}
        </div>
      )}
    </div>
  );
}
