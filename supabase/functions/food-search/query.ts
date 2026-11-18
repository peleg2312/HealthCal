/**
 * The pure parts of the food-search function, kept apart from index.ts so the
 * app's unit tests can run them (src/services/offQuery.test.ts).
 *
 * `offSearchQuery`, `offQueryText` and everything they use are a copy of
 * src/services/offQuery.ts (the function is bundled on its own and cannot
 * import from src/): read the explanation there. The test holds both copies to
 * the same text and the same output, so change both together.
 *
 * `usableHit` is a copy of the drop rules of `offToFood`
 * (src/services/openFoodFacts.ts): the function asks the free-text search once
 * more only when a field query found no product the app would show. The same
 * test holds it to `offToFood` on a grid of products.
 */
export interface OffSearchQuery {
  /** The `q` parameter, before URL encoding. */
  q: string;
  /** The `sort_by` parameter, only for a field query. */
  sortBy?: string;
}

/** A Hebrew letter, a Yiddish ligature or a Hebrew presentation form. */
const HEBREW_LETTER = /[א-תװ-ײיִ-ﭏ]/;
/** Cantillation marks and vowel points (the same set as `fold`, src/lib/hebrew.ts) and Latin accents. */
const MARKS = /[֑-ְ֯-ׇֽֿׁׂׅׄ̀-ͯ]/g;
/**
 * A geresh, an apostrophe or a right single quote between two Hebrew letters is part of the word
 * (ג'חנון, צ'יפס): it is kept as a private mark while the words are split, and one typed by itself
 * is removed first. Anywhere else (קוטג', a quote) it separates like every other character.
 */
const INNER_QUOTE = /([א-ת])['’׳](?=[א-ת])/g;
const JOIN = '';
/** Anything that is not a Hebrew letter, a-z, 0-9 or the mark of an inner geresh separates words. */
const SEPARATOR = /[^א-תa-z0-9]+/;
/** Words that carry no product meaning, and the Lucene operators spelled as words. */
const STOP = new Set(['עם', 'של', 'את', 'and', 'or', 'not']);
const MAX_WORDS = 6;
/** Only the first 80 characters of what was typed are sent, by the phones and by the function alike. */
export const MAX_QUERY_CHARS = 80;
/** The fields of a field query, in the order of its clauses. */
const NAME_FIELDS = ['product_name.main', 'product_name.en', 'brands'];

/** The text of the free-text search (and of the field query's fallback): what was typed, cut to 80 characters. */
export function offQueryText(q: string): string {
  return q.slice(0, MAX_QUERY_CHARS);
}

/**
 * One word's clause. A word with an inner geresh is asked in the two forms the service finds (checked
 * against search.openfoodfacts.org on 2026-11-18): with the geresh (U+05F3, "צ׳יפס" found 9 products)
 * and joined ("ציפס" found 2); the ASCII apostrophe form and the part after the geresh found none.
 */
function clause(w: string): string {
  const forms = w.includes(JOIN) ? [w.split(JOIN).join('׳'), w.split(JOIN).join('')] : [w];
  return `(${NAME_FIELDS.flatMap((f) => forms.map((x) => `${f}:${x}*`)).join(' OR ')})`;
}

export function offSearchQuery(typed: string): OffSearchQuery {
  const q = offQueryText(typed);
  if (!HEBREW_LETTER.test(q)) return { q };
  const words: string[] = [];
  const clean = q
    .normalize('NFD')
    .replace(/ﭏ/g, 'אל')
    .replace(/װ/g, 'וו')
    .replace(/ױ/g, 'וי')
    .replace(/ײ/g, 'יי')
    .replace(MARKS, '')
    .toLowerCase()
    .replace(//g, ' ')
    .replace(INNER_QUOTE, `$1${JOIN}`);
  for (const w of clean.split(SEPARATOR)) {
    if (w.length < 2 || STOP.has(w) || words.includes(w)) continue;
    words.push(w);
    if (words.length === MAX_WORDS) break;
  }
  if (words.length === 0) return { q };
  return {
    q: words.map(clause).join(' AND '),
    sortBy: '-popularity_key',
  };
}

/** A search hit as the service returns it; only what `usableHit` reads. */
export interface OffHit {
  code?: string;
  product_name?: string;
  product_name_he?: string;
  product_name_en?: string;
  generic_name?: string;
  nutriments?: Record<string, number | string | undefined>;
}

function num(v: unknown): number | undefined {
  const x = typeof v === 'string' ? Number(v) : v;
  return typeof x === 'number' && Number.isFinite(x) && x >= 0 ? x : undefined;
}

/** True when `offToFood` would keep this product (a name, a code, calories and the three macros that agree). */
export function usableHit(hit: unknown): boolean {
  if (!hit || typeof hit !== 'object') return false;
  const p = hit as OffHit;
  // Each candidate trimmed before choosing: a name of spaces must not hide the Hebrew name behind it.
  const name = [p.product_name, p.product_name_he, p.product_name_en, p.generic_name].map((x) => (typeof x === 'string' ? x.trim() : '')).find(Boolean) ?? '';
  const nu = p.nutriments ?? {};
  let kcal = num(nu['energy-kcal_100g']);
  const kj = num(nu['energy_100g']);
  if (kcal === undefined && kj !== undefined) kcal = kj / 4.184;
  const protein = num(nu['proteins_100g']);
  const carbs = num(nu['carbohydrates_100g']);
  const fat = num(nu['fat_100g']);
  if (!name || !p.code || kcal === undefined || protein === undefined || carbs === undefined || fat === undefined) return false;
  if (protein + carbs + fat > 101 || kcal > 905) return false;
  const implied = protein * 4 + carbs * 4 + fat * 9;
  return !(implied > 40 && (kcal < implied * 0.55 || kcal > implied * 1.6));
}
