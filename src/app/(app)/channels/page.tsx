import type { Metadata } from 'next';
import { requireContext } from '@/server/context';
import { listChannels } from '@/server/services/channels';
import { PageHeader } from '@/components/ui/card';
import { ChannelManager } from './channel-manager';

export const metadata: Metadata = { title: 'Channel Manager' };

export default async function ChannelsPage({ searchParams }: { searchParams: Promise<{ channel?: string }> }) {
  const ctx = await requireContext('channels.manage');
  const { channel } = await searchParams;
  const list = await listChannels(ctx.propertyId);
  return (
    <div>
      <PageHeader
        eyebrow="Channels"
        title="Channel Manager"
        description="Two-way sync with MakeMyTrip, Goibibo, Booking.com and more. Every availability or rate change is sent within seconds; OTA bookings arrive here and are checked against live inventory so nothing is sold twice."
      />
      <ChannelManager channels={JSON.parse(JSON.stringify(list))} focus={channel ?? null} />
    </div>
  );
}
