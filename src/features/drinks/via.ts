/**
 * Whether a diary entry was written by the water screen with its drink (`via: 'water'`, see
 * src/features/drinks/rules.ts). Its own file with no imports, so the store, the selectors and the
 * food helpers can ask without loading the drink rules.
 *
 * Such an entry counts for calories, macros, the budget and isCompleteDay like any other, and is
 * left out of recents, usual foods, last portions, copied and saved meals, the logging streak and
 * the morning page's "food logged".
 */
import type { FoodEntry } from '@/types';

export function isWaterDrinkEntry(e: Pick<FoodEntry, 'via'>): boolean {
  return e.via === 'water';
}
