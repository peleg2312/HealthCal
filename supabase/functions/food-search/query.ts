/**
 * The pure parts of the food-search function, kept apart from index.ts so the
 * app's unit tests can run them (src/services/offQuery.test.ts).
 *
 * `offSearchQuery` is a copy of src/services/offQuery.ts (the function is
 * bundled on its own and cannot import from src/): read the explanation there.
 * The test holds both copies to the same output, so change both together.
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
/** Anything that is not a Hebrew letter, a-z or 0-9 separates words. */
const SEPARATOR = /[^א-תa-z0-9]+/;
/** Words that carry no product meaning, and the Lucene operators spelled as words. */
const STOP = new Set(['עם', 'של', 'את', 'and', 'or', 'not']);
const MAX_WORDS = 6;

export function offSearchQuery(q: string): OffSearchQuery {
  if (!HEBREW_LETTER.test(q)) return { q };
  const words: string[] = [];
  const clean = q
    .normalize('NFD')
    .replace(/ﭏ/g, 'אל')
    .replace(/װ/g, 'וו')
    .replace(/ױ/g, 'וי')
    .replace(/ײ/g, 'יי')
    .replace(MARKS, '')
    .toLowerCase();
  for (const w of clean.split(SEPARATOR)) {
    if (w.length < 2 || STOP.has(w) || words.includes(w)) continue;
    words.push(w);
    if (words.length === MAX_WORDS) break;
  }
  if (words.length === 0) return { q };
  return {
    q: words.map((w) => `(product_name.main:${w}* OR product_name.en:${w}* OR brands:${w}*)`).join(' AND '),
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
  const name = (p.product_name || p.product_name_he || p.product_name_en || p.generic_name || '').trim();
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
