/**
 * Diary-level actions built on top of `@/features/food/log`: copying meals and
 * days, clearing a meal, saving a meal, and managing custom foods. Every one
 * of them can be undone from the toast.
 */
import { followEntry, undoEdit } from '@/features/drinks/pair';
import { DRINKS_NOT_COPIED, DRINKS_NOT_SAVED } from '@/features/drinks/rules';
import { isWaterDrinkEntry } from '@/features/drinks/via';
import { addDays } from '@/lib/dates';
import { nowISO } from '@/lib/id';
import { MEAL_LABEL } from '@/lib/nutrition';
import { useStore } from '@/store';
import { live } from '@/store/selectors';
import type { CustomFood, FoodEntry, ISODate, MealType, Nutrients, SavedMeal, SavedMealItem } from '@/types';
import { haptic, toast } from '@/ui';

import { dayPhrase } from './helpers';

import { deleteEntry, logItems, toSavedMealItem } from './log';

const sortByLogged = (a: FoodEntry, b: FoodEntry) => a.loggedAt.localeCompare(b.loggedAt);

function liveEntries(): FoodEntry[] {
  return live(useStore.getState().foodEntries);
}

/** Most recent day before `date` (within `maxDays`) that has entries in `meal`. Drinks from the water screen are left out. */
export function findPreviousMeal(
  entries: FoodEntry[],
  date: ISODate,
  meal: MealType,
  maxDays = 60,
): { date: ISODate; entries: FoodEntry[] } | null {
  const byDate = new Map<ISODate, FoodEntry[]>();
  const floor = addDays(date, -maxDays);
  for (const e of entries) {
    if (e.meal !== meal || e.date >= date || e.date < floor || isWaterDrinkEntry(e)) continue;
    const list = byDate.get(e.date) ?? [];
    list.push(e);
    byDate.set(e.date, list);
  }
  const latest = [...byDate.keys()].sort().pop();
  return latest ? { date: latest, entries: byDate.get(latest)!.sort(sortByLogged) } : null;
}

/** Most recent day before `date` with anything logged. Drinks from the water screen are left out (they are logged on Water again). */
export function findPreviousDay(entries: FoodEntry[], date: ISODate, maxDays = 60): { date: ISODate; entries: FoodEntry[] } | null {
  const floor = addDays(date, -maxDays);
  const food = entries.filter((e) => !isWaterDrinkEntry(e));
  let latest: ISODate | null = null;
  for (const e of food) if (e.date < date && e.date >= floor && (!latest || e.date > latest)) latest = e.date;
  if (!latest) return null;
  return { date: latest, entries: food.filter((e) => e.date === latest).sort(sortByLogged) };
}

function undoAll(ids: string[]) {
  const s = useStore.getState();
  ids.forEach((id) => s.remove('foodEntries', id));
}

/**
 * Copy entries (any meals) onto a day, keeping each entry's meal unless `meal` is given. Drinks from
 * the water screen are not copied: their water is not copied, and they are logged on Water again.
 */
export function copyEntries(entries: FoodEntry[], toDate: ISODate, meal?: MealType, message?: string): FoodEntry[] {
  const food = entries.filter((e) => !isWaterDrinkEntry(e));
  if (food.length === 0) {
    if (entries.length > 0) toast(DRINKS_NOT_COPIED);
    return [];
  }
  const groups = new Map<MealType, FoodEntry[]>();
  for (const e of [...food].sort(sortByLogged)) {
    const m = meal ?? e.meal;
    groups.set(m, [...(groups.get(m) ?? []), e]);
  }
  const created: FoodEntry[] = [];
  for (const [m, list] of groups) created.push(...logItems(list, m, toDate));
  // One toast whose Undo covers every meal that was copied.
  const ids = created.map((e) => e.id);
  toast(message ?? `Copied ${created.length} ${created.length === 1 ? 'item' : 'items'} to ${dayPhrase(toDate)}`, {
    label: 'Undo',
    onPress: () => undoAll(ids),
  });
  return created;
}

export function copyPreviousMeal(date: ISODate, meal: MealType): boolean {
  const prev = findPreviousMeal(liveEntries(), date, meal);
  if (!prev) {
    toast(`No earlier ${MEAL_LABEL[meal].toLowerCase()} to copy`);
    return false;
  }
  copyEntries(prev.entries, date, meal, `Copied ${MEAL_LABEL[meal].toLowerCase()} from ${dayPhrase(prev.date)}`);
  return true;
}

export function copyPreviousDay(date: ISODate): boolean {
  const prev = findPreviousDay(liveEntries(), date);
  if (!prev) {
    toast('No earlier day to copy');
    return false;
  }
  copyEntries(prev.entries, date, undefined, `Copied ${prev.entries.length} items from ${dayPhrase(prev.date)}`);
  return true;
}

export function clearEntries(entries: FoodEntry[], label: string): void {
  if (entries.length === 0) return;
  if (entries.length === 1) {
    deleteEntry(entries[0]);
    return;
  }
  const s = useStore.getState();
  const ids = entries.map((e) => e.id);
  ids.forEach((id) => s.remove('foodEntries', id));
  haptic.tap();
  toast(`Cleared ${label}`, { label: 'Undo', onPress: () => ids.forEach((id) => useStore.getState().restore('foodEntries', id)) });
}

/** Save entries as a meal. Drinks from the water screen are left out; with nothing else, no meal is saved and the toast says why. */
export function saveMeal(name: string, entries: FoodEntry[]): SavedMeal | null {
  if (entries.length === 0) return null;
  const food = entries.filter((e) => !isWaterDrinkEntry(e));
  if (food.length === 0) {
    toast(DRINKS_NOT_SAVED);
    return null;
  }
  const meal = useStore.getState().upsert('savedMeals', { name: name.trim() || 'Saved meal', items: food.map(toSavedMealItem) });
  haptic.success();
  toast(`Saved "${meal.name}"`, { label: 'Undo', onPress: () => useStore.getState().remove('savedMeals', meal.id) });
  return meal;
}

/**
 * Store a meal built or edited in the meal builder. Servings of 1 or less mean
 * a plain meal. Undo removes a new meal or puts an edited one back as it was.
 */
export function storeSavedMeal(input: { id: string | null; name: string; servings: number | null; items: SavedMealItem[] }): SavedMeal | null {
  if (input.items.length === 0) return null;
  const store = useStore.getState();
  const before = input.id ? store.savedMeals[input.id] : undefined;
  const servings = input.servings && input.servings > 1 ? Math.round(input.servings * 100) / 100 : 1;
  const meal = store.upsert('savedMeals', {
    ...(before && !before.deleted ? before : null),
    ...(input.id ? { id: input.id } : null),
    name: input.name.trim() || 'Saved meal',
    items: input.items,
    servings,
  });
  haptic.success();
  toast(before ? `Saved changes to "${meal.name}"` : `Saved "${meal.name}"`, {
    label: 'Undo',
    onPress: () => (before ? useStore.getState().upsert('savedMeals', before) : useStore.getState().remove('savedMeals', meal.id)),
  });
  return meal;
}

export function renameSavedMeal(meal: SavedMeal, name: string): void {
  const trimmed = name.trim();
  if (!trimmed || trimmed === meal.name) return;
  useStore.getState().upsert('savedMeals', { ...meal, name: trimmed });
  toast('Renamed');
}

export function deleteSavedMeal(meal: SavedMeal): void {
  useStore.getState().remove('savedMeals', meal.id);
  haptic.tap();
  toast(`Deleted "${meal.name}"`, { label: 'Undo', onPress: () => useStore.getState().restore('savedMeals', meal.id) });
}

export function deleteCustomFood(food: CustomFood): void {
  useStore.getState().remove('customFoods', food.id);
  haptic.tap();
  toast(`Deleted ${food.name}`, { label: 'Undo', onPress: () => useStore.getState().restore('customFoods', food.id) });
}

/**
 * Edit an entry that has no food definition behind it (AI estimate or quick
 * add): name, calories and macros are changed directly. A changed calorie
 * value replaces the AI range, since the number is now the user's own.
 */
export function updateEntryDirect(
  entry: FoodEntry,
  patch: { name: string; nutrients: Nutrients; meal: MealType; date: ISODate },
): FoodEntry {
  const kcalChanged = Math.round(patch.nutrients.kcal) !== Math.round(entry.nutrients.kcal);
  const next = useStore.getState().upsert('foodEntries', {
    ...entry,
    name: patch.name.trim() || entry.name,
    nutrients: { ...entry.nutrients, ...patch.nutrients },
    meal: patch.meal,
    date: patch.date,
    kcalRange: kcalChanged ? undefined : entry.kcalRange,
    confidence: kcalChanged ? undefined : entry.confidence,
    loggedAt: entry.loggedAt ?? nowISO(),
  });
  // A drink from Water: its water record follows the new day (an entered drink has no grams to scale).
  const waterBefore = entry.deleted ? null : followEntry(entry, next);
  haptic.success();
  toast('Entry updated', { label: 'Undo', onPress: () => undoEdit(entry, waterBefore) });
  return next;
}
