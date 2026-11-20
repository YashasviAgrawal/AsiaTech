'use client';

import { useEffect, useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Loader2, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input, Select } from './fields';

export interface FilterField {
  key: string;
  type: 'search' | 'select' | 'date';
  placeholder?: string;
  label?: string;
  options?: { value: string; label: string }[];
  className?: string;
}

/** URL-driven filters: every change updates the query string, so filtered views can be bookmarked and shared. */
export function FilterBar({ fields, className }: { fields: FilterField[]; className?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState(params.get('q') ?? '');

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    startTransition(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if ((params.get('q') ?? '') !== search) set('q', search);
    }, 300);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const active = fields.some((f) => f.key !== 'q' && params.get(f.key)) || Boolean(params.get('q'));

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      {fields.map((field) => {
        if (field.type === 'search')
          return (
            <div key={field.key} className={cn('w-full sm:w-72', field.className)}>
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={field.placeholder}
                leading={pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                className="h-9"
              />
            </div>
          );
        if (field.type === 'select')
          return (
            <Select key={field.key} value={params.get(field.key) ?? ''} onChange={(e) => set(field.key, e.target.value)} className={cn('h-9 w-auto py-1.5 text-[13px]', field.className)} aria-label={field.label}>
              <option value="">{field.placeholder ?? 'All'}</option>
              {field.options?.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          );
        return (
          <label key={field.key} className="flex items-center gap-1.5 text-xs text-ink-500">
            {field.label}
            <Input type="date" value={params.get(field.key) ?? ''} onChange={(e) => set(field.key, e.target.value)} className="h-9 w-auto py-1.5 text-[13px]" />
          </label>
        );
      })}
      {active && (
        <button
          onClick={() => {
            setSearch('');
            startTransition(() => router.replace(pathname, { scroll: false }));
          }}
          className="inline-flex h-9 items-center gap-1 rounded-lg px-2.5 text-xs font-semibold text-ink-500 hover:bg-ink-100 hover:text-ink-800"
        >
          <X className="h-3.5 w-3.5" /> Clear
        </button>
      )}
    </div>
  );
}
