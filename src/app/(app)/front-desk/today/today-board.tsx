'use client';

import { useTr } from '@/i18n/client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Clock, Crown, Globe2, LogIn, LogOut, Search, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDayShort, formatINR, sourceLabel } from '@/lib/format';
import type { getTodayBoard } from '@/server/services/frontoffice';
import { Card, EmptyState } from '@/components/ui/card';
import { Tabs } from '@/components/ui/tabs';
import { StatusBadge } from '@/components/ui/badge';
import { Input } from '@/components/ui/fields';
import { buttonClasses } from '@/components/ui/button-styles';
import { tx } from '@/i18n/tx';

type Board = Awaited<ReturnType<typeof getTodayBoard>>;
type Row = Board['arrivals'][number];
type Tab = 'arrivals' | 'inhouse' | 'departures';

const HK_TONE: Record<string, string> = {
  clean: 'text-emerald-700 bg-emerald-50 ring-emerald-200',
  inspected: 'text-sky-700 bg-sky-50 ring-sky-200',
  dirty: 'text-amber-800 bg-amber-50 ring-amber-200',
  out_of_order: 'text-rose-700 bg-rose-50 ring-rose-200',
};

export function TodayBoard({ data, initialTab, businessDate, canCheckIn }: { data: Board; initialTab: Tab; businessDate: string; canCheckIn: boolean }) {
  const tr = useTr();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [q, setQ] = useState('');
  const rows = tab === 'arrivals' ? data.arrivals : tab === 'inhouse' ? data.inHouse : data.departures;
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) => [r.guestName, r.bookingNo, r.roomNumber, r.mobile].some((v) => v?.toLowerCase().includes(s)));
  }, [rows, q]);

  const pendingArrivals = data.arrivals.filter((r) => r.brStatus === 'reserved').length;
  const pendingDepartures = data.departures.filter((r) => r.brStatus === 'in_house').length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {[
          { key: 'arrivals' as const, label: 'Arrivals', value: data.arrivals.length, sub: `${pendingArrivals} to check in`, icon: LogIn, tone: 'text-violet-600 bg-violet-50' },
          { key: 'inhouse' as const, label: 'In house', value: data.inHouse.length, sub: 'rooms occupied', icon: Sparkles, tone: 'text-emerald-600 bg-emerald-50' },
          { key: 'departures' as const, label: 'Departures', value: data.departures.length, sub: `${pendingDepartures} to check out`, icon: LogOut, tone: 'text-amber-600 bg-amber-50' },
        ].map((s) => (
          <button
            key={s.key}
            onClick={() => setTab(s.key)}
            className={cn('card flex items-center gap-3 p-4 text-left transition hover:shadow-lift', tab === s.key && 'ring-2 ring-brand-500')}
          >
            <span className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-xl', s.tone)}>
              <s.icon className="h-5 w-5" />
            </span>
            <span>
              <span className="num block text-2xl leading-none font-extrabold text-ink-900">{s.value}</span>
              <span className="mt-1 block text-xs text-ink-500">
                {tr(s.label)} · {tr(s.sub)}
              </span>
            </span>
          </button>
        ))}
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-3">
          <Tabs<Tab>
            value={tab}
            onChange={setTab}
            className="border-b-0"
            items={[
              { value: 'arrivals', label: 'Arrivals', count: data.arrivals.length },
              { value: 'inhouse', label: 'In house', count: data.inHouse.length },
              { value: 'departures', label: 'Departures', count: data.departures.length },
            ]}
          />
          <div className="w-full pb-2 sm:w-64">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by name, room, ID" leading={<Search className="h-4 w-4" />} className="h-9" />
          </div>
        </div>
        {filtered.length === 0 ? (
          <div className="border-t border-ink-100 p-6">
            <EmptyState compact title={tab === 'arrivals' ? 'No arrivals left today' : tab === 'inhouse' ? 'Nobody in house' : 'No departures today'} />
          </div>
        ) : (
          <ul className="divide-y divide-ink-100 border-t border-ink-100">
            {filtered.map((row) => (
              <BoardRow key={row.brId} row={row} tab={tab} businessDate={businessDate} canCheckIn={canCheckIn} />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function BoardRow({ row, tab, businessDate, canCheckIn }: { row: Row; tab: Tab; businessDate: string; canCheckIn: boolean }) {
  const tr = useTr();
  const late = tab === 'arrivals' && row.brStatus === 'reserved' && row.checkIn < businessDate;
  const action =
    tab === 'arrivals' && row.brStatus === 'reserved'
      ? { label: 'Check in', href: `/front-desk/bookings/${row.bookingId}?do=checkin`, icon: LogIn }
      : (tab === 'departures' || tab === 'inhouse') && row.brStatus === 'in_house' && (tab === 'departures' || row.checkOut <= businessDate)
        ? { label: 'Check out', href: `/front-desk/bookings/${row.bookingId}?do=checkout`, icon: LogOut }
        : null;
  return (
    <li className="flex flex-wrap items-center gap-4 px-5 py-3.5 transition hover:bg-ink-50/60">
      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl text-sm font-extrabold text-white shadow-sm" style={{ backgroundColor: row.typeColor }}>
        {row.roomNumber ?? '—'}
      </span>
      <div className="min-w-0 flex-1">
        <Link href={`/front-desk/bookings/${row.bookingId}`} className="flex items-center gap-1.5 font-semibold text-ink-900 hover:text-brand-600">
          {row.guestName}
          {row.isVip && <Crown className="h-3.5 w-3.5 text-amber-500" />}
          {row.isForeign && <Globe2 className="h-3.5 w-3.5 text-sky-500" />}
        </Link>
        <p className="mt-0.5 text-xs text-ink-500">
          <span className="font-mono">{row.bookingNo}</span> · {row.typeName} · {row.adults}A{row.children ? ` ${row.children}C` : ''} · {sourceLabel(row.source, row.channel)}
        </p>
        <p className="mt-0.5 text-xs text-ink-400">
          {formatDayShort(row.checkIn)} → {formatDayShort(row.checkOut)}
          {row.arrivalTime && tab === 'arrivals' && (
            <span className="ml-2 inline-flex items-center gap-1">
              <Clock className="h-3 w-3" /> {row.arrivalTime}
            </span>
          )}
          {late && <span className="ml-2 font-semibold text-rose-600">{tr('Arrival date passed')}</span>}
        </p>
      </div>
      {row.roomHk && tab === 'arrivals' && row.brStatus === 'reserved' && <span className={cn('badge capitalize', HK_TONE[row.roomHk])}>{tx(row.roomHk.replaceAll('_', ' '))}</span>}
      <div className="w-28 text-right">
        <p className={cn('num text-sm font-bold', row.balance > 0.5 ? 'text-amber-700' : 'text-emerald-600')}>{row.balance > 0.5 ? formatINR(row.balance) : tr('Paid')}</p>
        <p className="text-[11px] text-ink-400">{tr('balance')}</p>
      </div>
      <div className="flex w-32 justify-end">
        {action && canCheckIn ? (
          <Link href={action.href} className={buttonClasses(action.label === 'Check in' ? 'primary' : 'secondary', 'sm')}>
            <action.icon className="h-3.5 w-3.5" /> {tr(action.label)}
          </Link>
        ) : (
          <span className="flex items-center gap-2">
            <StatusBadge status={row.brStatus} />
            <ArrowRight className="h-4 w-4 text-ink-300" />
          </span>
        )}
      </div>
    </li>
  );
}
