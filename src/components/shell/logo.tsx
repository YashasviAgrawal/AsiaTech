import { cn } from '@/lib/utils';

/** AsiaTech mark: a rose "A" monogram (echoing the client's crimson logo) with the Tixit brand gradient. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'relative grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand-500 via-brand-600 to-brand-800 shadow-lg shadow-brand-900/30',
        className,
      )}
      aria-hidden
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5 text-white" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 20 11.2 4.6a.9.9 0 0 1 1.6 0L20 20" />
        <path d="M7.5 14.5h9" />
      </svg>
      <span className="absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full border-2 border-ink-950 bg-emerald-400" />
    </span>
  );
}

export function Logo({ dark = true, subtitle = 'Hotel OS' }: { dark?: boolean; subtitle?: string }) {
  const name = process.env.NEXT_PUBLIC_APP_NAME ?? 'AsiaTech';
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark />
      <span className="leading-none">
        <span className={cn('block text-[17px] font-extrabold tracking-tight', dark ? 'text-white' : 'text-ink-900')}>{name}</span>
        <span className={cn('mt-1 block text-[10px] font-semibold tracking-[0.18em] uppercase', dark ? 'text-brand-300' : 'text-brand-600')}>
          {subtitle}
        </span>
      </span>
    </span>
  );
}
