import type { Metadata } from 'next';
import { requireContext } from '@/server/context';
import { getPosTerminal, listOutlets } from '@/server/services/pos';
import { EmptyState, PageHeader } from '@/components/ui/card';
import { MenuEditor } from './menu-editor';
import { OutletsCard } from './outlets-card';
import { OutletSwitcher } from '../outlet-switcher';

export const metadata: Metadata = { title: 'Menu & Tables' };

export default async function MenuPage({ searchParams }: { searchParams: Promise<{ outlet?: string }> }) {
  const ctx = await requireContext('pos.manage');
  const { outlet } = await searchParams;
  const [data, outlets] = await Promise.all([getPosTerminal(ctx.propertyId, outlet), listOutlets(ctx.propertyId)]);
  if (!data) return <EmptyState title="No outlet" />;
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Restaurant"
        title="Menu & Tables"
        description="Prices exclude GST. Restaurant service in hotels is usually 5% GST without input tax credit."
        actions={<OutletSwitcher outlets={data.outlets} current={data.outlet.id} basePath="/restaurant/menu" />}
      />
      <OutletsCard outlets={outlets} current={data.outlet.id} />
      <MenuEditor
        key={data.outlet.id}
        outletId={data.outlet.id}
        categories={data.categories.map((c) => ({ id: c.id, name: c.name }))}
        items={data.items.map((i) => ({ id: i.id, name: i.name, price: i.price, taxRate: i.taxRate, isVeg: i.isVeg, isAvailable: i.isAvailable, categoryId: i.categoryId }))}
        tables={data.tables.map((t) => ({ id: t.id, name: t.name, seats: t.seats }))}
      />
    </div>
  );
}
