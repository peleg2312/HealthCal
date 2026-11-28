/**
 * A saved meal or recipe shown to friends (meal_show_saved in
 * supabase/migrations/20261202000000_friends_together.sql): the same door as a day's meal (`buildSharedMeal`).
 * What leaves the phone is each food's name, emoji, portion and where its numbers come from, a bundled food's id,
 * a product's barcode, the serving, quantity and grams, and its calories only when the person switched them on (a
 * range kept for an estimate). Never macros, notes or a record id; the saved meal's own id goes to the server only
 * to make an opaque reference with the share key, and is never kept. At most 15 foods. Pure.
 */
import { sourceKindOf } from '@/features/food/helpers';
import type { SavedMeal, SavedMealItem, SharedFoodSource, SharedMealItem } from '@/types';

import { entryPortion, MAX_SHARED_ITEMS, NAME_MAX, PORTION_MAX } from './meals';

const EMOJI_MAX = 8;

const cut = (s: string, max: number) => {
  const t = s.replace(/\s+/g, ' ').trim();
  const chars = Array.from(t);
  return chars.length > max ? chars.slice(0, max).join('').trim() : t;
};

function sharedLine(it: SavedMealItem, showKcal: boolean): SharedMealItem {
  // A line with a range is an estimate, whatever food it was matched to afterwards.
  const source: SharedFoodSource = it.kcalRange ? 'ai' : sourceKindOf({ source: it.source, food: it.food });
  const bundledId = source === 'builtin' || source === 'typical' || source === 'usda' ? it.food?.id : undefined;
  const barcode = source === 'openfoodfacts' ? (it.food?.barcode ?? '').replace(/\D/g, '') : '';
  const item: SharedMealItem = {
    name: cut(it.name, NAME_MAX) || 'Food',
    ...(it.emoji ? { emoji: Array.from(it.emoji).slice(0, EMOJI_MAX).join('') } : null),
    portion: cut(entryPortion(it), PORTION_MAX),
    source,
    ...(bundledId && /^b_/.test(bundledId) ? { foodId: bundledId } : null),
    ...(barcode.length >= 6 && barcode.length <= 14 ? { barcode } : null),
    serving: cut(it.servingLabel, PORTION_MAX),
    quantity: Math.round(it.quantity * 100) / 100,
    ...(it.grams > 0 ? { grams: Math.round(it.grams * 10) / 10 } : null),
  };
  if (showKcal) {
    item.kcal = Math.max(0, Math.round(it.nutrients.kcal));
    if (it.kcalRange) {
      item.kcalLow = Math.max(0, Math.round(Math.min(it.kcalRange[0], it.kcalRange[1])));
      item.kcalHigh = Math.max(0, Math.round(Math.max(it.kcalRange[0], it.kcalRange[1])));
    }
  }
  return item;
}

/** What `showSavedMeal` sends for a saved meal: its name, its foods as friends will see them and, for a recipe, its servings. */
export function buildSharedSavedMeal(input: { meal: Pick<SavedMeal, 'name' | 'items' | 'servings'>; showKcal: boolean }): {
  name: string;
  items: SharedMealItem[];
  servings: number | null;
} {
  const servings = input.meal.servings && input.meal.servings > 1 ? Math.min(100, Math.round(input.meal.servings * 100) / 100) : null;
  return {
    name: cut(input.meal.name, NAME_MAX) || 'Meal',
    items: input.meal.items
      .filter((it) => it.quantity > 0)
      .slice(0, MAX_SHARED_ITEMS)
      .map((it) => sharedLine(it, input.showKcal)),
    servings,
  };
}
