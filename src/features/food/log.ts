/**
 * The single path for writing food to the diary. Screens call these helpers
 * instead of touching the store directly so every entry is built the same way,
 * recents stay up to date, and every add or delete can be undone.
 */
import { nowISO } from '@/lib/id';
import { MEAL_LABEL, scaleNutrients } from '@/lib/nutrition';
import { useStore } from '@/store';
import type { AiFoodItem, Food, FoodEntry, ISODate, MealType, Nutrients, SavedMealItem, Serving } from '@/types';
import { haptic, toast } from '@/ui';

export interface LogFoodInput {
  food: Food;
  serving: Serving;
  quantity: number;
  meal: MealType;
  date: ISODate;
  /** Pass to update an existing entry instead of adding one. */
  entryId?: string;
}

/** Build the diary line for a food definition and an amount. Pure. */
export function buildEntry({ food, serving, quantity, meal, date }: Omit<LogFoodInput, 'entryId'>): Omit<FoodEntry, 'id' | 'updatedAt'> {
  const grams = serving.grams * quantity;
  return {
    date,
    meal,
    name: food.name,
    brand: food.brand,
    emoji: food.emoji,
    foodId: food.id,
    source: food.source,
    verified: food.verified,
    servingLabel: serving.label,
    quantity,
    grams,
    nutrients: scaleNutrients(food.per100g, grams),
    food,
    loggedAt: nowISO(),
  };
}

function announce(message: string, ids: string[]) {
  haptic.success();
  toast(message, { label: 'Undo', onPress: () => ids.forEach((id) => useStore.getState().remove('foodEntries', id)) });
}

export function logFood(input: LogFoodInput): FoodEntry {
  const store = useStore.getState();
  const built = buildEntry(input);
  if (input.entryId) {
    const existing = store.foodEntries[input.entryId];
    // An edited estimate is still an estimate: keep its range, scaled to the new amount.
    const scale = existing?.kcalRange && existing.nutrients.kcal > 0 ? built.nutrients.kcal / existing.nutrients.kcal : null;
    const entry = store.upsert('foodEntries', {
      ...built,
      id: input.entryId,
      loggedAt: existing?.loggedAt ?? built.loggedAt,
      ...(scale !== null && existing?.kcalRange
        ? { kcalRange: [Math.round(existing.kcalRange[0] * scale), Math.round(existing.kcalRange[1] * scale)] as [number, number], confidence: existing.confidence }
        : null),
    });
    haptic.success();
    toast('Entry updated');
    return entry;
  }
  const entry = store.upsert('foodEntries', built);
  store.rememberFood(input.food);
  announce(`Added to ${MEAL_LABEL[input.meal].toLowerCase()}`, [entry.id]);
  return entry;
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

/** Items confirmed by the user after an AI photo or text analysis. */
export function logAiItems(items: AiFoodItem[], meal: MealType, date: ISODate): FoodEntry[] {
  const entries = useStore.getState().upsertMany(
    'foodEntries',
    items.map((it) => {
      // Lower confidence widens the band shown next to the estimate.
      const spread = 0.15 + (1 - Math.min(1, Math.max(0, it.confidence))) * 0.3;
      return {
        date,
        meal,
        name: it.name,
        emoji: '✨',
        source: 'ai' as const,
        verified: false,
        servingLabel: `${Math.round(it.grams)} g`,
        quantity: 1,
        grams: it.grams,
        nutrients: { kcal: it.kcal, protein: it.protein, carbs: it.carbs, fat: it.fat, fiber: it.fiber },
        kcalRange: [Math.round(it.kcal * (1 - spread)), Math.round(it.kcal * (1 + spread))] as [number, number],
        confidence: it.confidence,
        loggedAt: nowISO(),
      };
    }),
  );
  announce(`${entries.length} ${entries.length === 1 ? 'item' : 'items'} added to ${MEAL_LABEL[meal].toLowerCase()}`, entries.map((e) => e.id));
  return entries;
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
      emoji: it.emoji,
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

export function deleteEntry(entry: FoodEntry): void {
  useStore.getState().remove('foodEntries', entry.id);
  haptic.tap();
  toast(`Removed ${entry.name}`, { label: 'Undo', onPress: () => useStore.getState().restore('foodEntries', entry.id) });
}

export function toSavedMealItem(e: FoodEntry): SavedMealItem {
  return {
    name: e.name,
    emoji: e.emoji,
    servingLabel: e.servingLabel,
    quantity: e.quantity,
    grams: e.grams,
    nutrients: e.nutrients,
    food: e.food,
    source: e.source,
    verified: e.verified,
  };
}
