/**
 * Pure builders for diary lines and saved-meal items: no React, no store, so
 * they are unit-tested directly. `log.ts` writes what these return.
 *
 * Estimates stay estimates (product principle 2): anything that started as an
 * AI estimate carries a calorie range wherever it is re-logged, re-portioned
 * or folded into a saved meal.
 */
import { itemSpread } from '@/features/ai/estimate';
import { nowISO } from '@/lib/id';
import { scaleNutrients, sumNutrients } from '@/lib/nutrition';
import type { Food, FoodEntry, ISODate, MealType, Nutrients, SavedMeal, SavedMealItem, Serving } from '@/types';

/**
 * Confidence assumed for an AI food re-logged when no earlier entry says how
 * sure the estimate was. Deliberately on the unsure side, so the range is
 * wider rather than falsely tight.
 */
export const UNKNOWN_AI_CONFIDENCE = 0.5;

/** Likely calorie band for an estimate, the same band the AI review and diary use. */
export function estimateRange(kcal: number, confidence: number): [number, number] {
  const s = itemSpread(confidence);
  return [Math.round(kcal * (1 - s)), Math.round(kcal * (1 + s))];
}

/** Scale a range by a factor (a new amount over the old one). */
export function scaleRange(range: [number, number], factor: number): [number, number] {
  const f = Number.isFinite(factor) && factor > 0 ? factor : 0;
  return [Math.round(range[0] * f), Math.round(range[1] * f)];
}

export interface BuildEntryInput {
  food: Food;
  serving: Serving;
  quantity: number;
  meal: MealType;
  date: ISODate;
  /** For an AI food: how sure the estimate was (0..1). Defaults to UNKNOWN_AI_CONFIDENCE. */
  confidence?: number;
}

/** Build the diary line for a food definition and an amount. */
export function buildEntry({ food, serving, quantity, meal, date, confidence }: BuildEntryInput): Omit<FoodEntry, 'id' | 'updatedAt'> {
  const grams = serving.grams * quantity;
  const nutrients = scaleNutrients(food.per100g, grams);
  const c = confidence ?? UNKNOWN_AI_CONFIDENCE;
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
    nutrients,
    // A re-logged estimate is still an estimate.
    ...(food.source === 'ai' ? { kcalRange: estimateRange(nutrients.kcal, c), confidence: c } : null),
    food,
    loggedAt: nowISO(),
  };
}

/** A saved-meal line for a food at an amount (the meal builder's picker). */
export function savedItemFromFood(food: Food, serving: Serving, quantity: number, confidence?: number): SavedMealItem {
  const e = buildEntry({ food, serving, quantity, meal: 'breakfast', date: '1970-01-01', confidence });
  return {
    name: e.name,
    brand: e.brand,
    emoji: e.emoji,
    servingLabel: e.servingLabel,
    quantity: e.quantity,
    grams: e.grams,
    nutrients: e.nutrients,
    food,
    source: e.source,
    verified: e.verified,
    ...(e.kcalRange ? { kcalRange: e.kcalRange, confidence: e.confidence } : null),
  };
}

function scaleNutrientsBy(n: Nutrients, f: number): Nutrients {
  const out = { ...n };
  for (const k of Object.keys(out) as (keyof Nutrients)[]) {
    const v = out[k];
    if (typeof v === 'number') out[k] = v * f;
  }
  return out;
}

/**
 * Change the amount of a saved-meal line. With a food definition the
 * nutrients are recomputed from it; without one (a quick add) they scale with
 * the quantity. A range scales with the calories.
 */
export function setItemAmount(item: SavedMealItem, serving: Serving, quantity: number): SavedMealItem {
  let next: SavedMealItem;
  if (item.food) {
    const grams = serving.grams * quantity;
    next = { ...item, servingLabel: serving.label, quantity, grams, nutrients: scaleNutrients(item.food.per100g, grams) };
  } else {
    const f = item.quantity > 0 ? quantity / item.quantity : 0;
    next = { ...item, quantity, grams: item.grams * f, nutrients: scaleNutrientsBy(item.nutrients, f) };
  }
  if (item.kcalRange) {
    const f = item.nutrients.kcal > 0 ? next.nutrients.kcal / item.nutrients.kcal : 0;
    next.kcalRange = scaleRange(item.kcalRange, f);
  }
  return next;
}

// ------------------------------------------------------------ saved meals

/** How many servings a saved meal makes (at least 1). */
export function mealServings(meal: Pick<SavedMeal, 'servings'>): number {
  const n = meal.servings;
  return typeof n === 'number' && Number.isFinite(n) && n > 1 ? n : 1;
}

/** "½", "1", "1½", "0.3" for a portion of a recipe. */
export function formatPortion(p: number): string {
  const whole = Math.floor(p + 1e-9);
  const rest = Math.round((p - whole) * 100) / 100;
  const frac: Record<string, string> = { '0.25': '¼', '0.5': '½', '0.75': '¾' };
  if (rest === 0) return String(whole);
  if (frac[String(rest)]) return `${whole > 0 ? whole : ''}${frac[String(rest)]}`;
  return String(Math.round(p * 100) / 100);
}

/** "1 of 4 servings", "½ of 4 servings". */
export function servingsPhrase(portion: number, servings: number): string {
  return `${formatPortion(portion)} of ${formatPortion(servings)} servings`;
}

/** Sum of a set of items' calorie ranges; items without one count at their exact value. Null when none is an estimate. */
export function itemsRange(items: SavedMealItem[]): [number, number] | null {
  if (!items.some((it) => it.kcalRange)) return null;
  let lo = 0;
  let hi = 0;
  for (const it of items) {
    lo += it.kcalRange ? it.kcalRange[0] : it.nutrients.kcal;
    hi += it.kcalRange ? it.kcalRange[1] : it.nutrients.kcal;
  }
  return [Math.round(lo), Math.round(hi)];
}

/** Calorie-weighted confidence of the estimated items. */
function itemsConfidence(items: SavedMealItem[]): number | undefined {
  const est = items.filter((it) => it.kcalRange && it.confidence !== undefined);
  if (!est.length) return undefined;
  const kcal = est.reduce((s, it) => s + Math.max(0, it.nutrients.kcal), 0);
  if (kcal <= 0) return est.reduce((s, it) => s + (it.confidence ?? 0), 0) / est.length;
  return est.reduce((s, it) => s + (it.confidence ?? 0) * Math.max(0, it.nutrients.kcal), 0) / kcal;
}

export interface SavedMealPlan {
  /** What goes to the diary. */
  items: SavedMealItem[];
  kcal: number;
  range: [number, number] | null;
}

/**
 * What logging a saved meal adds. A plain meal logs its ticked items as they
 * are. A recipe (servings > 1) logs one line, the ticked items summed and
 * scaled to the portion, with a food definition so it can be re-portioned
 * later. `include` defaults to every item; `portion` to one serving.
 */
export function planSavedMeal(meal: Pick<SavedMeal, 'id' | 'name' | 'items' | 'servings'>, opts: { portion?: number; include?: boolean[] } = {}): SavedMealPlan {
  const ticked = meal.items.filter((_, i) => opts.include?.[i] ?? true);
  const servings = mealServings(meal);
  if (servings <= 1) {
    const n = sumNutrients(ticked.map((it) => it.nutrients));
    return { items: ticked, kcal: n.kcal, range: itemsRange(ticked) };
  }
  if (!ticked.length) return { items: [], kcal: 0, range: null };
  const portion = opts.portion !== undefined && opts.portion > 0 ? opts.portion : 1;
  const f = portion / servings;
  if (ticked.length < meal.items.length) {
    // Some ingredients were left out, so this is not a serving of the recipe: log what was
    // ticked, each scaled to the portion, under its own name.
    const items = ticked.map((it) => ({
      ...it,
      quantity: it.quantity * f,
      grams: it.grams * f,
      nutrients: scaleNutrientsBy(it.nutrients, f),
      ...(it.kcalRange ? { kcalRange: scaleRange(it.kcalRange, f) } : null),
    }));
    const n = sumNutrients(items.map((it) => it.nutrients));
    return { items, kcal: n.kcal, range: itemsRange(items) };
  }
  const total = sumNutrients(ticked.map((it) => it.nutrients));
  const totalGrams = ticked.reduce((s, it) => s + (it.grams > 0 ? it.grams : 0), 0);
  const nutrients = scaleNutrientsBy(total, f);
  const sumRange = itemsRange(ticked);
  const range = sumRange ? scaleRange(sumRange, f) : null;
  const confidence = itemsConfidence(ticked);
  const ai = ticked.some((it) => it.source === 'ai');
  const emoji = ticked.find((it) => it.emoji)?.emoji ?? '🍲';
  const perServing = totalGrams / servings;
  // Every item needs a weight for a per-gram definition; a quick add has none.
  const food: Food | undefined =
    totalGrams > 0 && ticked.every((it) => it.grams > 0)
      ? {
          id: `meal_${meal.id}`,
          name: meal.name,
          per100g: scaleNutrientsBy(total, 100 / totalGrams),
          servings: [
            { label: '1 serving', grams: Math.round(perServing * 10) / 10 },
            { label: `whole recipe (${formatPortion(servings)} servings)`, grams: Math.round(totalGrams * 10) / 10 },
          ],
          source: ai ? 'ai' : 'custom',
          verified: false,
          emoji,
        }
      : undefined;
  const item: SavedMealItem = {
    name: meal.name,
    emoji,
    servingLabel: servingsPhrase(portion, servings),
    quantity: 1,
    grams: totalGrams * f,
    nutrients,
    food,
    source: ai ? 'ai' : 'custom',
    verified: false,
    ...(range ? { kcalRange: range, confidence } : null),
  };
  return { items: [item], kcal: nutrients.kcal, range };
}
