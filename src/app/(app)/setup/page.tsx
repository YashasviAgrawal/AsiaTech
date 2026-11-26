import type { Metadata } from 'next';
import Link from 'next/link';
import { and, eq, sql } from 'drizzle-orm';
import { ArrowRight, BedDouble, Building2, CheckCircle2, Globe, IndianRupee, Rocket } from 'lucide-react';
import { db } from '@/db';
import { channels, ratePlans, rooms, roomTypes } from '@/db/schema';
import { requireContext } from '@/server/context';
import { cn } from '@/lib/utils';
import { PageHeader } from '@/components/ui/card';
import { GoLiveButton } from './go-live';
import { tx } from '@/i18n/tx';

export const metadata: Metadata = { title: 'Setup Wizard' };

export default async function SetupPage() {
  const ctx = await requireContext('settings.manage');
  const pid = ctx.propertyId;
  const [[types], [roomCount], [plans], [connected]] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(roomTypes).where(eq(roomTypes.propertyId, pid)),
    db.select({ n: sql<number>`count(*)::int` }).from(rooms).where(and(eq(rooms.propertyId, pid), eq(rooms.isActive, true))),
    db.select({ n: sql<number>`count(*)::int` }).from(ratePlans).where(and(eq(ratePlans.propertyId, pid), eq(ratePlans.isActive, true))),
    db.select({ n: sql<number>`count(*)::int` }).from(channels).where(and(eq(channels.propertyId, pid), eq(channels.status, 'connected'))),
  ]);
  const p = ctx.property;
  const steps = [
    { title: 'Hotel details', done: Boolean(p.gstin && p.city && p.stateCode), detail: p.gstin ? `GSTIN ${p.gstin} · ${p.city}` : 'Name, GSTIN, address, check-in time', href: '/settings/hotel', icon: Building2 },
    { title: 'Rooms', done: types.n > 0 && roomCount.n > 0, detail: types.n ? `${types.n} room types · ${roomCount.n} rooms` : 'Room types and room numbers', href: '/rooms/setup', icon: BedDouble },
    { title: 'Rates', done: plans.n > 0, detail: plans.n ? `${plans.n} rate plans (EP / CP / MAP / AP)` : 'Prices and meal plans', href: '/rooms/setup', icon: IndianRupee },
    { title: 'OTA connection', done: connected.n > 0, detail: connected.n ? `${connected.n} channel(s) connected` : 'MakeMyTrip, Goibibo, Booking.com…', href: '/channels', icon: Globe },
  ];
  const ready = steps.every((s) => s.done);
  const doneCount = steps.filter((s) => s.done).length + (p.status === 'live' ? 1 : 0);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader eyebrow="Guided setup" title={p.status === 'live' ? `${p.name} is live` : `Let's get ${p.name} live`} description="Five short steps. You can come back any time." />
      <div className="mb-6">
        <div className="flex justify-between text-xs font-medium text-ink-500">
          <span>{doneCount} of 5 done</span>
          <span>{Math.round((doneCount / 5) * 100)}%</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-ink-100">
          <div className="h-full rounded-full bg-gradient-to-r from-brand-500 to-brand-600 transition-all" style={{ width: `${(doneCount / 5) * 100}%` }} />
        </div>
      </div>
      <ol className="space-y-3">
        {steps.map((step, i) => (
          <li key={step.title}>
            <Link href={step.href} className={cn('card group flex items-center gap-4 p-5 transition hover:shadow-lift', step.done && 'border-emerald-200')}>
              <span className={cn('grid h-11 w-11 shrink-0 place-items-center rounded-xl', step.done ? 'bg-emerald-500 text-white' : 'bg-ink-100 text-ink-500')}>
                {step.done ? <CheckCircle2 className="h-5 w-5" /> : <step.icon className="h-5 w-5" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-semibold text-ink-400">{tx(`Step ${i + 1}`)}</span>
                <span className="block font-bold text-ink-900">{tx(step.title)}</span>
                <span className="block text-sm text-ink-500">{tx(step.detail)}</span>
              </span>
              <ArrowRight className="h-5 w-5 text-ink-300 transition group-hover:translate-x-0.5 group-hover:text-brand-600" />
            </Link>
          </li>
        ))}
        <li className={cn('card flex items-center gap-4 p-5', p.status === 'live' ? 'border-emerald-200 bg-emerald-50/50' : ready ? 'border-brand-200 bg-brand-50/40' : 'opacity-70')}>
          <span className={cn('grid h-11 w-11 shrink-0 place-items-center rounded-xl', p.status === 'live' ? 'bg-emerald-500 text-white' : 'bg-brand-600 text-white')}>
            <Rocket className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-semibold text-ink-400">{tx('Step 5')}</span>
            <span className="block font-bold text-ink-900">{tx('Go live')}</span>
            <span className="block text-sm text-ink-500">{p.status === 'live' ? 'Taking bookings on every channel.' : ready ? 'Everything is ready. Start selling.' : 'Finish the steps above first.'}</span>
          </span>
          {p.status !== 'live' && <GoLiveButton disabled={!ready} />}
        </li>
      </ol>
    </div>
  );
}
