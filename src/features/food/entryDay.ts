/**
 * The day of an entry: one control (`DayStepper` in ./components) for every screen that dates a record
 * (food detail, quick add, Saved meals, copying a meal, the run log and the strength log), with one way of
 * naming the day and one rule for how far ahead it goes. Pure: the day today comes from the caller
 * (`useToday()`), never from the clock while rendering.
 */
import { addDays, formatLongDate, fromISODate, weekdayShort } from '@/lib/dates';
import type { ISODate } from '@/types';

/** How far ahead food can be planned: the diary's week ahead (the strip's `latest`). */
export const ENTRY_DAYS_AHEAD = 7;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** The last day food can be dated: a week ahead, as far as the diary goes. */
export function foodLatestDay(today: ISODate): ISODate {
  return addDays(today, ENTRY_DAYS_AHEAD);
}

/**
 * The day as the control names it: "Today", "Yesterday", "Tomorrow", else "Sat, Nov 14"; a day in another
 * year carries the year ("Sat, Nov 14, 2025"), so an old entry is never taken for this year's.
 */
export function entryDayLabel(date: ISODate, today: ISODate): string {
  if (date === today) return 'Today';
  if (date === addDays(today, -1)) return 'Yesterday';
  if (date === addDays(today, 1)) return 'Tomorrow';
  const d = fromISODate(date);
  const base = `${weekdayShort(date)}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;
  return d.getFullYear() === fromISODate(today).getFullYear() ? base : `${base}, ${d.getFullYear()}`;
}

/** What a screen reader says for the middle of the control: the full date, and how to come back to today. */
export function entryDaySpoken(date: ISODate, today: ISODate): string {
  const long = formatLongDate(date);
  if (date === today) return `Today, ${long}`;
  const word = entryDayLabel(date, today);
  return `${/^(Yesterday|Tomorrow)$/.test(word) ? `${word}, ${long}` : long}. Tap for today`;
}

/** Whether the next day may be chosen: never past `latest`. */
export function canStepForward(date: ISODate, latest: ISODate): boolean {
  return date < latest;
}
