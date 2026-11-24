/**
 * One line of real numbers for the "Your week is ready" card on Today.
 * Pure: takes the seven day summaries of the finished week.
 */
import { hasFoodLogged } from '@/features/drinks/via';
import { budgetMark } from '@/lib/insights';
import { isCompleteDay } from '@/lib/trend';
import type { FoodEntry } from '@/types';

export interface RecapLineDay {
  entries: readonly Pick<FoodEntry, 'via'>[];
  eaten: { kcal: number };
  budget: number;
}

/**
 * "Logged 6 of 7 days, 4 on budget": on budget is a fully logged day at 90 to 100% of its own budget
 * (`budgetMark`, as on the recap it opens). The budget part is left out when no day was on budget.
 */
export function recapLine(days: RecapLineDay[]): string {
  const logged = days.filter((d) => hasFoodLogged(d.entries));
  const onBudget = logged.filter((d) => isCompleteDay(d.eaten.kcal, d.budget) && budgetMark(d.eaten.kcal, d.budget) === 'on').length;
  const head = `Logged ${logged.length} of ${days.length} ${days.length === 1 ? 'day' : 'days'}`;
  return onBudget > 0 ? `${head}, ${onBudget} on budget` : head;
}
