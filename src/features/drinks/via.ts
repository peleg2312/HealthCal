/**
 * Whether a diary entry was written by the water screen with its drink (`via: 'water'`, see
 * src/features/drinks/rules.ts). Its own file with no imports, so the store, the selectors and the
 * food helpers can ask without loading the drink rules.
 *
 * Such an entry counts for calories, macros, the budget and isCompleteDay like any other, and is
 * left out of recents, usual foods, last portions, copied and saved meals.
 *
 * "Logged" means one thing everywhere: food logged. An entry with `via: 'water'` never makes a day
 * or a meal logged. Ask `hasFoodLogged` (a day's or a meal's entries) or `foodLoggedDates` (in the
 * selectors, for date sets); never test `entries.length` for it. Its readers: the streak and the
 * logging calendar, Progress's Consistency card and early state, Today's first-day invite and a
 * past day's "Nothing logged", Today's coach, the + sheet's repeat offer, the recap's cups and
 * line, the share card, the morning page, the meal reminders, "Repeat yesterday's <meal>" and the
 * evening check-in. A day with only drinks from Water is then exactly what it was for a water-only
 * person before drinks had calories. The calories themselves (cups, totals, charts, budget) still
 * count every entry.
 */
import type { FoodEntry } from '@/types';

export function isWaterDrinkEntry(e: Pick<FoodEntry, 'via'>): boolean {
  return e.via === 'water';
}

/** Whether a day's (or a meal's) entries hold food logged in the diary itself, not only drinks from Water. */
export function hasFoodLogged(entries: readonly Pick<FoodEntry, 'via'>[]): boolean {
  return entries.some((e) => !isWaterDrinkEntry(e));
}
