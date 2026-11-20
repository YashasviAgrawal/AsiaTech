import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Round to 2 decimals (paise) without floating-point drift. */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function sum(values: number[]): number {
  return round2(values.reduce((total, value) => total + value, 0));
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

/** Normalised key for duplicate detection: lower-case, letters and digits only. */
export function nameKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9ऀ-ॿ]/g, '');
}

/** Levenshtein distance; used to warn about near-duplicate guests ("Agrawal" vs "Agewal"). */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[b.length];
}

/** Indian mobile numbers: keep the last 10 digits. */
export function normaliseMobile(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, '');
  if (digits.length < 10) return digits || null;
  return digits.slice(-10);
}

export function maskIdNumber(value: string | null | undefined): string | null {
  if (!value) return null;
  const clean = value.replace(/\s/g, '');
  if (clean.length <= 4) return clean;
  return `${'X'.repeat(Math.max(0, clean.length - 4))}${clean.slice(-4)}`.replace(/(.{4})(?=.)/g, '$1-');
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
