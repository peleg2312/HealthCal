import type { Food, FoodEntry, MealType, Nutrients, Serving } from '@/types';

export const EMPTY_NUTRIENTS: Nutrients = { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0, satFat: 0, sodium: 0 };

const KEYS: (keyof Nutrients)[] = ['kcal', 'protein', 'carbs', 'fat', 'fiber', 'sugar', 'satFat', 'sodium'];

export function scaleNutrients(per100g: Nutrients, grams: number): Nutrients {
  const f = grams / 100;
  const out: Nutrients = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  for (const k of KEYS) {
    const v = per100g[k];
    if (v !== undefined) out[k] = v * f;
  }
  return out;
}

export function sumNutrients(list: Nutrients[]): Nutrients {
  const out: Nutrients = { ...EMPTY_NUTRIENTS };
  for (const n of list) for (const k of KEYS) out[k] = (out[k] ?? 0) + (n[k] ?? 0);
  return out;
}

export function entriesTotal(entries: FoodEntry[]): Nutrients {
  return sumNutrients(entries.map((e) => e.nutrients));
}

/** Calories implied by the macros (Atwater 4/4/9). Used to sanity-check data. */
export function atwaterKcal(n: Pick<Nutrients, 'protein' | 'carbs' | 'fat'>): number {
  return n.protein * 4 + n.carbs * 4 + n.fat * 9;
}

export const MEALS: { id: MealType; label: string; emoji: string }[] = [
  { id: 'breakfast', label: 'Breakfast', emoji: '🌅' },
  { id: 'lunch', label: 'Lunch', emoji: '☀️' },
  { id: 'dinner', label: 'Dinner', emoji: '🌙' },
  { id: 'snack', label: 'Snacks', emoji: '🍎' },
];

export const MEAL_LABEL: Record<MealType, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snacks',
};

/** Meal the user is most likely logging right now. */
export function mealForTime(now: Date = new Date()): MealType {
  const h = now.getHours() + now.getMinutes() / 60;
  if (h >= 4.5 && h < 10.5) return 'breakfast';
  if (h >= 11.5 && h < 15) return 'lunch';
  if (h >= 17.5 && h < 21.5) return 'dinner';
  return 'snack';
}

/** Share of the day's calories a meal typically takes, for per-meal guidance. */
export const MEAL_SHARE: Record<MealType, number> = { breakfast: 0.25, lunch: 0.35, dinner: 0.3, snack: 0.1 };

export const GRAM_SERVING: Serving = { label: '100 g', grams: 100 };

/** Servings offered for a food: its own household measures plus 100 g and 1 g. */
export function servingsFor(food: Food): Serving[] {
  const own = food.servings.filter((s) => s.grams > 0);
  const has100 = own.some((s) => Math.abs(s.grams - 100) < 0.01);
  return [...own, ...(has100 ? [] : [GRAM_SERVING]), { label: '1 g', grams: 1 }];
}

export function defaultServing(food: Food): Serving {
  return food.servings.find((s) => s.grams > 0) ?? GRAM_SERVING;
}

export function formatMacro(g: number): string {
  if (g >= 100) return String(Math.round(g));
  return (Math.round(g * 10) / 10).toString();
}

/** Percent of calories from each macro for a nutrient total. */
export function macroPercents(n: Nutrients): { protein: number; carbs: number; fat: number } {
  const total = atwaterKcal(n);
  if (total <= 0) return { protein: 0, carbs: 0, fat: 0 };
  return {
    protein: (n.protein * 4) / total,
    carbs: (n.carbs * 4) / total,
    fat: (n.fat * 9) / total,
  };
}
