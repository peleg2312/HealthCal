/**
 * Pure maths for the Today week strip: how each day's cup is drawn and the
 * one-line "week so far" caption. No React, no storage, unit-tested.
 */
import { addDays, startOfWeek, toISODate } from '@/lib/dates';
import { budgetMark, isCompleteDay, type InsightDay } from '@/lib/insights';
import { formatNumber } from '@/lib/units';
import type { ISODate } from '@/types';

/**
 * future: still to come (dashed). before: before the person started using the
 * app, so not a missed day (a dot, no cup). empty: nothing logged. under, band
 * and over: how the day landed against its budget, by `budgetMark` (band is on
 * budget, 90 to 100% of it; over is above it).
 */
export type DayRingState = 'future' | 'before' | 'empty' | 'under' | 'band' | 'over';

export interface DayRing {
  date: ISODate;
  state: DayRingState;
  /** Fill for the cup: 0..1, or above 1 when the day went past its budget (the amber lip). */
  progress: number;
  /** On budget, at 90 to 100% of it (`budgetMark`): never a day above it, which is 'over' with its lip. */
  close: boolean;
}

/**
 * One rule for "over" wherever a cup is drawn: eaten more than that day's
 * budget, shown with the amber lip in proportion. A day under budget but within
 * the band is 'band'; a day with no food before `start` (the day the profile
 * was made) is 'before', never an empty day.
 */
export function dayRing(day: Pick<InsightDay, 'date' | 'entries' | 'eaten' | 'budget'>, today: ISODate, start?: ISODate): DayRing {
  if (day.date > today) return { date: day.date, state: 'future', progress: 0, close: false };
  if (day.entries.length === 0 && start && day.date < start) return { date: day.date, state: 'before', progress: 0, close: false };
  if (day.entries.length === 0 || day.budget <= 0) return { date: day.date, state: 'empty', progress: 0, close: false };
  const ratio = day.eaten.kcal / day.budget;
  const mark = budgetMark(day.eaten.kcal, day.budget);
  if (mark === 'above') return { date: day.date, state: 'over', progress: ratio, close: false };
  return { date: day.date, state: mark === 'on' ? 'band' : 'under', progress: ratio, close: mark === 'on' };
}

/** The local day the profile was made, from `profile.onboardedAt`; undefined when unknown. */
export function startDate(onboardedAt: string | undefined | null): ISODate | undefined {
  if (!onboardedAt) return undefined;
  const d = new Date(onboardedAt);
  return Number.isNaN(d.getTime()) ? undefined : toISODate(d);
}

/** The seven dates (Monday first) of the week `weeksBack` weeks before the one holding `today`. */
export function weekDates(today: ISODate, weeksBack = 0): ISODate[] {
  const start = addDays(startOfWeek(today), -7 * weeksBack);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/**
 * "Week so far: 310 kcal a day under budget, 4 full days", or "Week so far: 2 full days on budget"
 * when every full day was on budget (`budgetMark`, the one meaning of "on budget"). Averages use
 * complete days only (closed, logged, not obviously partial) so a half-logged day or today's open
 * log cannot drag the number down. Days before `start` (when the profile was made) with nothing
 * logged are not part of the week.
 */
export function weekCaption(days: InsightDay[], today: ISODate, start?: ISODate): string {
  const inWeek = days.filter((d) => d.date <= today && (!start || d.date >= start || d.entries.length > 0));
  const isCurrent = days.some((d) => d.date === today);
  const lead = isCurrent ? 'Week so far' : 'That week';
  const complete = inWeek.filter((d) => isCompleteDay(d, today));
  if (complete.length === 0) {
    if (inWeek.length === 0) return 'Before you started';
    if (isCurrent && start === today && inWeek.length === 1) return 'Day 1. Your week starts here.';
    if (isCurrent && inWeek.length === 1) return 'New week. Each logged day fills its cup.';
    return `${lead}: no full days logged yet`;
  }
  const diff = complete.reduce((s, d) => s + (d.eaten.kcal - d.budget), 0) / complete.length;
  const budget = complete.reduce((s, d) => s + d.budget, 0) / complete.length;
  // Full days only: today is still open and a barely logged day would skew the average.
  const n = `${complete.length} full ${complete.length === 1 ? 'day' : 'days'}`;
  if (complete.every((d) => budgetMark(d.eaten.kcal, d.budget) === 'on')) return `${lead}: ${n} on budget`;
  const rounded = Math.round(Math.abs(diff) / 10) * 10;
  if (rounded === 0 || budget <= 0) return `${lead}: at budget on average, ${n}`;
  return `${lead}: ${formatNumber(rounded)} kcal a day ${diff < 0 ? 'under' : 'over'} budget, ${n}`;
}
