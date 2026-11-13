/**
 * Food search. The local part is pure and synchronous so it answers on every
 * keystroke (well under a frame for the bundled database) and can be unit
 * tested; the online part wraps Open Food Facts and ranks its products with
 * the same relevance rules.
 *
 * Ranking, strongest signal first:
 *  1. How well the words match: whole word > word prefix > inside a word >
 *     typo-tolerant match. Every query word must match (in any order).
 *  2. The user's own history: favourites, custom foods and recents float up.
 *  3. The data source: bundled reference foods above community products.
 */
import { BUILTIN_FOODS } from '@/data/foods';
import type { Food } from '@/types';

import { searchProducts } from './openFoodFacts';

export type SearchOrigin = 'favorite' | 'custom' | 'recent' | 'builtin' | 'online';

export interface SearchHit {
  food: Food;
  score: number;
  /** Strongest reason this food is in the user's world (for labels and tests). */
  origin: SearchOrigin;
}

export interface SearchContext {
  /** Reference corpus. Defaults to the bundled database. */
  foods?: Food[];
  customFoods?: Food[];
  /** Newest first. */
  recentFoods?: Food[];
  favoriteIds?: string[];
}

// ------------------------------------------------------------ text helpers

const STOPWORDS = new Set(['a', 'an', 'and', 'of', 'the', 'with', 'w', 'in', 'on', 'or']);

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Very small English singulariser: enough for "apples", "berries", "tomatoes", "dishes". */
export function stem(word: string): string {
  if (word.length <= 3 || /\d/.test(word)) return word;
  if (word.endsWith('ies') && word.length > 4) return `${word.slice(0, -3)}y`;
  if (word.endsWith('oes') || /(ss|x|ch|sh)es$/.test(word)) return word.slice(0, -2);
  if (word.endsWith('s') && !word.endsWith('ss') && !word.endsWith('us') && !word.endsWith('is')) return word.slice(0, -1);
  return word;
}

export function tokenize(s: string): string[] {
  return normalize(s)
    .split(' ')
    .filter((t) => t && !STOPWORDS.has(t))
    .map(stem);
}

/** Damerau-Levenshtein (optimal string alignment) with an early exit above `max`. */
export function editDistance(a: string, b: string, max = 2): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const prev2: number[] = new Array(b.length + 1).fill(0);
  let prev: number[] = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur: number[] = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    for (let j = 0; j <= b.length; j++) prev2[j] = prev[j];
    prev = cur;
  }
  return prev[b.length];
}

// ------------------------------------------------------------------ index

interface Indexed {
  /** Normalised full name, for "name starts with the query". */
  name: string;
  /** Tokens of the main part of the name (before the first comma or bracket). */
  head: string[];
  /** All name tokens, then brand tokens. */
  tokens: string[];
  brandStart: number;
}

const cache = new WeakMap<Food, Indexed>();

function index(food: Food): Indexed {
  let hit = cache.get(food);
  if (hit) return hit;
  const nameTokens = tokenize(food.name);
  const head = tokenize(food.name.split(/[,(]/)[0] ?? food.name);
  const brand = food.brand ? tokenize(food.brand) : [];
  hit = { name: normalize(food.name), head, tokens: [...nameTokens, ...brand], brandStart: nameTokens.length };
  cache.set(food, hit);
  return hit;
}

const WHOLE = 100;
const PREFIX = 70;
const INSIDE = 30;
const FUZZY = 45;

/** Best match of one query token against a food's tokens: [score, token position] or null. */
function matchToken(q: string, ix: Indexed, fuzzy: boolean): [number, number] | null {
  let best = 0;
  let pos = -1;
  for (let i = 0; i < ix.tokens.length; i++) {
    const t = ix.tokens[i];
    let s = 0;
    if (t === q) s = WHOLE;
    else if (t.startsWith(q)) s = PREFIX + Math.min(15, (q.length / t.length) * 15);
    else if (q.length >= 3 && t.includes(q)) s = INSIDE;
    else if (fuzzy && q.length >= 4) {
      const max = q.length >= 7 ? 2 : 1;
      if (editDistance(q, t, max) <= max) s = FUZZY;
      // Typo while still typing a longer word: "chik" -> "chicken".
      else if (t.length > q.length && editDistance(q, t.slice(0, q.length), 1) <= 1 && q[0] === t[0]) s = FUZZY - 3;
    }
    // Brand words count a little less than words of the name itself.
    if (s && i >= ix.brandStart) s *= 0.8;
    if (s > best) {
      best = s;
      pos = i;
    }
  }
  return best > 0 ? [best, pos] : null;
}

/** Relevance of a food for already-tokenised query words, or 0 when some word does not match. */
function relevance(food: Food, qTokens: string[], qNorm: string, fuzzyFor: boolean[]): number {
  const ix = index(food);
  let total = 0;
  const positions: number[] = [];
  for (let i = 0; i < qTokens.length; i++) {
    const m = matchToken(qTokens[i], ix, fuzzyFor[i]);
    if (!m) return 0;
    total += m[0];
    positions.push(m[1]);
  }
  let score = total / qTokens.length;
  // The whole name starts with what was typed: "chicken b" -> "Chicken breast".
  if (ix.name.startsWith(qNorm)) score += 40;
  // Matching the main part of the name beats matching a qualifier after the comma.
  const headHits = positions.filter((p) => p < ix.head.length).length;
  score += (headHits / qTokens.length) * 20;
  // The query covers the whole main name: "apple" is "Apple, raw" more than "Apple pie".
  const headCovered = new Set(positions.filter((p) => p < ix.head.length)).size;
  if (ix.head.length) score += (headCovered / ix.head.length) * 15;
  // First word of the food matched: "rice" prefers "Rice, ..." over "Fried rice".
  if (positions.includes(0)) score += 10;
  // Prefer shorter, more generic names when everything else is equal.
  score -= Math.min(15, ix.tokens.length * 1.2);
  return score;
}

const SOURCE_BONUS: Record<Food['source'], number> = {
  custom: 8,
  builtin: 14,
  usda: 14,
  ai: 0,
  quick: 0,
  openfoodfacts: 0,
};

function plan(query: string): { qTokens: string[]; qNorm: string } | null {
  const qNorm = normalize(query);
  if (!qNorm) return null;
  let qTokens = tokenize(query);
  // A query made only of stop words ("and") still deserves results.
  if (qTokens.length === 0) qTokens = qNorm.split(' ').map(stem);
  return { qTokens, qNorm };
}

/** Whether each query word matches something directly; typo tolerance only kicks in where it does not. */
function fuzzyNeeds(qTokens: string[], foods: Food[]): boolean[] {
  return qTokens.map((q) => {
    for (const f of foods) {
      for (const t of index(f).tokens) if (t.startsWith(q) || (q.length >= 3 && t.includes(q))) return false;
    }
    return true;
  });
}

/**
 * Instant search over the bundled foods, the user's custom foods and their
 * history. Pure and synchronous. Returns [] for an empty query.
 */
export function searchLocal(query: string, ctx: SearchContext = {}, limit = 40): SearchHit[] {
  const p = plan(query);
  if (!p) return [];
  const base = ctx.foods ?? BUILTIN_FOODS;
  const custom = ctx.customFoods ?? [];
  const recents = ctx.recentFoods ?? [];
  const favs = new Set(ctx.favoriteIds ?? []);

  // One definition per id: the user's edited custom food wins over a stale recent copy.
  const byId = new Map<string, Food>();
  for (const f of recents) byId.set(f.id, f);
  for (const f of base) byId.set(f.id, f);
  for (const f of custom) byId.set(f.id, f);
  const recentRank = new Map<string, number>();
  recents.forEach((f, i) => {
    if (!recentRank.has(f.id)) recentRank.set(f.id, i);
  });
  const customIds = new Set(custom.map((f) => f.id));

  const foods = [...byId.values()];
  const fuzzyFor = fuzzyNeeds(p.qTokens, foods);
  const hits: SearchHit[] = [];
  for (const food of foods) {
    const rel = relevance(food, p.qTokens, p.qNorm, fuzzyFor);
    if (rel <= 0) continue;
    let bonus = SOURCE_BONUS[food.source] ?? 0;
    let origin: SearchOrigin = food.source === 'openfoodfacts' ? 'online' : 'builtin';
    const r = recentRank.get(food.id);
    if (r !== undefined) {
      bonus += 30 - Math.min(15, r * 0.5);
      origin = 'recent';
    }
    if (customIds.has(food.id)) {
      bonus += 26;
      origin = 'custom';
    }
    if (favs.has(food.id)) {
      bonus += 36;
      origin = 'favorite';
    }
    if (food.verified) bonus += 3;
    hits.push({ food, score: rel + bonus, origin });
  }
  hits.sort((a, b) => b.score - a.score || a.food.name.length - b.food.name.length || a.food.name.localeCompare(b.food.name));
  return hits.slice(0, limit);
}

/**
 * Rank online products for a query. Products whose names match every word come
 * first; the rest keep Open Food Facts' own order behind them (names are often
 * in another language, so they are not dropped).
 */
export function rankOnline(query: string, products: Food[], exclude: Iterable<string> = []): Food[] {
  const p = plan(query);
  const skip = new Set(exclude);
  const fresh = products.filter((f) => !skip.has(f.id));
  if (!p) return fresh;
  const fuzzyFor = fuzzyNeeds(p.qTokens, fresh);
  return fresh
    .map((food, i) => ({ food, score: relevance(food, p.qTokens, p.qNorm, fuzzyFor), i }))
    .sort((a, b) => (b.score > 0 ? 1 : 0) - (a.score > 0 ? 1 : 0) || b.score - a.score || a.i - b.i)
    .map((x) => x.food);
}

/**
 * Online community products from Open Food Facts. Never throws: an empty list
 * means nothing was found or the network was unavailable.
 */
export async function searchOnline(query: string, opts: { limit?: number; exclude?: Iterable<string> } = {}): Promise<Food[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const products = await searchProducts(q, opts.limit ?? 24);
  return rankOnline(q, products, opts.exclude);
}
