'use client';

import { tx } from '@/i18n/tx';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface TabItem<T extends string = string> {
  value: T;
  label: ReactNode;
  count?: number;
  href?: string;
}

/** Underline tabs. Pass `href` on items for URL-driven tabs, or `onChange` for local state. */
export function Tabs<T extends string>({
  items,
  value,
  onChange,
  className,
}: {
  items: TabItem<T>[];
  value: T;
  onChange?: (value: T) => void;
  className?: string;
}) {
  return (
    <div className={cn('scrollbar-none -mb-px flex gap-1 overflow-x-auto border-b border-ink-200', className)} role="tablist">
      {items.map((item) => {
        const active = item.value === value;
        const inner = (
          <>
            {tx(item.label)}
            {item.count !== undefined && (
              <span
                className={cn(
                  'num ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold',
                  active ? 'bg-brand-600 text-white' : 'bg-ink-100 text-ink-600',
                )}
              >
                {item.count}
              </span>
            )}
          </>
        );
        const classes = cn(
          'relative inline-flex shrink-0 items-center border-b-2 px-3 py-2.5 text-sm font-medium transition',
          active ? 'border-brand-600 text-ink-900' : 'border-transparent text-ink-500 hover:text-ink-800',
        );
        return item.href ? (
          <Link key={item.value} href={item.href} role="tab" aria-selected={active} className={classes} scroll={false}>
            {inner}
          </Link>
        ) : (
          <button key={item.value} type="button" role="tab" aria-selected={active} onClick={() => onChange?.(item.value)} className={classes}>
            {inner}
          </button>
        );
      })}
    </div>
  );
}
