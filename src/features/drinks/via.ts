/**
 * Whether a diary entry was written by the water screen with its drink (`via: 'water'`, see
 * src/features/drinks/rules.ts). Its own file with no imports beyond the types, the id hash and
 * @/lib/hydration, so the store, the selectors and the food helpers can ask without loading the drink
 * rules.
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
 *
 * The mirror, for water: a drink logged as food in the diary also adds a water record
 * (`fromEntryId`, ./diary.ts). Such water counts in every total, but it never makes a day "water
 * tracked": a person who never logs on the Water screen must not start hearing about water because of
 * a coffee in the diary. Ask `isTrackedWater` / `hasWaterTracked` wherever the app decides whether to
 * talk about water or count a day as tracked (Progress's hydration insight and habits card, the share
 * card, the morning page, the recap); never test `waterEntries.length` for it. The rule itself is in
 * @/lib/hydration, re-exported here.
 */
import { stableId } from '@/lib/hash';
import type { FoodEntry } from '@/types';

export function isWaterDrinkEntry(e: Pick<FoodEntry, 'via'>): boolean {
  return e.via === 'water';
}

/** Whether a day's (or a meal's) entries hold food logged in the diary itself, not only drinks from Water. */
export function hasFoodLogged(entries: readonly Pick<FoodEntry, 'via'>[]): boolean {
  return entries.some((e) => !isWaterDrinkEntry(e));
}

/** The "water tracked" rule lives in @/lib/hydration (src/lib may not import from src/features); every caller keeps this import. */
export { hasWaterTracked, isTrackedWater } from '@/lib/hydration';

/** The id of the water record a diary entry adds: the same on every phone, so no path can make two for one entry. */
export function waterIdFromEntry(entryId: string): string {
  return stableId('waterFromEntry', entryId);
}
