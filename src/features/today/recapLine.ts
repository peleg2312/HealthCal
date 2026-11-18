/**
 * One line of real numbers for the "Your week is ready" card on Today.
 * Pure: takes the seven day summaries of the finished week.
 */
import { hasFoodLogged } from '@/features/drinks/via';
import { inBudgetBand } from '@/lib/insights';
import type { FoodEntry } from '@/types';

export interface RecapLineDay {
  entries: readonly Pick<FoodEntry, 'via'>[];
  eaten: { kcal: number };
  budget: number;
}

/** "Logged 6 of 7 days, 4 on budget". The budget part is left out when no logged day was on budget. */
export function recapLine(days: RecapLineDay[]): string {
  const logged = days.filter((d) => hasFoodLogged(d.entries));
  const onBudget = logged.filter((d) => inBudgetBand(d.eaten.kcal, d.budget)).length;
  const head = `Logged ${logged.length} of ${days.length} ${days.length === 1 ? 'day' : 'days'}`;
  return onBudget > 0 ? `${head}, ${onBudget} on budget` : head;
}
