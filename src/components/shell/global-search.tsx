'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { ArrowRight, BedDouble, CalendarDays, CalendarPlus, ConciergeBell, CornerDownLeft, Loader2, Search, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useT } from '@/i18n/client';
import { tx } from '@/i18n/tx';

export interface SearchResult {
  type: 'booking' | 'guest' | 'room' | 'action';
  id: string;
  title: string;
  subtitle?: string;
  href: string;
  meta?: string;
}

const QUICK_ACTIONS: SearchResult[] = [
  { type: 'action', id: 'new', title: 'Make a reservation', subtitle: 'Front Desk', href: '/front-desk/reservations/new' },
  { type: 'action', id: 'today', title: "Today's arrivals & departures", subtitle: 'Front Desk', href: '/front-desk/today' },
  { type: 'action', id: 'calendar', title: 'Availability calendar', subtitle: 'Rooms & Rates', href: '/rooms/calendar' },
  { type: 'action', id: 'chart', title: 'Room chart', subtitle: 'Rooms & Rates', href: '/rooms/chart' },
  { type: 'action', id: 'hk', title: 'Housekeeping board', subtitle: 'Housekeeping', href: '/housekeeping' },
  { type: 'action', id: 'pos', title: 'Restaurant POS', subtitle: 'Restaurant', href: '/restaurant' },
];

const ICONS = {
  booking: CalendarDays,
  guest: User,
  room: BedDouble,
  action: ArrowRight,
};

const GROUP_LABELS: Record<SearchResult['type'], string> = {
  action: 'Quick actions',
  booking: 'Bookings',
  guest: 'Guests',
  room: 'Rooms',
};

export function GlobalSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  // Mounted only while open, so every search starts empty.
  if (!open || typeof document === 'undefined') return null;
  return <SearchPanel onClose={onClose} />;
}

function SearchPanel({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { t } = useT();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: controller.signal });
        const data = (await response.json()) as { results: SearchResult[] };
        setResults(data.results);
        setActive(0);
      } catch {
        /* aborted */
      } finally {
        setLoading(false);
      }
    }, 180);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query]);

  const list = useMemo(() => {
    if (query.trim().length < 2) return QUICK_ACTIONS;
    const filteredActions = QUICK_ACTIONS.filter((a) => a.title.toLowerCase().includes(query.trim().toLowerCase()));
    return [...results, ...filteredActions];
  }, [query, results]);

  function go(result: SearchResult | undefined) {
    if (!result) return;
    onClose();
    router.push(result.href);
  }


  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-start justify-center p-3 pt-[10vh]" role="dialog" aria-modal="true" aria-label="Search">
      <div className="absolute inset-0 animate-fade-in bg-ink-950/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-xl animate-pop overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-lift">
        <div className="flex items-center gap-3 border-b border-ink-100 px-4">
          {loading ? <Loader2 className="h-5 w-5 animate-spin text-brand-600" /> : <Search className="h-5 w-5 text-ink-400" />}
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((i) => Math.min(list.length - 1, i + 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((i) => Math.max(0, i - 1));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                go(list[active]);
              } else if (e.key === 'Escape') {
                onClose();
              }
            }}
            placeholder={t('top.search')}
            className="h-14 flex-1 bg-transparent text-[15px] text-ink-900 outline-none placeholder:text-ink-400"
          />
          <kbd className="kbd">Esc</kbd>
        </div>

        <div className="scrollbar-thin max-h-[55vh] overflow-y-auto p-2">
          {query.trim().length >= 2 && !loading && list.length === 0 && (
            <div className="px-3 py-6 text-center">
              <p className="text-sm font-medium text-ink-700">{tx(`No booking, guest or room matches “${query}”`)}</p>
              <button
                onClick={() => go({ type: 'action', id: 'new', title: '', href: `/front-desk/reservations/new?guest=${encodeURIComponent(query)}` })}
                className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 hover:text-brand-700"
              >
                <CalendarPlus className="h-4 w-4" /> {tx(`Make a new reservation for “${query}”`)}
              </button>
            </div>
          )}
          {list.map((result, index) => {
            const Icon = result.type === 'action' && result.id === 'new' ? ConciergeBell : ICONS[result.type];
            const header = result.type !== list[index - 1]?.type ? GROUP_LABELS[result.type] : null;
            return (
              <div key={`${result.type}-${result.id}`}>
                {header && <p className="px-3 pt-2.5 pb-1 text-[11px] font-semibold tracking-wider text-ink-400 uppercase">{header}</p>}
                <button
                  onMouseEnter={() => setActive(index)}
                  onClick={() => go(result)}
                  className={cn('flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition', index === active ? 'bg-brand-50' : 'hover:bg-ink-50')}
                >
                  <span className={cn('grid h-8 w-8 shrink-0 place-items-center rounded-lg', index === active ? 'bg-brand-600 text-white' : 'bg-ink-100 text-ink-500')}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-ink-900">{result.title}</span>
                    {result.subtitle && <span className="block truncate text-xs text-ink-500">{result.subtitle}</span>}
                  </span>
                  {result.meta && <span className="shrink-0 text-xs font-medium text-ink-400">{result.meta}</span>}
                  {index === active && <CornerDownLeft className="h-4 w-4 shrink-0 text-brand-600" />}
                </button>
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-4 border-t border-ink-100 bg-ink-50/60 px-4 py-2 text-[11px] text-ink-500">
          <span className="flex items-center gap-1">
            <kbd className="kbd">↑</kbd>
            <kbd className="kbd">↓</kbd> move
          </span>
          <span className="flex items-center gap-1">
            <kbd className="kbd">↵</kbd> open
          </span>
          <span className="ml-auto">{tx('Search by booking ID, name, mobile or room number')}</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
