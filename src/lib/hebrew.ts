/**
 * Text folding for search, and the small Hebrew helpers the food search and the activity picker use.
 * Pure: no React, no storage.
 *
 * `fold` replaces the food search's old `normalize`. For text without Hebrew letters it gives exactly
 * the old output (lower case, accents removed, everything that is not a-z or 0-9 a space), so English
 * search is unchanged; `hebrew.test.ts` holds that for every bundled name and the English query list.
 * Hebrew letters are kept, with vowel points removed, final letters made normal, geresh and gershayim
 * dropped inside a word, and a space put between Hebrew and Latin letters or digits.
 *
 * Every helper below works on folded text, so an ending like the plural ים is written in its folded
 * form ימ.
 */

/** A Hebrew letter (folded text has only the 22 base letters plus the five finals before step 4). */
const HE_LETTER = /[א-ת]/;

const FINALS: Readonly<Record<string, string>> = {
  'ך': 'כ', // ך -> כ
  'ם': 'מ', // ם -> מ
  'ן': 'נ', // ן -> נ
  'ף': 'פ', // ף -> פ
  'ץ': 'צ', // ץ -> צ
};

/**
 * Search normalisation, in the order of the specification (4.1):
 * NFD; cantillation and vowel points removed (maqaf, paseq, sof pasuq and nun hafukha kept, they are
 * punctuation and break words below); the alef-lamed ligature; final letters; a geresh after a Hebrew
 * letter deleted (', ׳, ’, ‘, `, ´); gershayim between two Hebrew letters deleted (", ״, “, ”); the
 * Yiddish digraphs; lower case and Latin accents removed; anything not a-z, 0-9 or א-ת a space; a
 * space between Hebrew and a Latin letter or digit; trimmed single spaces.
 */
export function fold(s: string): string {
  // Text with nothing from the Hebrew block or the Hebrew presentation forms takes the short road (the
  // Hebrew steps would change nothing); on Hermes this halves the time to index the bundled names.
  if (!HE_ANY.test(s)) {
    return s
      .normalize('NFD')
      .toLowerCase()
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }
  return s
    .normalize('NFD')
    .replace(/[\u0591-\u05af\u05b0-\u05bd\u05bf\u05c1\u05c2\u05c4\u05c5\u05c7]/g, '')
    .replace(/\ufb4f/g, '\u05d0\u05dc')
    .replace(/[\u05da\u05dd\u05df\u05e3\u05e5]/g, (c) => FINALS[c] ?? c)
    .replace(/([\u05d0-\u05ea])['\u05f3\u2019\u2018`\u00b4]/g, '$1')
    .replace(/([\u05d0-\u05ea])["\u05f4\u201c\u201d](?=[\u05d0-\u05ea])/g, '$1')
    .replace(/\u05f0/g, '\u05d5\u05d5')
    .replace(/\u05f1/g, '\u05d5\u05d9')
    .replace(/\u05f2/g, '\u05d9\u05d9')
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\u05d0-\u05ea]+/g, ' ')
    .replace(/([\u05d0-\u05ea])(?=[a-z0-9])|([a-z0-9])(?=[\u05d0-\u05ea])/g, '$1$2 ')
    .replace(/ +/g, ' ')
    .trim();
}

/** Whether the text holds a Hebrew letter. */
export function isHebrew(s: string): boolean {
  return HE_LETTER.test(s);
}

/** Doubled vav and yod collapsed, so full and defective spellings meet (עגבנייה = עגבניה). */
export function collapseDoubles(w: string): string {
  return w.replace(/יי/g, 'י').replace(/וו/g, 'ו');
}

/** Folded Hebrew stop words: עם, של, ו. Not "בלי" or "ללא": "without" keeps its meaning. */
export const HEBREW_STOPWORDS: ReadonlySet<string> = new Set(['עם', 'של', 'ו'].map(fold));

/** A one-letter prefix written apart before its word ("ה-חומוס", "ב-פיתה"); dropped by the tokenizer. */
export const LONE_PREFIXES: ReadonlySet<string> = new Set(['ה', 'ב', 'ל', 'מ', 'ש', 'כ']);

/**
 * Stems that would join different foods' words, so they count as no stem: פירות (fruit) never meets
 * פירה (mashed potato), טורטית (a wafer bar) never meets טורטיה (a tortilla).
 */
export const STEM_STOP: ReadonlySet<string> = new Set(['פיר', 'טורטי']);

/** The plural endings ים (folded ימ) and ות. */
const PLURAL = /(ימ|ות)$/;

/** Whether a folded word ends in a plural ending (ים, ות). */
export function hasPluralEnding(w: string): boolean {
  return PLURAL.test(w);
}

/**
 * A folded Hebrew word's stem, or null: 5+ letters ending in ים/ות lose those two; else 4+ letters
 * ending in ה or ת lose that one. A stem in `STEM_STOP` counts as none.
 */
export function hebrewStem(w: string): string | null {
  let s: string | null = null;
  if (w.length >= 5 && PLURAL.test(w)) s = w.slice(0, -2);
  else if (w.length >= 4 && /[הת]$/.test(w)) s = w.slice(0, -1);
  return s !== null && !STEM_STOP.has(s) ? s : null;
}

/** First letter, then the rest without vav and yod (חומוס, חמוס -> חמס). */
export function skeleton(w: string): string {
  return w.length ? w[0] + w.slice(1).replace(/[וי]/g, '') : w;
}

/** Hebrew prefixes tried by `prefixReadings`, longest chains first. */
export const PREFIXES: readonly string[] = ['וכש', 'וה', 'וב', 'ול', 'ומ', 'וש', 'שה', 'שב', 'של', 'מה', 'בה', 'לה', 'כש', 'מש', 'ו', 'ה', 'ב', 'ל', 'מ', 'ש', 'כ'];

/** The word without each prefix it starts with, when 3+ letters remain; no duplicates. */
export function prefixReadings(w: string): string[] {
  const out: string[] = [];
  for (const p of PREFIXES) {
    if (w.startsWith(p) && w.length - p.length >= 3) {
      const r = w.slice(p.length);
      if (!out.includes(r)) out.push(r);
    }
  }
  return out;
}

const foldAll = (ws: string[]): ReadonlySet<string> => new Set(ws.map(fold));

/** Amount words a relaxed search may leave unmatched (folded). */
export const QUANTITY: ReadonlySet<string> = foldAll([
  'כוס', 'כוסות', 'כף', 'כפות', 'כפית', 'כפיות', 'חצי', 'רבע', 'פרוסה', 'פרוסת', 'פרוסות', 'יחידה', 'יחידות',
  'חתיכה', 'חתיכת', 'חתיכות', 'צלחת', 'קערה', 'קערת', 'בקבוק', 'פחית', 'גביע', 'שקית', 'קופסה', 'קופסת', 'גרם', 'מל',
]);

/** Preparation and size words a relaxed search may leave unmatched (folded). */
export const MODIFIERS: ReadonlySet<string> = foldAll([
  'מנה', 'מנת', 'ביתי', 'ביתית', 'טרי', 'טריה', 'קלוי', 'קלויה', 'צלוי', 'צלויה', 'על', 'האש', 'בגריל', 'גריל',
  'מתוק', 'מתוקה', 'קטן', 'קטנה', 'גדול', 'גדולה', 'חם', 'חמה', 'קר', 'קרה',
]);
