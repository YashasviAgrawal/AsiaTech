import Link from 'next/link';
import { Store } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Pick the outlet (restaurant, café, bar…) a screen works on. Hidden when the hotel has one outlet. */
export function OutletSwitcher({ outlets, current, basePath, allLabel, query = '' }: { outlets: { id: string; name: string }[]; current: string | null; basePath: string; allLabel?: string; query?: string }) {
  if (outlets.length < 2) return null;
  return (
    <nav aria-label="Outlet" className="inline-flex items-center gap-0.5 rounded-xl bg-ink-100 p-1">
      <Store className="mx-1.5 h-4 w-4 text-ink-400" />
      {allLabel && (
        <Link
          href={`${basePath}${query ? `?${query}` : ''}`}
          aria-current={current === null ? 'page' : undefined}
          className={cn('rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap transition', current === null ? 'bg-white text-ink-900 shadow-card' : 'text-ink-500 hover:text-ink-800')}
        >
          {allLabel}
        </Link>
      )}
      {outlets.map((o) => (
        <Link
          key={o.id}
          href={`${basePath}?outlet=${o.id}${query ? `&${query}` : ''}`}
          aria-current={o.id === current ? 'page' : undefined}
          className={cn(
            'rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap transition',
            o.id === current ? 'bg-white text-ink-900 shadow-card' : 'text-ink-500 hover:text-ink-800',
          )}
        >
          {o.name}
        </Link>
      ))}
    </nav>
  );
}
