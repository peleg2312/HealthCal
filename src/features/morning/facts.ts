/**
 * One day reduced to the plain facts the morning page judges (review.ts, personal.ts). Pure:
 * it takes a DaySummary (useDay / useDays from @/store/selectors) and returns numbers and flags,
 * so every rule after it is tested without the store.
 *
 * The shared rules are used, never re-implemented: a fully logged day is isCompleteDay
 * (@/lib/trend), the band around the budget is BUDGET_BAND (@/lib/insights), the minutes toward
 * the weekly 150 are guidelineMinutes (@/lib/exercise).
 */
import { guidelineMinutes } from '@/lib/exercise';
import { BUDGET_BAND } from '@/lib/insights';
import { isCompleteDay } from '@/lib/trend';
import { hasFoodLogged } from '@/features/drinks/via';
import { isEstimate } from '@/features/today/meals';
import type { ActivityEntry, FoodEntry, ISODate } from '@/types';

export interface DayFacts {
  date: ISODate;
  /** Any food entry on the day other than a drink from the water screen (those count as water, as before they had calories). */
  foodLogged: boolean;
  /** isCompleteDay(kcal, budget): a fully logged day. */
  complete: boolean;
  /** A complete day more than BUDGET_BAND above its budget (exactly 110% is inside the band). */
  overBand: boolean;
  /** Any entry is an estimate (AI or a calorie range), so the day's total reads "about". */
  approx: boolean;
  kcal: number;
  /** The day's own budget (its snapshot), exercise included when eat-back is on. */
  budget: number;
  protein: number;
  proteinG: number;
  waterMl: number;
  waterGoalMl: number;
  /** Any water entry on the day. */
  hasWater: boolean;
  activities: { name: string; emoji: string; durationMin: number }[];
  /** guidelineMinutes(activities): the day's minutes toward the weekly 150. */
  guidelineMin: number;
}

/** The parts of a DaySummary that dayFacts reads. */
export interface DayFactsSource {
  date: ISODate;
  entries: readonly Pick<FoodEntry, 'source' | 'kcalRange' | 'via'>[];
  eaten: { kcal: number; protein: number };
  budget: number;
  macros: { proteinG: number };
  waterMl: number;
  waterGoalMl: number;
  waterEntries: readonly unknown[];
  activities: readonly Pick<ActivityEntry, 'name' | 'emoji' | 'durationMin' | 'met' | 'intensity'>[];
}

/** True when a complete day is more than the band above its budget. */
export function isOverBand(complete: boolean, kcal: number, budget: number): boolean {
  return complete && budget > 0 && kcal - budget > budget * BUDGET_BAND + 1e-9;
}

/** The facts of one day. `approx` defaults to "any entry is an estimate". */
export function dayFacts(d: DayFactsSource, approx: boolean = d.entries.some(isEstimate)): DayFacts {
  const kcal = d.eaten.kcal;
  const budget = d.budget;
  const foodLogged = hasFoodLogged(d.entries);
  const complete = isCompleteDay(kcal, budget);
  return {
    date: d.date,
    foodLogged,
    complete,
    overBand: isOverBand(complete, kcal, budget),
    approx,
    kcal,
    budget,
    protein: d.eaten.protein,
    proteinG: d.macros.proteinG,
    waterMl: d.waterMl,
    waterGoalMl: d.waterGoalMl,
    hasWater: d.waterEntries.length > 0,
    activities: d.activities.map((a) => ({ name: a.name, emoji: a.emoji, durationMin: a.durationMin })),
    guidelineMin: guidelineMinutes(d.activities),
  };
}

/** Nothing logged at all: no food, no activity and no water (the page then shows its plain card). */
export function isNothing(d: DayFacts): boolean {
  return !d.foodLogged && d.activities.length === 0 && !d.hasWater;
}
