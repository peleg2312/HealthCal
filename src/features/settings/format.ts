import { formatShortDate, toISODate } from '@/lib/dates';

/** "just now", "12 min ago", "3 h ago", "yesterday", "Nov 2". */
export function timeAgo(iso: string | null | undefined, now: Date = new Date()): string | null {
  if (!iso) return null;
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return null;
  const mins = Math.round((now.getTime() - t.getTime()) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24 && toISODate(t) === toISODate(now)) return `${hours} h ago`;
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  if (toISODate(t) === toISODate(y)) return 'yesterday';
  return formatShortDate(toISODate(t));
}

/** "Mar 4, 2027" for projected dates. */
export function formatMonthDayYear(d: Date): string {
  return `${formatShortDate(toISODate(d))}, ${d.getFullYear()}`;
}
