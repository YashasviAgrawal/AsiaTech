import type { Metadata } from 'next';
import { and, eq, sql } from 'drizzle-orm';
import { ExternalLink, Globe, Code2 } from 'lucide-react';
import { db } from '@/db';
import { bookings } from '@/db/schema';
import { requireContext } from '@/server/context';
import { formatINR, monthStart } from '@/lib/format';
import { Card, CardHeader, PageHeader } from '@/components/ui/card';
import { buttonClasses } from '@/components/ui/button-styles';
import { tx } from '@/i18n/tx';

export const metadata: Metadata = { title: 'Booking Engine' };

export default async function BookingEnginePage() {
  const ctx = await requireContext('channels.manage');
  const [stats] = await db
    .select({ n: sql<number>`count(*)::int`, total: sql<number>`COALESCE(sum(${bookings.totalAmount}), 0)::float` })
    .from(bookings)
    .where(and(eq(bookings.propertyId, ctx.propertyId), eq(bookings.source, 'web'), sql`${bookings.createdAt} >= ${monthStart(ctx.property.businessDate)}::date`, sql`${bookings.status} <> 'cancelled'`));
  const url = `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/book/${ctx.property.slug}`;
  return (
    <div>
      <PageHeader
        eyebrow="Channels"
        title="Booking Engine"
        description="Your own commission-free booking page. Bookings arrive as WEB… with the same live availability as every OTA."
        actions={
          <a href={`/book/${ctx.property.slug}`} target="_blank" className={buttonClasses('primary')}>
            <ExternalLink className="h-4 w-4" /> {tx('Open booking page')}
          </a>
        }
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="p-5">
          <p className="text-xs font-semibold tracking-wide text-ink-400 uppercase">{tx('This month')}</p>
          <p className="num mt-1 text-3xl font-extrabold text-ink-900">{stats.n}</p>
          <p className="text-sm text-ink-500">{tx(`direct bookings · ${formatINR(stats.total)}`)}</p>
          <p className="mt-3 rounded-lg bg-emerald-50 p-2.5 text-xs text-emerald-800">{tx(`Saved about ${formatINR(stats.total * 0.18)} in OTA commission.`)}</p>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader icon={<Globe className="h-4 w-4" />} title="Your link" description="Share on Google Business, Instagram bio and WhatsApp" />
          <div className="p-5">
            <p className="rounded-lg bg-ink-50 p-3 font-mono text-sm break-all text-ink-800">{url}</p>
            <p className="mt-4 flex items-center gap-2 text-sm font-semibold text-ink-900">
              <Code2 className="h-4 w-4" /> {tx('Add a “Book now” button to your website')}
            </p>
            <pre className="mt-2 overflow-x-auto rounded-lg bg-ink-900 p-3 text-xs text-ink-100">{`<a href="${url}" style="background:${ctx.property.branding.primaryColor};color:#fff;padding:12px 20px;border-radius:10px;font-weight:700;text-decoration:none">Book now</a>`}</pre>
          </div>
        </Card>
      </div>
    </div>
  );
}
