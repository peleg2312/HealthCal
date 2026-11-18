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
 * names together (the union name, scored lower). A Latin word is never compared with a Hebrew name, and
 * an Arabic or Cyrillic word (an own food's name) only with whole words and word beginnings.
 * Text is folded with `fold` (`@/lib/hebrew`), which leaves Latin text exactly as the old normaliser
 * did, so English search keeps its behaviour (`foodSearch.english.test.ts` holds the top 5 of 304
 * queries and the first result of 230 more in `english-more.tsv`). When a query with a Hebrew letter finds nothing, a relaxed
 * pass lets amounts, numbers, preparation words and words found nowhere (a brand) after the first
 * content word go unmatched, and then the parts pass shows each word's own foods (see `searchLocal`). A typed
 * percentage ("5%", "9 אחוז") changes the calories: the relaxed pass shows only foods whose name states a
 * percentage, and the parts pass never searches one alone.
 * A name token after לא ("אורז לא מבושל") matches only a query that says לא too.
 *
 * Speed: the app runs this on every keystroke on Hermes (no JIT). Each food's names are indexed once
 * per food object (stems included); the corpus's sorted gate tokens and per-script typo vocabularies
 * are built once per set of food objects (the Hebrew skeletons on the first typo search); typo
 * candidates are computed once per search over the distinct tokens of the word's own script, not per
 * food. Only the first 80 characters and 10 words are searched. `scripts/dev/search-timing.mjs` measures it with and without the interpreter
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
  isOtherScript,
  LONE_PREFIXES,
  MODIFIERS,
  PREFIX_SET,
  prefixReadings,
  QUANTITY,
  shortPluralBase,
  skeleton,
  soundSkeleton,
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

const DIGITS = /^[0-9]+$/;

const STOPWORDS = new Set(['a', 'an', 'and', 'of', 'the', 'with', 'w', 'in', 'on', 'or', ...HEBREW_STOPWORDS]);

/** Very small English singulariser: enough for "apples", "berries", "tomatoes", "dishes". */
export function stem(word: string): string {
  // Only a word that ends in s can change (the rules below all need it); skip the tests for the rest.
  if (word.length <= 3 || word[word.length - 1] !== 's' || /\d/.test(word)) return word;
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
 * before a Hebrew word or a number dropped ("ה-חומוס", "כ100"), each word in its compared form.
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
    if (LONE_PREFIXES.has(t) && i + 1 < raw.length && (isHebrew(raw[i + 1]) || DIGITS.test(raw[i + 1]))) continue;
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
  /**
   * Tokens that stand directly after לא ("אורז לא מבושל"), or null when there are none: they match a
   * query word only when the query holds לא too, so "אורז מבושל" never offers the dry rice.
   */
  neg: boolean[] | null;
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
  return { text, kind, norm, head, tokens, stems: tokens.map(stemOf), neg: negated(tokens), brandStart: nameTokens.length };
}

const NOT = 'לא';

function negated(tokens: string[]): boolean[] | null {
  const i = tokens.indexOf(NOT);
  if (i < 0 || i === tokens.length - 1) return null;
  return tokens.map((_, j) => j > 0 && tokens[j - 1] === NOT);
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
    // A union token is negated only when every name that holds it negates it.
    const neg = heNames.some((n) => n.neg)
      ? tokens.map((t) => heNames.every((n) => n.tokens.every((x, j) => x !== t || (n.neg !== null && n.neg[j]))))
      : null;
    union = { text: heNames[0].text, kind: 'heu', norm: '', head: heNames[0].tokens, tokens, stems: tokens.map(stemOf), neg, brandStart: tokens.length };
  }
  hit = { names, union, heNames };
  foodCache.set(food, hit);
  return hit;
}

// ------------------------------------------------------------------ corpus (once per set of foods)

interface Corpus {
  /** Distinct tokens of stored names, brands and Hebrew names, sorted: "does any start with q" is a binary search. */
  gate: string[];
  /** The first word of every stored name and Hebrew name (the parts pass reads בפיתה as פיתה only when פיתה heads a name). */
  heads: Set<string>;
  /** Distinct Latin and digit gate tokens: "does any contain q" (Latin words of 3+ letters) and the Latin typo vocabulary. */
  gateLatin: string[];
  /** The Hebrew typo vocabulary: distinct Hebrew gate tokens. */
  typoHe: string[];
  /** Their skeletons and sound-alike skeletons, built by the first Hebrew typo search (not by the first call). */
  heSkel: { skel: string[]; sound: string[] } | null;
  /** Token -> foods, built by the first parts pass. */
  postings: Map<string, Food[]> | null;
}

function buildCorpus(foods: readonly Food[]): Corpus {
  const gate = new Set<string>();
  const heads = new Set<string>();
  for (const f of foods) {
    for (const n of index(f).names) {
      if (n.kind === 'latin') continue;
      for (const t of n.tokens) gate.add(t);
      if (n.tokens.length) heads.add(n.tokens[0]);
    }
  }
  const sorted = [...gate].sort();
  const latin = sorted.filter((t) => !isHebrew(t));
  const he = sorted.filter(isHebrew);
  return { gate: sorted, heads, gateLatin: latin, typoHe: he, heSkel: null, postings: null };
}

/** Whether the sorted list holds `q` itself. */
function has(sorted: readonly string[], q: string): boolean {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (sorted[mid] < q) lo = mid + 1;
    else hi = mid;
  }
  return lo < sorted.length && sorted[lo] === q;
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
/** A Hebrew one-edit typo with the same first letter: above a skeleton match. */
const HE_EDIT = 52;
/** The sound-alike skeleton (פיטה for פיתה). */
const SOUND = 48;
/** The query word is a name token with a prefix glued on (בטחינה for טחינה): below a prefix match. */
const GLUED = 60;
const FUZZY = 45;

type Kind = 'whole' | 'part' | 'skip';

interface Plan {
  qTokens: string[];
  qNorm: string;
  he: boolean[];
  /** Typo candidates per word (token -> score), or null when typo matching is off for it. */
  fuzzy: (ReadonlyMap<string, number> | null)[];
  /** Prefix readings per Hebrew word, or null when off. */
  alts: (Reading[] | null)[];
  /** Words that may go unmatched (relaxed pass only). */
  optional: boolean[];
  /**
   * A fat percentage or any other percentage ("5%", "1.5%", "9 אחוז"): a number that changes the calories.
   * The relaxed pass may leave it unmatched only for a food whose name states a percentage (`PCT_NAME`).
   */
  pct: boolean[];
  /** Every word is Hebrew or digits: the union name may be tried. */
  allHe: boolean;
  stems: (string | null)[];
  plural: boolean[];
  /**
   * The Hebrew word exists whole in the list: a name token that is this word with a prefix glued on
   * (בטחינה for טחינה) matches it, below a prefix match.
   */
  whole: boolean[];
  /** The query holds לא: a negated name token may match. */
  hasNot: boolean;
  /** Arabic or Cyrillic words: whole and prefix matches only. */
  other: boolean[];
}

/** A word of the word sets: an amount (QUANTITY) or a preparation or size word (MODIFIERS). */
const setWord = (q: string) => QUANTITY.has(q) || MODIFIERS.has(q);

const NO_TYPOS: ReadonlyMap<string, number> = new Map();

/** A prefix reading of a query word, with its stem and plural flag so "הגבינות" meets "גבינה". */
interface Reading {
  r: string;
  stem: string | null;
  plural: boolean;
}

/**
 * A Hebrew word's stem for matching: its stem (`hebrewStem`), or for a four-letter plural the
 * two-letter singular when that word exists whole in the list (דגים -> דג).
 */
function stemIn(w: string, c: Corpus): string | null {
  const s = hebrewStem(w);
  if (s !== null) return s;
  const b = shortPluralBase(w);
  return b !== null && has(c.gate, b) ? b : null;
}

/** A four-letter plural whose two-letter singular exists whole in the list (דגים: דג). */
function shortIn(w: string, c: Corpus): boolean {
  const b = shortPluralBase(w);
  return b !== null && has(c.gate, b);
}

function readings(q: string, c: Corpus): Reading[] {
  return prefixReadings(q).map((r) => ({ r, stem: stemIn(r, c), plural: hasPluralEnding(r) }));
}

/**
 * Typo candidates for `q` among the corpus tokens of its own script (4.5).
 *
 * Latin (unchanged): one edit (two from 7 letters), or a typo while still typing a longer word.
 * Hebrew: the same skeleton (4+ letters), the same sound-alike skeleton (4+ letters, the same length:
 * only sound-alike letters differ, so פטה is not פיטה; three letters only by a final א or ה), or one edit (two
 * from 8 letters, from 5 letters) with the same first letter. When several fit, the highest score
 * wins, and an edit match scores above a skeleton match of another word. Among edits, a word the
 * query left a letter out of comes before one that leaves a typed letter over, so בקלווה finds baklava
 * before cod; a vav or yod left out (the skeleton fits too) scores highest.
 */
function typoSet(q: string, he: boolean, c: Corpus): Map<string, number> {
  const out = new Map<string, number>();
  if (q.length < (he ? 3 : 4)) return out;
  const q0 = q[0];
  if (!he) {
    const max = q.length >= 7 ? 2 : 1;
    const vocab = c.gateLatin;
    for (let i = 0; i < vocab.length; i++) {
      const t = vocab[i];
      const d = t.length - q.length;
      let s = 0;
      if (d <= max && d >= -max && (max === 1 ? withinOneEdit(q, t) : editDistance(q, t, max) <= max)) s = FUZZY;
      // A typo while still typing a longer word: "chik" -> "chicken".
      else if (d > 0 && t[0] === q0 && withinOneEdit(q, t.slice(0, q.length))) s = FUZZY - 3;
      if (s) out.set(t, s);
    }
    return out;
  }
  const max = q.length >= 8 ? 2 : 1;
  const editOk = q.length >= 5;
  const qSkel = skeleton(q);
  const qSound = soundSkeleton(q);
  // Three letters: only a final א for ה or the other way (קפא for קפה); פתה stays apart from פטה.
  const last = q[q.length - 1];
  const q3 = q.length === 3 && (last === 'א' || last === 'ה') ? q.slice(0, 2) + (last === 'א' ? 'ה' : 'א') : '';
  const vocab = c.typoHe;
  c.heSkel ??= { skel: vocab.map(skeleton), sound: vocab.map(soundSkeleton) };
  const { skel: skels, sound } = c.heSkel;
  for (let i = 0; i < vocab.length; i++) {
    const t = vocab[i];
    let s = 0;
    const skel = t.length >= 4 && q.length >= 4 && skels[i] === qSkel;
    if (editOk && t[0] === q0) {
      const d = t.length - q.length;
      // A word with a letter left out (בקלווה for בקלאווה) before one that leaves a typed letter over
      // (בקלה); a vav or yod left out (בורגל for בורגול: the skeleton fits too) first of all.
      if (d <= max && d >= -max && (max === 1 ? withinOneEdit(q, t) : editDistance(q, t, max) <= max)) s = d < 0 ? HE_EDIT - 1 : skel && d > 0 ? HE_EDIT + 2 : HE_EDIT;
    }
    if (!s && skel) s = SKEL;
    if (!s && t.length === q.length && (q.length >= 4 ? sound[i] === qSound : t === q3)) s = SOUND;
    if (s) out.set(t, s);
  }
  return out;
}

/** Only the first 80 characters and 10 words of a query are searched (no one types more into a food search). */
const MAX_CHARS = 80;
const MAX_WORDS = 10;
/** The relaxed and parts passes are skipped above 6 words. */
const MAX_RELAXED_WORDS = 6;

function makePlan(query: string, c: Corpus): Plan | null {
  const clipped = query.length > MAX_CHARS ? query.slice(0, MAX_CHARS) : query;
  const qNorm = fold(clipped);
  if (!qNorm) return null;
  let qTokens = tokenizeFolded(qNorm);
  // A query made only of stop words ("and") still deserves results.
  if (qTokens.length === 0) qTokens = qNorm.split(' ').map(wordForm);
  if (qTokens.length > MAX_WORDS) qTokens = qTokens.slice(0, MAX_WORDS);
  const he = qTokens.map(isHebrew);
  // An amount or preparation word gets no typo and no prefix reading (פרוסה is not אפונה גרוסה, כפית is not פיתה).
  const fuzzy = qTokens.map((q, i) => {
    const direct = anyStartsWith(c.gate, q) || (!he[i] && !isOtherScript(q) && q.length >= 3 && c.gateLatin.some((t) => t.includes(q)));
    return direct ? null : (he[i] && setWord(q)) || isOtherScript(q) ? NO_TYPOS : typoSet(q, he[i], c);
  });
  return {
    qTokens,
    qNorm,
    he,
    fuzzy,
    alts: qTokens.map((q, i) => (he[i] && fuzzy[i] && !setWord(q) ? readings(q, c) : null)),
    optional: qTokens.map(() => false),
    pct: percentages(clipped, qTokens),
    allHe: qTokens.every((q, i) => he[i] || DIGITS.test(q)),
    stems: qTokens.map((q, i) => (he[i] ? stemIn(q, c) : null)),
    plural: qTokens.map((q, i) => he[i] && hasPluralEnding(q)),
    whole: qTokens.map((q, i) => he[i] && q.length >= 3 && has(c.gate, q)),
    hasNot: qTokens.includes(NOT),
    other: qTokens.map((q, i) => !he[i] && isOtherScript(q)),
  };
}


/** A stored name that states a percentage ("Cottage cheese, 5% fat", "Milk, reduced fat (2%)"). */
const PCT_NAME = /\d\s*%/;
/** A number typed with a percent sign, decimals included ("5%", "1.5 %", "0,5%"). */
const PCT_TYPED = /\d+(?:[.,]\d+)?\s*%/g;
/** A Latin letter next to a digit: fold keeps the two in one word ("x2"), so that digit run is no word of its own. */
const LATIN_NEXT = /[a-z\u00c0-\u024f]/i;
const PERCENT_WORDS: ReadonlySet<string> = new Set(['אחוז', 'אחוזים'].map((w) => tokenize(w)[0]));

/**
 * Which query words are a percentage: a number typed with % (each digit run of it, so "1.5%" marks 1 and
 * 5), or a number before אחוז or אחוזים. The digit runs of the raw text are the number words of the
 * tokens, in order; when the two counts differ (a digit inside a Latin word) none is marked.
 */
function percentages(raw: string, qTokens: string[]): boolean[] {
  const out = qTokens.map((q, i) => DIGITS.test(q) && i + 1 < qTokens.length && PERCENT_WORDS.has(qTokens[i + 1]));
  if (raw.indexOf('%') < 0) return out;
  const inPct: boolean[] = [];
  const spans: [number, number][] = [];
  PCT_TYPED.lastIndex = 0;
  for (let m = PCT_TYPED.exec(raw); m; m = PCT_TYPED.exec(raw)) spans.push([m.index, m.index + m[0].length]);
  const run = /\d+/g;
  for (let m = run.exec(raw); m; m = run.exec(raw)) {
    const a = m.index;
    const b = a + m[0].length;
    if (LATIN_NEXT.test(raw[a - 1] ?? '') || LATIN_NEXT.test(raw[b] ?? '')) continue;
    inPct.push(spans.some(([x, y]) => a >= x && b <= y));
  }
  const numbers = qTokens.map((q, i) => (DIGITS.test(q) ? i : -1)).filter((i) => i >= 0);
  if (numbers.length > inPct.length) return out;
  numbers.forEach((i, k) => {
    if (inPct[k]) out[i] = true;
  });
  return out;
}

/** The relaxed plan (4.6), or null when it would be the strict one again. */
function relaxPlan(p: Plan, c: Corpus): Plan | null {
  const alts = p.qTokens.map((q, i) => (p.he[i] && !setWord(q) ? readings(q, c) : null));
  // The first Hebrew content word (not a number, an amount or a preparation word) carries the meaning:
  // it is never skipped. A word found nowhere may be skipped only after it.
  const head = p.qTokens.findIndex((q, i) => p.he[i] && !setWord(q));
  // A Hebrew word the list has nowhere, even by typo or prefix reading (a brand such as תנובה).
  const nowhere = (i: number) =>
    i > head &&
    p.he[i] &&
    !shortIn(p.qTokens[i], c) &&
    p.fuzzy[i] !== null &&
    p.fuzzy[i]!.size === 0 &&
    !(alts[i] ?? []).some((a) => anyStartsWith(c.gate, a.r) || shortIn(a.r, c));
  const canSkip = p.qTokens.map((q, i) => setWord(q) || DIGITS.test(q) || nowhere(i));
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
  const neg = p.hasNot ? null : n.neg;
  const other = p.other[i];
  for (let j = 0; j < n.tokens.length; j++) {
    if (neg && neg[j]) continue;
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
          if (t === a.r) s = Math.max(s, PREFIX);
          else if (a.stem !== null && ((ts !== null && ts === a.stem) || (a.plural && t === a.stem))) s = Math.max(s, PREFIX - 2);
          else if (t.startsWith(a.r)) s = Math.max(s, PREFIX - 5);
        }
      }
      // A prefix glued onto the word inside the name: "בטחינה" for טחינה.
      if (!s && p.whole[i] && t.length > q.length && t.endsWith(q) && PREFIX_SET.has(t.slice(0, t.length - q.length))) s = GLUED;
    } else if (other) {
      // An Arabic or Cyrillic word: whole (above) or the beginning of a word of its own script only.
      if (t.startsWith(q)) s = PREFIX + Math.min(15, (q.length / t.length) * 15);
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
  /** The name token each word matched (-1 when skipped). */
  at: number[];
}

/** Today's relevance on one name, or null when a required word does not match. */
function nameRelevance(n: IndexedName, p: Plan): NameMatch | null {
  let total = 0;
  const positions: number[] = [];
  const kinds: Kind[] = [];
  const at: number[] = [];
  for (let i = 0; i < p.qTokens.length; i++) {
    const m = matchWord(p, i, n);
    if (!m) {
      if (p.optional[i]) {
        kinds.push('skip');
        at.push(-1);
        continue;
      }
      return null;
    }
    total += m[0];
    positions.push(m[1]);
    kinds.push(m[2]);
    at.push(m[1]);
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
  return { score, kinds, at };
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
    if (r) return { score: r.score * 0.9, kinds: r.kinds, at: r.at, matched: unionShown(ix.heNames, p).text };
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
 *
 * Passes, each only when the one before found nothing: strict (every word matches one name); relaxed
 * (a query with a Hebrew letter: amounts, numbers, preparation words and words found nowhere after the
 * first content word may go unmatched); the parts pass (two or more Hebrew content words that no food
 * holds together: each word's own foods, in the order typed). A last Hebrew word of one letter that
 * would empty the list is a word still being typed, and is left out.
 *
 * A new rule is proved in `__fixtures__/hebrew-examples.tsv` (with its must-be-first and must-not ids)
 * and measured against every list in `__fixtures__` and the English comparison
 * (`foodSearch.english.test.ts`).
 */
export function searchLocal(query: string, ctx: SearchContext = {}, limit = 40): SearchHit[] {
  return runLocal(query, ctx).hits.slice(0, limit).map(({ demoted: _demoted, ...hit }) => hit);
}

/** Which pass found the local results: for tests (a query with no food must find nothing, or only parts). */
export type LocalPass = 'strict' | 'relaxed' | 'parts' | 'none';

/** The pass `searchLocal` took for a query (after leaving out a last word still being typed). */
export function localPass(query: string, ctx: SearchContext = {}): LocalPass {
  return runLocal(query, ctx).pass;
}

function runLocal(query: string, ctx: SearchContext): Found {
  if (!fold(query)) return NONE;
  const base = ctx.foods ?? BUILTIN_FOODS;
  const custom = ctx.customFoods ?? [];
  const recents = ctx.recentFoods ?? [];

  // One definition per id: the user's edited custom food wins over a stale recent copy.
  const byId = new Map<string, Food>();
  for (const f of recents) byId.set(f.id, f);
  for (const f of base) byId.set(f.id, f);
  for (const f of custom) byId.set(f.id, f);
  const recentRank = new Map<string, number>();
  recents.forEach((f, i) => {
    if (!recentRank.has(f.id)) recentRank.set(f.id, i);
  });
  const who: Who = { recentRank, customIds: new Set(custom.map((f) => f.id)), favs: new Set(ctx.favoriteIds ?? []) };

  const foods = [...byId.values()];
  const corpus = corpusFor(foods);
  const r = find(query, foods, corpus, who);
  if (r.hits.length) return r;
  // A word still being typed: a last Hebrew word of one letter (ע on the way to עם).
  const f = fold(query.length > MAX_CHARS ? query.slice(0, MAX_CHARS) : query);
  const cut = f.lastIndexOf(' ');
  return cut > 0 && f.length - cut === 2 && isHebrew(f[cut + 1]) ? find(f.slice(0, cut), foods, corpus, who) : r;
}

interface Found {
  hits: RankedHit[];
  pass: LocalPass;
}

const NONE: Found = { hits: [], pass: 'none' };

/** Who the person is to each food: recents, own foods and favourites. */
interface Who {
  recentRank: Map<string, number>;
  customIds: Set<string>;
  favs: Set<string>;
}

type RankedHit = SearchHit & { demoted: number };

/** The strict, relaxed and parts passes for one query, ranked. */
function find(query: string, foods: readonly Food[], c: Corpus, who: Who): Found {
  const p = makePlan(query, c);
  if (!p) return NONE;
  let found = match(foods, p);
  if (found.length) return { hits: rank(found, p, who), pass: 'strict' };
  // The other passes: only for a query with a Hebrew letter, and never above 6 words.
  if (!p.he.some(Boolean) || p.qTokens.length > MAX_RELAXED_WORDS) return NONE;
  const relaxed = relaxPlan(p, c);
  if (relaxed) {
    found = match(foods, relaxed);
    // A percentage left unmatched must still be on the screen: only foods whose name states one.
    if (relaxed.pct.some(Boolean)) found = found.filter(([food]) => PCT_NAME.test(food.name));
    if (found.length) return { hits: rank(found, relaxed, who), pass: 'relaxed' };
  }
  const parts = partsPass(p, foods, c, who);
  return parts.length ? { hits: parts, pass: 'parts' } : NONE;
}

/** Hits with their bonus for history and source, in today's order. */
function rank(found: [Food, FoodMatch][], plan: Plan, who: Who): RankedHit[] {
  // Hebrew whole words first: a food that matched a Hebrew word only in part goes after every food
  // that did not, when some food matched that word whole as the first word of its name (milk above
  // halva for חלב, whatever history; but סוכר חום does not push hummus down while חומ is typed).
  const wholeSomewhere = plan.qTokens.map((_, i) => plan.he[i] && found.some(([, r]) => r.kinds[i] === 'whole' && r.at[i] === 0));
  const hits: RankedHit[] = [];
  for (const [food, r] of found) {
    let bonus = SOURCE_BONUS[food.source] ?? 0;
    let origin: SearchOrigin = food.source === 'openfoodfacts' ? 'online' : 'builtin';
    const rr = who.recentRank.get(food.id);
    if (rr !== undefined) {
      bonus += 30 - Math.min(15, rr * 0.5);
      origin = 'recent';
    }
    if (who.customIds.has(food.id)) {
      bonus += 26;
      origin = 'custom';
    }
    if (who.favs.has(food.id)) {
      bonus += 36;
      origin = 'favorite';
    }
    if (food.verified) bonus += 3;
    let demoted = 0;
    for (let i = 0; i < r.kinds.length; i++) if (wholeSomewhere[i] && r.kinds[i] !== 'whole') demoted++;
    const hit: RankedHit = { food, score: r.score + bonus, origin, demoted };
    if (r.matched !== undefined) hit.matched = r.matched;
    hits.push(hit);
  }
  hits.sort(byRank);
  // The person's own foods and favourites are never pushed below every whole match: the best whole
  // match first, then own foods and favourites that matched in part, then the other whole matches.
  const mine = hits.filter((h) => h.demoted > 0 && (h.origin === 'custom' || h.origin === 'favorite'));
  return mine.length && hits[0].demoted === 0 ? [hits[0], ...mine, ...hits.slice(1).filter((h) => !mine.includes(h))] : hits;
}

const WITHOUT: ReadonlySet<string> = new Set(['ללא', 'בלי']);

/**
 * The parts pass: two or more Hebrew content words (two letters or more, not numbers, amounts,
 * preparation words or stop words; never a word after ללא or בלי, never the אחוז of a percentage) that no
 * food holds together. Each word is searched by itself
 * (strictly, prefix readings on) and the foods are shown in the order the words were typed: the best
 * three of each word, then the rest; a food found by more of the words comes first. So "שניצל בפיתה"
 * shows the schnitzels and then the pitas, and "סביח בפיתה" only the pitas (סביח is unknown). Each
 * hit keeps the Hebrew name its word matched.
 */
function partsPass(p: Plan, foods: readonly Food[], c: Corpus, who: Who): RankedHit[] {
  if (!p.allHe) return [];
  const words: string[] = [];
  p.qTokens.forEach((q, i) => {
    // One letter is a word still being typed, never a part of its own.
    // A percentage (its number, and אחוז after it) is never a part of its own.
    if (!p.he[i] || q.length < 2 || setWord(q) || WITHOUT.has(q) || (i > 0 && WITHOUT.has(p.qTokens[i - 1]))) return;
    if (i > 0 && p.pct[i - 1] && PERCENT_WORDS.has(q)) return;
    if (!words.includes(q)) words.push(q);
  });
  if (words.length < 2) return [];
  const lists: RankedHit[][] = [];
  for (const w of words) {
    // A word with a prefix glued on is searched as its plain word when that word heads a name of the
    // list and the glued form heads none (בפיתה is פיתה; בננה stays בננה).
    const plain = c.heads.has(w) ? undefined : prefixReadings(w).find((r) => c.heads.has(r));
    const i = p.qTokens.indexOf(w);
    const plan = plain === undefined ? wordPlan(p, i, c) : makePlan(plain, c);
    if (!plan) continue;
    plan.alts = [readings(plan.qTokens[0], c)];
    // Only the foods that hold a token this word can match (on Hermes a pass over every food per word
    // would cost too much).
    const found = match(candidates(plan, foods, c), plan);
    if (found.length) lists.push(rank(found, plan, who));
  }
  const count = new Map<string, number>();
  for (const l of lists) for (const h of l) count.set(h.food.id, (count.get(h.food.id) ?? 0) + 1);
  const out: RankedHit[] = [];
  const placed = new Set<string>();
  const put = (h: RankedHit) => {
    placed.add(h.food.id);
    out.push({ ...h, demoted: 0 });
  };
  for (let n = lists.length; n >= 1; n--) {
    for (const l of lists) {
      let taken = 0;
      for (const h of l) {
        if (taken === 3) break;
        if (placed.has(h.food.id) || count.get(h.food.id) !== n) continue;
        put(h);
        taken++;
      }
    }
    for (const l of lists) for (const h of l) if (!placed.has(h.food.id) && count.get(h.food.id) === n) put(h);
  }
  return out;
}

/** The strict plan of one word of `p`, reusing its typo set and stem. */
function wordPlan(p: Plan, i: number, c: Corpus): Plan {
  const q = p.qTokens[i];
  return {
    qTokens: [q],
    qNorm: q,
    he: [true],
    fuzzy: [p.fuzzy[i]],
    alts: [null],
    optional: [false],
    pct: [p.pct[i]],
    allHe: true,
    stems: [p.stems[i] ?? stemIn(q, c)],
    plural: [p.plural[i]],
    whole: [p.whole[i]],
    hasNot: p.hasNot,
    other: [false],
  };
}

/**
 * The foods that hold a token a one-word Hebrew plan can match: tokens that start with the word, its
 * stem, a prefix reading or a reading's stem, its typo candidates, and the word with a prefix glued on.
 * A superset: `match` then decides.
 */
function candidates(plan: Plan, foods: readonly Food[], c: Corpus): Food[] {
  const q = plan.qTokens[0];
  const tokens = new Set<string>();
  const range = (pre: string) => {
    let lo = 0;
    let hi = c.gate.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (c.gate[mid] < pre) lo = mid + 1;
      else hi = mid;
    }
    for (let k = lo; k < c.gate.length && c.gate[k].startsWith(pre); k++) tokens.add(c.gate[k]);
  };
  range(q);
  if (plan.stems[0]) range(plan.stems[0]);
  for (const t of plan.fuzzy[0]?.keys() ?? []) tokens.add(t);
  for (const a of plan.alts[0] ?? []) {
    range(a.r);
    if (a.stem) range(a.stem);
  }
  for (const pre of PREFIX_SET) if (has(c.gate, pre + q)) tokens.add(pre + q);
  const post = postings(foods, c);
  const out = new Set<Food>();
  for (const t of tokens) for (const f of post.get(t) ?? []) out.add(f);
  return [...out];
}

/** Token -> the foods whose stored or Hebrew names hold it; built on the first parts pass. */
function postings(foods: readonly Food[], c: Corpus): Map<string, Food[]> {
  if (c.postings) return c.postings;
  const m = new Map<string, Food[]>();
  for (const f of foods) {
    for (const n of index(f).names) {
      if (n.kind === 'latin') continue;
      for (const t of n.tokens) {
        const l = m.get(t);
        if (!l) m.set(t, [f]);
        else if (l[l.length - 1] !== f) l.push(f);
      }
    }
  }
  c.postings = m;
  return m;
}

/**
 * Today's order: whole words first, then the score; on a tie between two Hebrew names, the shorter
 * matched name (גבינה: גבינה לבנה before גבינה שוויצרית); then the shorter stored name, then by name.
 */
function byRank(a: RankedHit, b: RankedHit): number {
  return (
    a.demoted - b.demoted ||
    b.score - a.score ||
    (a.matched !== undefined && b.matched !== undefined ? a.matched.length - b.matched.length : 0) ||
    a.food.name.length - b.food.name.length ||
    a.food.name.localeCompare(b.food.name)
  );
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
 * matched by the same rules as local foods, Hebrew whole words first.
 */
export function rankOnline(query: string, products: Food[], exclude: Iterable<string> = []): Food[] {
  const skip = new Set(exclude);
  const fresh = products.filter((f) => !skip.has(f.id));
  if (!fold(query)) return fresh;
  const p = makePlan(query, buildCorpus(fresh));
  if (!p) return fresh;
  const rows = fresh.map((food, i) => ({ food, r: relevance(food, p), i, demoted: 0 }));
  // Hebrew whole words first, as in the local search: a product that holds every word whole comes
  // before one that holds a word only as a prefix (חלב 3%: milk before a halva product).
  p.qTokens.forEach((_, k) => {
    if (!p.he[k] || !rows.some((x) => x.r?.kinds[k] === 'whole')) return;
    for (const x of rows) if (x.r && x.r.kinds[k] !== 'whole') x.demoted++;
  });
  return rows
    .sort((a, b) => Number(b.r !== null) - Number(a.r !== null) || a.demoted - b.demoted || (b.r?.score ?? 0) - (a.r?.score ?? 0) || a.i - b.i)
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
