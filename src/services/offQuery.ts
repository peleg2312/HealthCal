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
