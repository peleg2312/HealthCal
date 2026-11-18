/**
 * The query sent to the Open Food Facts search service for what a person typed.
 *
 * The service does not index Hebrew for its free-text search (its language
 * subfields are ar, de, en, es, fr, it, nl, pt, ru, tr), so a query with a
 * Hebrew letter asks a field query on the product's own name instead:
 * `product_name.main` is the name in the product's main language, whatever it
 * is. Each word becomes one clause, all clauses must match, the last letters of
 * every word may still be missing (a prefix), and the service orders the
 * matches by popularity because field clauses carry no relevance score.
 *
 * The query is built from a whitelist of characters (Hebrew letters, a-z,
 * 0-9): everything else, every Lucene operator included, only separates words,
 * so nothing a person types can change the query's structure. Never a leading
 * wildcard, and never free words mixed with field clauses (the service answers
 * HTTP 500 to that).
 *
 * A query without a Hebrew letter is returned unchanged, so the request is
 * byte for byte what it was before Hebrew support.
 *
 * A copy of this function lives in supabase/functions/food-search/query.ts (the
 * edge function cannot import from src/); offQuery.test.ts holds both to the
 * same output. Change both together.
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
