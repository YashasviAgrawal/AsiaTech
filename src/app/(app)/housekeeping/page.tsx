import type { Metadata } from 'next';
import { requireContext } from '@/server/context';
import { getHousekeepingBoard, housekeepingStaff } from '@/server/services/housekeeping';
import { getT } from '@/i18n/server';
import { PageHeader } from '@/components/ui/card';
import { HousekeepingBoard } from './board';

export const metadata: Metadata = { title: 'Housekeeping' };

export default async function HousekeepingPage() {
  const ctx = await requireContext('housekeeping.use');
  const { t } = await getT();
  const [rooms, staff] = await Promise.all([getHousekeepingBoard(ctx.propertyId, ctx.property.businessDate), housekeepingStaff(ctx.propertyId)]);
  return (
    <div>
      <PageHeader eyebrow={t('nav.housekeeping')} title={t('nav.roomStatus')} description="Tap a room to change its status or assign it to a housekeeper. Check-out makes a room dirty automatically." />
      <HousekeepingBoard rooms={JSON.parse(JSON.stringify(rooms))} staff={staff} canManage={ctx.can('housekeeping.manage')} businessDate={ctx.property.businessDate} />
    </div>
  );
}
