/**
 * Free, offline suggestions for an item the analysis missed: match the typed
 * words against the bundled reference foods and turn the best hits into
 * review items at their default serving. No analysis is spent on these.
 *
 * Text without a Hebrew letter is scored here, exactly as before Hebrew search (state words such as
 * "grilled" or "raw" steer the choice). Text with a Hebrew letter goes to the food search
 * (`searchLocal`), which reads Hebrew names, prefixes, amounts and typos.
 */
import { isHebrew } from '@/lib/hebrew';
import { scaleNutrients } from '@/lib/nutrition';
import { searchLocal } from '@/services/foodSearch';
import type { AiFoodItem, Food } from '@/types';

/** Latin words of two letters or more (this scorer's words since it was written). */
const words = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
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

const COOKED_WORDS = new Set(['cooked', 'grilled', 'roasted', 'baked', 'fried', 'boiled', 'steamed', 'sauteed', 'stewed', 'braised', 'toasted', 'poached', 'scrambled', 'barbecued', 'seared']);
const RAW_WORDS = new Set(['raw', 'dry', 'dried', 'uncooked']);

/**
 * +1 when the food's state matches what was asked for, -1 when it contradicts it.
 * "Grilled chicken" should offer the cooked reference food before the raw one:
 * the same weight of raw meat or dry rice has very different calories.
 */
function stateFit(queryWords: string[], nameWords: string[]): number {
  const wantsCooked = queryWords.some((w) => COOKED_WORDS.has(w));
  const wantsRaw = queryWords.some((w) => RAW_WORDS.has(w));
  if (wantsCooked === wantsRaw) return 0;
  const isCooked = nameWords.some((w) => COOKED_WORDS.has(w));
  const isRaw = nameWords.some((w) => RAW_WORDS.has(w));
  if (isCooked === isRaw) return 0;
  return wantsCooked === isCooked ? 1 : -1;
}

export function matchFoods(query: string, foods: Food[], limit = 3): Food[] {
  const rest = parseAmount(query).rest;
  if (isHebrew(rest)) return searchLocal(rest, { foods }, limit).map((h) => h.food);
  const all = words(rest);
  const q = all.filter((w) => !GENERIC.has(w));
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
    const fit = stateFit(all, name);
    // The opposite state is a different food by weight: dry rice is not a swap for cooked rice.
    if (fit < 0) continue;
    score += fit;
    scored.push({ food, score });
  }
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.food);
}

const stem = (w: string) => w.replace(/e?s$/, '');

/**
 * The row mark for an estimated item: the emoji of the food in the list that the item names
 * outright ("Grilled chicken breast" wears the chicken breast's, "White rice, cooked" the rice's), so
 * an estimated meal's rows read as food in the diary. Only from one of the five best matches, and only
 * when the item is plainly that food, state words such as "grilled" aside:
 * - the food's name holds every word of the item's name, or
 * - the item is that food named with one of its own portions: the food's name before its first comma
 *   ("Tomato") holds only words of the item and ends on the item's last word, and every other word of
 *   the item names one of the food's portions ("cherry" in the tomato's "1 cherry tomato", "slice" in
 *   the bread's "1 slice"). "Cherry tomatoes" wears the tomato; "Cup of rice" never wears rice noodles.
 * A food that is merely near ("Mixed green salad" beside "Green peas", "Beef stew" beside "Beef
 * jerky") gives nothing, and the row wears the pot (`AI_FOOD_EMOJI`). Names in Hebrew give nothing
 * here. A mark only: it never changes a number.
 */
export function emojiLike(name: string, foods: Food[]): string | undefined {
  const content = (s: string) => words(s).filter((w) => !GENERIC.has(w) && !COOKED_WORDS.has(w) && !RAW_WORDS.has(w));
  const q = content(parseAmount(name).rest).map(stem);
  if (q.length === 0) return undefined;
  for (const food of matchFoods(name, foods, 5)) {
    const named = new Set(words(food.name).map(stem));
    if (q.every((w) => named.has(w))) return food.emoji;
    const head = content(food.name.split(/[,(]/)[0]).map(stem);
    if (head.length === 0 || head[head.length - 1] !== q[q.length - 1] || !head.every((w) => q.includes(w))) continue;
    const portions = new Set(food.servings.flatMap((s) => words(s.label)).map(stem));
    if (q.every((w) => named.has(w) || portions.has(w))) return food.emoji;
  }
  return undefined;
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
