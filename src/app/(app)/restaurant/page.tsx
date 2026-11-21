import type { Metadata } from 'next';
import Link from 'next/link';
import { ClipboardList, Settings2, UtensilsCrossed } from 'lucide-react';
import { requireContext } from '@/server/context';
import { OutletSwitcher } from './outlet-switcher';
import { getPosTerminal } from '@/server/services/pos';
import { formatDayShort } from '@/lib/format';
import { EmptyState, PageHeader } from '@/components/ui/card';
import { buttonClasses } from '@/components/ui/button-styles';
import { PosTerminal } from './pos-terminal';

export const metadata: Metadata = { title: 'Point Of Sale' };

export default async function RestaurantPage({ searchParams }: { searchParams: Promise<{ outlet?: string }> }) {
  const ctx = await requireContext('pos.use');
  const { outlet } = await searchParams;
  const data = await getPosTerminal(ctx.propertyId, outlet);
  if (!data) return <EmptyState icon={<UtensilsCrossed className="h-6 w-6" />} title="No restaurant outlet yet" description="Add an outlet under Menu & Tables." />;
  return (
    <div>
      <PageHeader
        eyebrow={`Restaurant · ${formatDayShort(ctx.property.businessDate)}`}
        title={data.outlet.name}
        actions={
          <>
            <OutletSwitcher outlets={data.outlets} current={data.outlet.id} basePath="/restaurant" />
            <Link href={`/restaurant/orders?outlet=${data.outlet.id}`} className={buttonClasses('outline')}>
              <ClipboardList className="h-4 w-4" /> Orders & day close
            </Link>
            {ctx.can('pos.manage') && (
              <Link href={`/restaurant/menu?outlet=${data.outlet.id}`} className={buttonClasses('outline')}>
                <Settings2 className="h-4 w-4" /> Menu & tables
              </Link>
            )}
          </>
        }
      />
      <PosTerminal data={JSON.parse(JSON.stringify(data))} canVoid={ctx.can('pos.void')} canManage={ctx.can('pos.manage')} />
    </div>
  );
}
