/**
 * Starring a saved meal or a food, with one toast and Undo (principle 6). Used by every star (the food
 * detail header, the saved-meal rows and cards) and every long press on a food or meal row.
 *
 * Each act reads the store's record at the moment of the tap, never a copy from a render, and does
 * nothing to a record that is missing or deleted (`upsert` writes `deleted: false`, so a star on a stale
 * render would bring a deleted meal back). The same holds for its Undo.
 */
import { isolateRtl } from '@/lib/bidi';
import { nowISO } from '@/lib/id';
import { favoriteRecordId, useStore } from '@/store';
import type { Food, SavedMeal } from '@/types';
import { haptic, toast } from '@/ui';

import { isFavoriteMeal, withFavorite } from './favorites';
import { favoriteToast } from './favoriteWords';

/** The meal's favourite state as it was: its exact `favoriteAt`, or no key at all. */
function putBack(id: string, had: boolean, at: unknown): void {
  const s = useStore.getState();
  const now = s.savedMeals[id];
  if (!now || now.deleted) return;
  if (had) s.upsert('savedMeals', { ...now, favoriteAt: at as string });
  else s.upsert('savedMeals', withFavorite(now, false, ''));
}

/** Star or unstar a saved meal. Returns the new state, or null when the meal is missing or deleted. */
export function toggleMealFavorite(meal: Pick<SavedMeal, 'id'>): boolean | null {
  const s = useStore.getState();
  const cur = s.savedMeals[meal.id];
  if (!cur || cur.deleted) return null;
  const had = Object.prototype.hasOwnProperty.call(cur, 'favoriteAt');
  const before = (cur as { favoriteAt?: unknown }).favoriteAt;
  const on = !isFavoriteMeal(cur);
  s.upsert('savedMeals', withFavorite(cur, on, nowISO()));
  if (on) haptic.success();
  else haptic.tap();
  toast(favoriteToast(isolateRtl(cur.name), on, 'meal'), { label: 'Undo', onPress: () => putBack(cur.id, had, before) });
  return on;
}

/** Is the food a favourite now (its record live)? */
export function isFavoriteFood(foodId: string): boolean {
  const r = useStore.getState().favorites[favoriteRecordId(foodId)];
  return !!r && !r.deleted;
}

/**
 * Star or unstar a food. Undo of a star removes the record; Undo of an unstar restores the same record
 * (`restore`, so the food copy and its place stay as they were), never a fresh star.
 */
export function toggleFoodFavorite(food: Food): boolean {
  const s = useStore.getState();
  const id = favoriteRecordId(food.id);
  const on = !isFavoriteFood(food.id);
  if (on) s.upsert('favorites', { id, food });
  else s.remove('favorites', id);
  if (on) haptic.success();
  else haptic.tap();
  toast(favoriteToast(isolateRtl(food.name), on, 'food'), {
    label: 'Undo',
    onPress: () => {
      const st = useStore.getState();
      const r = st.favorites[id];
      if (!r) return;
      if (on && !r.deleted) st.remove('favorites', id);
      else if (!on && r.deleted) st.restore('favorites', id);
    },
  });
  return on;
}
