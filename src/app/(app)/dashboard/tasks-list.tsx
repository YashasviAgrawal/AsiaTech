'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AlertOctagon, ArrowRight, BedDouble, Clock, Globe, LogIn, LogOut, RefreshCw, Wallet } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TaskItem } from '@/server/services/dashboard';

const KIND_ICON = {
  checkin: LogIn,
  checkout: LogOut,
  assign: BedDouble,
  listing: Globe,
  sync: RefreshCw,
  balance: Wallet,
  hold: Clock,
  custom: AlertOctagon,
} as const;

const SEVERITY = {
  danger: { row: 'border-l-rose-500 bg-rose-50/60', icon: 'bg-rose-100 text-rose-600', button: 'bg-rose-600 text-white hover:bg-rose-700' },
  warning: { row: 'border-l-amber-500 bg-amber-50/40', icon: 'bg-amber-100 text-amber-700', button: 'bg-ink-900 text-white hover:bg-ink-800' },
  info: { row: 'border-l-transparent', icon: 'bg-ink-100 text-ink-600', button: 'bg-white text-ink-800 ring-1 ring-ink-300 hover:bg-ink-50' },
};

export function TasksList({ tasks }: { tasks: TaskItem[] }) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? tasks : tasks.slice(0, 7);
  return (
    <div>
      <ul className="divide-y divide-ink-100">
        {visible.map((task) => {
          const Icon = KIND_ICON[task.kind];
          const s = SEVERITY[task.severity];
          return (
            <li key={task.id} className={cn('flex items-center gap-3 border-l-[3px] px-5 py-3 transition hover:bg-ink-50/60', s.row)}>
              <span className={cn('grid h-8 w-8 shrink-0 place-items-center rounded-lg', s.icon)}>
                <Icon className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className={cn('truncate text-[13px] font-semibold', task.severity === 'danger' ? 'text-rose-800' : 'text-ink-800')}>{task.title}</p>
                {task.detail && <p className="mt-0.5 truncate text-xs text-ink-500">{task.detail}</p>}
              </div>
              <Link
                href={task.action.href}
                className={cn('inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold shadow-sm transition active:scale-[0.97]', s.button)}
              >
                {task.action.label}
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </li>
          );
        })}
      </ul>
      {tasks.length > 7 && (
        <button onClick={() => setShowAll((v) => !v)} className="w-full border-t border-ink-100 py-2.5 text-xs font-semibold text-brand-600 transition hover:bg-ink-50">
          {showAll ? 'Show fewer' : `Show all ${tasks.length} tasks`}
        </button>
      )}
    </div>
  );
}
