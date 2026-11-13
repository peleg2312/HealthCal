/**
 * Pure maths for the Today week strip: how each day's ring is drawn and the
 * one-line "week so far" caption. No React, no storage, unit-tested.
 */
import { addDays, startOfWeek } from '@/lib/dates';
import { BUDGET_BAND, inBudgetBand, isCompleteDay, type InsightDay } from '@/lib/insights';
import { formatNumber } from '@/lib/units';
import type { ISODate } from '@/types';

export type DayRingState = 'future' | 'empty' | 'under' | 'band' | 'over';

export interface DayRing {
  date: ISODate;
  state: DayRingState;
  /** Value for `Ring`: 0..1, or above 1 to draw the over-budget lap. */
  progress: number;
}

/**
 * A day inside the budget band reads as a full, calm ring rather than a sliver
 * of second lap: 2,350 of 2,280 kcal is on budget, not over it.
 */
export function dayRing(day: Pick<InsightDay, 'date' | 'entries' | 'eaten' | 'budget'>, today: ISODate): DayRing {
  if (day.date > today) return { date: day.date, state: 'future', progress: 0 };
  if (day.entries.length === 0 || day.budget <= 0) return { date: day.date, state: 'empty', progress: 0 };
  const ratio = day.eaten.kcal / day.budget;
  if (inBudgetBand(day.eaten.kcal, day.budget)) return { date: day.date, state: 'band', progress: Math.min(1, ratio) };
  if (ratio > 1) return { date: day.date, state: 'over', progress: ratio };
  return { date: day.date, state: 'under', progress: ratio };
}

/** The seven dates (Monday first) of the week `weeksBack` weeks before the one holding `today`. */
export function weekDates(today: ISODate, weeksBack = 0): ISODate[] {
  const start = addDays(startOfWeek(today), -7 * weeksBack);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/**
 * "Week so far: 310 kcal a day under budget, 4 days logged". Averages use
 * complete days only (closed, logged, not obviously partial) so a half-logged
 * day or today's open log cannot drag the number down.
 */
export function weekCaption(days: InsightDay[], today: ISODate): string {
  const inWeek = days.filter((d) => d.date <= today);
  const isCurrent = days.some((d) => d.date === today);
  const lead = isCurrent ? 'Week so far' : 'That week';
  const complete = inWeek.filter((d) => isCompleteDay(d, today));
  if (complete.length === 0) {
    if (isCurrent && inWeek.length === 1) return 'New week. Each logged day fills its ring.';
    return `${lead}: no full days logged yet`;
  }
  const diff = complete.reduce((s, d) => s + (d.eaten.kcal - d.budget), 0) / complete.length;
  const budget = complete.reduce((s, d) => s + d.budget, 0) / complete.length;
  const n = `${complete.length} ${complete.length === 1 ? 'day' : 'days'} logged`;
  if (Math.abs(diff) <= budget * BUDGET_BAND * 0.5 || Math.abs(diff) < 50) return `${lead}: on budget, ${n}`;
  const amount = formatNumber(Math.round(Math.abs(diff) / 10) * 10);
  return `${lead}: ${amount} kcal a day ${diff < 0 ? 'under' : 'over'} budget, ${n}`;
}
