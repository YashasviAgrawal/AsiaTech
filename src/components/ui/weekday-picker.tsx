'use client';

import { cn } from '@/lib/utils';
import { tx } from '@/i18n/tx';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function WeekdayPicker({ value, onChange }: { value: number[]; onChange: (value: number[]) => void }) {
  const toggle = (day: number) => onChange(value.includes(day) ? value.filter((d) => d !== day) : [...value, day].sort());
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {[1, 2, 3, 4, 5, 6, 0].map((day) => (
        <button
          key={day}
          type="button"
          onClick={() => toggle(day)}
          aria-pressed={value.includes(day)}
          className={cn(
            'h-8 w-11 rounded-lg text-xs font-semibold ring-1 transition active:scale-95',
            value.includes(day) ? 'bg-ink-900 text-white ring-ink-900' : 'bg-white text-ink-500 ring-ink-300 hover:text-ink-800',
          )}
        >
          {DAYS[day]}
        </button>
      ))}
      <span className="mx-1 h-5 w-px bg-ink-200" />
      <button type="button" onClick={() => onChange([0, 1, 2, 3, 4, 5, 6])} className="text-xs font-medium text-brand-600 hover:text-brand-700">
        {tx('All')}
      </button>
      <button type="button" onClick={() => onChange([5, 6])} className="text-xs font-medium text-brand-600 hover:text-brand-700">
        {tx('Fri–Sat')}
      </button>
      <button type="button" onClick={() => onChange([0, 1, 2, 3, 4])} className="text-xs font-medium text-brand-600 hover:text-brand-700">
        {tx('Sun–Thu')}
      </button>
    </div>
  );
}
