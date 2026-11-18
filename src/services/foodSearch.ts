/**
 * Food search. The local part is pure and synchronous so it answers on every
 * keystroke and can be unit tested; the online part wraps Open Food Facts and
 * ranks its products with the same relevance rules.
 *
 * Ranking, strongest signal first:
 *  1. How well the words match: whole word > word prefix > inside a word >
 *     typo-tolerant match. Every query word must match (in any order).
 *  2. The user's own history: favourites, custom foods and recents float up.
 *  3. The data source: bundled reference foods above community products.
 *
 * A food is matched against one or more names: its stored name (with its brand after it), and for a
 * bundled food its search names from `@/data/searchNames` (Hebrew names and Latin spellings). One name
 * must hold every query word; only Hebrew-and-digit queries may also be found across a food's Hebrew
 * names together (the union name, scored lower). A Latin word is never compared with a Hebrew name.
 * Text is folded with `fold` (`@/lib/hebrew`), which leaves Latin text exactly as the old normaliser
 * did, so English search keeps its behaviour (`foodSearch.english.test.ts` holds the top 5 of 304
 * queries). When a query with a Hebrew letter finds nothing, a relaxed pass lets amounts, numbers,
 * preparation words and words found nowhere (a brand) go unmatched.
 *
 * Speed: the app runs this on every keystroke on Hermes (no JIT). Each food's names are indexed once
 * per food object (stems and skeletons included); the corpus's sorted gate tokens and per-script typo
 * vocabularies are built once per set of food objects; typo candidates are computed once per search
 * over the distinct tokens of the word's own script, not per food. `scripts/dev/search-timing.mjs` measures it with and without the interpreter
 * flags.
 */
import { BUILTIN_FOODS } from '@/data/foods';
import { SEARCH_NAMES } from '@/data/searchNames';
import {
  collapseDoubles,
  fold,
  hasPluralEnding,
  HEBREW_STOPWORDS,
  hebrewStem,
  isHebrew,
  LONE_PREFIXES,
  MODIFIERS,
  prefixReadings,
  QUANTITY,
  skeleton,
} from '@/lib/hebrew';
import type { Food } from '@/types';

import { searchProductsWithStatus } from './openFoodFacts';

export type SearchOrigin = 'favorite' | 'custom' | 'recent' | 'builtin' | 'online';

export interface SearchHit {
  food: Food;
  score: number;
  /** Strongest reason this food is in the user's world (for labels and tests). */
  origin: SearchOrigin;
  /**
   * The search name the query matched, when that was one of the food's Hebrew search names
   * (`@/data/searchNames`) and not its stored name. Shown under the name in a result row. Display
   * only: never stored.
   */
  matched?: string;
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

const STOPWORDS = new Set(['a', 'an', 'and', 'of', 'the', 'with', 'w', 'in', 'on', 'or', ...HEBREW_STOPWORDS]);

/** The search normaliser. Kept under its old name; it is `fold` from `@/lib/hebrew`. */
export const normalize = fold;

/** Very small English singulariser: enough for "apples", "berries", "tomatoes", "dishes". */
export function stem(word: string): string {
  if (word.length <= 3 || /\d/.test(word)) return word;
  if (word.endsWith('ies') && word.length > 4) return `${word.slice(0, -3)}y`;
  if (word.endsWith('oes') || /(ss|x|ch|sh)es$/.test(word)) return word.slice(0, -2);
  if (word.endsWith('s') && !word.endsWith('ss') && !word.endsWith('us') && !word.endsWith('is')) return word.slice(0, -1);
  return word;
}

/** One folded word as it is compared: English stem for Latin, doubled vav and yod collapsed for Hebrew. */
function wordForm(t: string): string {
  return isHebrew(t) ? collapseDoubles(t) : stem(t);
}

/**
 * Search words of a text: folded, stop words dropped, a lone one-letter Hebrew prefix written apart
 * before a Hebrew word dropped ("ה-חומוס"), each word in its compared form.
 */
export function tokenize(s: string): string[] {
  return tokenizeFolded(fold(s));
}

/** `tokenize` for text that is already folded. */
function tokenizeFolded(folded: string): string[] {
  const raw = folded.split(' ').filter((t) => t && !STOPWORDS.has(t));
  const out: string[] = [];
  for (let i = 0; i < raw.length; i++) {
    const t = raw[i];
    if (LONE_PREFIXES.has(t) && i + 1 < raw.length && isHebrew(raw[i + 1])) continue;
    out.push(wordForm(t));
  }
  return out;
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

/**
 * `editDistance(a, b, 1) <= 1` without allocating: equal, one substitution, one letter more or less, or
 * two neighbours swapped. The typo sets call it for hundreds of tokens per keystroke, and on Hermes the
 * arrays of the general version cost more than the comparison.
 */
export function withinOneEdit(a: string, b: string): boolean {
  const la = a.length;
  const lb = b.length;
  if (la === lb) {
    let i = 0;
    while (i < la && a[i] === b[i]) i++;
    if (i >= la - 1) return true;
    // One substitution at i, or a swap of i and i + 1.
    if (a.slice(i + 1) === b.slice(i + 1)) return true;
    return a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2);
  }
  if (la - lb === 1 || lb - la === 1) {
    const [l, s] = la > lb ? [a, b] : [b, a];
    let i = 0;
    while (i < s.length && l[i] === s[i]) i++;
    return l.slice(i + 1) === s.slice(i);
  }
  return false;
}

const HAS_LATIN = /[a-z]/;
const DIGITS = /^[0-9]+$/;

// ------------------------------------------------------------------ index

/** 'name': the stored name (and brand); 'he' / 'latin': a search name; 'heu': all Hebrew names together. */
type NameKind = 'name' | 'he' | 'latin' | 'heu';

interface IndexedName {
  /** The text shown as `matched` (a Hebrew name; for the union, set per match). */
  text: string;
  kind: NameKind;
  /** Folded full text, for "name starts with the query" (empty for the union). */
  norm: string;
  /** Tokens of the main part (stored name: before the first comma or bracket; a search name: all). */
  head: string[];
  /** All tokens, then brand tokens. */
  tokens: string[];
  /** Hebrew stem of each token (null when none or not Hebrew). */
  stems: (string | null)[];
  brandStart: number;
}

interface IndexedFood {
  names: IndexedName[];
  /** The union of the Hebrew names, when the food has two or more. */
  union: IndexedName | null;
  /** The Hebrew names the union is made of, in table order (for the `matched` text). */
  heNames: IndexedName[];
}

function indexName(text: string, kind: NameKind, brand?: string): IndexedName {
  // Fold once: on Hermes the first search indexes about 1,900 names, and folding is most of that.
  const norm = fold(text);
  const nameTokens = tokenizeFolded(norm);
  let head = nameTokens;
  if (kind === 'name') {
    const cut = text.search(/[,(]/);
    if (cut >= 0) head = tokenize(text.slice(0, cut));
  }
  const tokens = brand ? [...nameTokens, ...tokenize(brand)] : nameTokens;
  return { text, kind, norm, head, tokens, stems: tokens.map(stemOf), brandStart: nameTokens.length };
}

function stemOf(t: string): string | null {
  return isHebrew(t) ? hebrewStem(t) : null;
}

const hasOwn = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

const foodCache = new WeakMap<Food, IndexedFood>();

function index(food: Food): IndexedFood {
  let hit = foodCache.get(food);
  if (hit) return hit;
  const names: IndexedName[] = [indexName(food.name, 'name', food.brand)];
  const heNames: IndexedName[] = [];
  const sn = hasOwn(SEARCH_NAMES, food.id) ? SEARCH_NAMES[food.id] : undefined;
  if (sn) {
    for (const t of sn.he) {
      const n = indexName(t, 'he');
      if (n.tokens.length) {
        names.push(n);
        heNames.push(n);
      }
    }
    for (const t of sn.latin ?? []) {
      const n = indexName(t, 'latin');
      if (n.tokens.length) names.push(n);
    }
  }
  let union: IndexedName | null = null;
  if (heNames.length > 1) {
    const tokens = [...new Set(heNames.flatMap((n) => n.tokens))];
    union = { text: heNames[0].text, kind: 'heu', norm: '', head: heNames[0].tokens, tokens, stems: tokens.map(stemOf), brandStart: tokens.length };
  }
  hit = { names, union, heNames };
  foodCache.set(food, hit);
  return hit;
}

// ------------------------------------------------------------------ corpus (once per set of foods)

interface Corpus {
  /** Distinct tokens of stored names, brands and Hebrew names, sorted: "does any start with q" is a binary search. */
  gate: string[];
  /** Distinct Latin and digit gate tokens, for "does any contain q" (Latin words of 3+ letters). */
  gateLatin: string[];
  /** Typo vocabulary per script: distinct tokens a typo may land on, with Hebrew skeletons beside. */
  typoLatin: string[];
  typoHe: string[];
  typoHeSkel: string[];
}

function buildCorpus(foods: readonly Food[]): Corpus {
  const gate = new Set<string>();
  for (const f of foods) {
    for (const n of index(f).names) {
      if (n.kind === 'latin') continue;
      for (const t of n.tokens) gate.add(t);
    }
  }
  const sorted = [...gate].sort();
  const latin = sorted.filter((t) => !isHebrew(t));
  const he = sorted.filter(isHebrew);
  return { gate: sorted, gateLatin: latin, typoLatin: latin, typoHe: he, typoHeSkel: he.map(skeleton) };
}

/** Whether a token of the sorted list starts with `q`. */
function anyStartsWith(sorted: readonly string[], q: string): boolean {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (sorted[mid] < q) lo = mid + 1;
    else hi = mid;
  }
  return lo < sorted.length && sorted[lo].startsWith(q);
}

// One slot: the search screen asks with the same foods on every keystroke. The key is the list of food
// objects itself, compared one by one (a few hundred identity checks): a caller that builds a new array
// of the same foods on every render (the photo review's pool) keeps the cache, and an edited own food,
// which is a new object, rebuilds it.
let corpusFoods: readonly Food[] = [];
let corpusVal: Corpus | null = null;

function corpusFor(foods: readonly Food[]): Corpus {
  if (corpusVal && corpusFoods.length === foods.length && corpusFoods.every((f, i) => f === foods[i])) return corpusVal;
  corpusVal = buildCorpus(foods);
  corpusFoods = foods;
  return corpusVal;
}

// ------------------------------------------------------------------ matching

const WHOLE = 100;
const STEM = 90;
const PREFIX = 70;
const INSIDE = 30;
const SKEL = 50;
const FUZZY = 45;

type Kind = 'whole' | 'part' | 'skip';

interface Plan {
  qTokens: string[];
  qNorm: string;
  he: boolean[];
  /** Typo candidates per word (token -> score), or null when typo matching is off for it. */
  fuzzy: (Map<string, number> | null)[];
  /** Prefix readings per Hebrew word, or null when off. */
  alts: (string[] | null)[];
  /** Words that may go unmatched (relaxed pass only). */
  optional: boolean[];
  /** Every word is Hebrew or digits: the union name may be tried. */
  allHe: boolean;
  stems: (string | null)[];
  plural: boolean[];
}

/** Typo candidates for `q` among the corpus tokens of its own script (4.5). */
function typoSet(q: string, he: boolean, c: Corpus): Map<string, number> {
  const out = new Map<string, number>();
  if (q.length < 4) return out;
  const max = he ? (q.length >= 8 ? 2 : 1) : q.length >= 7 ? 2 : 1;
  const editOk = !he || q.length >= 5;
  const vocab = he ? c.typoHe : c.typoLatin;
  const qSkel = he ? skeleton(q) : '';
  const q0 = q[0];
  for (let i = 0; i < vocab.length; i++) {
    const t = vocab[i];
    let s = 0;
    if (he && t.length >= 4 && c.typoHeSkel[i] === qSkel) s = SKEL;
    else if (editOk) {
      const d = t.length - q.length;
      if (d <= max && d >= -max && (max === 1 ? withinOneEdit(q, t) : editDistance(q, t, max) <= max)) s = FUZZY;
      // A typo while still typing a longer word: "chik" -> "chicken".
      else if (d > 0 && t[0] === q0 && withinOneEdit(q, t.slice(0, q.length))) s = FUZZY - 3;
    }
    if (s) out.set(t, s);
  }
  return out;
}

function makePlan(query: string, c: Corpus): Plan | null {
  const qNorm = fold(query);
  if (!qNorm) return null;
  let qTokens = tokenize(query);
  // A query made only of stop words ("and") still deserves results.
  if (qTokens.length === 0) qTokens = qNorm.split(' ').map(wordForm);
  const he = qTokens.map(isHebrew);
  const fuzzy = qTokens.map((q, i) => {
    const direct = anyStartsWith(c.gate, q) || (!he[i] && q.length >= 3 && c.gateLatin.some((t) => t.includes(q)));
    return direct ? null : typoSet(q, he[i], c);
  });
  return {
    qTokens,
    qNorm,
    he,
    fuzzy,
    alts: qTokens.map((q, i) => (he[i] && fuzzy[i] ? prefixReadings(q) : null)),
    optional: qTokens.map(() => false),
    allHe: qTokens.every((q, i) => he[i] || DIGITS.test(q)),
    stems: qTokens.map((q, i) => (he[i] ? hebrewStem(q) : null)),
    plural: qTokens.map((q, i) => he[i] && hasPluralEnding(q)),
  };
}

/** The relaxed plan (4.6), or null when it would be the strict one again. */
function relaxPlan(p: Plan, c: Corpus): Plan | null {
  const alts = p.qTokens.map((q, i) => (p.he[i] ? prefixReadings(q) : null));
  // A Hebrew word the list has nowhere, even by typo or prefix reading (a brand such as תנובה).
  const nowhere = (i: number) =>
    p.he[i] && p.fuzzy[i] !== null && p.fuzzy[i]!.size === 0 && !(alts[i] ?? []).some((r) => anyStartsWith(c.gate, r));
  const canSkip = p.qTokens.map((q, i) => MODIFIERS.has(q) || QUANTITY.has(q) || DIGITS.test(q) || nowhere(i));
  // At least one word must not be skippable.
  const optional = canSkip.every(Boolean) ? canSkip.map(() => false) : canSkip;
  if (!optional.some(Boolean) && !alts.some((a) => a && a.length)) return null;
  return { ...p, alts, optional };
}

/** One query word against one name: [score, token position, kind] or null. */
function matchWord(p: Plan, i: number, n: IndexedName): [number, number, Kind] | null {
  const q = p.qTokens[i];
  const he = p.he[i];
  // Script separation: a Latin word is never compared with a Hebrew name.
  if (!he && (n.kind === 'he' || n.kind === 'heu') && HAS_LATIN.test(q)) return null;
  const fuzzy = p.fuzzy[i];
  let best = 0;
  let pos = -1;
  let kind: Kind = 'part';
  for (let j = 0; j < n.tokens.length; j++) {
    const t = n.tokens[j];
    let s = 0;
    let k: Kind = 'part';
    if (t === q) {
      s = WHOLE;
      k = 'whole';
    } else if (he) {
      const qs = p.stems[i];
      const ts = n.stems[j];
      if (qs !== null && ((ts !== null && qs === ts) || (p.plural[i] && t === qs))) {
        s = STEM;
        k = 'whole';
      } else if (t.startsWith(q)) s = PREFIX + Math.min(15, (q.length / t.length) * 15);
      else if (fuzzy && fuzzy.has(t)) s = fuzzy.get(t)!;
      const alts = p.alts[i];
      if (!s && alts) {
        for (const a of alts) {
          if (t === a) s = Math.max(s, PREFIX);
          else if (t.startsWith(a)) s = Math.max(s, PREFIX - 5);
        }
      }
    } else if (n.kind === 'latin') {
      if (q.length >= 4 && t.startsWith(q)) s = PREFIX + Math.min(15, (q.length / t.length) * 15);
    } else if (t.startsWith(q)) s = PREFIX + Math.min(15, (q.length / t.length) * 15);
    else if (q.length >= 3 && t.includes(q)) s = INSIDE;
    else if (fuzzy && fuzzy.has(t)) s = fuzzy.get(t)!;
    // Brand words count a little less than words of the name itself.
    if (s && j >= n.brandStart) s *= 0.8;
    if (s > best) {
      best = s;
      pos = j;
      kind = k;
    }
  }
  return best > 0 ? [best, pos, kind] : null;
}

interface NameMatch {
  score: number;
  kinds: Kind[];
}

/** Today's relevance on one name, or null when a required word does not match. */
function nameRelevance(n: IndexedName, p: Plan): NameMatch | null {
  let total = 0;
  const positions: number[] = [];
  const kinds: Kind[] = [];
  for (let i = 0; i < p.qTokens.length; i++) {
    const m = matchWord(p, i, n);
    if (!m) {
      if (p.optional[i]) {
        kinds.push('skip');
        continue;
      }
      return null;
    }
    total += m[0];
    positions.push(m[1]);
    kinds.push(m[2]);
  }
  if (!positions.length) return null;
  const qn = p.qTokens.length;
  let score = total / qn;
  // The whole name starts with what was typed: "chicken b" -> "Chicken breast".
  if (n.norm && n.norm.startsWith(p.qNorm)) score += 40;
  // Matching the main part of the name beats matching a qualifier after the comma.
  let headHits = 0;
  const covered = new Set<number>();
  for (const x of positions) {
    if (x < n.head.length) {
      headHits++;
      covered.add(x);
    }
  }
  score += (headHits / qn) * 20;
  // The query covers the whole main name: "apple" is "Apple, raw" more than "Apple pie".
  if (n.head.length) score += (covered.size / n.head.length) * 15;
  // First word of the food matched: "rice" prefers "Rice, ..." over "Fried rice".
  if (positions.includes(0)) score += 10;
  // Prefer shorter, more generic names when everything else is equal.
  score -= Math.min(15, n.tokens.length * 1.2);
  if (n.kind === 'latin') score *= 0.95;
  return { score, kinds };
}

interface FoodMatch extends NameMatch {
  matched?: string;
}

function relevance(food: Food, p: Plan): FoodMatch | null {
  const ix = index(food);
  let best: NameMatch | null = null;
  let bestName: IndexedName | null = null;
  for (const n of ix.names) {
    const r = nameRelevance(n, p);
    if (r && (!best || r.score > best.score)) {
      best = r;
      bestName = n;
    }
  }
  if (best && bestName) return bestName.kind === 'he' ? { ...best, matched: bestName.text } : best;
  // Hebrew words may be found across the food's Hebrew names together, never with a Latin or stored name.
  if (ix.union && p.allHe) {
    const r = nameRelevance(ix.union, p);
    if (r) return { score: r.score * 0.9, kinds: r.kinds, matched: unionShown(ix.heNames, p).text };
  }
  return null;
}

/** The Hebrew name that holds the most query words (first in table order on a tie). */
function unionShown(names: IndexedName[], p: Plan): IndexedName {
  let shown = names[0];
  let cover = -1;
  for (const n of names) {
    let c = 0;
    for (const q of p.qTokens) if (n.tokens.some((t) => t === q || t.startsWith(q))) c++;
    if (c > cover) {
      cover = c;
      shown = n;
    }
  }
  return shown;
}

const SOURCE_BONUS: Record<Food['source'], number> = {
  custom: 8,
  builtin: 14,
  usda: 14,
  ai: 0,
  quick: 0,
  openfoodfacts: 0,
};

/**
 * Instant search over the bundled foods, the user's custom foods and their
 * history. Pure and synchronous. Returns [] for an empty query.
 */
export function searchLocal(query: string, ctx: SearchContext = {}, limit = 40): SearchHit[] {
  if (!fold(query)) return [];
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
  const corpus = corpusFor(foods);
  let p = makePlan(query, corpus);
  if (!p) return [];
  let found = match(foods, p);
  // Relaxed pass: only when a query with a Hebrew letter found nothing.
  if (!found.length && p.he.some(Boolean)) {
    const relaxed = relaxPlan(p, corpus);
    if (relaxed) {
      p = relaxed;
      found = match(foods, p);
    }
  }
  // Hebrew whole words first: a food that matched a Hebrew word only in part goes after every food
  // that did not, when some food matched that word whole (milk above halva for חלב, whatever history).
  const plan = p;
  const wholeSomewhere = plan.qTokens.map((_, i) => plan.he[i] && found.some(([, r]) => r.kinds[i] === 'whole'));

  const hits: (SearchHit & { demoted: number })[] = [];
  for (const [food, r] of found) {
    let bonus = SOURCE_BONUS[food.source] ?? 0;
    let origin: SearchOrigin = food.source === 'openfoodfacts' ? 'online' : 'builtin';
    const rr = recentRank.get(food.id);
    if (rr !== undefined) {
      bonus += 30 - Math.min(15, rr * 0.5);
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
    let demoted = 0;
    for (let i = 0; i < r.kinds.length; i++) if (wholeSomewhere[i] && r.kinds[i] !== 'whole') demoted++;
    const hit: SearchHit & { demoted: number } = { food, score: r.score + bonus, origin, demoted };
    if (r.matched !== undefined) hit.matched = r.matched;
    hits.push(hit);
  }
  hits.sort(
    (a, b) =>
      a.demoted - b.demoted ||
      b.score - a.score ||
      a.food.name.length - b.food.name.length ||
      a.food.name.localeCompare(b.food.name),
  );
  return hits.slice(0, limit).map(({ demoted: _demoted, ...hit }) => hit);
}

function match(foods: readonly Food[], p: Plan): [Food, FoodMatch][] {
  const out: [Food, FoodMatch][] = [];
  for (const food of foods) {
    const r = relevance(food, p);
    if (r) out.push([food, r]);
  }
  return out;
}

/**
 * Rank online products for a query. Products whose names match every word come
 * first; the rest keep Open Food Facts' own order behind them (names are often
 * in another language, so they are not dropped). Hebrew names are folded and
 * matched by the same rules as local foods.
 */
export function rankOnline(query: string, products: Food[], exclude: Iterable<string> = []): Food[] {
  const skip = new Set(exclude);
  const fresh = products.filter((f) => !skip.has(f.id));
  if (!fold(query)) return fresh;
  const p = makePlan(query, buildCorpus(fresh));
  if (!p) return fresh;
  return fresh
    .map((food, i) => {
      const r = relevance(food, p);
      return { food, ok: r !== null, score: r?.score ?? 0, i };
    })
    .sort((a, b) => Number(b.ok) - Number(a.ok) || b.score - a.score || a.i - b.i)
    .map((x) => x.food);
}

/**
 * Online community products from Open Food Facts. Never throws. `failed` is
 * true when the service could not be reached, as opposed to finding nothing.
 */
export async function searchOnlineWithStatus(
  query: string,
  opts: { limit?: number; exclude?: Iterable<string> } = {},
): Promise<{ items: Food[]; failed: boolean; unavailable: boolean }> {
  const q = query.trim();
  if (q.length < 2) return { items: [], failed: false, unavailable: false };
  const { foods, failed, unavailable } = await searchProductsWithStatus(q, opts.limit ?? 24);
  return { items: rankOnline(q, foods, opts.exclude), failed, unavailable };
}

export async function searchOnline(query: string, opts: { limit?: number; exclude?: Iterable<string> } = {}): Promise<Food[]> {
  return (await searchOnlineWithStatus(query, opts)).items;
}
