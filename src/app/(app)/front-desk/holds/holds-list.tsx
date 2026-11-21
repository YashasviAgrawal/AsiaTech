'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { BadgeCheck, Clock, TimerReset, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDayShort, formatINR } from '@/lib/format';
import { cancelBookingAction, confirmHoldAction, extendHoldAction } from '@/server/actions/reservations';
import { Button } from '@/components/ui/button';
import { useRun } from '@/components/ui/use-run';

interface HoldRow {
  id: string;
  bookingNo: string;
  holdUntil: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  totalAmount: number;
  guestName: string;
  mobile: string | null;
}

function useNow(interval = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), interval);
    return () => window.clearInterval(t);
  }, [interval]);
  return now;
}

export function HoldsList({ rows, canEdit, canCancel }: { rows: HoldRow[]; canEdit: boolean; canCancel: boolean }) {
  const now = useNow();
  const { run, pending } = useRun();
  return (
    <ul className="divide-y divide-ink-100">
      {rows.map((row) => {
        const minutes = Math.round((new Date(row.holdUntil).getTime() - now) / 60000);
        const tone = minutes <= 60 ? 'bg-rose-50 text-rose-700 ring-rose-200' : minutes <= 180 ? 'bg-amber-50 text-amber-800 ring-amber-200' : 'bg-emerald-50 text-emerald-700 ring-emerald-200';
        return (
          <li key={row.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
            <span className={cn('flex w-24 flex-col items-center rounded-xl px-2 py-2 ring-1', tone)}>
              <Clock className="h-4 w-4" />
              <span className="num mt-1 text-sm font-bold">{minutes <= 0 ? 'Expiring' : minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} m`}</span>
              <span className="text-[10px] font-medium opacity-80">left</span>
            </span>
            <div className="min-w-0 flex-1">
              <Link href={`/front-desk/bookings/${row.id}`} className="font-semibold text-ink-900 hover:text-brand-600">
                {row.guestName}
              </Link>
              <p className="text-xs text-ink-500">
                <span className="font-mono">{row.bookingNo}</span> · {formatDayShort(row.checkIn)} → {formatDayShort(row.checkOut)} · {row.nights}N · {formatINR(row.totalAmount)}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {canEdit && (
                <>
                  <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => extendHoldAction(row.id, 2), { success: 'Hold extended by 2 hours' })}>
                    <TimerReset className="h-3.5 w-3.5" /> Extend 2 h
                  </Button>
                  <Button size="sm" disabled={pending} onClick={() => run(() => confirmHoldAction(row.id), { success: (d) => `${d.bookingNo} confirmed` })}>
                    <BadgeCheck className="h-3.5 w-3.5" /> Confirm
                  </Button>
                </>
              )}
              {canCancel && (
                <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => cancelBookingAction(row.id, 'Released by front desk'), { success: 'Hold released. Rooms are back on sale.' })}>
                  <XCircle className="h-3.5 w-3.5" /> Release
                </Button>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
