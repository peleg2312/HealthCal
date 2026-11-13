/**
 * One line of real numbers for the "Your week is ready" card on Today.
 * Pure: takes the seven day summaries of the finished week.
 */
import { inBudgetBand } from '@/lib/insights';

export interface RecapLineDay {
  entries: readonly unknown[];
  eaten: { kcal: number };
  budget: number;
}

/** "Logged 6 of 7 days, 4 on budget". The budget part is left out when no logged day was on budget. */
export function recapLine(days: RecapLineDay[]): string {
  const logged = days.filter((d) => d.entries.length > 0);
  const onBudget = logged.filter((d) => inBudgetBand(d.eaten.kcal, d.budget)).length;
  const head = `Logged ${logged.length} of ${days.length} ${days.length === 1 ? 'day' : 'days'}`;
  return onBudget > 0 ? `${head}, ${onBudget} on budget` : head;
}
