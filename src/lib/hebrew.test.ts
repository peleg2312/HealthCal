import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { BUILTIN_FOODS } from '@/data/foods';

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
  percentSigns,
  prefixReadings,
  QUANTITY,
  shortPluralBase,
  skeleton,
  soundSkeleton,
  STEM_STOP,
} from './hebrew';

/** The food search's normaliser before Hebrew search, kept here word for word as the reference for Latin text. */
function legacyNormalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const QUERIES = readFileSync(path.join(__dirname, '../services/__fixtures__/english-queries.txt'), 'utf8')
  .split('\n')
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith('#'));

describe('fold on Latin text', () => {
  it('equals the old normaliser on every bundled name, every English query and odd Latin text', () => {
    const texts = [
      ...BUILTIN_FOODS.map((f) => f.name),
      ...BUILTIN_FOODS.map((f) => f.brand ?? ''),
      ...BUILTIN_FOODS.flatMap((f) => f.servings.map((s) => s.label)),
      ...QUERIES,
      'Crème brûlée', 'Jalapeño 5%', "Kellogg's", 'Ñandú – über', '½ cup', 'Coca-Cola®', '  many   spaces  ', '', '!!!', 'İstanbul', 'ﬁsh',
    ];
    expect(QUERIES.length).toBe(304);
    const diff = texts.filter((t) => legacyNormalize(t) !== fold(t));
    expect(diff).toEqual([]);
  });

  it("splits an apostrophe in Latin text as before: Kellogg's -> kellogg s", () => {
    expect(fold("Kellogg's")).toBe('kellogg s');
  });
});

describe('fold on Hebrew text (4.1)', () => {
  it('removes vowel points, cantillation and the shin and sin dots', () => {
    expect(fold('חו\u05bcמו\u05bcס')).toBe('חומוס');
    expect(fold('ש\u05b0\u05c1נ\u05b4יצ\u05b6ל')).toBe('שניצל');
    expect(fold('ש\u05c2ניצל')).toBe('שניצל');
    expect(fold('ב\u0591ר\u05afא')).toBe('ברא');
    expect(fold('ב\u05bfר\u05c4\u05c5\u05c7א')).toBe('ברא');
  });

  it('decomposes presentation forms (U+FB2A shin with shin dot) and the alef-lamed ligature', () => {
    expect(fold('\ufb2aניצל')).toBe('שניצל');
    expect(fold('\ufb4fכוהול')).toBe('אלכוהול');
  });

  it('makes final letters normal', () => {
    expect(fold('שמן')).toBe('שמנ');
    expect(fold('ךםןףץ')).toBe('כמנפצ');
  });

  it('deletes every geresh form after a Hebrew letter', () => {
    for (const g of ["'", '\u05f3', '’', '‘', '`', '´']) expect(fold(`קוטג${g}`)).toBe('קוטג');
    expect(fold("צ'יפס")).toBe('ציפס');
    expect(fold('ג\u05f3חנון')).toBe('גחנונ');
  });

  it('deletes gershayim between two Hebrew letters, every form', () => {
    for (const g of ['"', '\u05f4', '“', '”']) expect(fold(`תפו${g}א`)).toBe('תפוא');
    expect(fold('צה"ל"ים')).toBe('צהלימ');
  });

  it('a quotation mark that is not between two Hebrew letters is a space', () => {
    expect(fold('"חומוס"')).toBe('חומוס');
  });

  it('expands the Yiddish digraphs', () => {
    expect(fold('\u05f0\u05f1\u05f2')).toBe('וווייי');
  });

  it('breaks words at maqaf, hyphen, sof pasuq and other punctuation', () => {
    expect(fold('פיתה\u05beטחינה')).toBe('פיתה טחינה');
    expect(fold('פיתה-טחינה')).toBe('פיתה טחינה');
    expect(fold('פיתה\u05c3טחינה\u05c0חומוס\u05c6')).toBe('פיתה טחינה חומוס');
  });

  it('puts a space between Hebrew and a Latin letter or digit, either way', () => {
    expect(fold('שניצל5')).toBe('שניצל 5');
    expect(fold('5שניצל')).toBe('5 שניצל');
    expect(fold('pitaפיתה')).toBe('pita פיתה');
    expect(fold("קוטג' 5%")).toBe('קוטג 5');
    expect(fold('Pita פיתה מקמח מלא')).toBe('pita פיתה מקמח מלא');
  });

  it('drops emoji and other symbols', () => {
    expect(fold('🍕 חומוס')).toBe('חומוס');
    expect(fold('🍕')).toBe('');
    expect(fold('Ωmega 3')).toBe('mega 3');
  });

  it('keeps Arabic and Cyrillic letters as words of their own script', () => {
    expect(fold('حمص بالطحينة')).toBe('حمص بالطحينة');
    // Arabic vowel marks and hamza marks go, so a word is found with or without them.
    expect(fold('حُمُّص')).toBe('حمص');
    expect(fold('أرز')).toBe(fold('ارز'));
    expect(fold('Хумус домашний')).toBe('хумус домашнии');
    expect(fold('хумус hummus')).toBe('хумус hummus');
    // Each script is a word of its own, also next to digits and Hebrew.
    expect(fold('хлеб5%חלב')).toBe('хлеб 5 חלב');
    expect(fold('حمص2')).toBe('حمص 2');
    expect(isOtherScript(fold('Хлеб'))).toBe(true);
    expect(isOtherScript('hummus')).toBe(false);
    expect(isOtherScript('חומוס')).toBe(false);
  });
});

describe('Hebrew helpers (4.2)', () => {
  it('isHebrew', () => {
    expect(isHebrew('חומוס')).toBe(true);
    expect(isHebrew('pita 5')).toBe(false);
    expect(isHebrew('5 חלב')).toBe(true);
  });

  it('collapses doubled vav and yod', () => {
    expect(collapseDoubles('עגבנייה')).toBe('עגבניה');
    expect(collapseDoubles('שוורמה')).toBe('שורמה');
  });

  it('folds the stop words and the word sets at load', () => {
    expect([...HEBREW_STOPWORDS].sort()).toEqual(['ו', 'עמ', 'של'].sort());
    expect(HEBREW_STOPWORDS.has('בלי')).toBe(false);
    expect(HEBREW_STOPWORDS.has('ללא')).toBe(false);
    expect([...LONE_PREFIXES].sort()).toEqual(['ב', 'ה', 'כ', 'ל', 'מ', 'ש'].sort());
    expect(QUANTITY.has('גרמ')).toBe(true);
    expect(QUANTITY.has('כוס')).toBe(true);
    // ג' and ק"ג fold to ג and קג.
    for (const w of ['גר', "ג'", 'ק"ג', 'קילו', 'ליטר', 'קצת', 'מעט', 'אשכול', 'סקופ', 'חבילה', 'חבילת', 'ספל', 'מגש', 'צנצנת']) expect(QUANTITY.has(fold(w)), w).toBe(true);
    expect(MODIFIERS.has('קטנ')).toBe(true);
    expect(MODIFIERS.has('חמ')).toBe(true);
    for (const w of ['בתנור', 'אפוי', 'אפויה', 'בינוני', 'בינונית', 'כפול', 'כפולה']) expect(MODIFIERS.has(fold(w)), w).toBe(true);
    // Sweet, iced, fried and in sauce change the calories: never skippable.
    for (const w of ['מתוק', 'מתוקה', 'קר', 'קרה', 'מטוגן', 'ברוטב']) expect(MODIFIERS.has(fold(w)) || QUANTITY.has(fold(w)), w).toBe(false);
    for (const w of [...QUANTITY, ...MODIFIERS]) expect(fold(w)).toBe(w);
  });

  it('hebrewStem: plural ים (folded ימ) and ות from 5 letters', () => {
    expect(hebrewStem(fold('ביצים'))).toBe('ביצ');
    expect(hebrewStem('ביצימ')).toBe('ביצ');
    expect(hebrewStem(fold('שניצלים'))).toBe('שניצל');
    expect(hebrewStem(fold('עגבניות'))).toBe('עגבני');
    expect(hebrewStem(fold('תותים'))).toBe('תות');
    expect(hebrewStem(fold('בצלים'))).toBe('בצל');
    // 4 letters ending in ים: not a plural stem, and not ה/ת either.
    expect(hebrewStem(fold('מים'))).toBeNull();
    expect(hasPluralEnding('ביצימ')).toBe(true);
    expect(hasPluralEnding('ביצה')).toBe(false);
  });

  it('hebrewStem: ה and ת from 4 letters, none below', () => {
    expect(hebrewStem('ביצה')).toBe('ביצ');
    expect(hebrewStem('גבינה')).toBe('גבינ');
    expect(hebrewStem('גבינת')).toBe('גבינ');
    expect(hebrewStem('חלבה')).toBe('חלב');
    expect(hebrewStem('חלב')).toBeNull();
    expect(hebrewStem('תות')).toBeNull();
    expect(hebrewStem('קפה')).toBeNull();
  });

  it('STEM_STOP keeps fruit away from mashed potato and the wafer bar away from the tortilla', () => {
    expect([...STEM_STOP].sort()).toEqual(['טורטי', 'פיר'].sort());
    expect(hebrewStem('פירות')).toBeNull();
    expect(hebrewStem('פירה')).toBeNull();
    expect(hebrewStem('טורטית')).toBeNull();
    expect(hebrewStem('טורטיה')).toBeNull();
  });

  it('skeleton: first letter, then the rest without vav and yod', () => {
    expect(skeleton('חומוס')).toBe('חמס');
    expect(skeleton('חמוס')).toBe('חמס');
    expect(skeleton(fold('ויטמין'))).toBe('וטמנ');
    expect(skeleton('')).toBe('');
  });

  it('soundSkeleton: ט as ת, כ as ק, ע as א, a final ה as א, after the skeleton', () => {
    expect(soundSkeleton('פיטה')).toBe(soundSkeleton('פיתה'));
    expect(soundSkeleton('בננא')).toBe(soundSkeleton('בננה'));
    expect(soundSkeleton('פסתה')).toBe(soundSkeleton('פסטה'));
    expect(soundSkeleton('עורז')).toBe(soundSkeleton('אורז'));
    expect(soundSkeleton('כוטג')).toBe(soundSkeleton('קוטג'));
    expect(soundSkeleton('אורס')).not.toBe(soundSkeleton('אורז'));
    expect(soundSkeleton('')).toBe('');
  });

  it('shortPluralBase: a four-letter plural\'s two-letter singular, never a word-set word', () => {
    expect(shortPluralBase('דגימ')).toBe('דג');
    expect(shortPluralBase('חסות')).toBe('חס');
    // על is in the word sets: עלים is not read as על.
    expect(shortPluralBase('עלימ')).toBeNull();
    expect(shortPluralBase('ביצימ')).toBeNull();
    expect(shortPluralBase('דגנ')).toBeNull();
  });

  it('prefixReadings: every prefix in order, 3+ letters left, no duplicates', () => {
    expect(prefixReadings('והחומוס')).toEqual(['חומוס', 'החומוס']);
    expect(prefixReadings('בטחינה')).toEqual(['טחינה']);
    expect(prefixReadings('שהקוטג')).toEqual(['קוטג']);
    // מ and ש alone are not prefixes: מסטיק is chewing gum, not "from steak"; in a chain they stay.
    expect(prefixReadings('מסטיק')).toEqual([]);
    expect(prefixReadings('שניצל')).toEqual([]);
    expect(prefixReadings('מהחומוס')).toEqual(['חומוס']);
    // Fewer than three letters left: no reading.
    expect(prefixReadings('בתה')).toEqual([]);
    expect(prefixReadings('לחמ')).toEqual([]);
    expect(prefixReadings('בננה')).toEqual(['ננה']);
    expect(prefixReadings('חומוס')).toEqual([]);
  });

  it('percentSigns: a number followed by אחוז or אחוזים is the number with %, nothing else changes', () => {
    expect(percentSigns('חלב 3 אחוז')).toBe('חלב 3%');
    expect(percentSigns('קוטג 5 אחוזים')).toBe('קוטג 5%');
    expect(percentSigns('יוגורט 1.5 אחוז')).toBe('יוגורט 1.5%');
    expect(percentSigns('חלב 1,5 אחוז')).toBe('חלב 1,5%');
    // Glued to the number, with a dash or a maqaf, final letters, vowel points.
    expect(percentSigns('חלב 3אחוז')).toBe('חלב 3%');
    expect(percentSigns('חלב 3-אחוזים')).toBe('חלב 3%');
    expect(percentSigns('חלב 3\u05beאחוז')).toBe('חלב 3%');
    expect(percentSigns('חלב 3 אחוזימ')).toBe('חלב 3%');
    expect(percentSigns('חלב 3 א\u05b8חו\u05bcז')).toBe('חלב 3%');
    // The prefixes the query already handles stay where they are.
    expect(percentSigns('חלב ב-3 אחוז')).toBe('חלב ב-3%');
    expect(percentSigns('חלב של 3 אחוז שומן')).toBe('חלב של 3% שומן');
    // A lone אחוז, a longer word, a number before another word, and a digit inside a Latin word stay.
    expect(percentSigns('אחוז')).toBe('אחוז');
    expect(percentSigns('חלב אחוז')).toBe('חלב אחוז');
    expect(percentSigns('3 אחוזית')).toBe('3 אחוזית');
    expect(percentSigns('3 באחוז')).toBe('3 באחוז');
    expect(percentSigns('2 ביצים 5 אחוז')).toBe('2 ביצים 5%');
    expect(percentSigns('x3 אחוז')).toBe('x3 אחוז');
    // Latin text is untouched.
    expect(percentSigns('milk 3 percent')).toBe('milk 3 percent');
    expect(percentSigns('milk 3%')).toBe('milk 3%');
  });
});
