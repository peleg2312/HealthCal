/**
 * Favourite saved meals: a field on the record, `SavedMeal.favoriteAt` (ISO time; absent is not a
 * favourite), never a record in `favorites` without `food` (an older copy's search maps `r.food.id`) and
 * never a new collection (an older copy moves its pull cursor past rows of a collection it does not know,
 * so a phone that updates later would never receive them). Pure, so every rule is tested (favorites.test.ts).
 *
 * Known and accepted:
 * - A saved meal syncs as one record, last writer wins. If one phone stars a meal and another edits the
 *   same meal before either syncs, only the later act survives (as with two edits of one meal today).
 * - A star made after another phone deleted the meal, before that delete was pulled, brings the meal back
 *   (as a builder edit does today). On this phone a star or its Undo never touches a missing or deleted
 *   record (`toggleMealFavorite`, ./favoriteActions.ts).
 * - Starring writes the record, so `updatedAt` moves: an unstarred meal goes to the top of the others.
 *   Where meals are listed the order is fixed once per visit (`orderSavedMeals` on focus), so a star never
 *   moves a card from under the finger.
 * - A backup keeps unknown fields and an older or other copy may hold any value: every reader here takes
 *   only a string that `Date.parse` reads as a favourite, and never throws on anything else.
 */
import { foodKey } from '@/features/food/usuals';
import { isWaterDrinkEntry } from '@/features/drinks/via';
import type { FoodEntry, SavedMeal, SavedMealItem } from '@/types';

/** The time a meal was starred, in ms; null when it is not a favourite (absent, empty, not a string, unreadable). */
function starredAt(m: Pick<SavedMeal, 'favoriteAt'>): number | null {
  const v = (m as { favoriteAt?: unknown }).favoriteAt;
  if (typeof v !== 'string' || !v) return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : null;
}

const updated = (m: Pick<SavedMeal, 'updatedAt'>) => (typeof m.updatedAt === 'string' ? m.updatedAt : '');

export function isFavoriteMeal(m: Pick<SavedMeal, 'favoriteAt'>): boolean {
  return starredAt(m) !== null;
}

/** The meal starred (`favoriteAt: at`) or not (the key removed). Every other field is kept as it is. */
export function withFavorite(m: SavedMeal, on: boolean, at: string): SavedMeal {
  if (on) return { ...m, favoriteAt: at };
  const { favoriteAt: _drop, ...rest } = m;
  return rest as SavedMeal;
}

const byStarDesc = (a: SavedMeal, b: SavedMeal) => (starredAt(b) ?? 0) - (starredAt(a) ?? 0) || updated(b).localeCompare(updated(a));
const byUpdatedDesc = (a: SavedMeal, b: SavedMeal) => updated(b).localeCompare(updated(a));

/** Favourites first (newest star first), then the rest (newest change first). Read once per visit. */
export function orderSavedMeals(meals: readonly SavedMeal[]): SavedMeal[] {
  const fav = meals.filter(isFavoriteMeal).sort(byStarDesc);
  const rest = meals.filter((m) => !isFavoriteMeal(m)).sort(byUpdatedDesc);
  return [...fav, ...rest];
}

/** The favourite meals only, newest star first. */
export function favoriteMeals(meals: readonly SavedMeal[]): SavedMeal[] {
  return meals.filter(isFavoriteMeal).sort(byStarDesc);
}

/**
 * The + sheet's saved-meal tile (`quick-usual-saved`): the meal changed last, leaving out the meals the
 * row already shows as favourite tiles (`skip`, their ids). Null for none.
 */
export function quickLogMeal(meals: readonly SavedMeal[], skip: readonly string[] = []): SavedMeal | null {
  const rest = meals.filter((m) => !skip.includes(m.id)).sort(byUpdatedDesc);
  return rest[0] ?? null;
}

/**
 * The meals in the order fixed when the visit began (`order`, ids from `orderSavedMeals` on focus), so a
 * star changes only its icon until the next visit. A meal that is new since then (saved during the visit)
 * leads, in `orderSavedMeals` order; a meal deleted since then is left out. No order yet: `orderSavedMeals`.
 */
export function inVisitOrder(meals: readonly SavedMeal[], order: readonly string[] | null): SavedMeal[] {
  if (!order) return orderSavedMeals(meals);
  const byId = new Map(meals.map((m) => [m.id, m]));
  const known = new Set(order);
  const fresh = orderSavedMeals(meals.filter((m) => !known.has(m.id)));
  return [...fresh, ...order.map((id) => byId.get(id)).filter((m): m is SavedMeal => !!m)];
}

/**
 * The favourite foods search's Favourites tab lists on this visit (ids): the ones starred since the visit
 * began first (in `live` order, newest first), then the ones that were favourites when it began, in that
 * order, starred or not now. A food unstarred there stays listed with its outline star until the next
 * visit, as a meal does, so it can be starred again and no row moves from under the finger.
 */
export function favoriteFoodsInVisit(live: readonly string[], visit: readonly string[] | null): string[] {
  if (!visit) return [...live];
  const known = new Set(visit);
  return [...live.filter((id) => !known.has(id)), ...visit];
}

/**
 * The entries of `meal` on `date` to offer as "Save lunch as a meal" (the row in Saved meals): two or more
 * different foods (`distinctFoodCount`; drinks logged on Water left out) that are not already a saved meal's set of foods. Null when
 * there is nothing to offer. The entries returned are the meal's own, drinks included (the save sheet leaves
 * them out, as `saveMeal` does).
 */
export function mealToSave(entries: readonly FoodEntry[], meal: string, date: string, meals: readonly SavedMeal[]): FoodEntry[] | null {
  const list = entries.filter((e) => e.date === date && e.meal === meal && !e.deleted);
  const food = list.filter((e) => !isWaterDrinkEntry(e));
  if (distinctFoodCount(food) < 2 || sameFoodsAsSaved(food, meals)) return null;
  return [...list].sort((a, b) => (a.loggedAt ?? '').localeCompare(b.loggedAt ?? ''));
}

/**
 * How many different foods these entries hold, by the food key `sameFoodsAsSaved` compares (drinks
 * logged on Water and deleted entries left out): two entries of one food count once, so a banana
 * logged twice is never offered as a meal of two foods ("Banana, Banana").
 */
export function distinctFoodCount(entries: readonly FoodEntry[]): number {
  return new Set(entries.filter((e) => !isWaterDrinkEntry(e) && !e.deleted).map(foodKey)).size;
}

const itemKey = (it: Pick<SavedMealItem, 'food' | 'name' | 'brand'>) => foodKey({ foodId: it.food?.id, name: it.name, brand: it.brand });

/** The set of foods, as `ideas.ts` dedupes meals: one key per food, sorted. */
function foodSet(keys: string[]): string {
  return [...new Set(keys)].sort().join('|');
}

/**
 * Do these diary entries hold the same set of foods as a live saved meal? (The same food key What fits
 * uses to tell two meals apart; drinks logged on Water are left out, as a save leaves them out.) A lunch
 * just saved from the AI review, or logged from a saved meal, answers true.
 */
export function sameFoodsAsSaved(entries: readonly FoodEntry[], meals: readonly SavedMeal[]): boolean {
  const food = entries.filter((e) => !isWaterDrinkEntry(e));
  if (!food.length) return false;
  const set = foodSet(food.map(foodKey));
  return meals.some((m) => !m.deleted && Array.isArray(m.items) && m.items.length > 0 && foodSet(m.items.map(itemKey)) === set);
}
