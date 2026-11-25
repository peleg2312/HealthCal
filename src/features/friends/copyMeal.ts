/**
 * Copying a friend's shown meal into one's own diary. A food from the bundled list comes over exactly,
 * in the friend's portion, priced with this phone's own numbers for it (`atFoodValues`, as Repeat
 * prices a bundled food). Anything else (their own food, a scanned product, an estimate, a quick add)
 * is never copied with numbers this phone cannot check (principle 3): it is offered as "Find", which
 * opens food search with its name. The ticked lines are logged by the caller through `logItems`, so
 * recents, the haptic, the toast and Undo are the usual ones. Pure.
 */
import { BUILTIN_FOODS } from '@/data/foods';
import { displayFoodName } from '@/features/food/displayName';
import { ideaFoodsPhrase } from '@/features/today/ideas';
import { atFoodValues } from '@/features/food/usuals';
import { defaultServing, servingsFor } from '@/lib/nutrition';
import type { Food, SavedMealItem } from '@/types';

import type { SharedMealItem } from './contract';

const BUNDLED = new Map(BUILTIN_FOODS.map((f) => [f.id, f]));

export type CopyRow =
  /** A bundled food: copied in the friend's portion with this phone's numbers. Ticked at first. */
  | { kind: 'copy'; index: number; item: SharedMealItem; line: SavedMealItem; kcal: number }
  /** Anything else: "Find" opens search with `query`. Never ticked, never copied with numbers. */
  | { kind: 'find'; index: number; item: SharedMealItem; query: string };

/** The bundled food a shared line names, when this phone's list holds it. */
export function bundledFoodFor(item: Pick<SharedMealItem, 'foodId' | 'source'>, foods: ReadonlyMap<string, Food> = BUNDLED): Food | null {
  if (!item.foodId || (item.source !== 'builtin' && item.source !== 'typical' && item.source !== 'usda')) return null;
  const f = foods.get(item.foodId);
  return f && f.source === 'builtin' ? f : null;
}

/** A shared food's name as drawn: a bundled name's database capitals in lower case, any other as written. */
export function shownName(item: Pick<SharedMealItem, 'name' | 'source'>): string {
  return displayFoodName({ name: item.name, source: item.source === 'builtin' || item.source === 'typical' ? 'builtin' : 'custom' });
}

/** The grams of the friend's portion: as sent, else what the serving label weighs on this phone, else one default serving. */
function portionGrams(item: SharedMealItem, food: Food, qty: number): number {
  if (item.grams && item.grams > 0) return item.grams;
  const byLabel = servingsFor(food).find((s) => s.label === item.serving);
  return (byLabel ?? defaultServing(food)).grams * qty;
}

/** One shared line as it would be copied. */
export function copyRow(item: SharedMealItem, index: number, foods: ReadonlyMap<string, Food> = BUNDLED): CopyRow {
  const food = bundledFoodFor(item, foods);
  if (!food) return { kind: 'find', index, item, query: shownName(item) };
  const qty = item.quantity && item.quantity > 0 ? item.quantity : 1;
  const grams = portionGrams(item, food, qty);
  const base: SavedMealItem = {
    name: food.name,
    emoji: food.emoji ?? item.emoji,
    servingLabel: item.serving || defaultServing(food).label,
    quantity: qty,
    grams,
    nutrients: food.per100g,
    food,
    source: 'builtin',
    verified: food.verified,
  };
  const line = atFoodValues(base, food);
  return { kind: 'copy', index, item, line, kcal: line.nutrients.kcal };
}

/** Every line of a friend's meal as it would be copied, in the meal's order. */
export function copyRows(items: readonly SharedMealItem[], foods: ReadonlyMap<string, Food> = BUNDLED): CopyRow[] {
  return items.map((it, i) => copyRow(it, i, foods));
}

/** The lines the person ticked, ready for `logItems`. A "Find" row is never among them. */
export function copyItems(rows: readonly CopyRow[], ticked: ReadonlySet<number>): SavedMealItem[] {
  return rows.flatMap((r) => (r.kind === 'copy' && ticked.has(r.index) ? [r.line] : []));
}

/** The calories the ticked lines add, with this phone's numbers. */
export function copyKcal(rows: readonly CopyRow[], ticked: ReadonlySet<number>): number {
  return rows.reduce((s, r) => s + (r.kind === 'copy' && ticked.has(r.index) ? r.kcal : 0), 0);
}

/** The lines ticked when the add step opens: every bundled food. */
export function firstTicked(rows: readonly CopyRow[]): Set<number> {
  return new Set(rows.filter((r) => r.kind === 'copy').map((r) => r.index));
}

/** The toast, naming what was added first: "Israeli salad and chicken breast added to lunch". `where` is `mealOnDay`, read at the tap. */
export function copiedToast(lines: readonly SavedMealItem[], where: string): string {
  return `${ideaFoodsPhrase(lines) || `${lines.length} foods`} added to ${where}`;
}

/** Where "Find" goes: food search on the meal and day picked, carrying the name (`?q=`). */
export function findHref(query: string, meal: string, date: string): string {
  const q = new URLSearchParams({ meal, date, q: query });
  return `/food/search?${q.toString()}`;
}
