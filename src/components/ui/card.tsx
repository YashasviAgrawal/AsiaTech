import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Card({ children, className, as: Tag = 'section' }: { children: ReactNode; className?: string; as?: 'section' | 'div' | 'article' }) {
  return <Tag className={cn('card', className)}>{children}</Tag>;
}

export function CardHeader({
  title,
  description,
  icon,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 px-5 py-4', className)}>
      <div className="flex min-w-0 items-center gap-2.5">
        {icon && <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600">{icon}</span>}
        <div className="min-w-0">
          <h2 className="truncate text-[15px] font-bold text-ink-900">{title}</h2>
          {description && <p className="mt-0.5 line-clamp-2 text-xs text-ink-500">{description}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mb-6 flex flex-wrap items-end justify-between gap-4', className)}>
      <div className="min-w-0">
        {eyebrow && <p className="mb-1 text-xs font-semibold tracking-wider text-brand-600 uppercase">{eyebrow}</p>}
        <h1 className="text-2xl font-bold tracking-tight text-ink-900 sm:text-[28px]">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-ink-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

const TILE_TONES = {
  rose: { chip: 'bg-brand-50 text-brand-600', value: 'text-ink-900', bar: 'from-brand-500 to-brand-400' },
  emerald: { chip: 'bg-emerald-50 text-emerald-600', value: 'text-ink-900', bar: 'from-emerald-500 to-emerald-400' },
  amber: { chip: 'bg-amber-50 text-amber-600', value: 'text-ink-900', bar: 'from-amber-500 to-amber-400' },
  sky: { chip: 'bg-sky-50 text-sky-600', value: 'text-ink-900', bar: 'from-sky-500 to-sky-400' },
  violet: { chip: 'bg-violet-50 text-violet-600', value: 'text-ink-900', bar: 'from-violet-500 to-violet-400' },
  teal: { chip: 'bg-teal-50 text-teal-600', value: 'text-ink-900', bar: 'from-teal-500 to-teal-400' },
  ink: { chip: 'bg-ink-100 text-ink-600', value: 'text-ink-900', bar: 'from-ink-500 to-ink-400' },
} as const;

export type TileTone = keyof typeof TILE_TONES;

/** Dashboard tile. Always a link (rule 4: every number is clickable). */
export function StatTile({
  href,
  label,
  value,
  hint,
  icon,
  tone = 'rose',
  className,
}: {
  href: string;
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: TileTone;
  className?: string;
}) {
  const t = TILE_TONES[tone];
  return (
    <Link
      href={href}
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-xl border border-ink-200 bg-white p-4 shadow-card transition-all duration-200 ease-smooth',
        'hover:-translate-y-0.5 hover:border-ink-300 hover:shadow-lift focus-visible:-translate-y-0.5',
        className,
      )}
    >
      <span className={cn('absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r opacity-0 transition-opacity group-hover:opacity-100', t.bar)} />
      <div className="flex items-start justify-between gap-2">
        {icon && <span className={cn('grid h-8 w-8 place-items-center rounded-lg', t.chip)}>{icon}</span>}
        <ArrowUpRight className="h-4 w-4 text-ink-300 transition-all duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-ink-600" />
      </div>
      <p className={cn('num mt-3 text-[26px] leading-none font-extrabold tracking-tight', t.value)}>{value}</p>
      <p className="mt-1.5 text-xs font-medium text-ink-500">{label}</p>
      {hint && <p className="mt-0.5 text-[11px] text-ink-400">{hint}</p>}
    </Link>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  compact,
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-xl border border-dashed border-ink-300 bg-white text-center',
        compact ? 'px-4 py-8' : 'px-6 py-14',
        className,
      )}
    >
      {icon && <div className="mb-3 grid h-12 w-12 place-items-center rounded-full bg-ink-50 text-ink-400">{icon}</div>}
      <p className="text-base font-semibold text-ink-800">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-ink-500">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton', className)} />;
}

export function Spinner({ className }: { className?: string }) {
  return <div className={cn('h-5 w-5 animate-spin rounded-full border-2 border-ink-200 border-t-brand-600', className)} role="status" aria-label="Loading" />;
}

export function DetailRow({ label, value, className }: { label: ReactNode; value: ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-start justify-between gap-4 py-2', className)}>
      <dt className="text-sm text-ink-500">{label}</dt>
      <dd className="text-right text-sm font-medium text-ink-900">{value}</dd>
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="kbd">{children}</kbd>;
}

export function Alert({
  tone = 'info',
  title,
  children,
  action,
  icon,
  className,
}: {
  tone?: 'info' | 'success' | 'warning' | 'error';
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  const styles = {
    info: 'bg-sky-50 text-sky-900 border-sky-200',
    success: 'bg-emerald-50 text-emerald-900 border-emerald-200',
    warning: 'bg-amber-50 text-amber-900 border-amber-200',
    error: 'bg-rose-50 text-rose-900 border-rose-200',
  }[tone];
  return (
    <div className={cn('flex items-start gap-3 rounded-xl border p-3.5 text-sm', styles, className)} role="alert">
      {icon && <span className="mt-0.5 shrink-0">{icon}</span>}
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cn(title ? 'mt-0.5' : undefined, 'leading-relaxed opacity-90')}>{children}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
