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
export function buildBars(days: InsightDay[], today: string, fills: BarFills): { data: BarDatum[]; weekly: boolean; openIndex?: number; budgets: (number | null)[] } {
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
    return { data, weekly: false, openIndex: open >= 0 ? open : undefined, budgets: days.map((d) => (d.budget > 0 ? d.budget : null)) };
  }
  const weeks = new Map<string, InsightDay[]>();
  for (const d of days) {
    const k = startOfWeek(d.date);
    weeks.set(k, [...(weeks.get(k) ?? []), d]);
  }
  const entries = [...weeks.entries()];
  const budgets: (number | null)[] = [];
  const data = entries.map(([start, list], i) => {
    const complete = list.filter((d) => isCompleteDay(d, today));
    const kcal = complete.length ? complete.reduce((s, d) => s + d.eaten.kcal, 0) / complete.length : 0;
    // A week's bar is its average day, so it is measured against the same days' average budget.
    const budget = complete.length ? complete.reduce((s, d) => s + d.budget, 0) / complete.length : 0;
    budgets.push(budget > 0 ? budget : null);
    const fromEnd = entries.length - 1 - i;
    const detail = `Week of ${formatShortDate(start)} · ${kcal ? `${formatNumber(Math.round(kcal))} of ${formatNumber(Math.round(budget))} kcal a day` : 'no full days'}`;
    return { label: fromEnd % 3 === 1 ? formatShortDate(start) : '', value: kcal, detail, goal: budget > 0 ? budget : undefined, ...solidBar(kcal, budget, fills.full, fills.over) };
  });
  return { data, weekly: true, budgets };
}

/**
 * The kit BarChart's geometry (`src/ui/Charts.tsx`), mirrored so a mark can stand at a bar: the label row
 * under the bars, the room above them, the head room over the scale's top and a bar's width in its slot.
 * `calorieBars.test.ts` reads the kit and fails when these drift from it.
 */
export const BAR_GEOMETRY = { labelH: 20, topPad: 18, head: 1.08, minBarW: 3, maxBarW: 20, barShare: 0.5 } as const;

/** The scale's top for bars and their own budgets (and a band behind them), passed to the kit as `maxValue`. */
export function budgetScaleTop(values: number[], budgets: (number | null)[], bandTo = 0): number {
  return Math.max(1, bandTo, ...values.map((v) => Math.max(0, v)), ...budgets.map((b) => b ?? 0));
}

/** One bar's budget mark: a short level line `w` wide from `x`, centred `y` px down the chart. */
export interface BudgetTick {
  index: number;
  x: number;
  y: number;
  w: number;
}

/**
 * Each bar's own budget as a short level line across its slot (the day's, or the week's average day's,
 * budget; never the period's average): the bar's width and up to 4 px past each wall, always 2 px short of
 * its neighbour's, so a run of them reads as a dashed line that steps with the budgets. A bar above its
 * budget passes through its mark, which tells an over day by its shape as well as by its amber. `top` is
 * the `maxValue` given to the kit (`budgetScaleTop`), so the kit's scale is `top * head`.
 */
export function budgetTicks(budgets: (number | null)[], width: number, height: number, top: number): BudgetTick[] {
  const n = budgets.length;
  if (!n || width <= 0) return [];
  const { labelH, topPad, head, minBarW, maxBarW, barShare } = BAR_GEOMETRY;
  const chartH = height - labelH - topPad;
  const max = top * head;
  const slot = width / n;
  const barW = Math.max(minBarW, Math.min(maxBarW, slot * barShare));
  const free = (slot - barW) / 2;
  const reach = Math.max(0, Math.min(4, free - 1));
  const out: BudgetTick[] = [];
  budgets.forEach((b, i) => {
    if (!b || b <= 0) return;
    const x = i * slot + free - reach;
    out.push({ index: i, x, y: topPad + chartH - (Math.min(b, max) / max) * chartH, w: barW + 2 * reach });
  });
  return out;
}

/**
 * What the bars show, true of every bar, each full day against its own budget, in the recap's words
 * (`budgetDaysVerdict`): a short headline ("19 of 27 days on budget, 3 above") and what it counts in
 * the caption under it ("On budget: a full day at 90 to 100% of its budget").
 */
export function daysVerdict(days: InsightDay[], today: string): { line: string; note: string | null } {
  return budgetDaysVerdict(countBudgetDays(days, today));
}
