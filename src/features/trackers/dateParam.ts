/**
 * The `?date=` a tracker screen was opened with, validated: a real calendar
 * day written as YYYY-MM-DD and no later than today. Anything else means today.
 */
import { formatShortDate, fromISODate, toISODate, weekdayShort } from '@/lib/dates';
import type { ISODate } from '@/types';

export function resolveDateParam(param: string | string[] | undefined, today: ISODate): ISODate {
  const raw = Array.isArray(param) ? param[0] : param;
  if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return today;
  // Round-trip so '2026-02-30' (which Date rolls into March) is rejected.
  if (toISODate(fromISODate(raw)) !== raw) return today;
  return raw > today ? today : raw;
}

/** "Wed, Nov 11": the header subtitle for a day that is not today. */
export function dayTitle(date: ISODate): string {
  return `${weekdayShort(date)}, ${formatShortDate(date)}`;
}
