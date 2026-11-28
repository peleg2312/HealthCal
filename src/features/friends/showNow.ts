/**
 * The one quiet shortcut on Friends to show a meal ("Show today's lunch to friends"): the meal of the hour
 * (`mealForTime` at the clock the screen reads with `useNow`), offered only while that meal has food today,
 * is not shown yet, meals are allowed for this person (18 and over, a server with meals) and at least one
 * friend can be picked for meals. It opens the diary menu's own show step; it is never a prompt anywhere
 * else and never a reminder. Pure.
 */
import type { MealType } from '@/types';

export function showShortcutMeal(input: { mealsAllowed: boolean; pickable: number; meal: MealType; hasFood: boolean; shownNow: boolean }): MealType | null {
  if (!input.mealsAllowed || input.pickable === 0 || !input.hasFood || input.shownNow) return null;
  return input.meal;
}
