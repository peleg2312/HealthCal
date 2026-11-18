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

import { searchLocal, tokenize } from './foodSearch';

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
  food('c_cottage', "קוטג' 5%", { per100g: { kcal: 95 } }),
  food('c_hummus_he', 'חומוס עם טחינה', { per100g: { kcal: 230 } }),
  food('c_mixed', 'Pita פיתה מקמח מלא', { per100g: { kcal: 250 } }),
  food('c_salad_mom', 'סלט של אמא', { per100g: { kcal: 90 } }),
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
  it('the 155 worked examples (4.8)', () => {
    const { lines, failures } = runList('hebrew-examples.tsv');
    expect(lines.length).toBe(155);
    expect(failures).toEqual([]);
  });

  it("the automatic list: each food's first Hebrew name finds it first", () => {
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
    expect(runList(name).failures).toEqual([]);
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
    const WANTED = new Set(['תאנ', 'מיובש', 'עגבני', 'מבושל', 'ירוק', 'שחור', 'חמוצ', 'מטוגנ', 'יבש', 'ביצ', 'פית', 'לבנ', 'חמא', 'נקניקי', 'גבינ', 'סופגני']);
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

describe('an own food named in Hebrew', () => {
  const pie = food('c_pie', 'פשטידת ברוקולי של סבתא');
  for (const [label, ctx] of [
    ['alone', { foods: [], customFoods: [pie] }],
    ['among the bundled foods', { customFoods: [pie] }],
  ] as const) {
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
    for (const q of ['', '   ', '!!!', '...', '״', "'", '—', '־', '‎⁨⁩']) expect(searchLocal(q, ctx)).toEqual([]);
  });

  it('a query of only stop words still searches for them', () => {
    // Names drop stop words too, so a Hebrew stop word alone finds only what starts with it; it never throws.
    expect(() => searchLocal('של', ctx)).not.toThrow();
    expect(() => searchLocal('עם ו של', ctx)).not.toThrow();
    // As before for English: "and" still finds words that contain it.
    expect(searchLocal('and', ctx).length).toBeGreaterThan(0);
  });

  it('emoji and Arabic letters are ignored like punctuation', () => {
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
      ' ', ' ', ' ', "'", '"', '%', '-', '(', ')', ',', '.', '׳', '״', '־', 'ִ', 'ּ', 'ׁ',
      '‎', '⁨', '🍕', 'ح', 'م', 'é', 'שׁ', 'ﭏ',
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
