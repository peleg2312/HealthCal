/**
 * The single path for writing food to the diary. Screens call these helpers
 * instead of touching the store directly so every entry is built the same way,
 * recents stay up to date, and every add or delete can be undone.
 */
import { nowISO } from '@/lib/id';
import { MEAL_LABEL } from '@/lib/nutrition';
import { useStore } from '@/store';
import { live } from '@/store/selectors';
import type { Food, FoodEntry, ISODate, MealType, Nutrients, SavedMeal, SavedMealItem, Serving } from '@/types';
import { haptic, toast } from '@/ui';

import { buildEntry, planSavedMeal } from './build';

export { buildEntry } from './build';

export interface LogFoodInput {
  food: Food;
  serving: Serving;
  quantity: number;
  meal: MealType;
  date: ISODate;
  /** Pass to update an existing entry instead of adding one. */
  entryId?: string;
}

/** How sure the latest estimate of this AI food was, so a re-log keeps the same band. */
function lastConfidence(food: Food): number | undefined {
  if (food.source !== 'ai') return undefined;
  let best: FoodEntry | undefined;
  for (const e of live(useStore.getState().foodEntries)) {
    if (e.foodId !== food.id || e.confidence === undefined) continue;
    if (!best || e.loggedAt > best.loggedAt) best = e;
  }
  return best?.confidence;
}

function announce(message: string, ids: string[]) {
  haptic.success();
  toast(message, { label: 'Undo', onPress: () => ids.forEach((id) => useStore.getState().remove('foodEntries', id)) });
}

/** Rewrite an existing entry with a new food, serving or amount. Keeps when it was logged and scales an estimate's range. */
function rewriteEntry(input: LogFoodInput & { entryId: string }): FoodEntry {
  const store = useStore.getState();
  const built = buildEntry({ ...input, confidence: lastConfidence(input.food) });
  const existing = store.foodEntries[input.entryId];
  // An edited estimate is still an estimate: keep its range, scaled to the new amount.
  const scale = existing?.kcalRange && existing.nutrients.kcal > 0 ? built.nutrients.kcal / existing.nutrients.kcal : null;
  return store.upsert('foodEntries', {
    ...built,
    id: input.entryId,
    loggedAt: existing?.loggedAt ?? built.loggedAt,
    ...(scale !== null && existing?.kcalRange
      ? { kcalRange: [Math.round(existing.kcalRange[0] * scale), Math.round(existing.kcalRange[1] * scale)] as [number, number], confidence: existing.confidence }
      : null),
  });
}

export function logFood(input: LogFoodInput): FoodEntry {
  const store = useStore.getState();
  if (input.entryId) {
    const before = store.foodEntries[input.entryId];
    const entry = rewriteEntry({ ...input, entryId: input.entryId });
    haptic.success();
    // Undo puts the entry back exactly as it was (amount, meal and day).
    toast('Entry updated', before ? { label: 'Undo', onPress: () => useStore.getState().upsert('foodEntries', before) } : undefined);
    return entry;
  }
  const entry = store.upsert('foodEntries', buildEntry({ ...input, confidence: lastConfidence(input.food) }));
  store.rememberFood(input.food);
  announce(`Added to ${MEAL_LABEL[input.meal].toLowerCase()}`, [entry.id]);
  return entry;
}

/**
 * Quietly change the amount of an entry that was just added (the search row
 * stepper): no toast per tap. A quantity of zero removes it, with Undo.
 * Pass `serving` to switch the serving as well.
 */
export function setEntryAmount(entry: FoodEntry, quantity: number, serving?: Serving): FoodEntry | null {
  if (!(quantity > 0)) {
    deleteEntry(entry);
    return null;
  }
  if (!entry.food) return entry;
  const s = serving ?? { label: entry.servingLabel, grams: entry.quantity > 0 ? entry.grams / entry.quantity : entry.grams };
  haptic.select();
  return rewriteEntry({ food: entry.food, serving: s, quantity, meal: entry.meal, date: entry.date, entryId: entry.id });
}

/** Calories-only (optionally macros) entry for when the user just knows the number. */
export function logQuickAdd(input: { name: string; nutrients: Nutrients; meal: MealType; date: ISODate }): FoodEntry {
  const entry = useStore.getState().upsert('foodEntries', {
    date: input.date,
    meal: input.meal,
    name: input.name.trim() || 'Quick add',
    emoji: '⚡',
    source: 'quick',
    verified: false,
    servingLabel: '1 serving',
    quantity: 1,
    grams: 0,
    nutrients: input.nutrients,
    loggedAt: nowISO(),
  });
  announce(`Added to ${MEAL_LABEL[input.meal].toLowerCase()}`, [entry.id]);
  return entry;
}

/** Re-log a set of existing entries or saved-meal items onto a day and meal. */
export function logItems(items: (SavedMealItem | FoodEntry)[], meal: MealType, date: ISODate, label?: string): FoodEntry[] {
  if (items.length === 0) return [];
  const entries = useStore.getState().upsertMany(
    'foodEntries',
    items.map((it) => ({
      date,
      meal,
      name: it.name,
      brand: it.brand,
      emoji: it.emoji,
      // A copied or saved estimate is still an estimate: keep its range and confidence.
      ...(it.kcalRange ? { kcalRange: it.kcalRange, confidence: it.confidence } : null),
      foodId: it.food?.id,
      source: it.source,
      verified: it.verified,
      servingLabel: it.servingLabel,
      quantity: it.quantity,
      grams: it.grams,
      nutrients: it.nutrients,
      food: it.food,
      loggedAt: nowISO(),
    })),
  );
  announce(label ?? `${entries.length} ${entries.length === 1 ? 'item' : 'items'} added to ${MEAL_LABEL[meal].toLowerCase()}`, entries.map((e) => e.id));
  return entries;
}

/**
 * Log a saved meal. A plain meal adds its items (all, or the ticked ones); a
 * recipe with servings adds one line for the portion (one serving unless
 * given). Use this from every place that logs a saved meal.
 */
export function logSavedMeal(
  meal: SavedMeal,
  mealType: MealType,
  date: ISODate,
  opts: { portion?: number; include?: boolean[] } = {},
): FoodEntry[] {
  const plan = planSavedMeal(meal, opts);
  return logItems(plan.items, mealType, date, `${meal.name} added to ${MEAL_LABEL[mealType].toLowerCase()}`);
}

export function deleteEntry(entry: FoodEntry): void {
  useStore.getState().remove('foodEntries', entry.id);
  haptic.tap();
  toast(`Removed ${entry.name}`, { label: 'Undo', onPress: () => useStore.getState().restore('foodEntries', entry.id) });
}

export function toSavedMealItem(e: FoodEntry): SavedMealItem {
  return {
    name: e.name,
    brand: e.brand,
    emoji: e.emoji,
    ...(e.kcalRange ? { kcalRange: e.kcalRange, confidence: e.confidence } : null),
    servingLabel: e.servingLabel,
    quantity: e.quantity,
    grams: e.grams,
    nutrients: e.nutrients,
    food: e.food,
    source: e.source,
    verified: e.verified,
  };
}
