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
  LONE_PREFIXES,
  MODIFIERS,
  prefixReadings,
  QUANTITY,
  skeleton,
  STEM_STOP,
} from './hebrew';

/** The food search's normaliser before Hebrew search, kept here word for word as the reference for Latin text. */
function legacyNormalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
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
    expect(fold('חוּמוּס')).toBe('חומוס');
    expect(fold('שְׁנִיצֶל')).toBe('שניצל');
    expect(fold('שׂניצל')).toBe('שניצל');
    expect(fold('ב֑ר֯א')).toBe('ברא');
    expect(fold('בֿרׇׅׄא')).toBe('ברא');
  });

  it('decomposes presentation forms (U+FB2A shin with shin dot) and the alef-lamed ligature', () => {
    expect(fold('שׁניצל')).toBe('שניצל');
    expect(fold('ﭏכוהול')).toBe('אלכוהול');
  });

  it('makes final letters normal', () => {
    expect(fold('שמן')).toBe('שמנ');
    expect(fold('ךםןףץ')).toBe('כמנפצ');
  });

  it('deletes every geresh form after a Hebrew letter', () => {
    for (const g of ["'", '׳', '’', '‘', '`', '´']) expect(fold(`קוטג${g}`)).toBe('קוטג');
    expect(fold("צ'יפס")).toBe('ציפס');
    expect(fold('ג׳חנון')).toBe('גחנונ');
  });

  it('deletes gershayim between two Hebrew letters, every form', () => {
    for (const g of ['"', '״', '“', '”']) expect(fold(`תפו${g}א`)).toBe('תפוא');
    expect(fold('צה"ל"ים')).toBe('צהלימ');
  });

  it('a quotation mark that is not between two Hebrew letters is a space', () => {
    expect(fold('"חומוס"')).toBe('חומוס');
  });

  it('expands the Yiddish digraphs', () => {
    expect(fold('װױײ')).toBe('וווייי');
  });

  it('breaks words at maqaf, hyphen, sof pasuq and other punctuation', () => {
    expect(fold('פיתה־טחינה')).toBe('פיתה טחינה');
    expect(fold('פיתה-טחינה')).toBe('פיתה טחינה');
    expect(fold('פיתה׃טחינה׀חומוס׆')).toBe('פיתה טחינה חומוס');
  });

  it('puts a space between Hebrew and a Latin letter or digit, either way', () => {
    expect(fold('שניצל5')).toBe('שניצל 5');
    expect(fold('5שניצל')).toBe('5 שניצל');
    expect(fold('pitaפיתה')).toBe('pita פיתה');
    expect(fold("קוטג' 5%")).toBe('קוטג 5');
    expect(fold('Pita פיתה מקמח מלא')).toBe('pita פיתה מקמח מלא');
  });

  it('drops emoji, Arabic letters and other scripts like any other symbol', () => {
    expect(fold('🍕 חומוס')).toBe('חומוס');
    expect(fold('حمص')).toBe('');
    expect(fold('хумус hummus')).toBe('hummus');
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
    expect(MODIFIERS.has('קטנ')).toBe(true);
    expect(MODIFIERS.has('חמ')).toBe(true);
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

  it('prefixReadings: every prefix in order, 3+ letters left, no duplicates', () => {
    expect(prefixReadings('והחומוס')).toEqual(['חומוס', 'החומוס']);
    expect(prefixReadings('בטחינה')).toEqual(['טחינה']);
    expect(prefixReadings('שהקוטג')).toEqual(['קוטג', 'הקוטג']);
    // Fewer than three letters left: no reading.
    expect(prefixReadings('בתה')).toEqual([]);
    expect(prefixReadings('לחמ')).toEqual([]);
    expect(prefixReadings('בננה')).toEqual(['ננה']);
    expect(prefixReadings('חומוס')).toEqual([]);
  });
});
