import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowRightLeft,
  BedDouble,
  CalendarCheck2,
  CalendarPlus,
  CircleCheckBig,
  ClipboardList,
  DoorOpen,
  Footprints,
  IndianRupee,
  LogIn,
  LogOut,
  Megaphone,
  Receipt,
  ShoppingBag,
  UtensilsCrossed,
  Wallet,
} from 'lucide-react';
import { requireContext } from '@/server/context';
import { getT } from '@/i18n/server';
import { getSystemUpdates, getTiles, getTodaysBookings, getTodaysTasks, getTonight } from '@/server/services/dashboard';
import { releaseExpiredHolds } from '@/server/services/bookings';
import { actorFromContext } from '@/server/services/actor';
import { formatDayLong, formatINR, formatNumber, monthName, timeAgo, todayIST, toIST } from '@/lib/format';
import { Card, CardHeader, PageHeader, StatTile } from '@/components/ui/card';
import { ButtonLink } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { TasksList } from './tasks-list';
import { BookingsTabs } from './bookings-tabs';
import { OccupancyRing } from './occupancy-ring';

export const metadata: Metadata = { title: 'Dashboard' };

export default async function DashboardPage() {
  const ctx = await requireContext('dashboard.view');
  await releaseExpiredHolds(actorFromContext(ctx));
  const { t } = await getT();

  const [tiles, tasks, updates, todays, tonight] = await Promise.all([
    getTiles(ctx),
    getTodaysTasks(ctx),
    getSystemUpdates(),
    getTodaysBookings(ctx),
    getTonight(ctx),
  ]);

  const hour = toIST(new Date()).getHours();
  const greeting = hour < 12 ? t('dash.greeting.morning') : hour < 17 ? t('dash.greeting.afternoon') : t('dash.greeting.evening');
  const month = monthName(todayIST());
  const biz = ctx.property.businessDate;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={formatDayLong(biz)}
        title={`${greeting}, ${ctx.user.name.split(' ')[0]}`}
        description={`Here is ${ctx.property.name} today. ${tiles.checkIns - tiles.checkInsDone} arrivals and ${tiles.checkOuts - tiles.checkOutsDone} departures still to handle.`}
        actions={
          <>
            {ctx.can('bookings.create') && (
              <ButtonLink href="/front-desk/reservations/new?walkin=1" variant="outline">
                <Footprints className="h-4 w-4" /> {t('dash.walkIn')}
              </ButtonLink>
            )}
            {ctx.can('bookings.create') && (
              <ButtonLink href="/front-desk/reservations/new">
                <CalendarPlus className="h-4 w-4" /> {t('dash.newBooking')}
              </ButtonLink>
            )}
          </>
        }
      />

      {/* Front desk tiles (AsiaTech row 1) */}
      <section aria-label="Front desk numbers" className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <StatTile href="/front-desk/bookings?created=today" label={t('dash.todaysBookings')} value={formatNumber(tiles.todaysBookings)} icon={<CalendarCheck2 className="h-4 w-4" />} tone="teal" />
        <StatTile href="/front-desk/bookings?created=today" label={t('dash.todaysEarning')} value={formatINR(tiles.todaysEarning)} icon={<IndianRupee className="h-4 w-4" />} tone="rose" />
        <StatTile
          href="/front-desk/today?tab=departures"
          label={t('dash.todaysCheckOut')}
          value={formatNumber(tiles.checkOuts)}
          hint={`${tiles.checkOutsDone} done · ${tiles.checkOuts - tiles.checkOutsDone} pending`}
          icon={<LogOut className="h-4 w-4" />}
          tone="amber"
        />
        <StatTile
          href="/front-desk/today?tab=arrivals"
          label={t('dash.todaysCheckIn')}
          value={formatNumber(tiles.checkIns)}
          hint={`${tiles.checkInsDone} done · ${tiles.checkIns - tiles.checkInsDone} pending`}
          icon={<LogIn className="h-4 w-4" />}
          tone="violet"
        />
        <StatTile href="/front-desk/bookings?created=month" label={t('dash.monthBookings', { month })} value={formatNumber(tiles.monthBookings)} icon={<ClipboardList className="h-4 w-4" />} tone="sky" />
        <StatTile href="/front-desk/bookings?created=month" label={t('dash.monthEarning', { month })} value={formatINR(tiles.monthEarning)} icon={<Wallet className="h-4 w-4" />} tone="emerald" />
      </section>

      {/* Restaurant tiles (AsiaTech row 2) */}
      <section aria-label="Restaurant numbers" className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <StatTile href="/restaurant/orders?date=today" label={t('dash.posOrders')} value={formatNumber(tiles.posOrders)} icon={<UtensilsCrossed className="h-4 w-4" />} tone="teal" />
        <StatTile href="/restaurant/orders?date=today" label={t('dash.posEarning')} value={formatINR(tiles.posEarning)} icon={<Receipt className="h-4 w-4" />} tone="rose" />
        <StatTile href="/restaurant/orders?date=today&mode=room_transfer" label={t('dash.posRoomTransfer')} value={formatNumber(tiles.posRoomTransfer)} icon={<ArrowRightLeft className="h-4 w-4" />} tone="amber" />
        <StatTile href="/restaurant/orders?date=today&type=in_house" label={t('dash.posInHouse')} value={formatNumber(tiles.posInHouse)} icon={<DoorOpen className="h-4 w-4" />} tone="violet" />
        <StatTile href="/restaurant/orders?date=month" label={t('dash.monthPosOrders', { month })} value={formatNumber(tiles.monthPosOrders)} icon={<ShoppingBag className="h-4 w-4" />} tone="sky" />
        <StatTile href="/restaurant/orders?date=month" label={t('dash.monthPosEarning', { month })} value={formatINR(tiles.monthPosEarning)} icon={<IndianRupee className="h-4 w-4" />} tone="emerald" />
      </section>

      <div className="grid gap-6 xl:grid-cols-3">
        {/* Today's Task */}
        <Card className="xl:col-span-2">
          <CardHeader
            icon={<ClipboardList className="h-4 w-4" />}
            title={
              <span className="flex items-center gap-2">
                {t('dash.todaysTask')}
                <span className="font-medium text-ink-400">· {formatDayLong(biz)}</span>
              </span>
            }
            description="Created automatically. Every item has its own button."
            action={
              tasks.length > 0 ? (
                <Badge tone={tasks.some((x) => x.severity === 'danger') ? 'danger' : 'warning'} dot>
                  {tasks.length} open
                </Badge>
              ) : (
                <Badge tone="success" dot>
                  All clear
                </Badge>
              )
            }
          />
          {tasks.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
              <span className="grid h-12 w-12 place-items-center rounded-full bg-emerald-50 text-emerald-600">
                <CircleCheckBig className="h-6 w-6" />
              </span>
              <p className="text-sm font-medium text-ink-700">{t('dash.allClear')}</p>
            </div>
          ) : (
            <TasksList tasks={tasks} />
          )}
        </Card>

        <div className="space-y-6">
          {/* Tonight */}
          <Card>
            <CardHeader icon={<BedDouble className="h-4 w-4" />} title="Tonight" description="Occupancy for the business date" action={<Link href="/rooms/calendar" className="text-xs font-semibold text-brand-600 hover:text-brand-700">Calendar →</Link>} />
            <div className="flex items-center gap-5 px-5 py-4">
              <OccupancyRing value={tonight.occupancy} />
              <dl className="grid flex-1 grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <div>
                  <dt className="text-xs text-ink-500">Rooms sold</dt>
                  <dd className="num font-bold text-ink-900">
                    {tonight.booked} <span className="font-normal text-ink-400">/ {tonight.sellable}</span>
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-ink-500">Blocked</dt>
                  <dd className="num font-bold text-ink-900">{tonight.blocked}</dd>
                </div>
                <div>
                  <dt className="text-xs text-ink-500">ADR</dt>
                  <dd className="num font-bold text-ink-900">{formatINR(tonight.adr)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-ink-500">RevPAR</dt>
                  <dd className="num font-bold text-ink-900">{formatINR(tonight.revpar)}</dd>
                </div>
              </dl>
            </div>
            <ul className="space-y-2 border-t border-ink-100 px-5 py-4">
              {tonight.types.map((type) => {
                const tone = type.available <= 0 ? 'bg-rose-500' : type.available < type.total ? 'bg-amber-500' : 'bg-emerald-500';
                return (
                  <li key={type.id} className="flex items-center gap-3 text-sm">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: type.color }} />
                    <span className="min-w-0 flex-1 truncate text-ink-700">{type.name}</span>
                    <span className="flex items-center gap-1.5">
                      <span className={`h-1.5 w-1.5 rounded-full ${tone}`} />
                      <span className="num text-xs font-semibold text-ink-900">{Math.max(type.available, 0)} left</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </Card>

          {/* System Update */}
          <Card>
            <CardHeader icon={<Megaphone className="h-4 w-4" />} title={t('dash.systemUpdate')} description="What's new in AsiaTech" />
            <ol className="scrollbar-thin max-h-72 space-y-1 overflow-y-auto p-3">
              {updates.map((u) => (
                <li key={u.id} className="rounded-lg p-2.5 transition hover:bg-ink-50">
                  <div className="flex items-center gap-2">
                    {u.tag && <Badge tone="brand">{u.tag}</Badge>}
                    <span className="text-[11px] text-ink-400">{timeAgo(u.publishedAt)}</span>
                  </div>
                  <p className="mt-1.5 text-sm font-semibold text-ink-900">{u.title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-ink-500">{u.body}</p>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>

      <BookingsTabs createdToday={todays.createdToday} arriving={todays.arriving} inHouse={todays.inHouse} canAssign={ctx.can('frontdesk.checkin')} />
    </div>
  );
}
