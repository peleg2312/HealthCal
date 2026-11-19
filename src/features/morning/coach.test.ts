import { describe, expect, it } from 'vitest';

import { addDays } from '@/lib/dates';
import type { ISODate, UnitSystem } from '@/types';

import {
  GOOD_FIRST_WEEK,
  GOOD_ITEM,
  GOOD_LOGGED,
  GOOD_MIXED,
  GOOD_STRONG,
  IMPROVE,
  IMPROVE_PROTEIN,
  MAX_COACH,
  OPEN_FIRST_WEEK,
  OPEN_NOTHING,
  OPEN_PARTIAL,
  OPEN_WATER,
  TODAY_BUDGET,
  TODAY_MOVE,
  TODAY_SLEEP,
  TODAY_TARGETS,
  TODAY_WATER,
  TODAY_WATER_LEAD,
  TODAY_WEIGH,
  coachMessage,
  dayIndex,
  proteinPerMeal,
  spokenCoach,
  type CoachInput,
  type CoachMessage,
} from './coach';
import type { DayFacts } from './facts';
import { todayPlan, type PlanInput } from './plan';
import { toAdjust, wentWell, type LastNight } from './review';

/** A fixed Thursday. */
const TODAY: ISODate = '2026-11-19';
const YESTERDAY = addDays(TODAY, -1);

function facts(p: Partial<DayFacts>): DayFacts {
  const base: DayFacts = {
    date: YESTERDAY,
    foodLogged: true,
    complete: true,
    overBand: false,
    approx: false,
    kcal: 2080,
    budget: 2190,
    protein: 160,
    proteinG: 152,
    waterMl: 3400,
    waterGoalMl: 3300,
    hasWater: true,
    activities: [],
    guidelineMin: 0,
  };
  const f = { ...base, ...p };
  return { ...f, overBand: f.complete && f.budget > 0 && f.kcal - f.budget > f.budget * 0.1 + 1e-9 };
}

interface Case {
  y: DayFacts;
  lastNight: LastNight | null;
  firstWeekDay?: number;
  units?: UnitSystem;
  weekBefore?: number;
  plan?: Partial<PlanInput>;
  targets?: { budget: number; proteinG: number };
  today?: ISODate;
}

function build(c: Case): CoachInput {
  const today = c.today ?? TODAY;
  const units = c.units ?? 'metric';
  const firstWeekDay = c.firstWeekDay ?? 0;
  const review = { y: c.y, weekBefore: c.weekBefore ?? 0, lastNight: c.lastNight, units, firstWeek: firstWeekDay >= 1 && firstWeekDay <= 7 };
  const well = wentWell(review);
  const adjust = toAdjust(review);
  const plan = todayPlan({
    today,
    waterMl: 0,
    waterGoalMl: 3300,
    weekMinutes: 0,
    lastWeighIn: addDays(today, -2),
    lastNightLogged: c.lastNight !== null,
    firstAdjust: adjust[0]?.kind ?? null,
    units,
    ...c.plan,
  });
  return { today, y: c.y, well, adjust, plan, targets: c.targets ?? { budget: 2190, proteinG: 152 }, firstWeekDay };
}

const run = (c: Case) => coachMessage(build(c));

const run1 = [{ name: 'Running', emoji: '🏃', durationMin: 42 }];

/** The cases A to G of the brief (the browser states morning-a-strong ... morning-g-stress). */
const CASES: Record<string, Case> = {
  A: {
    y: facts({ kcal: 2080, protein: 160, waterMl: 3400, activities: run1, guidelineMin: 42 }),
    lastNight: { hours: 7.5 },
    weekBefore: 63,
    plan: { waterMl: 0, weekMinutes: 105 },
  },
  B: {
    y: facts({ kcal: 2850, protein: 112, waterMl: 1980 }),
    lastNight: { hours: 5.67 },
    plan: { waterMl: 0, lastWeighIn: addDays(TODAY, -9) },
  },
  C: { y: facts({ kcal: 420, complete: false, protein: 18, waterMl: 0, hasWater: false }), lastNight: null },
  D: { y: facts({ kcal: 0, foodLogged: false, complete: false, protein: 0, waterMl: 1190 }), lastNight: null },
  E: { y: facts({ kcal: 0, foodLogged: false, complete: false, protein: 0, waterMl: 0, hasWater: false }), lastNight: null },
  F: { y: facts({ kcal: 1490, protein: 88, waterMl: 1910 }), lastNight: null, firstWeekDay: 2 },
  G: {
    y: facts({ kcal: 11480, protein: 431, proteinG: 180, waterMl: 12500, waterGoalMl: 3700, activities: [{ name: 'Mountain trail running', emoji: '🏃', durationMin: 75 }], guidelineMin: 75 }),
    lastNight: { hours: 7.2 },
    units: 'imperial',
    targets: { budget: 2640, proteinG: 180 },
    plan: { waterMl: 500, waterGoalMl: 3700, weekMinutes: 75 },
  },
};

describe('coachMessage: the cases', () => {
  it('A to G on a fixed date', () => {
    const texts = Object.fromEntries(Object.entries(CASES).map(([k, c]) => [k, run(c).text]));
    expect(texts).toEqual({
      A: "Your workout and a full night's sleep: carry that into today. One glass now: 3.3 L of water to go.",
      B: 'You kept the diary whole yesterday; that habit carries the rest. Next step: about 50 g of protein at each meal today. One glass now: 3.3 L of water to go.',
      C: 'Some of yesterday is logged; today can hold the rest. Next step: every meal in the diary today. One glass now: 3.3 L of water to go.',
      D: "Yesterday's water is in the diary. Next step: every meal in the diary today. One glass now: 3.3 L of water to go.",
      E: 'Today opens with a clean diary. One glass now: 3.3 L of water to go.',
      F: 'The whole day logged: solid footing for a first week. One glass now: 3.3 L of water to go.',
      G: 'Your workout: that one is yours to keep. A fresh budget today; plan the next meal from it. One glass now: 108 fl oz of water to go.',
    });
  });

  it('A: a strong day has no improve part', () => {
    const m = run(CASES.A);
    expect(m.kind).toBe('strong');
    expect(m.improve).toBeNull();
    expect(m.good).not.toBeNull();
    expect(m.goodKinds).toEqual(['move', 'sleep']);
    expect(m.todayFrom).toBe('water');
  });

  it('B: the habit named as such, one specific gap as a next step: protein, then sleep (never calories while another is listed)', () => {
    const m = run(CASES.B);
    expect(m.kind).toBe('mixed');
    expect(GOOD_LOGGED).toContain(m.good);
    // Protein at 74% is the first next step, although "What to improve" (three items, by the share
    // missing) has room only for calories, the night and water.
    expect(build(CASES.B).adjust.map((a) => a.kind)).toEqual(['cal', 'sleep', 'water']);
    expect(m.improveKind).toBe('protein');
    expect(m.improve).toMatch(/50 g of protein/);
    expect(m.today).not.toBeNull();
    // Without the protein gap, the short night is next.
    const night = run({ ...CASES.B, y: facts({ kcal: 2850, protein: 150, waterMl: 1980 }) });
    expect(night.improveKind).toBe('sleep');
    expect(night.improve).toMatch(/7 h/);
  });

  it('protein comes first among the next steps, with today\'s share per meal', () => {
    const m = run({ y: facts({ protein: 60, waterMl: 1200 }), lastNight: { hours: 5 } });
    expect(m.improveKind).toBe('protein');
    expect(IMPROVE_PROTEIN.map((f) => f('50 g'))).toContain(m.improve);
    // Without a protein target today, the step has no number.
    expect(IMPROVE.protein).toContain(run({ y: facts({ protein: 60 }), lastNight: null, targets: { budget: 2190, proteinG: 0 } }).improve);
    expect(proteinPerMeal(152)).toBe(50);
    expect(proteinPerMeal(0)).toBeNull();
  });

  it('calories over the band, alone: a fresh budget, never a logging tip to someone who logged it all', () => {
    for (const today of [TODAY, addDays(TODAY, 1), addDays(TODAY, 2)]) {
      const m = run({ ...CASES.G, today });
      expect(m.improveKind).toBe('cal');
      expect(IMPROVE.cal).toContain(m.improve);
      expect(m.improve).not.toMatch(/\blog/i);
      expect(m.improve).not.toMatch(/less|cut|make up|skip/i);
    }
  });

  it('C, D: a day not fully logged opens neutrally and names logging the rest as the next step; E has nothing to improve', () => {
    for (const [k, kind] of [
      ['C', 'partial'],
      ['D', 'water-only'],
    ] as const) {
      const m = run(CASES[k]);
      expect(m.kind).toBe(kind);
      expect(m.good).toBeNull();
      expect(m.opener).not.toBeNull();
      expect(IMPROVE.log).toContain(m.improve);
      expect(m.today).not.toBeNull();
    }
    const e = run(CASES.E);
    expect(e.kind).toBe('nothing');
    expect(e.improve).toBeNull();
    expect(e.opener).not.toBeNull();
  });

  it('a day not fully logged is never praised as a whole: only the one true thing', () => {
    const strong = [...GOOD_STRONG, ...GOOD_MIXED].map((f) => f('\u0001').split('\u0001')[1]).concat(GOOD_LOGGED);
    const cases: Record<string, Case> = {
      'nothing logged, a good night': { ...CASES.E, lastNight: { hours: 8 } },
      'breakfast only, a good night': { ...CASES.C, lastNight: { hours: 8 } },
      'water met, no food': { y: facts({ kcal: 0, foodLogged: false, complete: false, protein: 0, waterMl: 3400 }), lastNight: null },
      'a workout, no food': { y: facts({ kcal: 0, foodLogged: false, complete: false, protein: 0, waterMl: 0, hasWater: false, activities: run1, guidelineMin: 42 }), lastNight: null },
      'part logged with a workout': { y: facts({ kcal: 420, complete: false, protein: 18, waterMl: 0, hasWater: false, activities: run1, guidelineMin: 42 }), lastNight: null },
    };
    for (const [name, c] of Object.entries(cases)) {
      for (const today of [TODAY, addDays(TODAY, 1), addDays(TODAY, 2)]) {
        const m = run({ ...c, today });
        expect(m.kind, name).toBe('item');
        expect(GOOD_ITEM.some((f) => f('\u0001').split('\u0001').every((part) => m.good!.toLowerCase().includes(part.toLowerCase().trim().replace(/^\W+/, ''))))).toBe(true);
        expect(strong.some((tail) => m.good!.endsWith(tail)), `${name}: ${m.good}`).toBe(false);
        expect(m.text).not.toMatch(/nothing to change|worth repeating|strong base/);
      }
    }
    // The workout without food names the workout, and the next step is to log the meals.
    const w = run(cases['a workout, no food']);
    expect(w.good).toMatch(/your workout/);
    expect(IMPROVE.log).toContain(w.improve);
  });

  it('the parts join to the text, and the label says the units in words', () => {
    const m = run(CASES.G);
    expect(m.text).toBe([m.opener, m.good, m.improve, m.today].filter(Boolean).join(' '));
    expect(spokenCoach('2.6 L of water to go, 152 g, 2,190 kcal, 7 h, 88 fl oz, 750 ml, 20 min')).toBe(
      '2.6 litres of water to go, 152 grams, 2,190 kilocalories, 7 hours, 88 fluid ounces, 750 millilitres, 20 minutes',
    );
  });
});

describe('coachMessage: the rules', () => {
  it('the first week: one good thing, no improve part', () => {
    for (let d = 1; d <= 7; d++) {
      for (const c of Object.values(CASES)) {
        const m = run({ ...c, firstWeekDay: d });
        expect(m.improve).toBeNull();
        if (m.good) expect(m.kind).toBe('first-week');
        if (m.good) expect(m.good).not.toMatch(/ and /);
      }
    }
  });

  it('water to improve and a water row first: one sentence says both', () => {
    const m = run({ y: facts({ waterMl: 600 }), lastNight: { hours: 7.5 } });
    expect(m.improve).toBeNull();
    expect(TODAY_WATER_LEAD.map((f) => f('2.6 L'))).toContain(run({ y: facts({ waterMl: 600 }), lastNight: { hours: 7.5 }, plan: { waterMl: 700 } }).today);
  });

  it('no plan row: today\'s targets, or the budget alone, or nothing', () => {
    const none = { waterMl: 3300, weekMinutes: 150 };
    const at = (targets: { budget: number; proteinG: number }) => run({ y: facts({}), lastNight: { hours: 8 }, plan: none, targets }).today;
    expect(TODAY_TARGETS.map((f) => f('2,190 kcal', '152 g'))).toContain(at({ budget: 2190, proteinG: 152 }));
    expect(TODAY_BUDGET.map((f) => f('1,980 kcal'))).toContain(at({ budget: 1980, proteinG: 0 }));
    expect(at({ budget: 0, proteinG: 0 })).toBeNull();
  });

  it('is the same for a date and differs on the next day', () => {
    for (const c of Object.values(CASES)) {
      const a = run({ ...c, today: TODAY });
      expect(run({ ...c, today: TODAY })).toEqual(a);
      expect(run({ ...c, today: addDays(TODAY, 1) }).text).not.toBe(a.text);
    }
    expect(dayIndex(addDays(TODAY, 1)) - dayIndex(TODAY)).toBe(1);
  });
});

// ------------------------------------------------------------------ the grid

const BLAME =
  /\b(bad|fail|failed|failure|cheat|cheated|should|should have|guilty|lazy|only|great job|amazing|well done|keep it up|too much|missed your|goal missed|over budget|make up|eat less|cut back|unfortunately|oops|sorry|weight loss|lose weight|healthy|healthier)\b/i;

const UNIT = /^(kcal|g|L|ml|fl oz|h|min|active minutes?|days?)\b/;

/** Every number in the text is followed by its unit. */
function unitless(text: string): string[] {
  const out: string[] = [];
  const re = /\d[\d,.]*/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const rest = text.slice(m.index + m[0].length).replace(/^[.,]$/, '');
    if (!UNIT.test(rest.replace(/^\s/, ''))) out.push(`${m[0]} in "${text}"`);
  }
  return out;
}

const numbersOf = (s: string | null) => (s ? (s.match(/\d[\d,.]*\d|\d/g) ?? []) : []);

function grid(): { input: CoachInput; m: CoachMessage }[] {
  const out: { input: CoachInput; m: CoachMessage }[] = [];
  const ys: DayFacts[] = [];
  for (const kcal of [0, 420, 1490, 2080, 2190, 2400, 2850, 11480])
    for (const share of [0, 0.5, 0.79, 1, 1.3])
      for (const acts of [[], run1, [...run1, { name: 'Yoga', emoji: '🧘', durationMin: 40 }]])
        ys.push(
          facts({
            kcal,
            foodLogged: kcal > 0,
            complete: kcal >= 1000,
            protein: 152 * share,
            waterMl: 3300 * share,
            hasWater: share > 0,
            activities: acts,
            guidelineMin: acts.reduce((s, a) => s + a.durationMin, 0),
          }),
        );
  // Protein short with water reached, so protein is the first thing to improve.
  for (const acts of [[], run1]) ys.push(facts({ protein: 60, waterMl: 3300, activities: acts, guidelineMin: acts.length ? 42 : 0 }));
  // Water short with protein reached, so water is the first thing to improve.
  for (const acts of [[], run1]) ys.push(facts({ protein: 160, waterMl: 1200, activities: acts, guidelineMin: acts.length ? 42 : 0 }));
  const nights: (LastNight | null)[] = [null, { hours: 5 }, { hours: 6.5 }, { hours: 7.5 }];
  const plans: Partial<PlanInput>[] = [
    { waterMl: 0 },
    { waterMl: 3300, weekMinutes: 60 },
    { waterMl: 3300, weekMinutes: 150, lastWeighIn: '2026-11-01' },
    { waterMl: 3300, weekMinutes: 150 },
  ];
  const dates: ISODate[] = Array.from({ length: 60 }, (_, k) => addDays('2026-11-01', k));
  let n = 0;
  for (const y of ys)
    for (const lastNight of nights)
      for (const plan of plans)
        for (const units of ['metric', 'imperial'] as UnitSystem[])
          for (const firstWeekDay of [0, 3]) {
            // A rotating subset of the 60 dates keeps the grid quick while every date is used.
            for (const today of [dates[n % 60], dates[(n + 29) % 60]]) {
              const input = build({ y, lastNight, plan, units, firstWeekDay, today, targets: n % 5 === 0 ? { budget: 1980, proteinG: 0 } : { budget: 2190, proteinG: 152 } });
              out.push({ input, m: coachMessage(input) });
            }
            n += 1;
          }
  return out;
}

const GRID = grid();

describe('coachMessage across a grid of inputs and 60 dates', () => {
  it('stays within the length', () => {
    const long = GRID.filter((g) => g.m.text.length > MAX_COACH).map((g) => g.m.text);
    expect(long).toEqual([]);
    expect(Math.max(...GRID.map((g) => g.m.text.length))).toBeLessThanOrEqual(MAX_COACH);
  });

  it('no blame word, no exclamation mark', () => {
    const bad = [...new Set(GRID.map((g) => g.m.text))].filter((s) => BLAME.test(s) || s.includes('!'));
    expect(bad).toEqual([]);
  });

  it("words.test.ts's no-shame guard holds too (and one active minute is singular)", () => {
    const WORDS =
      /\b(bad|fail|failed|failure|cheat|cheated|should|guilty|lazy|great|amazing|well done|keep it up|too much|missed your|goal missed|over budget|make up|only|unfortunately|oops|sorry)\b/i;
    const texts = [...new Set(GRID.flatMap((g) => [g.m.text, g.m.label]))];
    expect(texts.filter((s) => WORDS.test(s) || s.includes('!') || /(^|[^\d,.])1 (more )?active minutes/.test(s))).toEqual([]);
  });

  it('every number has its unit', () => {
    expect([...new Set(GRID.flatMap((g) => unitless(g.m.text)))]).toEqual([]);
  });

  it('never says a number twice', () => {
    const twice = GRID.filter((g) => {
      const nums = [...numbersOf(g.m.good), ...numbersOf(g.m.improve), ...numbersOf(g.m.today), ...numbersOf(g.m.opener)];
      return new Set(nums).size !== nums.length;
    }).map((g) => g.m.text);
    expect([...new Set(twice)]).toEqual([]);
  });

  it('never names the same thing as good and to improve', () => {
    const same = { cal: ['budget', 'cal'], budget: ['budget', 'cal'], water: ['water'], protein: ['protein'], sleep: ['sleep'] } as Record<string, string[]>;
    const clash = GRID.filter(({ input }) => {
      const first = input.adjust[0]?.kind;
      if (!first) return false;
      return input.well.some((w) => (same[first] ?? [first]).includes(w.kind));
    });
    expect(clash.length).toBe(0);
    // And the words: a good part never names what the improve part names.
    const words = GRID.filter(({ m }) => m.good && m.improve && ['water', 'protein', 'sleep', 'night', 'budget'].some((w) => m.good!.includes(w) && m.improve!.includes(w)));
    expect(words.map((g) => g.m.text)).toEqual([]);
  });

  it('praise only with something true to point at', () => {
    for (const { input, m } of GRID) {
      if (input.well.length === 0) expect(m.good).toBeNull();
      else expect(m.good).not.toBeNull();
    }
  });

  it('the first week: no improve part', () => {
    for (const { input, m } of GRID) if (input.firstWeekDay) expect(m.improve).toBeNull();
  });

  it('the whole day is praised only when it was fully logged', () => {
    for (const { input, m } of GRID) if (!input.y.complete && m.good) expect(['item', 'first-week']).toContain(m.kind);
  });

  it('a calorie step only on a fully logged day above the band, and only when nothing else is listed', () => {
    for (const { input, m } of GRID) {
      if (m.improveKind !== 'cal') continue;
      expect(input.y.complete && input.y.overBand).toBe(true);
      expect(input.adjust.every((a) => a.kind === 'cal')).toBe(true);
    }
  });

  it('no two parts say "start" (or "begin") in one message', () => {
    const twice = [...new Set(GRID.map((g) => g.m.text))].filter((t) => (t.match(/\b(start|starts|begin)\b/gi) ?? []).length > 1);
    expect(twice).toEqual([]);
  });

  it('two mornings in a row never read alike', () => {
    for (const { input, m } of GRID.slice(0, 400)) expect(coachMessage({ ...input, today: addDays(input.today, 1) }).text).not.toBe(m.text);
  });
});

describe('every phrasing is reachable', () => {
  it('each part and kind', () => {
    const seen = new Set(GRID.map((g) => g.m.text));
    const all = [...seen].join('\n');
    const fixed = [...OPEN_PARTIAL, ...OPEN_WATER, ...OPEN_NOTHING, ...OPEN_FIRST_WEEK, ...Object.values(IMPROVE).flat(), ...GOOD_LOGGED, ...TODAY_WEIGH, ...TODAY_SLEEP];
    expect(fixed.filter((s) => !all.includes(s))).toEqual([]);
    // The templates, by the words they hold around their slot.
    const shapes = [GOOD_STRONG, GOOD_MIXED, GOOD_ITEM, GOOD_FIRST_WEEK, IMPROVE_PROTEIN, TODAY_WATER, TODAY_WATER_LEAD, TODAY_MOVE].flatMap((list) => list.map((f) => f('\u0001')));
    const missing = shapes.filter((s) => {
      const [a, b] = s.split('\u0001').map((x) => x.trim());
      return !GRID.some((g) => [g.m.good, g.m.improve, g.m.today].some((p) => p && (a === '' || p.toLowerCase().includes(a.toLowerCase().replace(/^\W+/, ''))) && p.endsWith(b)));
    });
    expect(missing).toEqual([]);
    const targets = [...TODAY_TARGETS.map((f) => f('\u0001', '\u0002')), ...TODAY_BUDGET.map((f) => f('\u0001'))].map((s) => s.split(/[\u0001\u0002]/)[0]);
    expect(targets.filter((a) => !GRID.some((g) => g.m.today?.startsWith(a)))).toEqual([]);
  });
});

// The coach reads the review and the plan: a day whose only water came with drinks from the
// diary (hasWater false yesterday, waterTracked false today) gets the words of a day with no water.
describe('drinks from the diary only', () => {
  it('yesterday and today read as without the diary water', () => {
    const base = { kcal: 2080, protein: 160, waterGoalMl: 3300, hasWater: false };
    const latte = run({ y: facts({ ...base, waterMl: 223 }), lastNight: { hours: 7.5 }, plan: { waterMl: 223, waterTracked: false } });
    const none = run({ y: facts({ ...base, waterMl: 0 }), lastNight: { hours: 7.5 }, plan: { waterMl: 0, waterTracked: false } });
    expect(latte).toEqual(none);
    expect(latte.improveKind).toBe('water');
  });

  it('diary drinks up to the goal never read as water on target', () => {
    const base = { kcal: 2080, protein: 160, waterGoalMl: 3300, hasWater: false };
    const latte = run({ y: facts({ ...base, waterMl: 3400 }), lastNight: { hours: 7.5 }, plan: { waterMl: 3400, waterTracked: false } });
    const none = run({ y: facts({ ...base, waterMl: 0 }), lastNight: { hours: 7.5 }, plan: { waterMl: 0, waterTracked: false } });
    expect(latte).toEqual(none);
    expect(latte.goodKinds).not.toContain('water');
  });
});
