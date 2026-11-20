import type { Metadata } from 'next';
import { requireContext } from '@/server/context';
import { listPromotions } from '@/server/services/channels';
import { PageHeader } from '@/components/ui/card';
import { PromotionsManager } from './promotions-manager';

export const metadata: Metadata = { title: 'Promotions' };

export default async function PromotionsPage() {
  const ctx = await requireContext('channels.manage');
  const list = await listPromotions(ctx.propertyId);
  return (
    <div>
      <PageHeader eyebrow="Channels" title="Promotions" description="Early bird, last minute, long stay and coupon discounts. Push them to every OTA in one click." />
      <PromotionsManager promotions={JSON.parse(JSON.stringify(list))} />
    </div>
  );
}
