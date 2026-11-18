/**
 * Hebrew search (specification section 4): the worked examples, the automatic one-line-per-food list
 * generated from the name table, the skeptic's lists and the extra lists, as fixtures in __fixtures__,
 * plus the rules a list cannot show (script separation, `matched`, the relaxed pass only for Hebrew)
 * and inputs nobody planned for.
 *
 * The lists that depend on the name table run once `src/data/searchNames.ts` holds every bundled id
 * (until then they are skipped, and their names say so).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { BUILTIN_FOODS } from '@/data/foods';
import { SEARCH_NAMES } from '@/data/searchNames';
import { fold, hebrewStem, isHebrew } from '@/lib/hebrew';
import type { Food } from '@/types';

import { foodToItem, matchFoods, parseAmount } from '@/features/ai/localMatch';

import { localPass, rankOnline, type SearchContext, searchLocal, tokenize } from './foodSearch';

const FIXTURES = path.join(__dirname, '__fixtures__');

interface Line {
  q: string;
  /** Ids that must come first, second, ... ('-' alone: no result; '?' alone: no expectation). */
  want: string;
  notIn: string[];
  ctx: string;
  line: number;
}

function readTsv(name: string): Line[] {
  return readFileSync(path.join(FIXTURES, name), 'utf8')
    .split('\n')
    .map((l, i) => ({ l, i }))
    .filter(({ l }) => l.trim() && !l.startsWith('#'))
    .map(({ l, i }) => {
      const [q, want = '?', notIn = '', ctx = ''] = l.split('\t');
      return { q, want: want.trim(), notIn: notIn.split(',').filter(Boolean), ctx: ctx.trim(), line: i + 1 };
    });
}

const food = (id: string, name: string, extra: Partial<Food> = {}): Food => ({
  id,
  name,
  per100g: { kcal: 100, protein: 5, carbs: 10, fat: 3 },
  servings: [],
  source: 'custom',
  verified: false,
  ...extra,
});

/** The four own foods of the "own" context (4.8). */
const OWN: Food[] = [
  food('c_cottage', "קוטג' 5%", { per100g: { kcal: 95, protein: 11, carbs: 3, fat: 5 } }),
  food('c_hummus_he', 'חומוס עם טחינה', { per100g: { kcal: 230, protein: 8, carbs: 14, fat: 16 } }),
  food('c_mixed', 'Pita פיתה מקמח מלא', { per100g: { kcal: 250, protein: 9, carbs: 50, fat: 2 } }),
  food('c_salad_mom', 'סלט של אמא', { per100g: { kcal: 90, protein: 2, carbs: 8, fat: 5 } }),
];
const HALVA = BUILTIN_FOODS.find((f) => f.id === 'b_halva');

function ctxFor(name: string) {
  if (name === 'own') return { customFoods: OWN };
  if (name === 'favHalva') return { favoriteIds: ['b_halva'], recentFoods: HALVA ? [HALVA] : [] };
  return {};
}

const BUNDLED_IDS = BUILTIN_FOODS.map((f) => f.id);
const TABLE_COMPLETE = BUNDLED_IDS.every((id) => Object.prototype.hasOwnProperty.call(SEARCH_NAMES, id));
const KNOWN_IDS = new Set([...BUNDLED_IDS, ...OWN.map((f) => f.id)]);

/** The problems with one line, empty when it passes. */
function check(l: Line): string[] {
  const hits = searchLocal(l.q, ctxFor(l.ctx), 40);
  const ids = hits.map((h) => h.food.id);
  const problems: string[] = [];
  if (l.want === '-') {
    if (ids.length) problems.push(`expected nothing, got ${ids.slice(0, 3).join(',')}`);
  } else if (l.want !== '?') {
    l.want.split(',').forEach((want, k) => {
      if (!KNOWN_IDS.has(want)) problems.push(`unknown id ${want}`);
      else if (ids[k] !== want) problems.push(`#${k + 1} is ${ids[k] ?? 'nothing'}, expected ${want}`);
    });
  }
  for (const bad of l.notIn) if (ids.includes(bad)) problems.push(`${bad} present at ${ids.indexOf(bad) + 1}`);
  return problems.length ? [`${l.q} (line ${l.line}): ${problems.join('; ')} | top ${ids.slice(0, 4).join(' ')}`] : [];
}

function runList(name: string) {
  const lines = readTsv(name);
  const failures = lines.flatMap(check);
  return { lines, failures };
}

describe.skipIf(!TABLE_COMPLETE)('Hebrew query lists (needs the full name table in src/data/searchNames.ts)', () => {
  it('the worked examples (4.8) and the fix round\'s rules', () => {
    const { lines, failures } = runList('hebrew-examples.tsv');
    expect(lines.length).toBe(203);
    expect(failures).toEqual([]);
  });

  it("each food's first Hebrew name finds it first (proves only that the first names are distinct, not that they mean the food)", () => {
    const failures: string[] = [];
    let n = 0;
    for (const id of BUNDLED_IDS) {
      const first = SEARCH_NAMES[id]?.he[0];
      if (!first) continue;
      n++;
      failures.push(...check({ q: first, want: id, notIn: [], ctx: '', line: n }));
    }
    expect(n).toBe(BUNDLED_IDS.length);
    expect(failures).toEqual([]);
  });

  it.each(['skeptic-q80.tsv', 'skeptic-q2.tsv', 'skeptic-en2.tsv', 'q-fixes.tsv', 'q-dem.tsv'])('%s', (name) => {
    const { lines, failures } = runList(name);
    // Every line asserts something: a first id, '-' (nothing), or a must-not id.
    expect(lines.filter((l) => l.want === '?' && !l.notIn.length).map((l) => l.q)).toEqual([]);
    expect(failures).toEqual([]);
  });

  it("the traps reader's queries keep their level (traps.tsv)", () => {
    const rows = readFileSync(path.join(FIXTURES, 'traps.tsv'), 'utf8')
      .split('\n')
      .filter((l) => l.trim() && !l.startsWith('#'))
      .map((l) => {
        const [q, expected, level, note = ''] = l.split('\t');
        return { q, expected, level, note };
      });
    expect(rows.length).toBe(434);
    const wrong: string[] = [];
    const count: Record<string, number> = {};
    for (const r of rows) {
      count[r.level] = (count[r.level] ?? 0) + 1;
      const ids = searchLocal(r.q).map((h) => h.food.id);
      const ok = r.expected.startsWith('ANY:') ? r.expected.slice(4).split('|') : [r.expected];
      for (const id of ok) if (id !== 'NONE' && !KNOWN_IDS.has(id)) wrong.push(`${r.q}: unknown id ${id}`);
      const pass =
        r.level === 'first'
          ? ok.includes(ids[0])
          : r.level === 'top3'
            ? ids.slice(0, 3).some((x) => ok.includes(x))
            : r.level === 'none'
              ? r.expected === 'NONE' && (ids.length === 0 || localPass(r.q) === 'parts')
              : r.level === 'miss' && r.note.length > 0;
      if (!pass) wrong.push(`${r.q} (${r.level} ${r.expected}): ${ids.slice(0, 4).join(' ') || 'nothing'}`);
    }
    expect(wrong).toEqual([]);
    // Measured on 2026-11-18 after the fix round: 377 first, 8 in the first three, 34 nothing or parts only, 15 known misses.
    expect(count.first).toBeGreaterThanOrEqual(377);
  });

  it('every stem shared by different Hebrew name words is wanted (STEM_STOP holds the rest)', () => {
    // Stem -> name word -> foods holding it. A stem joining words of different foods is listed here on
    // purpose, as wanted (the singular and the plural or construct form of one thing).
    const groups = new Map<string, Map<string, Set<string>>>();
    for (const id of BUNDLED_IDS) {
      for (const name of SEARCH_NAMES[id]?.he ?? []) {
        for (const t of tokenize(name)) {
          const s = isHebrew(t) ? hebrewStem(t) : null;
          if (!s) continue;
          const g = groups.get(s) ?? new Map<string, Set<string>>();
          groups.set(s, g);
          const ids = g.get(t) ?? new Set<string>();
          g.set(t, ids);
          ids.add(id);
        }
      }
    }
    const collisions: string[] = [];
    for (const [s, g] of groups) {
      if (g.size < 2) continue;
      const foods = new Set([...g.values()].flatMap((ids) => [...ids]));
      if (foods.size < 2) continue;
      collisions.push(`${s}: ${[...g.keys()].sort().join(' ')}`);
    }
    // Each of these joins two forms of one word (singular, plural, construct, feminine), read against
    // the table on 2026-11-18. A new collision fails here: read it, and either add it below or put
    // its stem in STEM_STOP (`@/lib/hebrew`) when the two words mean different things.
    const WANTED = new Set(['תאנ', 'מיובש', 'עגבני', 'מבושל', 'ירוק', 'שחור', 'חמוצ', 'מטוגנ', 'יבש', 'ביצ', 'פית', 'לבנ', 'חמא', 'נקניקי', 'גבינ', 'סופגני', 'קציצ', 'מלוח']);
    expect(collisions.filter((c) => !WANTED.has(c.split(':')[0]))).toEqual([]);
    expect(collisions.some((c) => c.startsWith('פיר:') || c.startsWith('טורטי:'))).toBe(false);
  });
});

describe('rules the lists cannot show', () => {
  const latinQueries = readFileSync(path.join(FIXTURES, 'english-queries.txt'), 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));

  it('a Latin query never reports a Hebrew name as matched', () => {
    for (const q of latinQueries) for (const h of searchLocal(q, {}, 40)) expect(h.matched).toBeUndefined();
  });

  it('matched is set only to one of the food’s Hebrew search names', () => {
    for (const q of ['חומוס', 'שניצל עוף', 'חלב', 'בננות', 'חלבה', 'טחינה גולמית', 'חומוס מסחרי']) {
      for (const h of searchLocal(q, { customFoods: OWN }, 40)) {
        if (h.matched === undefined) continue;
        expect(SEARCH_NAMES[h.food.id]?.he ?? []).toContain(h.matched);
      }
    }
  });

  it('a stored-name match (an own food named in Hebrew) carries no matched line', () => {
    const hits = searchLocal('סלט של אמא', { customFoods: OWN });
    expect(hits[0].food.id).toBe('c_salad_mom');
    expect(hits[0].matched).toBeUndefined();
  });

  it('the matched line names the Hebrew name the query found', () => {
    expect(searchLocal('שניצל עוף')[0]).toMatchObject({ food: { id: 'b_schnitzel_chicken' }, matched: 'שניצל עוף' });
    expect(searchLocal('חומוס')[0]).toMatchObject({ food: { id: 'b_hummus' }, matched: 'חומוס' });
    // The union of the Hebrew names: the name that holds the most query words.
    expect(searchLocal('שניצל חזה עוף')[0]).toMatchObject({ food: { id: 'b_schnitzel_chicken' }, matched: 'שניצל חזה עוף' });
  });

  it('a Latin word never matches a Hebrew name, and scripts never join across names', () => {
    expect(searchLocal('חומוס pita')).toEqual([]);
    expect(searchLocal('פיתה pocket')).toEqual([]);
    // "humus" is a Latin search name of hummus; the Hebrew name חומוס must not lend it a Hebrew partner.
    expect(searchLocal('humus חלב')).toEqual([]);
  });

  it('the relaxed pass never runs for a Latin-only query', () => {
    // A number that matches nothing: a Hebrew query may leave it unmatched, a Latin one may not.
    expect(searchLocal('banana 98765')).toEqual([]);
    expect(searchLocal('בננה 98765')[0]?.food.id).toBe('b_banana');
    expect(searchLocal('milk qqqqqqqq')).toEqual([]);
  });

  it('a Hebrew word typed as it appears is never stripped of a prefix', () => {
    expect(searchLocal('בננה')[0].food.id).toBe('b_banana');
    expect(searchLocal('חלב')[0].food.id).toBe('b_milk_whole');
    expect(searchLocal('והחומוס')[0].food.id).toBe('b_hummus');
  });

  it('the whole Hebrew word beats history: milk above a favourite, recent halva for חלב', () => {
    const hits = searchLocal('חלב', ctxFor('favHalva'));
    expect(hits[0].food.id).toBe('b_milk_whole');
    expect(hits.findIndex((h) => h.food.id === 'b_halva')).toBeGreaterThan(0);
  });
});

describe('the fix round\'s rules a list cannot show', () => {
  it('the parts pass runs only when the strict and relaxed passes found nothing, and only for Hebrew', () => {
    expect(localPass('שניצל בפיתה')).toBe('parts');
    expect(localPass('שניצל עוף')).toBe('strict');
    expect(localPass('קוטג 5% תנובה')).toBe('relaxed');
    expect(localPass('schnitzel pita')).toBe('none');
    // A word after ללא or בלי is never searched by itself.
    expect(searchLocal('ריבה ללא סוכר')).toEqual([]);
    // Each hit names the Hebrew name its own word found.
    const hits = searchLocal('שניצל בפיתה');
    expect(hits.find((h) => h.food.id === 'b_pita_bakery')?.matched).toBe('פיתה');
    expect(hits.find((h) => h.food.id === 'b_schnitzel_chicken')?.matched).toBe('שניצל');
  });

  it('a food found by more of the words comes before one found by fewer (parts pass)', () => {
    const both = food('c_both', 'פיתה עם שניצל');
    const own = food('c_one', 'שניצל של אמא');
    // Neither holds בפיתה whole; the own food with both words ranks first.
    const ids = searchLocal('שניצל בפיתה', { customFoods: [own, both] }).map((h) => h.food.id);
    expect(ids[0]).toBe('c_both');
  });

  it('only the first 10 words and 80 characters are searched; the relaxed and parts passes stop above 6 words', () => {
    expect(searchLocal('חומוס ' + 'קקקקק '.repeat(12))[0]).toBeUndefined();
    expect(searchLocal('חומוס חומוס חומוס חומוס חומוס חומוס חומוס חומוס חומוס חומוס קקקקקק')[0]?.food.id).toBe('b_hummus');
    // Characters after the 80th are not read: the word that would empty the list is never seen.
    expect(searchLocal(`חומוס${' '.repeat(80)}קקקקקק`)[0]?.food.id).toBe('b_hummus');
    expect(localPass('חומוס פיתה טחינה סלט שניצל צ\'יפס קקקקקק')).toBe('none');
  });

  it('a favourite or own food that matched in part comes right after the best whole match', () => {
    const shake = food('c_shake', 'חלבון וניל');
    const ids = searchLocal('חלב', { customFoods: [shake], favoriteIds: ['c_shake'], recentFoods: [shake] }).map((h) => h.food.id);
    expect(ids.slice(0, 2)).toEqual(['b_milk_whole', 'c_shake']);
    expect(ids[2]).toMatch(/^b_milk_/);
  });

  it('an own food named in Arabic or Russian is found by its word or the beginning of it, never by a typo', () => {
    const ar = food('c_ar', 'حمص بالطحينة');
    const ru = food('c_ru', 'Хумус домашний');
    const ctx = { customFoods: [ar, ru] };
    expect(searchLocal('حمص', ctx)[0]?.food.id).toBe('c_ar');
    expect(searchLocal('حم', ctx)[0]?.food.id).toBe('c_ar');
    expect(searchLocal('хумус', ctx)[0]?.food.id).toBe('c_ru');
    expect(searchLocal('Хум', ctx)[0]?.food.id).toBe('c_ru');
    expect(searchLocal('домашн', ctx)[0]?.food.id).toBe('c_ru');
    expect(searchLocal('хумуз', ctx)).toEqual([]);
    expect(searchLocal('мус', ctx)).toEqual([]);
  });

  it('online: a product holding every Hebrew word whole comes before one holding a word only as a prefix', () => {
    const halva = food('o_halva', 'חלבה אחווה', { source: 'openfoodfacts' });
    const milk = food('o_milk', 'תנובה חלב 3%', { source: 'openfoodfacts' });
    expect(rankOnline('חלב 3%', [halva, milk]).map((f) => f.id)).toEqual(['o_milk', 'o_halva']);
    expect(rankOnline('חלב', [halva, milk]).map((f) => f.id)).toEqual(['o_milk', 'o_halva']);
  });

  it('a name word after לא matches only a query that says לא', () => {
    expect(searchLocal('אורז לא מבושל')[0]?.food.id).toBe('b_rice_white_dry');
    expect(searchLocal('קינואה מבושלת').map((h) => h.food.id)).not.toContain('b_quinoa_dry');
  });
});

describe('an own food named in Hebrew', () => {
  const pie = food('c_pie', 'פשטידת ברוקולי של סבתא');
  const contexts: [string, SearchContext][] = [
    ['alone', { foods: [], customFoods: [pie] }],
    ['among the bundled foods', { customFoods: [pie] }],
  ];
  for (const [label, ctx] of contexts) {
    it(`is found ${label} by a Hebrew word, a prefixed word, a typo and a defective spelling`, () => {
      for (const q of ['פשטידת', 'פשטידת ברוקולי', 'ברוקולי סבתא', 'והפשטידת', 'פשתידת', 'פשטדת', 'פשטיד']) {
        expect(searchLocal(q, ctx)[0]?.food.id, q).toBe('c_pie');
      }
    });
  }
});

describe('inputs nobody planned for', () => {
  const ctx = { customFoods: OWN };

  it('empty, blank and punctuation-only queries return nothing', () => {
    for (const q of ['', '   ', '!!!', '...', '\u05f4', "'", '—', '\u05be', '\u200e\u2068\u2069']) expect(searchLocal(q, ctx)).toEqual([]);
  });

  it('a query of only stop words still searches for them', () => {
    // Names drop stop words too, so a Hebrew stop word alone finds only what starts with it; it never throws.
    expect(() => searchLocal('של', ctx)).not.toThrow();
    expect(() => searchLocal('עם ו של', ctx)).not.toThrow();
    // As before for English: "and" still finds words that contain it.
    expect(searchLocal('and', ctx).length).toBeGreaterThan(0);
  });

  it('emoji are ignored like punctuation, and an Arabic word finds no bundled food', () => {
    expect(searchLocal('🍌')).toEqual([]);
    expect(searchLocal('حمص')).toEqual([]);
    expect(searchLocal('🍌 בננה')[0].food.id).toBe('b_banana');
    expect(searchLocal('banana 🍌')[0].food.id).toBe('b_banana');
  });

  it('a query mixing Hebrew, digits and Latin is folded apart and never throws', () => {
    expect(fold('קוטג5%cottage')).toBe('קוטג 5 cottage');
    for (const q of ['קוטג5%cottage', 'milk חלב 3', '3חלב', 'חלב3%', 'a1ב2c3', 'שניצל x2']) expect(() => searchLocal(q, ctx)).not.toThrow();
    expect(searchLocal('חלב3%')[0].food.id).toBe('b_milk_whole');
  });

  it('a 300-character query answers quickly', () => {
    const q = 'חומוס טחינה פיתה '.repeat(18).slice(0, 300);
    expect(q.length).toBe(300);
    searchLocal(q, ctx);
    const t0 = performance.now();
    searchLocal(q, ctx);
    expect(performance.now() - t0).toBeLessThan(50);
    const latin = 'chicken breast rice '.repeat(16).slice(0, 300);
    expect(() => searchLocal(latin, ctx)).not.toThrow();
  });

  it('no input throws or takes longer than 50 ms', () => {
    // Deterministic pseudo-random strings over Hebrew (with points, finals, geresh), Latin, digits,
    // punctuation, direction marks, emoji and Arabic.
    const alphabet = [
      ...'אבגדהוזחטיכלמנסעפצקרשתךםןףץ',
      ...'abcdefghijklmnopqrstuvwxyz',
      ...'0123456789',
      ' ', ' ', ' ', "'", '"', '%', '-', '(', ')', ',', '.', '\u05f3', '\u05f4', '\u05be', '\u05b4', '\u05bc', '\u05c1',
      '\u200e', '\u2068', '🍕', 'ح', 'م', 'é', '\ufb2a', '\ufb4f',
    ];
    let seed = 12345;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    searchLocal('warm', ctx);
    let worst = 0;
    let worstQ = '';
    for (let n = 0; n < 400; n++) {
      const len = 1 + Math.floor(rand() * (n % 10 === 0 ? 120 : 16));
      let q = '';
      for (let i = 0; i < len; i++) q += alphabet[Math.floor(rand() * alphabet.length)];
      const t0 = performance.now();
      const hits = searchLocal(q, ctx);
      const ms = performance.now() - t0;
      if (ms > worst) {
        worst = ms;
        worstQ = q;
      }
      expect(Array.isArray(hits)).toBe(true);
    }
    expect(worst, worstQ).toBeLessThan(50);
  });
});

describe('the photo review\'s "add what the analysis missed" (localMatch)', () => {
  it('finds a food typed in Hebrew, with a prefix or an amount, through the food search', () => {
    expect(matchFoods('חומוס', BUILTIN_FOODS)[0]?.id).toBe('b_hummus');
    expect(matchFoods('שניצל עוף', BUILTIN_FOODS)[0]?.id).toBe('b_schnitzel_chicken');
    expect(matchFoods('והחומוס', BUILTIN_FOODS)[0]?.id).toBe('b_hummus');
    expect(matchFoods('חומוס', BUILTIN_FOODS).length).toBeLessThanOrEqual(3);
    // A Hebrew cooked word never offers the dry food (C9).
    expect(matchFoods('אורז מבושל', BUILTIN_FOODS).map((f) => f.id)).not.toContain('b_rice_white_dry');
  });

  it('leaves text without a Hebrew letter to the English scorer, as before (no Latin spellings, no typos)', () => {
    expect(matchFoods('shnitzel', BUILTIN_FOODS)).toEqual([]);
    expect(matchFoods('banana', BUILTIN_FOODS)[0]?.id).toBe('b_banana');
  });

  it('reads a leading amount before a Hebrew word and scales the item', () => {
    expect(parseAmount('2 ביצים')).toEqual({ count: 2, grams: null, rest: 'ביצים' });
    expect(parseAmount('150 g חומוס')).toEqual({ count: null, grams: 150, rest: 'חומוס' });
    const hummus = matchFoods('150 g חומוס', BUILTIN_FOODS)[0];
    expect(hummus.id).toBe('b_hummus');
    expect(foodToItem(hummus, '150 g חומוס').grams).toBe(150);
    expect(matchFoods('2 ביצים', BUILTIN_FOODS)[0]?.id).toBe('b_egg_boiled');
  });

  it('finds an own food named in Hebrew in the pool', () => {
    const pool = [...OWN, ...BUILTIN_FOODS];
    expect(matchFoods('סלט של אמא', pool)[0]?.id).toBe('c_salad_mom');
  });

  it('nothing for words that match nothing', () => {
    expect(matchFoods('קקקקקק', BUILTIN_FOODS)).toEqual([]);
    expect(matchFoods('  ', BUILTIN_FOODS)).toEqual([]);
  });
});
