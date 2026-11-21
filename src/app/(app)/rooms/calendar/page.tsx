import type { Metadata } from 'next';
import { Download } from 'lucide-react';
import { requireContext } from '@/server/context';
import { getAvailabilityGrid } from '@/server/services/inventory';
import { formatDay, addDay } from '@/lib/format';
import { PageHeader } from '@/components/ui/card';
import { DateNav } from '@/components/ui/date-nav';
import { buttonClasses } from '@/components/ui/button-styles';
import { Badge } from '@/components/ui/badge';
import { AvailabilityGrid } from './availability-grid';
import { BulkUpdateButton } from './bulk-update';

export const metadata: Metadata = { title: 'Availability Calendar' };

const DAYS = 15;

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ start?: string }> }) {
  const ctx = await requireContext('inventory.view');
  const { start: startParam } = await searchParams;
  const today = ctx.property.businessDate;
  const start = startParam && /^\d{4}-\d{2}-\d{2}$/.test(startParam) ? startParam : today;
  const rows = await getAvailabilityGrid(ctx.propertyId, start, DAYS);
  const canEdit = ctx.can('inventory.edit');

  return (
    <div>
      <PageHeader
        eyebrow="Rooms & Rates"
        title={
          <span>
            Availability Calendar <span className="font-semibold text-ink-400">of {ctx.property.name}</span>
          </span>
        }
        description="Rooms to sell per room type and date. Click any number to change it. Every change reaches all OTAs within seconds."
        actions={
          <>
            <a href={`/api/exports/inventory?start=${start}&days=60`} className={buttonClasses('outline')}>
              <Download className="h-4 w-4" /> Download Inventory
            </a>
            {canEdit && <BulkUpdateButton roomTypes={rows.map((r) => r.roomType)} defaultFrom={start} />}
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <DateNav start={start} days={DAYS} today={today} />
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="brand" className="uppercase">
            Inventory of {formatDay(start).slice(0, -5)} to {formatDay(addDay(start, DAYS - 1)).slice(0, -5)}
          </Badge>
          <span className="hidden h-4 w-px bg-ink-200 sm:block" />
          <Legend />
        </div>
      </div>

      <AvailabilityGrid rows={rows} today={today} canEdit={canEdit} />
    </div>
  );
}

function Legend() {
  const items = [
    { cls: 'bg-rose-500', label: 'Sold out' },
    { cls: 'bg-amber-400', label: 'Partly used' },
    { cls: 'bg-emerald-500', label: 'All free' },
  ];
  return (
    <div className="flex items-center gap-3 text-xs text-ink-500">
      {items.map((item) => (
        <span key={item.label} className="flex items-center gap-1.5">
          <span className={`h-2.5 w-2.5 rounded-sm ${item.cls}`} />
          {item.label}
        </span>
      ))}
      <span className="flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-sm bg-[repeating-linear-gradient(45deg,#e11d48_0_2px,#fff_2px_4px)] ring-1 ring-brand-300" />
        Stop-sell
      </span>
    </div>
  );
}
