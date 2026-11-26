'use client';

import { TrendingDown, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTr } from '@/i18n/client';

/** The "+12% WoW" chip on a stat tile. Client-side so its tooltip follows the language switch. */
export function TrendChip({ delta, compare }: { delta: number; compare: string }) {
  const tr = useTr();
  const up = delta > 0;
  const down = delta < 0;
  const sign = up ? '+' : '';
  return (
    <p
      className={cn(
        'inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold whitespace-nowrap',
        up ? 'bg-emerald-50 text-emerald-700' : down ? 'bg-rose-50 text-rose-700' : 'bg-ink-100 text-ink-500',
      )}
      title={`${sign}${delta}% ${tr(compare)}`}
    >
      {up ? <TrendingUp className="h-3 w-3" /> : down ? <TrendingDown className="h-3 w-3" /> : null}
      {sign}
      {delta}%<span className="ml-0.5 font-medium opacity-70">{tr(compare.includes('month') ? 'MoM' : 'WoW')}</span>
    </p>
  );
}
