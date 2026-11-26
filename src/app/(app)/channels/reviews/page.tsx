import type { Metadata } from 'next';
import { requireContext } from '@/server/context';
import { listReviews } from '@/server/services/channels';
import { OTA_LABELS } from '@/lib/format';
import { PageHeader } from '@/components/ui/card';
import { FilterBar } from '@/components/ui/filter-bar';
import { ReviewsList } from './reviews-list';
import { tx } from '@/i18n/tx';

export const metadata: Metadata = { title: 'OTA Reviews' };

export default async function ReviewsPage({ searchParams }: { searchParams: Promise<{ channel?: string }> }) {
  const ctx = await requireContext('channels.manage');
  const { channel } = await searchParams;
  const data = await listReviews(ctx.propertyId, channel);
  return (
    <div>
      <PageHeader eyebrow="Channels" title="OTA Reviews" description="Every guest review from every OTA in one list. Reply to keep your rating up." />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-xl bg-ink-900 p-4 text-white shadow-card">
          <p className="text-[11px] font-medium tracking-wide text-ink-400 uppercase">{tx('Average rating')}</p>
          <p className="num mt-1 text-3xl font-extrabold">
            {data.average.toFixed(1)}
            <span className="text-base text-ink-400"> / 5</span>
          </p>
          <p className="text-xs text-ink-400">{tx(`${data.total} reviews`)}</p>
        </div>
        <div className="rounded-xl border border-ink-200 bg-white p-4 shadow-card">
          <p className="text-[11px] font-medium tracking-wide text-ink-400 uppercase">{tx('Waiting for a reply')}</p>
          <p className="num mt-1 text-3xl font-extrabold text-amber-600">{data.unreplied}</p>
        </div>
        {data.byChannel.slice(0, 2).map((c) => (
          <div key={c.channel} className="rounded-xl border border-ink-200 bg-white p-4 shadow-card">
            <p className="text-[11px] font-medium tracking-wide text-ink-400 uppercase">{OTA_LABELS[c.channel] ?? c.channel}</p>
            <p className="num mt-1 text-3xl font-extrabold text-ink-900">{c.average.toFixed(1)}</p>
            <p className="text-xs text-ink-500">{tx(`${c.count} reviews`)}</p>
          </div>
        ))}
      </div>
      <FilterBar className="mb-4" fields={[{ key: 'channel', type: 'select', placeholder: 'All OTAs', options: data.byChannel.map((c) => ({ value: c.channel, label: OTA_LABELS[c.channel] ?? c.channel })) }]} />
      <ReviewsList reviews={JSON.parse(JSON.stringify(data.rows))} />
    </div>
  );
}
