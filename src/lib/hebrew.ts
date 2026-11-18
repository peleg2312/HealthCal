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
const HE_LETTER = /[\u05d0-\u05ea]/;

/** Anything from the Hebrew block or the Hebrew presentation forms (which decompose into it). */
const HE_ANY = /[\u0590-\u05ff\ufb1d-\ufb4f]/;

/** Arabic letters (U+0621 to U+064A) and Cyrillic letters, in any case. */
const OTHER_ANY = /[\u0621-\u064a\u0400-\u04ff]/;
/** A folded Arabic or Cyrillic letter. */
const OTHER_LETTER = /[\u0621-\u064a\u0430-\u044f]/;

/** The alef-lamed ligature and the Yiddish digraphs. */
const RARE = /[\ufb4f\u05f0-\u05f2]/;

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
 * letter deleted (', U+05F3, U+2019, U+2018, `, U+00B4); gershayim between two Hebrew letters
 * deleted (", U+05F4, U+201C, U+201D); the Yiddish digraphs; lower case and Latin accents removed; anything not a-z, 0-9 or א-ת a space; a
 * space between Hebrew and a Latin letter or digit; trimmed single spaces.
 *
 * Text with an Arabic (U+0621 to U+064A) or Cyrillic letter also keeps those letters, without Arabic
 * vowel marks, each script set apart as words of its own, so an own food named in Arabic or Russian is
 * found. Text with none of them takes exactly the road above.
 */
export function fold(s: string): string {
  // Text with nothing from the Hebrew block or the Hebrew presentation forms takes the short road (the
  // Hebrew steps would change nothing); on Hermes this halves the time to index the bundled names.
  if (!HE_ANY.test(s) && !OTHER_ANY.test(s)) {
    return s
      .normalize('NFD')
      .toLowerCase()
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }
  let t = s.normalize('NFD').replace(/[\u0591-\u05af\u05b0-\u05bd\u05bf\u05c1\u05c2\u05c4\u05c5\u05c7]/g, '');
  const other = OTHER_ANY.test(t);
  // Arabic: vowel marks, hamza marks and the dagger alef removed, so a word is found without them.
  if (other) t = t.replace(/[\u064b-\u065f\u0670]/g, '');
  // The ligature and the Yiddish digraphs are rare: one test instead of four replacements (indexing
  // folds every Hebrew name, and on Hermes each regular expression call costs).
  if (RARE.test(t)) {
    t = t
      .replace(/\ufb4f/g, '\u05d0\u05dc')
      .replace(/\u05f0/g, '\u05d5\u05d5')
      .replace(/\u05f1/g, '\u05d5\u05d9')
      .replace(/\u05f2/g, '\u05d9\u05d9');
  }
  t = t
    .replace(/[\u05da\u05dd\u05df\u05e3\u05e5]/g, (c) => FINALS[c] ?? c)
    .replace(/([\u05d0-\u05ea])['\u05f3\u2019\u2018`\u00b4]/g, '$1')
    .replace(/([\u05d0-\u05ea])["\u05f4\u201c\u201d](?=[\u05d0-\u05ea])/g, '$1')
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, '');
  if (other) {
    // Arabic and Cyrillic letters are word letters too, each script a word of its own.
    return t
      .replace(/[^a-z0-9\u05d0-\u05ea\u0621-\u064a\u0430-\u044f]+/g, ' ')
      .replace(/([\u0621-\u064a])(?=[^\u0621-\u064a ])|([^\u0621-\u064a ])(?=[\u0621-\u064a])/g, '$1$2 ')
      .replace(/([\u0430-\u044f])(?=[^\u0430-\u044f ])|([^\u0430-\u044f ])(?=[\u0430-\u044f])/g, '$1$2 ')
      .replace(/([\u05d0-\u05ea])(?=[a-z0-9])|([a-z0-9])(?=[\u05d0-\u05ea])/g, '$1$2 ')
      .replace(/ +/g, ' ')
      .trim();
  }
  return t
    .replace(/[^a-z0-9\u05d0-\u05ea]+/g, ' ')
    .replace(/([\u05d0-\u05ea])(?=[a-z0-9])|([a-z0-9])(?=[\u05d0-\u05ea])/g, '$1$2 ')
    .replace(/ +/g, ' ')
    .trim();
}

/** Whether the folded word is Arabic or Cyrillic (an own food's name): matched whole or by its beginning only. */
export function isOtherScript(w: string): boolean {
  return OTHER_LETTER.test(w);
}

/** Whether the text holds a Hebrew letter. */
export function isHebrew(s: string): boolean {
  return HE_LETTER.test(s);
}

/** Doubled vav and yod collapsed, so full and defective spellings meet (עגבנייה = עגבניה). */
export function collapseDoubles(w: string): string {
  // Most words have no doubled letter: skip the two replacements (indexing calls this for every word).
  if (!w.includes('יי') && !w.includes('וו')) return w;
  return w.replace(/יי/g, 'י').replace(/וו/g, 'ו');
}

/** Folded Hebrew stop words: עם, של, ו. Not "בלי" or "ללא": "without" keeps its meaning. */
export const HEBREW_STOPWORDS: ReadonlySet<string> = new Set(['עם', 'של', 'ו'].map(fold));

/** A one-letter prefix written apart before its word or a number ("ה-חומוס", "ב-פיתה", "כ100"); dropped by the tokenizer. */
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

/**
 * A four-letter plural's two-letter singular (דגים -> דג), or null. Only a candidate: the search uses it
 * only when that two-letter word exists whole in its list, and never for a word of the word sets
 * (עלים is not על).
 */
export function shortPluralBase(w: string): string | null {
  if (w.length !== 4 || !PLURAL.test(w)) return null;
  const b = w.slice(0, -2);
  return QUANTITY.has(b) || MODIFIERS.has(b) || HEBREW_STOPWORDS.has(b) || QUANTITY.has(w) || MODIFIERS.has(w) ? null : b;
}

/** First letter, then the rest without vav and yod (חומוס, חמוס -> חמס). */
export function skeleton(w: string): string {
  return w.length ? w[0] + w.slice(1).replace(/[וי]/g, '') : w;
}

const SOUND: Readonly<Record<string, string>> = { 'ט': 'ת', 'כ': 'ק', 'ע': 'א' };

/**
 * The sound-alike skeleton: the skeleton with letters that sound alike made one (ט as ת, כ as ק, ע as
 * א, a final ה as א), so פיטה meets פיתה, בננא meets בננה and עורז meets אורז.
 */
export function soundSkeleton(w: string): string {
  return skeleton(w)
    .replace(/[טכע]/g, (c) => SOUND[c] ?? c)
    .replace(/ה$/, 'א');
}

/**
 * Hebrew prefixes tried by `prefixReadings`, longest chains first. מ ("from") and ש ("that") alone are
 * left out: in a food search they are far more often a word's own first letter (מסטיק is chewing gum,
 * not "from steak"); in a chain (מה, שה, ומ) they stay.
 */
export const PREFIXES: readonly string[] = ['וכש', 'וה', 'וב', 'ול', 'ומ', 'וש', 'שה', 'שב', 'של', 'מה', 'בה', 'לה', 'כש', 'מש', 'ו', 'ה', 'ב', 'ל', 'כ'];

/** The same prefixes as a set, for "is this the part before the word". */
export const PREFIX_SET: ReadonlySet<string> = new Set(PREFIXES);

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

/** Amount words a relaxed search may leave unmatched (folded; ג' and ק"ג fold to ג and קג). */
export const QUANTITY: ReadonlySet<string> = foldAll([
  'כוס', 'כוסות', 'כף', 'כפות', 'כפית', 'כפיות', 'חצי', 'רבע', 'פרוסה', 'פרוסת', 'פרוסות', 'יחידה', 'יחידות',
  'חתיכה', 'חתיכת', 'חתיכות', 'צלחת', 'קערה', 'קערת', 'בקבוק', 'פחית', 'גביע', 'שקית', 'קופסה', 'קופסת', 'גרם', 'מל',
  'גר', 'ג', 'קג', 'קילו', 'ליטר', 'קצת', 'מעט', 'אשכול', 'סקופ', 'חבילה', 'חבילת', 'ספל', 'מגש', 'צנצנת',
]);

/**
 * Preparation and size words a relaxed search may leave unmatched (folded). Only words that do not
 * change the calories: never sweet or iced (מתוק, קר: a sweet or iced drink is not the plain one), fried
 * or in sauce (מטוגן, ברוטב).
 */
export const MODIFIERS: ReadonlySet<string> = foldAll([
  'מנה', 'מנת', 'ביתי', 'ביתית', 'טרי', 'טריה', 'קלוי', 'קלויה', 'צלוי', 'צלויה', 'על', 'האש', 'בגריל', 'גריל',
  'קטן', 'קטנה', 'גדול', 'גדולה', 'חם', 'חמה', 'בתנור', 'אפוי', 'אפויה', 'בינוני', 'בינונית', 'כפול', 'כפולה',
]);
