'use client';

import { useTr } from '@/i18n/client';
import { tx } from '@/i18n/tx';
import { Children, cloneElement, forwardRef, isValidElement, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { AlertCircle, Minus, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FieldProps {
  label?: ReactNode;
  hint?: ReactNode;
  error?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
  htmlFor?: string;
}

export function Field({ label, hint, error, required, children, className, htmlFor }: FieldProps) {
  return (
    <div className={className}>
      {label && (
        <label className="label" htmlFor={htmlFor}>
          {tx(label)}
          {required && <span className="ml-0.5 text-brand-600">*</span>}
        </label>
      )}
      {children}
      {error ? (
        <p className="mt-1.5 flex items-center gap-1 text-xs text-rose-600">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {tx(error)}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-ink-500">{tx(hint)}</p>
      ) : null}
    </div>
  );
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean; leading?: ReactNode; trailing?: ReactNode };

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ className, invalid, leading, trailing, placeholder, ...props }, ref) {
  const tr = useTr();
  const input = (
    <input
      ref={ref}
      className={cn(
        'input',
        invalid && 'border-rose-400 focus:border-rose-500 focus:ring-rose-100',
        leading ? 'pl-9' : undefined,
        trailing ? 'pr-10' : undefined,
        className,
      )}
      aria-invalid={invalid || undefined}
      placeholder={placeholder ? tr(placeholder) : placeholder}
      {...props}
    />
  );
  if (!leading && !trailing) return input;
  return (
    <div className="relative">
      {leading && <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-ink-400">{leading}</span>}
      {input}
      {trailing && <span className="absolute inset-y-0 right-3 flex items-center text-ink-400">{trailing}</span>}
    </div>
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, placeholder, ...props },
  ref,
) {
  const tr = useTr();
  return <textarea ref={ref} className={cn('input min-h-[88px] resize-y', className)} placeholder={placeholder ? tr(placeholder) : placeholder} {...props} />;
});

/** Plain-text <option>s (and <optgroup> labels) are translated, so every dropdown follows the language switch. */
function translateOptions(children: ReactNode, tr: (text: string) => string): ReactNode {
  return Children.map(children, (child) => {
    if (!isValidElement<{ children?: ReactNode; label?: string }>(child)) return child;
    if (child.type === 'option' && typeof child.props.children === 'string') return cloneElement(child, undefined, tr(child.props.children));
    if (child.type === 'optgroup') return cloneElement(child, { label: child.props.label ? tr(child.props.label) : undefined }, translateOptions(child.props.children, tr));
    return child;
  });
}

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }>(function Select(
  { className, invalid, children, ...props },
  ref,
) {
  const tr = useTr();
  return (
    <select
      ref={ref}
      className={cn(
        'input cursor-pointer appearance-none bg-[length:16px] bg-[right_0.75rem_center] bg-no-repeat pr-9',
        "bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")]",
        invalid && 'border-rose-400 focus:border-rose-500 focus:ring-rose-100',
        className,
      )}
      {...props}
    >
      {translateOptions(children, tr)}
    </select>
  );
});

export function Checkbox({
  label,
  description,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode; description?: ReactNode }) {
  return (
    <label className={cn('flex cursor-pointer items-start gap-2.5 text-sm', className)}>
      <input
        type="checkbox"
        className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-ink-300 accent-brand-600"
        {...props}
      />
      <span>
        <span className="font-medium text-ink-800">{tx(label)}</span>
        {description && <span className="mt-0.5 block text-xs text-ink-500">{tx(description)}</span>}
      </span>
    </label>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  disabled,
  name,
  size = 'md',
}: {
  checked: boolean;
  onChange?: (value: boolean) => void;
  label?: string;
  disabled?: boolean;
  name?: string;
  size?: 'sm' | 'md';
}) {
  const tr = useTr();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label ? tr(label) : undefined}
      disabled={disabled}
      onClick={() => onChange?.(!checked)}
      className={cn(
        'relative inline-flex shrink-0 items-center rounded-full transition-colors duration-200 ease-smooth disabled:opacity-50',
        size === 'sm' ? 'h-5 w-9' : 'h-6 w-11',
        checked ? 'bg-brand-600' : 'bg-ink-300',
      )}
    >
      {name && <input type="hidden" name={name} value={checked ? 'on' : ''} />}
      <span
        className={cn(
          'inline-block rounded-full bg-white shadow transition-transform duration-200 ease-smooth',
          size === 'sm' ? 'h-4 w-4' : 'h-5 w-5',
          checked ? (size === 'sm' ? 'translate-x-4.5' : 'translate-x-5.5') : 'translate-x-0.5',
        )}
      />
    </button>
  );
}

/** − 2 + stepper for room counts, adults, quantities. */
export function Stepper({
  value,
  onChange,
  min = 0,
  max = 99,
  label,
  size = 'md',
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  label?: string;
  size?: 'sm' | 'md';
}) {
  const tr = useTr();
  const btn = cn(
    'grid place-items-center rounded-md text-ink-600 transition hover:bg-ink-100 active:scale-95 disabled:opacity-30',
    size === 'sm' ? 'h-7 w-7' : 'h-8 w-8',
  );
  return (
    <div className="inline-flex items-center gap-1 rounded-lg border border-ink-300 bg-white p-0.5" role="group" aria-label={label ? tr(label) : undefined}>
      <button type="button" className={btn} onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label={tr('Decrease')}>
        <Minus className="h-3.5 w-3.5" />
      </button>
      <span className={cn('num min-w-6 text-center font-semibold text-ink-900', size === 'sm' ? 'text-xs' : 'text-sm')}>{value}</span>
      <button type="button" className={btn} onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label={tr('Increase')}>
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/** Segmented control: a compact radio group. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  size = 'md',
  className,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: ReactNode }[];
  size?: 'sm' | 'md';
  className?: string;
}) {
  return (
    <div className={cn('inline-flex rounded-lg bg-ink-100 p-0.5', className)} role="radiogroup">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            'rounded-md font-medium transition-all duration-150 ease-smooth',
            size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-1.5 text-sm',
            value === option.value ? 'bg-white text-ink-900 shadow-card' : 'text-ink-500 hover:text-ink-800',
          )}
        >
          {tx(option.label)}
        </button>
      ))}
    </div>
  );
}
