import { cn } from '@/lib/utils';

/* Shared by <Button>, <ButtonLink> and plain <a> tags in server components. */
export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'success' | 'soft';
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg' | 'icon' | 'icon-sm';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800 shadow-sm shadow-brand-600/20',
  secondary: 'bg-ink-900 text-white hover:bg-ink-800 active:bg-ink-950 shadow-sm',
  outline: 'border border-ink-300 bg-white text-ink-800 hover:bg-ink-50 hover:border-ink-400 active:bg-ink-100',
  ghost: 'text-ink-700 hover:bg-ink-100 active:bg-ink-200',
  danger: 'bg-rose-600 text-white hover:bg-rose-700 active:bg-rose-800 shadow-sm',
  success: 'bg-emerald-600 text-white hover:bg-emerald-700 active:bg-emerald-800 shadow-sm',
  soft: 'bg-brand-50 text-brand-700 hover:bg-brand-100 active:bg-brand-200',
};

const SIZES: Record<ButtonSize, string> = {
  xs: 'h-7 px-2.5 text-xs gap-1 rounded-md',
  sm: 'h-8 px-3 text-xs gap-1.5 rounded-lg',
  md: 'h-10 px-4 text-sm gap-2 rounded-lg',
  lg: 'h-12 px-6 text-base gap-2 rounded-xl',
  icon: 'h-9 w-9 rounded-lg',
  'icon-sm': 'h-7 w-7 rounded-md',
};

const BASE =
  'inline-flex items-center justify-center font-medium whitespace-nowrap select-none ' +
  // A brief scale-down on press gives tactile confirmation, especially on touch screens.
  'transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-smooth ' +
  'active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 disabled:active:scale-100';

export function buttonClasses(variant: ButtonVariant = 'primary', size: ButtonSize = 'md', className?: string) {
  return cn(BASE, VARIANTS[variant], SIZES[size], className);
}

