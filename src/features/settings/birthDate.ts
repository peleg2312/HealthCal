/**
 * The birth date in Goals as three number fields (day, month and year, in the order the units'
 * region writes them, as onboarding asks), shown back in the app's date style: "May 12, 1994".
 * Stored as 'YYYY-MM-DD' as before; only the input and its words change. Pure: no React, no clock.
 */
import { formatShortDate } from '@/lib/dates';
import type { ISODate } from '@/types';

export interface BirthParts {
  day: number | null;
  month: number | null;
  year: number | null;
}

/** The three fields of a stored birth date; empty fields for anything that is not 'YYYY-MM-DD'. */
export function birthParts(iso: string | undefined): BirthParts {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? '');
  if (!m) return { day: null, month: null, year: null };
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

/** 'YYYY-MM-DD' from the three fields, or null while one is empty. Whether the date exists is the validator's. */
export function birthIso(p: BirthParts): ISODate | null {
  if (p.day === null || p.month === null || p.year === null) return null;
  const pad = (n: number, w: number) => String(Math.max(0, Math.round(n))).padStart(w, '0');
  return `${pad(p.year, 4)}-${pad(p.month, 2)}-${pad(p.day, 2)}`;
}

/** "May 12, 1994": a birth date in the app's date style. */
export function birthDateWords(iso: ISODate): string {
  return `${formatShortDate(iso)}, ${Number(iso.slice(0, 4))}`;
}

/** Said when a field is still empty. */
export const BIRTH_INCOMPLETE = 'Enter the day, month and year.';
