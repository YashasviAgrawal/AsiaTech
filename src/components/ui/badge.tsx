import { tx } from '@/i18n/tx';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type Tone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'violet';

export const TONE_BADGE: Record<Tone, string> = {
  neutral: 'bg-ink-100 text-ink-700 ring-ink-200',
  brand: 'bg-brand-50 text-brand-700 ring-brand-200',
  success: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  warning: 'bg-amber-50 text-amber-700 ring-amber-200',
  danger: 'bg-rose-50 text-rose-700 ring-rose-200',
  info: 'bg-sky-50 text-sky-700 ring-sky-200',
  violet: 'bg-violet-50 text-violet-700 ring-violet-200',
};

export const TONE_DOT: Record<Tone, string> = {
  neutral: 'bg-ink-400',
  brand: 'bg-brand-500',
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  danger: 'bg-rose-500',
  info: 'bg-sky-500',
  violet: 'bg-violet-500',
};

export function Badge({ children, tone = 'neutral', dot, className }: { children: ReactNode; tone?: Tone; dot?: boolean; className?: string }) {
  return (
    <span className={cn('badge', TONE_BADGE[tone], className)}>
      {dot && <span className={cn('h-1.5 w-1.5 rounded-full', TONE_DOT[tone])} aria-hidden />}
      {tx(children)}
    </span>
  );
}

/** One mapping for every status in the app, so the same word always gets the same colour (rule 6). */
const STATUS: Record<string, { label: string; tone: Tone }> = {
  // bookings
  hold: { label: 'On hold', tone: 'warning' },
  confirmed: { label: 'Confirmed', tone: 'info' },
  checked_in: { label: 'Checked in', tone: 'success' },
  checked_out: { label: 'Checked out', tone: 'neutral' },
  cancelled: { label: 'Cancelled', tone: 'danger' },
  no_show: { label: 'No-show', tone: 'danger' },
  // booking rooms
  reserved: { label: 'Reserved', tone: 'info' },
  in_house: { label: 'In house', tone: 'success' },
  departed: { label: 'Departed', tone: 'neutral' },
  // housekeeping
  clean: { label: 'Clean', tone: 'success' },
  dirty: { label: 'Dirty', tone: 'warning' },
  inspected: { label: 'Inspected', tone: 'info' },
  out_of_order: { label: 'Out of order', tone: 'danger' },
  pending: { label: 'Pending', tone: 'warning' },
  in_progress: { label: 'In progress', tone: 'info' },
  done: { label: 'Done', tone: 'success' },
  verified: { label: 'Verified', tone: 'success' },
  open: { label: 'Open', tone: 'warning' },
  resolved: { label: 'Resolved', tone: 'success' },
  // payments / sync
  success: { label: 'Success', tone: 'success' },
  failed: { label: 'Failed', tone: 'danger' },
  queued: { label: 'Queued', tone: 'neutral' },
  processing: { label: 'Processing', tone: 'info' },
  expired: { label: 'Expired', tone: 'neutral' },
  refunded: { label: 'Refunded', tone: 'violet' },
  // POS
  billed: { label: 'Billed', tone: 'info' },
  settled: { label: 'Settled', tone: 'success' },
  void: { label: 'Void', tone: 'danger' },
  // channels
  connected: { label: 'Connected', tone: 'success' },
  disconnected: { label: 'Not connected', tone: 'neutral' },
  error: { label: 'Error', tone: 'danger' },
  parked_business: { label: 'Parked business', tone: 'danger' },
  closed: { label: 'Closed', tone: 'danger' },
  suspended: { label: 'Suspended', tone: 'danger' },
  // generic
  active: { label: 'Active', tone: 'success' },
  inactive: { label: 'Inactive', tone: 'neutral' },
  approved: { label: 'Approved', tone: 'success' },
  rejected: { label: 'Rejected', tone: 'danger' },
  issued: { label: 'Issued', tone: 'success' },
  live: { label: 'Live', tone: 'success' },
  setup: { label: 'Setting up', tone: 'warning' },
};

export function statusMeta(status: string): { label: string; tone: Tone } {
  return STATUS[status] ?? { label: status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()), tone: 'neutral' };
}

export function StatusBadge({ status, className, label }: { status: string; className?: string; label?: string }) {
  const meta = statusMeta(status);
  return (
    <Badge tone={meta.tone} dot className={className}>
      {tx(label ?? meta.label)}
    </Badge>
  );
}
