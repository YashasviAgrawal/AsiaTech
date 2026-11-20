import type { Metadata } from 'next';
import { requireContext } from '@/server/context';
import { getPosTerminal } from '@/server/services/pos';
import { EmptyState, PageHeader } from '@/components/ui/card';
import { MenuEditor } from './menu-editor';

export const metadata: Metadata = { title: 'Menu & Tables' };

export default async function MenuPage() {
  const ctx = await requireContext('pos.manage');
  const data = await getPosTerminal(ctx.propertyId);
  if (!data) return <EmptyState title="No outlet" />;
  return (
    <div>
      <PageHeader eyebrow="Restaurant" title="Menu & Tables" description="Prices exclude GST. Restaurant service in hotels is usually 5% GST without input tax credit." />
      <MenuEditor outletId={data.outlet.id} categories={data.categories.map((c) => ({ id: c.id, name: c.name }))} items={data.items.map((i) => ({ id: i.id, name: i.name, price: i.price, taxRate: i.taxRate, isVeg: i.isVeg, isAvailable: i.isAvailable, categoryId: i.categoryId }))} tables={data.tables.map((t) => ({ id: t.id, name: t.name, seats: t.seats }))} />
    </div>
  );
}
