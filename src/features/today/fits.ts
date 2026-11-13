/**
 * "What fits": the user's own foods (usuals for the next meal, favourites,
 * recents) that fit in the calories left, ranked by protein per kcal when
 * protein is the gap. Pure, so the ranking is unit-tested.
 */
import { defaultServing } from '@/lib/nutrition';
import type { Food, FoodEntry, Serving } from '@/types';

export type FitSource = 'usual' | 'favourite' | 'recent';

export interface Fit {
  /** The food's id: one row per food. */
  key: string;
  food: Food;
  serving: Serving;
  quantity: number;
  kcal: number;
  protein: number;
  from: FitSource;
}

export interface FitSources {
  /** Usual foods for the next meal, best first, as their most recent entry (portion to repeat). */
  usual: FoodEntry[];
  favourites: Food[];
  recents: Food[];
  /** The last entry of each food id, so a favourite or recent repeats the amount last eaten. */
  lastByFood: Map<string, FoodEntry>;
}

function fromEntry(e: FoodEntry, from: FitSource): Fit | null {
  if (!e.food || !(e.quantity > 0)) return null;
  return {
    key: e.food.id,
    food: e.food,
    serving: { label: e.servingLabel, grams: e.grams / e.quantity },
    quantity: e.quantity,
    kcal: e.nutrients.kcal,
    protein: e.nutrients.protein,
    from,
  };
}

function fromFood(food: Food, from: FitSource, last?: FoodEntry): Fit {
  const fromLast = last ? fromEntry(last, from) : null;
  if (fromLast) return { ...fromLast, food };
  const serving = defaultServing(food);
  const f = serving.grams / 100;
  return { key: food.id, food, serving, quantity: 1, kcal: food.per100g.kcal * f, protein: food.per100g.protein * f, from };
}

/** Every candidate once, in source order: usuals, then favourites, then recents. */
export function fitCandidates(src: FitSources): Fit[] {
  const out: Fit[] = [];
  const seen = new Set<string>();
  const push = (fit: Fit | null) => {
    if (!fit || seen.has(fit.key)) return;
    seen.add(fit.key);
    out.push(fit);
  };
  for (const e of src.usual) push(fromEntry(e, 'usual'));
  for (const f of src.favourites) push(fromFood(f, 'favourite', src.lastByFood.get(f.id)));
  for (const f of src.recents) push(fromFood(f, 'recent', src.lastByFood.get(f.id)));
  return out;
}

/**
 * Candidates whose portion fits in `kcalLeft`. With `proteinFirst`, foods with
 * real protein come first, best protein per kcal leading; otherwise the source
 * order (usual, favourite, recent) is kept.
 */
export function rankFits(candidates: Fit[], opts: { kcalLeft: number; proteinFirst: boolean; limit?: number }): Fit[] {
  const { kcalLeft, proteinFirst, limit = 8 } = opts;
  const fits = candidates.filter((c) => c.kcal > 0 && c.kcal <= kcalLeft);
  if (!proteinFirst) return fits.slice(0, limit);
  return fits
    .filter((c) => c.protein >= 1)
    .map((c, i) => ({ c, i, density: c.protein / c.kcal }))
    .sort((a, b) => b.density - a.density || a.i - b.i)
    .map((x) => x.c)
    .slice(0, limit);
}
