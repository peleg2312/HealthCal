/**
 * "Save to my meals" from a friend's shown meal or saved meal (proposal 5a). No server: done on the phone from what
 * the feed already holds, by the copy rules of `copyMeal.ts`: a bundled food comes over in the friend's portion,
 * priced with this phone's own numbers for it; anything else (their own food, a product, an estimate, a quick add)
 * is never copied with numbers this phone cannot check (principle 3) and is listed in `leftOut`, for "Find".
 * The draft has no id: save it with `useStore.getState().upsert('savedMeals', draft)`, which fills id and updatedAt.
 * The name is the caller's (the words, "Maya's lunch", are in words.ts). Pure.
 */
import type { SavedMeal, SharedMealItem } from '@/types';

import { copyRows } from './copyMeal';

export function friendMealToSaved(input: { items: readonly SharedMealItem[]; name: string; servings?: number }): {
  /** Null when no food can be copied. */
  draft: Omit<SavedMeal, 'id' | 'updatedAt'> | null;
  /** The friend's foods that were not copied, in the meal's order, for "Find". */
  leftOut: SharedMealItem[];
} {
  const rows = copyRows(input.items);
  const lines = rows.flatMap((r) => (r.kind === 'copy' ? [r.line] : []));
  const leftOut = rows.flatMap((r) => (r.kind === 'find' ? [r.item] : []));
  const name = input.name.replace(/\s+/g, ' ').trim() || 'Saved meal';
  const servings = input.servings && input.servings > 1 && lines.length === input.items.length ? input.servings : undefined;
  return { draft: lines.length ? { name, items: lines, ...(servings ? { servings } : null) } : null, leftOut };
}
