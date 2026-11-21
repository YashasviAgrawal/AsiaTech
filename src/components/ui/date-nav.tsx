'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { addDay, formatDay } from '@/lib/format';
import { cn } from '@/lib/utils';

/** Pre / date search / Next / Today, as in AsiaTech's calendar ("Search 19-11-2026"), driven by ?start=. */
export function DateNav({ start, days, today, className }: { start: string; days: number; today: string; className?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const href = (value: string) => {
    const next = new URLSearchParams(params.toString());
    next.set('start', value);
    return `${pathname}?${next.toString()}`;
  };
  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      <div className="inline-flex items-center rounded-lg border border-ink-300 bg-white shadow-sm">
        <Link href={href(addDay(start, -days))} className="grid h-9 w-9 place-items-center rounded-l-lg text-ink-600 transition hover:bg-ink-50" aria-label="Previous dates" scroll={false}>
          <ChevronLeft className="h-4 w-4" />
        </Link>
        <label className="relative flex h-9 items-center gap-2 border-x border-ink-200 px-3 text-sm font-medium text-ink-800">
          <CalendarDays className="h-4 w-4 text-ink-400" />
          <span className="num">{formatDay(start)}</span>
          <span className="text-ink-400">→</span>
          <span className="num">{formatDay(addDay(start, days - 1))}</span>
          <input
            type="date"
            value={start}
            onChange={(e) => e.target.value && router.push(href(e.target.value), { scroll: false })}
            className="absolute inset-0 cursor-pointer opacity-0"
            aria-label="Jump to date"
          />
        </label>
        <Link href={href(addDay(start, days))} className="grid h-9 w-9 place-items-center rounded-r-lg text-ink-600 transition hover:bg-ink-50" aria-label="Next dates" scroll={false}>
          <ChevronRight className="h-4 w-4" />
        </Link>
      </div>
      {start !== today && (
        <Link href={href(today)} className="h-9 rounded-lg px-3 text-sm leading-9 font-medium text-brand-600 transition hover:bg-brand-50" scroll={false}>
          Today
        </Link>
      )}
    </div>
  );
}
