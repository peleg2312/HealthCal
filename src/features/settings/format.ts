import { formatShortDate, toISODate } from '@/lib/dates';
import { formatNumber, weightUnit, weightValue } from '@/lib/units';
import type { UnitSystem } from '@/types';

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

/**
 * An email address that may wrap on a narrow screen: a zero-width space after the @ and
 * after each dot lets a long address break there instead of running past the screen's edge.
 * For display only, never for a value that is sent or stored.
 */
export function breakableEmail(email: string): string {
  return email.replace(/([@.])/g, '$1​');
}

/**
 * A weight as every weigh-in shows it: always one decimal, never trimmed ("74.0 kg", "163.1 lb"; rubric
 * D11-07), so a goal or a projected weight beside a measured one reads the same. `formatWeight` drops a
 * trailing ".0", which suits a pace or a range but not a weight set beside "78.8 kg".
 */
export function weightFixed(kg: number, units: UnitSystem): string {
  return `${formatNumber(weightValue(kg, units), 1)} ${weightUnit(units)}`;
}
