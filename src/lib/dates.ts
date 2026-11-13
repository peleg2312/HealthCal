import type { ISODate } from '@/types';

/** Local-calendar date key. Never use toISOString() for this: it is UTC and shifts days. */
export function toISODate(d: Date = new Date()): ISODate {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function fromISODate(s: ISODate): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

export function today(): ISODate {
  return toISODate(new Date());
}

export function addDays(date: ISODate, n: number): ISODate {
  const d = fromISODate(date);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

/** Whole days from a to b (b - a). */
export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((fromISODate(b).getTime() - fromISODate(a).getTime()) / 86_400_000);
}

/** Inclusive list of dates ending at `end`, oldest first. */
export function lastNDates(n: number, end: ISODate = today()): ISODate[] {
  return Array.from({ length: n }, (_, i) => addDays(end, i - (n - 1)));
}

export function ageFromBirthDate(birth: ISODate, on: Date = new Date()): number {
  const b = fromISODate(birth);
  let age = on.getFullYear() - b.getFullYear();
  const beforeBirthday =
    on.getMonth() < b.getMonth() || (on.getMonth() === b.getMonth() && on.getDate() < b.getDate());
  if (beforeBirthday) age -= 1;
  return Math.max(0, age);
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function weekdayShort(date: ISODate): string {
  return WEEKDAYS[fromISODate(date).getDay()];
}

export function formatDayLabel(date: ISODate): string {
  const t = today();
  if (date === t) return 'Today';
  if (date === addDays(t, -1)) return 'Yesterday';
  if (date === addDays(t, 1)) return 'Tomorrow';
  const d = fromISODate(date);
  return `${WEEKDAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

export function formatShortDate(date: ISODate): string {
  const d = fromISODate(date);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

export function formatLongDate(date: ISODate): string {
  const d = fromISODate(date);
  return `${WEEKDAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

/** 'HH:mm' -> minutes after midnight. */
export function parseHHmm(s: string): number {
  const [h, m] = s.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function formatHHmm(minutes: number): string {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** 12/24h clock label for a 'HH:mm' string. */
export function formatClock(hhmm: string, hour12 = false): string {
  if (!hour12) return hhmm;
  const mins = parseHHmm(hhmm);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

export function formatDuration(minutes: number): string {
  const m = Math.round(minutes);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest === 0 ? `${h} h` : `${h} h ${rest} min`;
}

export function greeting(now: Date = new Date()): string {
  const h = now.getHours();
  if (h < 5) return 'Good night';
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

/** Monday-based start of the week containing `date`. */
export function startOfWeek(date: ISODate): ISODate {
  const d = fromISODate(date);
  const offset = (d.getDay() + 6) % 7;
  return addDays(date, -offset);
}
