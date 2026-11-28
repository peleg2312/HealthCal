/**
 * "Save to my meals" from a friend's meal or saved meal (proposal 5a): `friendMealToSaved` makes the draft by the
 * copy rules (bundled foods at this phone's numbers; anything else left out, for Find), the store saves it, and one
 * toast names it with one Undo. No server. The name is plain text (never direction marks: it is stored).
 */
import { MEAL_LABEL } from '@/lib/nutrition';
import { useStore } from '@/store';
import type { MealType, SharedMealItem } from '@/types';
import { haptic, toast } from '@/ui';

import { friendMealToSaved } from './saveFriendMeal';
import { borrowedName, borrowedToast, SAVE_NONE } from './words';

/** The name a borrowed meal is saved under: "Maya’s lunch" for a day's meal, "Maya’s Chicken bowl" for a saved one. */
export function borrowedMealName(owner: string, what: { meal: MealType } | { name: string }): string {
  const plain = owner.replace(/[‎‏⁦-⁩]/g, '').trim() || 'A friend';
  return borrowedName(plain, 'name' in what ? what.name : what.meal === 'snack' ? 'snacks' : MEAL_LABEL[what.meal].toLowerCase());
}

/** Save it; true when something was saved. */
export function saveToMyMeals(input: { owner: string; what: { meal: MealType } | { name: string }; items: readonly SharedMealItem[]; servings?: number }): boolean {
  const name = borrowedMealName(input.owner, input.what);
  const { draft, leftOut } = friendMealToSaved({ items: input.items, name, servings: input.servings });
  if (!draft) {
    haptic.warn();
    toast(SAVE_NONE);
    return false;
  }
  const saved = useStore.getState().upsert('savedMeals', draft);
  haptic.success();
  toast(borrowedToast(draft.name, leftOut.length), { label: 'Undo', onPress: () => useStore.getState().remove('savedMeals', saved.id) });
  return true;
}
