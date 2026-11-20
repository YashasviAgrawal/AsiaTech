import type { Metadata } from 'next';
import { requireContext } from '@/server/context';
import { pettyCashLedger } from '@/server/services/money';
import { addDay, monthStart } from '@/lib/format';
import { PageHeader } from '@/components/ui/card';
import { FilterBar } from '@/components/ui/filter-bar';
import { PettyCash } from './petty-cash';

export const metadata: Metadata = { title: 'Petty Cash' };

export default async function PettyCashPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const ctx = await requireContext('money.view');
  const p = await searchParams;
  const to = p.to ?? ctx.property.businessDate;
  const from = p.from ?? addDay(monthStart(to), 0);
  const ledger = await pettyCashLedger(ctx.propertyId, from, to);
  return (
    <div>
      <PageHeader eyebrow="Money" title="Petty Cash" description="Small cash expenses with a bill photo. The closing balance is what should be in the cash box." />
      <FilterBar className="mb-4" fields={[{ key: 'from', type: 'date', label: 'From' }, { key: 'to', type: 'date', label: 'To' }]} />
      <PettyCash ledger={JSON.parse(JSON.stringify(ledger))} canManage={ctx.can('money.manage')} canApprove={['owner', 'manager', 'accountant'].includes(ctx.role.key)} />
    </div>
  );
}
