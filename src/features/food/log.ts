/**
 * The single path for writing food to the diary. Screens call these helpers
 * instead of touching the store directly so every entry is built the same way,
 * recents stay up to date, and every add or delete can be undone.
 */
import { followEntry, pairEditBlocked, undoEdit } from '@/features/drinks/pair';
import { livePartner, removedEntryToast, removedWaterToast, waterPointingAt, type DrinkPlan } from '@/features/drinks/rules';
import { today } from '@/lib/dates';
import { nowISO } from '@/lib/id';
import { useStore } from '@/store';
import { live } from '@/store/selectors';
import type { Food, FoodEntry, ISODate, MealType, Nutrients, SavedMeal, SavedMealItem, Serving, UnitSystem, WaterEntry } from '@/types';
import { haptic, toast } from '@/ui';

import { mealOnDay } from './addedTo';
import { bandSpread, buildEntry, planSavedMeal } from './build';

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
/** How sure the last log of an AI food was, and how wide its band was (so a photo estimate keeps its wider band). */
function lastEstimate(food: Food): { confidence?: number; spread?: number } {
  if (food.source !== 'ai') return {};
  let best: FoodEntry | undefined;
  for (const e of live(useStore.getState().foodEntries)) {
    if (e.foodId !== food.id || e.confidence === undefined) continue;
    if (!best || e.loggedAt > best.loggedAt) best = e;
  }
  return best ? { confidence: best.confidence, spread: bandSpread(best.kcalRange, best.nutrients.kcal) } : {};
}

/** The meal and, when it is not today, the day: read at the moment of the log (an event handler), never while rendering. */
function where(meal: MealType, date: ISODate): string {
  return mealOnDay(meal, date, today());
}

function announce(message: string, ids: string[], alsoUndo?: () => void) {
  haptic.success();
  toast(message, {
    label: 'Undo',
    onPress: () => {
      ids.forEach((id) => useStore.getState().remove('foodEntries', id));
      alsoUndo?.();
    },
  });
}

/**
 * What Undo does to recents after a food was logged: the list goes back to how it was,
 * unless something else has been logged since (then the newer list stands).
 */
export function recentsAfterUndo<T extends { id: string }>(now: readonly T[], before: readonly T[], foodId: string): readonly T[] {
  return now[0]?.id === foodId ? before : now;
}

/**
 * Rewrite an existing entry with a new food, serving or amount. Keeps when it was logged, scales an
 * estimate's range, keeps a drink's `via`, and moves the drink's water record with it (followEntry);
 * `waterBefore` is that record as it was, for Undo.
 */
function rewriteEntry(input: LogFoodInput & { entryId: string }): { entry: FoodEntry; waterBefore: WaterEntry | null; refused?: string } {
  const store = useStore.getState();
  const built = buildEntry({ ...input, ...lastEstimate(input.food) });
  const existing = store.foodEntries[input.entryId];
  // A drink also counted in Water is never moved past today nor made larger than one water record holds.
  const refused = pairEditBlocked(existing, built);
  if (existing && refused) return { entry: existing, waterBefore: null, refused };
  // An edited estimate is still an estimate: keep its range, scaled to the new amount.
  const scale = existing?.kcalRange && existing.nutrients.kcal > 0 ? built.nutrients.kcal / existing.nutrients.kcal : null;
  const entry = store.upsert('foodEntries', {
    ...built,
    id: input.entryId,
    loggedAt: existing?.loggedAt ?? built.loggedAt,
    ...(existing?.via ? { via: existing.via } : null),
    ...(scale !== null && existing?.kcalRange
      ? { kcalRange: [Math.round(existing.kcalRange[0] * scale), Math.round(existing.kcalRange[1] * scale)] as [number, number], confidence: existing.confidence }
      : null),
  });
  const waterBefore = existing && !existing.deleted ? followEntry(existing, entry) : null;
  return { entry, waterBefore };
}

export function logFood(input: LogFoodInput): FoodEntry {
  const store = useStore.getState();
  if (input.entryId) {
    const before = store.foodEntries[input.entryId];
    const { entry, waterBefore, refused } = rewriteEntry({ ...input, entryId: input.entryId });
    if (refused) {
      haptic.warn();
      toast(refused);
      return entry;
    }
    haptic.success();
    // Undo puts the entry back exactly as it was (amount, meal and day), and a drink's water record with it.
    toast('Entry updated', before ? { label: 'Undo', onPress: () => undoEdit(before, waterBefore) } : undefined);
    return entry;
  }
  const entry = store.upsert('foodEntries', buildEntry({ ...input, ...lastEstimate(input.food) }));
  const recentsBefore = store.recentFoods;
  store.rememberFood(input.food);
  announce(`Added to ${where(input.meal, input.date)}`, [entry.id], () => {
    useStore.setState((s) => ({ recentFoods: [...recentsAfterUndo(s.recentFoods, recentsBefore, input.food.id)] }));
  });
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
  const done = rewriteEntry({ food: entry.food, serving: s, quantity, meal: entry.meal, date: entry.date, entryId: entry.id });
  if (done.refused) {
    haptic.warn();
    toast(done.refused);
    return done.entry;
  }
  haptic.select();
  return done.entry;
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
  announce(`Added to ${where(input.meal, input.date)}`, [entry.id]);
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
  announce(label ?? `${entries.length} ${entries.length === 1 ? 'item' : 'items'} added to ${where(meal, date)}`, entries.map((e) => e.id));
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
  return logItems(plan.items, mealType, date, `${meal.name} added to ${where(mealType, date)}`);
}

const unitsNow = (): UnitSystem => useStore.getState().profile?.units ?? 'metric';

/**
 * Delete a diary entry (soft, with Undo). An entry a drink's water record points at goes alone: the
 * calories are removed and the water stays counted, and the toast says so.
 */
export function deleteEntry(entry: FoodEntry): void {
  const water = waterPointingAt(useStore.getState().water, entry.id);
  useStore.getState().remove('foodEntries', entry.id);
  haptic.tap();
  const message = water ? removedEntryToast(entry.name, water, unitsNow()) : `Removed ${entry.name}`;
  toast(message, { label: 'Undo', onPress: () => useStore.getState().restore('foodEntries', entry.id) });
}

/**
 * Log a drink from the water screen as planned by `planDrink` (@/features/drinks/rules): the diary
 * entry first (when the drink has calories), then the water record pointing at it. No recents (a
 * drink from Water never enters them), haptic.tap, one toast tinted 'water' whose Undo removes both
 * (the store's cascade). Plain water writes exactly the record and toast the water screen always did.
 */
export function logDrink(plan: DrinkPlan): { water: WaterEntry; entry: FoodEntry | null } {
  const store = useStore.getState();
  const entry = plan.entry ? store.upsert('foodEntries', plan.entry) : null;
  const water = store.upsert('water', entry ? { ...plan.water, foodEntryId: entry.id } : plan.water);
  // Crossing the goal is marked by the vessel itself (its onReached adds the success haptic).
  haptic.tap();
  toast(plan.toast, { label: 'Undo', tint: 'water', onPress: () => useStore.getState().remove('water', water.id) });
  return { water, entry };
}

/**
 * Delete a drink on the water screen (soft, with Undo). A drink with live calories in the diary takes
 * them with it, in one store act ("Removed 250 ml of milk and its 129 kcal"); Undo brings both back.
 */
export function removeDrink(water: WaterEntry): void {
  const s = useStore.getState();
  const partner = livePartner(water, s.foodEntries);
  s.remove('water', water.id);
  haptic.tap();
  toast(removedWaterToast(water, partner, unitsNow()), { label: 'Undo', tint: 'water', onPress: () => useStore.getState().restore('water', water.id) });
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
