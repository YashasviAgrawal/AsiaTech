import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns';

/* ───────────────────────────── money ───────────────────────────── */

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const inrPaise = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const indianNumber = new Intl.NumberFormat('en-IN');

/** ₹3,97,474 (Indian grouping). Shows paise only when present or when asked. */
export function formatINR(value: number | null | undefined, options: { paise?: boolean; compact?: boolean } = {}): string {
  const amount = value ?? 0;
  if (options.compact) {
    const abs = Math.abs(amount);
    if (abs >= 1_00_00_000) return `₹${(amount / 1_00_00_000).toFixed(2)}Cr`;
    if (abs >= 1_00_000) return `₹${(amount / 1_00_000).toFixed(abs >= 10_00_000 ? 1 : 2)}L`;
    if (abs >= 1_000) return `₹${(amount / 1_000).toFixed(1)}K`;
  }
  const hasPaise = Math.round(amount * 100) % 100 !== 0;
  return (options.paise || hasPaise ? inrPaise : inr).format(amount);
}

export function formatNumber(value: number | null | undefined): string {
  return indianNumber.format(value ?? 0);
}

/* ───────────────────────────── dates ───────────────────────────── */
/*
 * Hotel dates (check-in, business date, inventory) are plain 'YYYY-MM-DD' strings with no time zone. Instants
 * (created_at) are shown in IST. India has no daylight saving, so a fixed +05:30 offset is exact.
 */

const IST_OFFSET_MINUTES = 330;

/** Today's calendar date in India, as 'YYYY-MM-DD'. */
export function todayIST(now: Date = new Date()): string {
  const ist = new Date(now.getTime() + IST_OFFSET_MINUTES * 60_000);
  return ist.toISOString().slice(0, 10);
}

/** Shift an instant so date-fns `format` prints IST wall-clock time on any server time zone. */
export function toIST(value: Date | string): Date {
  const date = typeof value === 'string' ? parseISO(value) : value;
  return new Date(date.getTime() + (IST_OFFSET_MINUTES + date.getTimezoneOffset()) * 60_000);
}

/** Parse a 'YYYY-MM-DD' hotel date at local midnight (safe for calendar arithmetic). */
export function parseDay(value: string): Date {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function toDay(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

export function addDay(value: string, days: number): string {
  return toDay(addDays(parseDay(value), days));
}

export function nightsBetween(checkIn: string, checkOut: string): number {
  return differenceInCalendarDays(parseDay(checkOut), parseDay(checkIn));
}

/** Every night of a stay: [checkIn, checkOut). */
export function stayDates(checkIn: string, checkOut: string): string[] {
  const nights = nightsBetween(checkIn, checkOut);
  return Array.from({ length: Math.max(0, nights) }, (_, index) => addDay(checkIn, index));
}

export function dateRange(start: string, days: number): string[] {
  return Array.from({ length: days }, (_, index) => addDay(start, index));
}

/** "19 Nov 2026" */
export function formatDay(value: string | null | undefined): string {
  if (!value) return '—';
  return format(parseDay(value), 'd MMM yyyy');
}

/** "Thu, 19 Nov" */
export function formatDayShort(value: string): string {
  return format(parseDay(value), 'EEE, d MMM');
}

/** "THURSDAY, 19th November" (dashboard header, like AsiaTech's Today's Task). */
export function formatDayLong(value: string): string {
  return format(parseDay(value), "EEEE, do MMMM");
}

export function weekdayShort(value: string): string {
  return format(parseDay(value), 'EEE');
}

export function isWeekend(value: string): boolean {
  const day = parseDay(value).getDay();
  return day === 0 || day === 6;
}

/** "19 Nov 2026, 12:50 PM" in IST. */
export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return '—';
  return format(toIST(value), 'd MMM yyyy, h:mm a');
}

export function formatTime(value: Date | string | null | undefined): string {
  if (!value) return '—';
  return format(toIST(value), 'h:mm a');
}

/** "5 min ago", "3 h ago", "2 d ago". */
export function timeAgo(value: Date | string, now: Date = new Date()): string {
  const date = typeof value === 'string' ? parseISO(value) : value;
  const seconds = Math.round((now.getTime() - date.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} d ago`;
  return formatDateTime(date);
}

/** Indian financial year for a date: '2026-27' for any date between 1 Apr 2026 and 31 Mar 2027. */
export function financialYear(value: string): string {
  const [y, m] = value.split('-').map(Number);
  const start = m >= 4 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

export function monthStart(value: string): string {
  return `${value.slice(0, 7)}-01`;
}

export function monthName(value: string): string {
  return format(parseDay(value), 'MMMM');
}

/* ───────────────────────────── labels ───────────────────────────── */

export const SOURCE_LABELS: Record<string, string> = {
  front_desk: 'Front Desk',
  walk_in: 'Walk-in',
  phone: 'Phone',
  ota: 'OTA',
  web: 'Booking Engine',
  agent: 'Travel Agent',
  corporate: 'Corporate',
};

export const OTA_LABELS: Record<string, string> = {
  makemytrip: 'MakeMyTrip',
  goibibo: 'Goibibo',
  booking_com: 'Booking.com',
  agoda: 'Agoda',
  expedia: 'Expedia',
  airbnb: 'Airbnb',
  cleartrip: 'Cleartrip',
  easemytrip: 'EaseMyTrip',
};

export function sourceLabel(source: string, channel?: string | null): string {
  if (source === 'ota' && channel) return OTA_LABELS[channel] ?? channel;
  return SOURCE_LABELS[source] ?? source;
}

export const MEAL_PLAN_LABELS: Record<string, string> = {
  EP: 'Room only (EP)',
  CP: 'With breakfast (CP)',
  MAP: 'Breakfast + 1 meal (MAP)',
  AP: 'All meals (AP)',
};

export function titleCase(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}
