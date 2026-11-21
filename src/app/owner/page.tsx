import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import { ArrowRight, ArrowUpRight, BedDouble, CircleAlert, IndianRupee, LayoutDashboard, LogIn, LogOut, TrendingDown, TrendingUp, UtensilsCrossed, Wallet } from 'lucide-react';
import { requireContext } from '@/server/context';
import { getT } from '@/i18n/server';
import { getTileTrends, getTiles, getTodaysTasks, getTonight } from '@/server/services/dashboard';
import { creditReport, listPayments } from '@/server/services/money';
import { formatDayLong, formatINR, monthName, PAYMENT_MODE_LABELS } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Sparkline } from '@/components/ui/sparkline';
import { AnimatedNumber } from '@/components/ui/animated-number';
import { OccupancyRing } from '../(app)/dashboard/occupancy-ring';

export const metadata: Metadata = { title: 'Owner summary' };
export const viewport: Viewport = { themeColor: '#020617' };

function Delta({ value, compare }: { value: number | null; compare: string }) {
  if (value === null) return null;
  const up = value > 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold', value === 0 ? 'bg-white/10 text-white/70' : up ? 'bg-emerald-400/15 text-emerald-300' : 'bg-rose-400/15 text-rose-300')}>
      {value !== 0 && <Icon className="h-3 w-3" />}
      {value > 0 ? '+' : ''}
      {value}% {compare}
    </span>
  );
}

/**
 * The owner's phone screen (rule 7): how the hotel is doing today in one scroll — earnings, occupancy, the desk,
 * cash and money owed, the month so far, and anything that needs attention. Read-only; every block links to the app.
 */
export default async function OwnerPage() {
  const ctx = await requireContext('dashboard.view');
  const { tr } = await getT();
  const biz = ctx.property.businessDate;
  const canMoney = ctx.can('money.view');
  const [tiles, trends, tonight, tasks, paid, owed] = await Promise.all([
    getTiles(ctx),
    getTileTrends(ctx),
    getTonight(ctx),
    getTodaysTasks(ctx),
    canMoney ? listPayments(ctx.propertyId, { from: biz, to: biz }) : null,
    canMoney ? creditReport(ctx.propertyId, biz) : null,
  ]);

  const earnedToday = tiles.todaysEarning + tiles.posEarning;
  const earnSeries = trends.todaysEarning.series.map((v, i) => v + (trends.posEarning.series[i] ?? 0));
  const earnBefore = earnSeries.length > 7 ? earnSeries[0] : 0;
  const earnDelta = earnBefore ? Math.round(((earnedToday - earnBefore) / earnBefore) * 100) : null;
  const urgent = tasks.filter((t) => t.severity !== 'info').slice(0, 4);
  const month = tr(monthName(biz));

  return (
    <div className="min-h-screen bg-ink-100 pb-10">
      <div className="mx-auto max-w-md">
        {/* Hero */}
        <header className="relative overflow-hidden rounded-b-[28px] bg-ink-950 px-5 pt-6 pb-6 text-white shadow-lift">
          <div className="pointer-events-none absolute -top-24 -right-16 h-64 w-64 rounded-full bg-brand-600/35 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-28 -left-20 h-56 w-56 rounded-full bg-violet-600/25 blur-3xl" />
          <div className="relative flex items-center justify-between">
            <div>
              <p className="text-[11px] font-semibold tracking-widest text-white/50 uppercase">{tr(formatDayLong(biz))}</p>
              <h1 className="mt-0.5 text-lg font-bold">{ctx.property.name}</h1>
            </div>
            <Link href="/dashboard" className="grid h-10 w-10 place-items-center rounded-full bg-white/10 ring-1 ring-white/15 transition hover:bg-white/15" aria-label={tr('Open the full app')}>
              <LayoutDashboard className="h-5 w-5" />
            </Link>
          </div>
          <div className="relative mt-6">
            <p className="text-xs font-medium text-white/60">{tr('Earned today')}</p>
            <p className="num mt-1 text-[40px] leading-none font-extrabold tracking-tight">
              <AnimatedNumber value={earnedToday} format="inr" />
            </p>
            <div className="mt-3 flex items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2 text-xs text-white/70">
                <span className="inline-flex items-center gap-1">
                  <BedDouble className="h-3.5 w-3.5" /> {formatINR(tiles.todaysEarning)}
                </span>
                <span className="inline-flex items-center gap-1">
                  <UtensilsCrossed className="h-3.5 w-3.5" /> {formatINR(tiles.posEarning)}
                </span>
                <Delta value={earnDelta} compare="WoW" />
              </div>
              <Sparkline values={earnSeries} width={96} height={30} className="text-brand-400" />
            </div>
          </div>
        </header>

        <main className="space-y-4 px-4 pt-4">
          {/* Tonight */}
          <section className="rounded-3xl bg-white p-4 shadow-card ring-1 ring-ink-200/70">
            <div className="flex items-center gap-4">
              <OccupancyRing value={tonight.occupancy} size={88} />
              <div className="grid flex-1 grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-[11px] text-ink-500">{tr('Rooms sold')}</p>
                  <p className="num text-lg font-bold text-ink-900">
                    {tonight.booked}
                    <span className="text-sm font-medium text-ink-400">/{tonight.sellable}</span>
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-ink-500">{tr('Blocked')}</p>
                  <p className="num text-lg font-bold text-ink-900">{tonight.blocked}</p>
                </div>
                <div>
                  <p className="text-[11px] text-ink-500">ADR</p>
                  <p className="num font-bold text-ink-900">{formatINR(tonight.adr)}</p>
                </div>
                <div>
                  <p className="text-[11px] text-ink-500">RevPAR</p>
                  <p className="num font-bold text-ink-900">{formatINR(tonight.revpar)}</p>
                </div>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
              {tonight.types.map((t) => {
                const sold = Math.max(0, t.total - Math.max(t.available, 0));
                return (
                  <div key={t.id} className="min-w-0 flex-1" title={`${t.name}: ${Math.max(t.available, 0)} left`}>
                    <div className="h-1.5 overflow-hidden rounded-full bg-ink-100">
                      <div className="h-full rounded-full" style={{ width: `${t.total ? (sold / t.total) * 100 : 0}%`, backgroundColor: t.color }} />
                    </div>
                    <p className="mt-1 flex items-center justify-between gap-2 text-[11px] text-ink-500">
                      <span className="truncate">{t.name.replace(/ (Bed )?Room$/, '')}</span>
                      <span className="num shrink-0 font-semibold text-ink-700">{tr(`${Math.max(t.available, 0)} left`)}</span>
                    </p>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Desk */}
          <section className="grid grid-cols-3 gap-3">
            {[
              { href: '/front-desk/today?tab=arrivals', icon: LogIn, label: tr('Arrivals'), value: tiles.checkIns, sub: `${tiles.checkInsDone}/${tiles.checkIns}`, tone: 'text-violet-600 bg-violet-50' },
              { href: '/front-desk/today?tab=departures', icon: LogOut, label: tr('Departures'), value: tiles.checkOuts, sub: `${tiles.checkOutsDone}/${tiles.checkOuts}`, tone: 'text-amber-600 bg-amber-50' },
              { href: '/front-desk/bookings?created=today', icon: ArrowUpRight, label: tr('Booked today'), value: tiles.todaysBookings, sub: formatINR(tiles.todaysEarning, { compact: true }), tone: 'text-teal-600 bg-teal-50' },
            ].map((c) => (
              <Link key={c.href} href={c.href} className="rounded-2xl bg-white p-3 shadow-card ring-1 ring-ink-200/70 transition active:scale-[0.98]">
                <span className={cn('grid h-8 w-8 place-items-center rounded-xl', c.tone)}>
                  <c.icon className="h-4 w-4" />
                </span>
                <p className="num mt-2 text-2xl leading-none font-extrabold text-ink-900">{c.value}</p>
                <p className="mt-1 truncate text-[11px] text-ink-500">{c.label}</p>
                <p className="num text-[11px] font-semibold text-ink-400">{c.sub}</p>
              </Link>
            ))}
          </section>

          {/* Money */}
          {paid && owed && (
            <section className="rounded-3xl bg-white p-4 shadow-card ring-1 ring-ink-200/70">
              <div className="flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-sm font-bold text-ink-900">
                  <Wallet className="h-4 w-4 text-emerald-600" /> {tr('Collected today')}
                </h2>
                <Link href="/money/payments" className="text-xs font-semibold text-brand-600">
                  {tr('Details')} →
                </Link>
              </div>
              <p className="num mt-2 text-2xl font-extrabold text-ink-900">{formatINR(paid.total)}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {Object.entries(paid.byMode)
                  .filter(([, v]) => Math.abs(v) > 0.5)
                  .map(([mode, v]) => (
                    <span key={mode} className="rounded-full bg-ink-50 px-2.5 py-1 text-[11px] font-medium text-ink-600 ring-1 ring-ink-200/70">
                      {tr(PAYMENT_MODE_LABELS[mode] ?? mode)} <span className="num font-bold text-ink-900">{formatINR(v)}</span>
                    </span>
                  ))}
                {paid.total === 0 && <span className="text-xs text-ink-400">{tr('Nothing collected yet')}</span>}
              </div>
              <Link href="/money/credit" className="mt-4 flex items-center justify-between rounded-2xl bg-amber-50 px-3.5 py-3 ring-1 ring-amber-200/70">
                <span>
                  <span className="block text-[11px] font-medium text-amber-800">{tr('Money owed to the hotel')}</span>
                  <span className="num text-lg font-extrabold text-amber-900">{formatINR(owed.total)}</span>
                </span>
                <span className="flex items-center gap-1 text-xs font-semibold text-amber-800">
                  {owed.count} <ArrowRight className="h-3.5 w-3.5" />
                </span>
              </Link>
            </section>
          )}

          {/* Month */}
          <section className="rounded-3xl bg-white p-4 shadow-card ring-1 ring-ink-200/70">
            <h2 className="flex items-center gap-2 text-sm font-bold text-ink-900">
              <IndianRupee className="h-4 w-4 text-brand-600" /> {month} {tr('so far')}
            </h2>
            <dl className="mt-3 space-y-3">
              {[
                { label: tr('Rooms'), value: tiles.monthEarning, trend: trends.monthEarning },
                { label: tr('Restaurant'), value: tiles.monthPosEarning, trend: trends.monthPosEarning },
              ].map((row) => (
                <div key={row.label} className="flex items-center justify-between gap-3">
                  <dt className="text-sm text-ink-600">{row.label}</dt>
                  <dd className="flex items-center gap-3">
                    <Sparkline values={row.trend.series} width={64} height={22} className="text-brand-500" />
                    <span className="num w-28 text-right text-base font-bold text-ink-900">{formatINR(row.value)}</span>
                  </dd>
                </div>
              ))}
              <div className="flex items-center justify-between border-t border-ink-100 pt-3">
                <dt className="text-sm font-semibold text-ink-800">{tr('Total')}</dt>
                <dd className="num text-lg font-extrabold text-ink-900">{formatINR(tiles.monthEarning + tiles.monthPosEarning)}</dd>
              </div>
            </dl>
          </section>

          {/* Needs attention */}
          <section className="rounded-3xl bg-white p-4 shadow-card ring-1 ring-ink-200/70">
            <h2 className="flex items-center gap-2 text-sm font-bold text-ink-900">
              <CircleAlert className={cn('h-4 w-4', urgent.length ? 'text-rose-600' : 'text-emerald-600')} /> {tr('Needs attention')}
            </h2>
            {urgent.length === 0 ? (
              <p className="mt-2 text-sm text-ink-500">{tr('All clear')} ✓</p>
            ) : (
              <ul className="mt-2 divide-y divide-ink-100">
                {urgent.map((t) => (
                  <li key={t.id}>
                    <Link href={t.action.href} className="flex items-center gap-3 py-2.5">
                      <span className={cn('h-2 w-2 shrink-0 rounded-full', t.severity === 'danger' ? 'bg-rose-500' : 'bg-amber-500')} />
                      <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink-800">{tr(t.title)}</span>
                      <ArrowRight className="h-4 w-4 shrink-0 text-ink-300" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <Link href="/dashboard" className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-ink-900 text-sm font-semibold text-white shadow-card active:scale-[0.99]">
            <LayoutDashboard className="h-4 w-4" /> {tr('Open the full app')}
          </Link>
        </main>
      </div>
    </div>
  );
}
