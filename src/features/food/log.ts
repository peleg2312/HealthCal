/**
 * The single path for writing food to the diary. Screens call these helpers
 * instead of touching the store directly so every entry is built the same way,
 * recents stay up to date, and every add or delete can be undone.
 */
import { diaryDrink, withWater } from '@/features/drinks/diary';
import { followEntry, pairEditBlocked, undoEdit } from '@/features/drinks/pair';
import { entryFor, removedEntryToast, removedWaterToast, waterFor, type DrinkPlan } from '@/features/drinks/rules';
import { isolateRtl } from '@/lib/bidi';
import { today } from '@/lib/dates';
import { nowISO } from '@/lib/id';
import { useStore } from '@/store';
import { live } from '@/store/selectors';
import type { Food, FoodEntry, ISODate, MealType, Nutrients, SavedMeal, SavedMealItem, Serving, UnitSystem, WaterEntry } from '@/types';
import { haptic, toast } from '@/ui';

import { entryRemovedToast, entryUpdatedToast, foodAddedToast, mealOnDay, quickAddedToast } from './addedTo';
import { bandSpread, buildEntry, planSavedMeal } from './build';
import { displayFoodName } from './displayName';
import { addedAndSavedToast } from './saveWords';
import { currentValues } from './usuals';

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

const unitsNow = (): UnitSystem => useStore.getState().profile?.units ?? 'metric';

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
    const moved = !!before && (before.meal !== entry.meal || before.date !== entry.date);
    toast(entryUpdatedToast(displayFoodName(entry), moved, where(entry.meal, entry.date)), before ? { label: 'Undo', onPress: () => undoEdit(before, waterBefore) } : undefined);
    return entry;
  }
  const built = buildEntry({ ...input, ...lastEstimate(input.food) });
  // A drink logged as food also adds its volume to Water, written with the entry in one act (one of the
  // two places that create this water; the store's cascade makes the toast's Undo take both back).
  const [{ entry, water }] = store.upsertEntriesWithWater([{ entry: built, water: diaryDrink(built, store.profile) }]);
  const recentsBefore = store.recentFoods;
  store.rememberFood(input.food);
  // The toast names what was added, then where: "Banana added to breakfast" ("…, 500 ml to Water" for a drink).
  announce(withWater(foodAddedToast(displayFoodName(entry), where(input.meal, input.date)), water?.ml, unitsNow()), [entry.id], () => {
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
  // Its name when one was typed, else its calories: "320 kcal added to lunch".
  announce(quickAddedToast(input.name, input.nutrients.kcal, where(input.meal, input.date)), [entry.id]);
  return entry;
}

/**
 * Write a set of existing entries or saved-meal items onto a day and meal, without a toast. A bundled food
 * goes in at today's values for its own grams (`currentValues`); everything else as it was stored. Each
 * drink among them also adds its volume to Water (`diaryDrink`), in the same act as its entry; `ml` is
 * the water written in all, for the caller's toast (`withWater`). The second of the two places that
 * create a diary drink's water.
 */
export function addItems(items: (SavedMealItem | FoodEntry)[], meal: MealType, date: ISODate): { entries: FoodEntry[]; ml: number } {
  if (items.length === 0) return { entries: [], ml: 0 };
  const store = useStore.getState();
  const rows = items.map(currentValues).map((it) => ({
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
  }));
  const written = store.upsertEntriesWithWater(rows.map((r) => ({ entry: r, water: diaryDrink(r, store.profile) })));
  return { entries: written.map((w) => w.entry), ml: written.reduce((n, w) => n + (w.water?.ml ?? 0), 0) };
}

/**
 * Re-log a set of existing entries or saved-meal items onto a day and meal (`addItems`), with one toast
 * that names the water the drinks among them added; its Undo removes every entry (and, by the store's
 * cascade, their water).
 */
export function logItems(items: (SavedMealItem | FoodEntry)[], meal: MealType, date: ISODate, label?: string): FoodEntry[] {
  const { entries, ml } = addItems(items, meal, date);
  if (entries.length === 0) return entries;
  announce(
    withWater(label ?? `${entries.length} ${entries.length === 1 ? 'item' : 'items'} added to ${where(meal, date)}`, ml, unitsNow()),
    entries.map((e) => e.id),
  );
  return entries;
}

/**
 * Log items and save them as one saved meal in one act (the AI review's "Also save as a meal"): one
 * toast that names the meal ("4 items added to lunch, saved as "Chicken and rice""), one Undo that
 * takes back the entries (and, by the store's cascade, any water a drink among them added) and the
 * saved meal. The meal's items are the entries just written (`toSavedMealItem`), so what is saved is
 * exactly what was logged: each AI row with its source, `kcalRange` and `confidence`, the fat answer's
 * row and any swap or correction. Nothing is saved when nothing was logged.
 *
 * It runs on the phone only: it never calls the AI and uses no estimate allowance, and neither does
 * logging the saved meal later (`logSavedMeal`). This file imports no AI service (log.test.ts reads
 * the code map to hold that).
 *
 * `windowWidth` is the window's width when the person tapped (read in the screen's handler), so the
 * toast keeps as much of the name as two lines hold on that phone (`addedAndSavedToast`).
 */
export function logAndSaveMeal(items: SavedMealItem[], meal: MealType, date: ISODate, name: string, windowWidth?: number): { entries: FoodEntry[]; saved: SavedMeal | null } {
  const { entries, ml } = addItems(items, meal, date);
  if (entries.length === 0) return { entries, saved: null };
  const store = useStore.getState();
  const saved = store.upsert('savedMeals', { name: name.replace(/\s+/g, ' ').trim().slice(0, 60).trim() || 'Saved meal', items: entries.map(toSavedMealItem) });
  const ids = entries.map((e) => e.id);
  haptic.success();
  toast(addedAndSavedToast({ count: entries.length, where: where(meal, date), name: saved.name, ml, units: unitsNow(), width: windowWidth }), {
    label: 'Undo',
    onPress: () => {
      const s = useStore.getState();
      ids.forEach((id) => s.remove('foodEntries', id));
      s.remove('savedMeals', saved.id);
    },
  });
  return { entries, saved };
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
  return logItems(plan.items, mealType, date, `${isolateRtl(meal.name)} added to ${where(mealType, date)}`);
}

/**
 * Delete a diary entry (soft, with Undo). The toast says what and where in the words of the meal card's
 * Restore row ("Almonds removed from breakfast", `entryRemovedToast`). An entry a drink from Water points
 * at goes alone: the calories are removed and the water stays counted ("Milk removed from lunch. The
 * 250 ml stays in Water."). A drink logged in the diary takes its water with it (the store's cascade):
 * "Cola removed from lunch and its 370 ml from Water", and Undo brings both back.
 */
export function deleteEntry(entry: FoodEntry): void {
  const water = waterFor(useStore.getState().water, entry.id)?.water ?? null;
  useStore.getState().remove('foodEntries', entry.id);
  haptic.tap();
  const removed = entryRemovedToast(displayFoodName(entry), mealOnDay(entry.meal, entry.date, today()));
  const message = water ? removedEntryToast(removed, water, unitsNow()) : removed;
  toast(message, { label: 'Undo', onPress: () => useStore.getState().restore('foodEntries', entry.id) });
}

/**
 * Log a drink from the water screen as planned by `planDrink` (@/features/drinks/rules): the diary
 * entry first (when the drink has calories), then the water record pointing at it. No recents (a
 * drink from Water never enters them), haptic.success, one toast tinted 'water' whose Undo removes both
 * (the store's cascade). Plain water writes exactly the record and toast the water screen always did.
 */
export function logDrink(plan: DrinkPlan): { water: WaterEntry; entry: FoodEntry | null } {
  const store = useStore.getState();
  const entry = plan.entry ? store.upsert('foodEntries', plan.entry) : null;
  const water = store.upsert('water', entry ? { ...plan.water, foodEntryId: entry.id } : plan.water);
  // A drink logged is "logged", as Today's glass is (haptic.success; tap means a delete). Crossing the goal is
  // marked by the vessel itself (its brim line, and its onReached on the Water screen).
  haptic.success();
  toast(plan.toast, { label: 'Undo', tint: 'water', onPress: () => useStore.getState().remove('water', water.id) });
  return { water, entry };
}

/**
 * Delete a drink on the water screen (soft, with Undo). A drink logged on Water with live calories in
 * the diary takes them with it, in one store act ("Removed 250 ml of milk and its 129 kcal"); Undo brings
 * both back. Water a drink logged in the diary added goes alone ("Removed 370 ml. The drink stays in
 * lunch."); Undo restores it with its link.
 */
export function removeDrink(water: WaterEntry): void {
  const s = useStore.getState();
  const partner = entryFor(water, s.foodEntries)?.entry ?? null;
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
