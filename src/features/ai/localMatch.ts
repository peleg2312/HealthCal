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

const UNICODE_FRACTIONS: Record<string, number> = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 0.125 };

/**
 * A leading number: "2", "1.5", "1,5", "1/2", "1 1/2", "½" or "1½".
 * Fractions are read before whole numbers so "1/2 avocado" is half, not one.
 */
const NUMBER = /^\s*(\d+\s+\d+\s*\/\s*\d+|\d+\s*\/\s*\d+|\d*\s*[½¼¾⅓⅔⅛]|\d+(?:[.,]\d+)?)/;

function toNumber(raw: string): number | null {
  const s = raw.trim();
  const mixed = s.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)$/);
  if (mixed) return Number(mixed[3]) > 0 ? Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]) : null;
  const frac = s.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (frac) return Number(frac[2]) > 0 ? Number(frac[1]) / Number(frac[2]) : null;
  const uni = s.match(/^(\d*)\s*([½¼¾⅓⅔⅛])$/);
  if (uni) return (uni[1] ? Number(uni[1]) : 0) + UNICODE_FRACTIONS[uni[2]];
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** Leading amount like "2 eggs", "1/2 avocado" or "150 g rice". */
export function parseAmount(query: string): { count: number | null; grams: number | null; rest: string } {
  const num = query.match(NUMBER);
  const value = num ? toNumber(num[1]) : null;
  if (!num || value === null || !(value > 0)) return { count: null, grams: null, rest: query };
  const after = query.slice(num[0].length);
  const g = after.match(/^\s*(g|gr|grams?|ml)\b\s*(?:of\s+)?(.*)$/i);
  if (g) return { count: null, grams: value, rest: g[2] };
  const c = after.match(/^\s*(?:x\s*)?(?:of\s+)?(.*)$/i);
  if (c && c[1]) return { count: value, grams: null, rest: c[1] };
  return { count: null, grams: null, rest: query };
}

/** Words that describe a state, not a food: "raw apple" should not match "raw egg". */
const GENERIC = new Set(['raw', 'cooked', 'fresh', 'with', 'and', 'of', 'the', 'plain', 'whole', 'homemade', 'small', 'large', 'medium']);

export function matchFoods(query: string, foods: Food[], limit = 3): Food[] {
  const q = words(parseAmount(query).rest).filter((w) => !GENERIC.has(w));
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
  const usable = food.servings.filter((s) => s.grams > 0);
  // A count means whole units: "1/2 avocado" is half of "1 whole", not half of the "1/2 fruit" serving.
  const serving = (count !== null ? usable.find((s) => /^1\s/.test(s.label)) : undefined) ?? usable[0];
  const g = grams ?? (serving ? serving.grams * (count ?? 1) : 100 * (count ?? 1));
  // Reference data, but the portion is still the user's guess.
  return itemFromFood(food, g, 0.8);
}

/** A review item for `grams` of a food definition, with exact per-gram values. */
export function itemFromFood(food: Food, grams: number, confidence: number): AiFoodItem {
  const g = Math.max(0, Math.round(Number.isFinite(grams) ? grams : 0));
  const n = scaleNutrients(food.per100g, g);
  const r1 = (x: number | undefined) => Math.round((x ?? 0) * 10) / 10;
  return {
    name: food.name,
    grams: g,
    kcal: Math.round(n.kcal),
    protein: r1(n.protein),
    carbs: r1(n.carbs),
    fat: r1(n.fat),
    fiber: r1(n.fiber),
    confidence,
  };
}
