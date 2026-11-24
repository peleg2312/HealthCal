/**
 * The recap's "Day by day" in words, and the one headline for a run of full days that the recap,
 * Progress's "Calories a day" and its Nutrition card share (`budgetDaysVerdict`). One rule for the
 * cups, the checks and the words, `budgetMark` (@/lib/insights): every day is measured against its
 * own budget (never the week's average); a check is a fully logged day on budget, at 90 to 100% of
 * its budget; amber a day above it (never with a check); under 90% has no mark.
 */
import { hasFoodLogged } from '@/features/drinks/via';
import { addDays, formatShortDate } from '@/lib/dates';
import { budgetMark, isCompleteDay, type InsightDay } from '@/lib/insights';
import { formatNumber } from '@/lib/units';
import type { ISODate } from '@/types';

export interface RecapDayCup {
  date: ISODate;
  /** eaten / that day's own budget. */
  ratio: number;
  logged: boolean;
  complete: boolean;
  /** Fully logged and on budget, at 90 to 100% of its own budget: the check. A day above its budget never has one. */
  check: boolean;
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
    const logged = !!d && hasFoodLogged(d.entries);
    const kcal = logged ? d.eaten.kcal : 0;
    const budget = d?.budget ?? 0;
    const ratio = logged && budget > 0 ? kcal / budget : 0;
    const complete = !!d && isCompleteDay(d, today);
    const mark = logged ? budgetMark(kcal, budget) : null;
    const over = mark === 'above';
    const check = complete && mark === 'on';
    return {
      date,
      ratio,
      logged,
      complete,
      check,
      over,
      isToday: date === today,
      future: date > today,
      detail: logged
        ? `${formatShortDate(date)} · ${formatNumber(Math.round(kcal))} of ${formatNumber(Math.round(budget))} kcal, ${standing(kcal, budget, over, check)}${complete ? '' : date === today ? ', still in progress' : ', partly logged'}`
        : `${formatShortDate(date)} · ${date > today ? 'still to come' : 'not logged'}`,
    };
  });
}

/**
 * How a day stands against its own budget, in words that agree with the cup:
 * a day above it says so and by how much (the amber lip), never a rounded
 * share that could read as on budget; the check's words only on a checked day.
 */
function standing(kcal: number, budget: number, over: boolean, check: boolean): string {
  if (budget <= 0) return 'no budget set';
  if (over) {
    const above = Math.max(1, Math.round(kcal - budget));
    return `${formatNumber(above)} kcal above that day’s budget`;
  }
  // Under the budget the share is floored, so 99.6% never reads as 100%.
  const pct = Math.floor((kcal / budget) * 100);
  return `${pct}% of that day’s budget${check ? ', on budget' : ''}`;
}

const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many);

/** How many full days there were, how many on budget and how many above it, by `budgetMark`. */
export interface BudgetDayCounts {
  full: number;
  on: number;
  above: number;
}

/** Counts the fully logged days of a run (`isCompleteDay`) by the one rule, `budgetMark`. */
export function countBudgetDays(days: InsightDay[], today: string): BudgetDayCounts {
  const full = days.filter((d) => isCompleteDay(d, today));
  const marks = full.map((d) => budgetMark(d.eaten.kcal, d.budget));
  return { full: full.length, on: marks.filter((m) => m === 'on').length, above: marks.filter((m) => m === 'above').length };
}

/** What "on budget" counts, said once under every headline that uses it. */
export const ON_BUDGET_NOTE = 'On budget: a full day at 90 to 100% of its budget';

/**
 * The one headline for a run of fully logged days, the same words on the recap and on Progress: plain
 * words ("3 of 7 days on budget, 2 above"), and what they count in the caption under it
 * (`ON_BUDGET_NOTE`: only full days, and the band). True of every cup and bar drawn: it counts the
 * checks and the amber.
 */
export function budgetDaysVerdict({ full, on, above }: BudgetDayCounts): { line: string; note: string | null } {
  if (!full) return { line: 'No fully logged days yet', note: null };
  const lead = on === full ? (full === 1 ? 'The one full day on budget' : `All ${full} days on budget`) : `${on} of ${full} ${plural(full, 'day')} on budget`;
  return { line: above ? `${lead}, ${above} above` : lead, note: ON_BUDGET_NOTE };
}

/** The recap's headline over its seven cups, counted from the cups themselves. */
export function recapDaysVerdict(cups: RecapDayCup[]): { line: string; note: string | null } {
  const full = cups.filter((c) => c.complete);
  return budgetDaysVerdict({ full: full.length, on: full.filter((c) => c.check).length, above: full.filter((c) => c.over).length });
}
