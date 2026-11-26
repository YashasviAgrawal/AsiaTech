import type { Metadata } from 'next';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { roomTypes } from '@/db/schema';
import { requireContext } from '@/server/context';
import { getChecklist } from '@/server/services/housekeeping';
import { PageHeader } from '@/components/ui/card';
import { ChecklistEditor } from './checklist-editor';

export const metadata: Metadata = { title: 'Housekeeping checklist' };

export default async function ChecklistPage() {
  const ctx = await requireContext('housekeeping.manage');
  const [items, types] = await Promise.all([
    getChecklist(ctx.propertyId),
    db.select({ id: roomTypes.id, name: roomTypes.name, code: roomTypes.code }).from(roomTypes).where(eq(roomTypes.propertyId, ctx.propertyId)).orderBy(asc(roomTypes.sortOrder)),
  ]);
  return (
    <div>
      <PageHeader
        eyebrow="Housekeeping"
        title="Checklist"
        description="One master item per thing, grouped as Cleaning, Amenities and Maintenance. During inspection staff tap OK, Problem or Missing. A problem opens a repair ticket automatically."
      />
      <ChecklistEditor items={items.map((i) => ({ id: i.id, name: i.name, nameHi: i.nameHi, category: i.category, roomTypeIds: i.roomTypeIds, isActive: i.isActive }))} roomTypes={types} />
    </div>
  );
}
