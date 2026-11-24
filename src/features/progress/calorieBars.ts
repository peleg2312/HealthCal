import { formatShortDate, startOfWeek, weekdayShort } from '@/lib/dates';
import { isCompleteDay, type InsightDay } from '@/lib/insights';
import { formatNumber } from '@/lib/units';
import type { BarDatum } from '@/ui/Charts';

import { budgetDaysVerdict, countBudgetDays } from './recapDays';

/** The colours a calorie bar is drawn in. */
export interface BarFills {
  /** A fully logged day: the calorie colour, solid (as the recap's cups and Today's). */
  full: string;
  /** A partly logged day: the recap's lighter fill. */
  partial: string;
  /** The part above that day's own budget. */
  over: string;
}

/**
 * A bar as two solid segments: the calorie fill up to the day's own budget and
 * the amber part above it. Drawn this way the bar keeps the full calorie
 * colour (the kit's plain fill is a tint that reads brown on the dark card)
 * and the kit puts the level line on top of the whole bar, at the day's
 * intake, with the amber part beneath it. `goal` is then the bar's own value
 * (or its budget when under), so the kit adds no amber of its own; the amber
 * is the second segment, measured against the same budget.
 */
export function solidBar(value: number, budget: number, fill: string, over: string): Pick<BarDatum, 'segments' | 'goal'> {
  if (value <= 0) return {};
  const under = budget > 0 ? Math.min(value, budget) : value;
  const above = budget > 0 ? Math.max(0, value - budget) : 0;
  return {
    segments: above > 0 ? [{ value: under, color: fill }, { value: above, color: over }] : [{ value, color: fill }],
    goal: Math.max(value, budget),
  };
}

/**
 * Daily bars for up to ~6 weeks, weekly averages beyond that. Bars are slim
 * cups, each measured against its own budget, never against the average (the
 * dashed line): solid calorie colour up to that budget, amber above it, the
 * level line on top at the day's intake. Today is hatched (`openIndex`, drawn
 * by the kit against today's budget); a partly logged day is the lighter fill
 * so it is not read as a full day.
 */
export function buildBars(days: InsightDay[], today: string, fills: BarFills): { data: BarDatum[]; weekly: boolean; openIndex?: number } {
  if (days.length <= 45) {
    const every = days.length <= 10 ? 1 : 7;
    const data = days.map((d, i) => {
      const fromEnd = days.length - 1 - i;
      const label = every === 1 ? (d.date === today ? 'Today' : weekdayShort(d.date)) : fromEnd % every === 3 ? formatShortDate(d.date) : '';
      const kcal = d.entries.length ? d.eaten.kcal : 0;
      const detail = `${formatShortDate(d.date)} · ${kcal ? `${formatNumber(Math.round(kcal))} of ${formatNumber(Math.round(d.budget))} kcal` : 'not logged'}`;
      const partial = kcal > 0 && d.date !== today && !isCompleteDay(d, today);
      const base: BarDatum = { label, value: kcal, detail, goal: d.budget > 0 ? d.budget : undefined, color: partial ? fills.partial : undefined };
      // Today stays the kit's hatched bar (still open); every other day is drawn solid.
      return d.date === today ? base : { ...base, ...solidBar(kcal, d.budget, partial ? fills.partial : fills.full, fills.over) };
    });
    const open = days.findIndex((d) => d.date === today);
    return { data, weekly: false, openIndex: open >= 0 ? open : undefined };
  }
  const weeks = new Map<string, InsightDay[]>();
  for (const d of days) {
    const k = startOfWeek(d.date);
    weeks.set(k, [...(weeks.get(k) ?? []), d]);
  }
  const entries = [...weeks.entries()];
  const data = entries.map(([start, list], i) => {
    const complete = list.filter((d) => isCompleteDay(d, today));
    const kcal = complete.length ? complete.reduce((s, d) => s + d.eaten.kcal, 0) / complete.length : 0;
    // A week's bar is its average day, so it is measured against the same days' average budget.
    const budget = complete.length ? complete.reduce((s, d) => s + d.budget, 0) / complete.length : 0;
    const fromEnd = entries.length - 1 - i;
    const detail = `Week of ${formatShortDate(start)} · ${kcal ? `${formatNumber(Math.round(kcal))} of ${formatNumber(Math.round(budget))} kcal a day` : 'no full days'}`;
    return { label: fromEnd % 3 === 1 ? formatShortDate(start) : '', value: kcal, detail, goal: budget > 0 ? budget : undefined, ...solidBar(kcal, budget, fills.full, fills.over) };
  });
  return { data, weekly: true };
}

/**
 * What the bars show, true of every bar, each full day against its own budget, in the recap's words
 * (`budgetDaysVerdict`): a short headline ("19 of 27 days on budget, 3 above") and what it counts in
 * the caption under it ("On budget: a full day at 90 to 100% of its budget").
 */
export function daysVerdict(days: InsightDay[], today: string): { line: string; note: string | null } {
  return budgetDaysVerdict(countBudgetDays(days, today));
}
