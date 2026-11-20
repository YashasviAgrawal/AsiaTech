import type { Metadata } from 'next';
import { requireContext } from '@/server/context';
import { getRateGrid } from '@/server/services/rates';
import { PageHeader } from '@/components/ui/card';
import { DateNav } from '@/components/ui/date-nav';
import { RateGrid } from './rate-grid';
import { BulkRateButton } from './bulk-rate';

export const metadata: Metadata = { title: 'Rate Management' };

const DAYS = 14;

export default async function RatesPage({ searchParams }: { searchParams: Promise<{ start?: string }> }) {
  const ctx = await requireContext('inventory.view');
  const { start: startParam } = await searchParams;
  const today = ctx.property.businessDate;
  const start = startParam && /^\d{4}-\d{2}-\d{2}$/.test(startParam) ? startParam : today;
  const rows = await getRateGrid(ctx.propertyId, start, DAYS);
  const canEdit = ctx.can('rates.edit');

  return (
    <div>
      <PageHeader
        eyebrow="Rooms & Rates"
        title="Rate Management"
        description="Price per night for 1, 2 or 3 adults, extra beds, minimum stay and stop-sell. Prices exclude GST unless set otherwise in Hotel Details."
        actions={canEdit && <BulkRateButton plans={rows.map((r) => ({ id: r.plan.id, label: `${r.roomType.name} · ${r.plan.name}`, mealPlan: r.plan.mealPlan }))} defaultFrom={start} />}
      />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <DateNav start={start} days={DAYS} today={today} />
        <p className="text-xs text-ink-500">
          Showing the <strong className="text-ink-700">2-adult</strong> price. <span className="font-semibold text-brand-700">Rose</span> = changed from the
          standard rate.
        </p>
      </div>
      <RateGrid rows={rows} today={today} canEdit={canEdit} />
    </div>
  );
}
