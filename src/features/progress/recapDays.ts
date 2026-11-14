/**
 * The recap's "Day by day" in words. One rule for the cups, the checks and
 * the verdict: every day is measured against its own budget (never the week's
 * average), and a check is a fully logged day within 10% of it.
 */
import { addDays, formatShortDate } from '@/lib/dates';
import { inBudgetBand, isCompleteDay, type InsightDay } from '@/lib/insights';
import { formatNumber } from '@/lib/units';
import type { ISODate } from '@/types';

export interface RecapDayCup {
  date: ISODate;
  /** eaten / that day's own budget. */
  ratio: number;
  logged: boolean;
  complete: boolean;
  /** Fully logged and within 10% of its own budget: the check. */
  inBand: boolean;
  /** Above its own budget (amber lip). */
  over: boolean;
  isToday: boolean;
  future: boolean;
  detail: string;
}

export function recapDayCups(weekStart: ISODate, days: InsightDay[], today: ISODate): RecapDayCup[] {
  const byDate = new Map(days.map((d) => [d.date, d]));
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(weekStart, i);
    const d = byDate.get(date);
    const logged = !!d && d.entries.length > 0;
    const kcal = logged ? d.eaten.kcal : 0;
    const budget = d?.budget ?? 0;
    const ratio = logged && budget > 0 ? kcal / budget : 0;
    const complete = !!d && isCompleteDay(d, today);
    const inBand = complete && inBudgetBand(kcal, budget);
    const over = logged && kcal > budget;
    return {
      date,
      ratio,
      logged,
      complete,
      inBand,
      over,
      isToday: date === today,
      future: date > today,
      detail: logged
        ? `${formatShortDate(date)} · ${formatNumber(Math.round(kcal))} of ${formatNumber(Math.round(budget))} kcal, ${standing(kcal, budget, over, inBand)}${complete ? '' : date === today ? ', still in progress' : ', partly logged'}`
        : `${formatShortDate(date)} · ${date > today ? 'still to come' : 'not logged'}`,
    };
  });
}

/**
 * How a day stands against its own budget, in words that agree with the cup:
 * a day above it says so and by how much (the amber lip), never a rounded
 * share that could read as on budget; a check is named only on a full day.
 */
function standing(kcal: number, budget: number, over: boolean, inBand: boolean): string {
  if (budget <= 0) return 'no budget set';
  if (over) {
    const above = Math.max(1, Math.round(kcal - budget));
    return `${formatNumber(above)} kcal above that day’s budget${inBand ? ', within 10% of it' : ''}`;
  }
  // Under the budget the share is floored, so 99.6% never reads as 100%.
  const pct = Math.floor((kcal / budget) * 100);
  return `${pct}% of that day’s budget${inBand ? ', within 10% of it' : ''}`;
}

const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many);

/** One plain line for the week's cups, true of every cup drawn. */
export function recapDaysVerdict(cups: RecapDayCup[]): string {
  const complete = cups.filter((c) => c.complete);
  if (!complete.length) return 'No fully logged days to measure yet';
  const inBand = complete.filter((c) => c.inBand).length;
  const over = complete.filter((c) => c.over && !c.inBand).length;
  const n = complete.length;
  const lead =
    inBand === n
      ? n === 1
        ? 'The one full day was within 10% of its budget'
        : `All ${n} full days within 10% of their budget`
      : `${inBand} of ${n} full ${plural(n, 'day')} within 10% of their budget`;
  return over ? `${lead}; ${over} more than 10% above` : lead;
}
