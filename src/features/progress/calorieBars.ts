import { formatShortDate, startOfWeek, weekdayShort } from '@/lib/dates';
import { inBudgetBand, isCompleteDay, type InsightDay } from '@/lib/insights';
import { formatNumber } from '@/lib/units';
import type { BarDatum } from '@/ui/Charts';

/**
 * Daily bars for up to ~6 weeks, weekly averages beyond that. Bars are slim
 * cups: each carries its own budget (`goal`), so the kit draws amber only on
 * the part above that day's budget, never against the average (the dashed
 * line). Today is hatched (`openIndex`); a partly logged day is drawn in
 * `partialColor` so it is not read as a full day.
 */
export function buildBars(days: InsightDay[], today: string, partialColor?: string): { data: BarDatum[]; weekly: boolean; openIndex?: number } {
  if (days.length <= 45) {
    const every = days.length <= 10 ? 1 : 7;
    const data = days.map((d, i) => {
      const fromEnd = days.length - 1 - i;
      const label = every === 1 ? (d.date === today ? 'Today' : weekdayShort(d.date)) : fromEnd % every === 3 ? formatShortDate(d.date) : '';
      const kcal = d.entries.length ? d.eaten.kcal : 0;
      const detail = `${formatShortDate(d.date)} · ${kcal ? `${formatNumber(Math.round(kcal))} of ${formatNumber(Math.round(d.budget))} kcal` : 'not logged'}`;
      const partial = kcal > 0 && d.date !== today && !isCompleteDay(d, today);
      return { label, value: kcal, detail, goal: d.budget > 0 ? d.budget : undefined, color: partial ? partialColor : undefined };
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
    return { label: fromEnd % 3 === 1 ? formatShortDate(start) : '', value: kcal, detail, goal: budget > 0 ? budget : undefined };
  });
  return { data, weekly: true };
}

/** One line for a run of days, true of every bar: each full day against its own budget. */
export function daysVerdict(days: InsightDay[], today: string): string {
  const complete = days.filter((d) => isCompleteDay(d, today));
  if (!complete.length) return 'No fully logged days yet';
  const inBand = complete.filter((d) => inBudgetBand(d.eaten.kcal, d.budget)).length;
  const above = complete.filter((d) => d.eaten.kcal > d.budget * 1.1).length;
  const n = complete.length;
  const lead = inBand === n ? `All ${n} full ${n === 1 ? 'day' : 'days'} within 10% of their budget` : `${inBand} of ${n} full ${n === 1 ? 'day' : 'days'} within 10% of their budget`;
  return above ? `${lead}, ${above} more than 10% above` : lead;
}
