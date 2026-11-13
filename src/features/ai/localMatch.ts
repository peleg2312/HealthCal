/**
 * Free, offline suggestions for an item the analysis missed: match the typed
 * words against the bundled reference foods and turn the best hits into
 * review items at their default serving. No analysis is spent on these.
 */
import { scaleNutrients } from '@/lib/nutrition';
import type { AiFoodItem, Food } from '@/types';

const words = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1);

/** Leading amount like "2 eggs" or "150 g rice". */
export function parseAmount(query: string): { count: number | null; grams: number | null; rest: string } {
  const g = query.match(/^\s*(\d+(?:[.,]\d+)?)\s*(g|gr|grams?|ml)\b\s*(?:of\s+)?(.*)$/i);
  if (g) return { count: null, grams: Number(g[1].replace(',', '.')), rest: g[3] };
  const c = query.match(/^\s*(\d+(?:[.,]\d+)?)\s*(?:x\s*)?(.*)$/i);
  if (c && c[2]) return { count: Number(c[1].replace(',', '.')), grams: null, rest: c[2] };
  return { count: null, grams: null, rest: query };
}

export function matchFoods(query: string, foods: Food[], limit = 3): Food[] {
  const q = words(parseAmount(query).rest);
  if (q.length === 0) return [];
  const scored: { food: Food; score: number }[] = [];
  for (const food of foods) {
    const name = words(food.name);
    let score = 0;
    for (const w of q) {
      // Allow a plural or singular on either side ("eggs" finds "Egg").
      const stem = w.replace(/e?s$/, '');
      if (name.includes(w)) score += 3;
      else if (name.some((n) => n.replace(/e?s$/, '') === stem)) score += 2.5;
      else if (name.some((n) => n.startsWith(stem) && stem.length >= 3)) score += 1;
    }
    if (score === 0) continue;
    // Prefer the first word matching, and shorter, more generic names.
    if (name[0] && q.some((w) => name[0].startsWith(w.replace(/e?s$/, '')))) score += 1;
    score -= name.length * 0.05;
    scored.push({ food, score });
  }
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.food);
}

/** Convert a matched food to a review item, honouring a typed amount. */
export function foodToItem(food: Food, query: string): AiFoodItem {
  const { count, grams } = parseAmount(query);
  const serving = food.servings.find((s) => s.grams > 0);
  const g = grams ?? (serving ? serving.grams * (count ?? 1) : 100 * (count ?? 1));
  const n = scaleNutrients(food.per100g, g);
  const r1 = (x: number | undefined) => Math.round((x ?? 0) * 10) / 10;
  return {
    name: food.name,
    grams: Math.round(g),
    kcal: Math.round(n.kcal),
    protein: r1(n.protein),
    carbs: r1(n.carbs),
    fat: r1(n.fat),
    fiber: r1(n.fiber),
    // Reference data, but the portion is still the user's guess.
    confidence: 0.8,
  };
}
