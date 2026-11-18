import { describe, expect, it } from 'vitest';

import { addDays, diffDays, startOfWeek } from '@/lib/dates';
import type { ISODate, Profile } from '@/types';

import {
  dailyShare,
  dayRuleFor,
  effectiveFrom,
  exercisePlaced,
  exerciseRuleOf,
  profileRuleOn,
  rangeRule,
  RULE_HISTORY_MAX,
  ruleFieldsOnSave,
  ruleOfDates,
  spreadShares,
  SPREAD_DAYS,
  withRuleChange,
  type ExerciseRule,
} from './exerciseBudget';

type RuleProfile = Pick<Profile, 'eatBackExercise' | 'exerciseSpread' | 'exerciseRuleHistory'>;
type Snaps = Map<ISODate, { eatBackExercise: boolean }>;

const DAY: RuleProfile = { eatBackExercise: true };
const WEEK: RuleProfile = { eatBackExercise: true, exerciseSpread: 'week' };

const range = (from: ISODate, n: number) => Array.from({ length: n }, (_, i) => addDays(from, i));
const added = (d: ISODate, net: Record<ISODate, number>, p: RuleProfile, snaps: Snaps = new Map()) => exercisePlaced(d, net, dayRuleFor(p, snaps)).added;
const addedRun = (from: ISODate, n: number, net: Record<ISODate, number>, p: RuleProfile, snaps: Snaps = new Map()) =>
  range(from, n).map((d) => added(d, net, p, snaps));
const sum = (xs: number[]) => xs.reduce((s, v) => s + v, 0);
const change = (p: RuleProfile, next: ExerciseRule, from: ISODate): RuleProfile => ({ ...p, ...withRuleChange(p, next, from) });
/** Workouts of `kcal` on the given weekdays (0 = Monday) from `from` for `days` days. */
function pattern(from: ISODate, days: number, weekdays: number[], kcal: number): Record<ISODate, number> {
  const out: Record<ISODate, number> = {};
  for (const d of range(from, days)) if (weekdays.includes(diffDays(startOfWeek(d), d))) out[d] = kcal;
  return out;
}

describe('spreadShares', () => {
  it.each([0, 1, 6, 7, 290, 400, 1200, 1199.7])('%s splits into seven whole shares that sum to it rounded', (t) => {
    const s = spreadShares(t);
    expect(s).toHaveLength(SPREAD_DAYS);
    expect(sum(s)).toBe(Math.round(t));
    for (const v of s) {
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
    }
  });
  it('matches the specification examples', () => {
    expect(spreadShares(400)).toEqual([57, 57, 57, 57, 57, 57, 58]);
    expect(spreadShares(1200)).toEqual([171, 171, 172, 171, 172, 171, 172]);
    expect(spreadShares(290)).toEqual([41, 41, 42, 41, 42, 41, 42]);
    expect(spreadShares(6)).toEqual([0, 1, 1, 1, 1, 1, 1]);
  });
  it('dailyShare is a seventh, rounded, for words', () => {
    expect(dailyShare(400)).toBe(57);
    expect(dailyShare(290)).toBe(41);
  });
});

describe('worked weeks of the specification (Over 7 days)', () => {
  it('(a) two 400 kcal workouts a week, steady state: 115 at most on any day, 800 a week', () => {
    const net = pattern('2026-08-31', 90, [1, 3], 400);
    const week = addedRun('2026-11-02', 7, net, WEEK);
    expect(week).toEqual([115, 114, 115, 114, 114, 114, 114]);
    expect(sum(week)).toBe(800);
    // Same day for comparison: the spikes the owner described.
    expect(addedRun('2026-11-02', 7, net, DAY)).toEqual([0, 400, 0, 400, 0, 0, 0]);
  });
  it('(b) one 1,200 kcal hike on Sat Nov 7: seven shares, then nothing', () => {
    const net = { '2026-11-07': 1200 };
    expect(addedRun('2026-11-06', 9, net, WEEK)).toEqual([0, 171, 171, 172, 171, 172, 171, 172, 0]);
  });
  it('(c) three workouts a week for three weeks, then none: weekly totals and the week off', () => {
    const net = pattern('2026-10-12', 21, [0, 2, 4], 400);
    const weeks = ['2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26', '2026-11-02', '2026-11-09', '2026-11-16'].map((m) => sum(addedRun(m, 7, net, WEEK)));
    expect(weeks).toEqual([0, 856, 1200, 1200, 344, 0, 0]);
    expect(sum(weeks)).toBe(3600);
    expect(addedRun('2026-11-02', 7, net, WEEK)).toEqual([114, 115, 57, 58, 0, 0, 0]);
  });
});

describe('the first weeks after choosing Over 7 days (Tue and Thu at 400, switch on Mon Nov 16)', () => {
  const net = pattern('2026-10-12', 70, [1, 3], 400);
  const p = change(DAY, 'week', '2026-11-16');

  it('history keeps the weeks before; the first week adds less', () => {
    expect(p.exerciseRuleHistory).toEqual([{ until: '2026-11-16', rule: 'day' }]);
    expect(addedRun('2026-11-09', 7, net, p)).toEqual([0, 400, 0, 400, 0, 0, 0]);
    expect(addedRun('2026-11-16', 7, net, p)).toEqual([0, 57, 57, 114, 114, 114, 114]);
    expect(sum(addedRun('2026-11-16', 7, net, p))).toBe(570);
    for (const m of ['2026-11-23', '2026-11-30', '2026-12-07']) expect(addedRun(m, 7, net, p)).toEqual([115, 114, 115, 114, 114, 114, 114]);
  });
  it('230 kcal stays in flight on every Sunday while he trains (58 from Tuesday, 172 from Thursday), never lost', () => {
    for (const sunday of ['2026-11-22', '2026-11-29', '2026-12-06', '2026-12-13']) {
      const days = diffDays('2026-11-16', sunday) + 1;
      const burned = sum(range('2026-11-16', days).map((d) => net[d] ?? 0));
      expect(burned - sum(addedRun('2026-11-16', days, net, p))).toBe(230);
    }
    // After the last workout (Thu Dec 17) the rest arrives within six days.
    const end = '2026-12-23';
    const days = diffDays('2026-11-16', end) + 1;
    expect(sum(addedRun('2026-11-16', days, net, p))).toBe(sum(range('2026-11-16', days).map((d) => net[d] ?? 0)));
  });
  it('switching back to Same day on Mon Nov 30 gives that week 1,030, then 800 a week', () => {
    const back = change(p, 'day', '2026-11-30');
    expect(back.exerciseRuleHistory).toEqual([
      { until: '2026-11-16', rule: 'day' },
      { until: '2026-11-30', rule: 'week' },
    ]);
    expect(addedRun('2026-11-23', 7, net, back)).toEqual([115, 114, 115, 114, 114, 114, 114]);
    expect(addedRun('2026-11-30', 7, net, back)).toEqual([115, 457, 58, 400, 0, 0, 0]);
    expect(sum(addedRun('2026-11-30', 7, net, back))).toBe(1030);
    expect(addedRun('2026-12-07', 7, net, back)).toEqual([0, 400, 0, 400, 0, 0, 0]);
  });
});

describe('exerciseRuleOf and profileRuleOn', () => {
  it('the boolean wins whenever it says off', () => {
    expect(exerciseRuleOf({ eatBackExercise: false, exerciseSpread: 'week' })).toBe('off');
    expect(exerciseRuleOf({ eatBackExercise: false })).toBe('off');
    expect(exerciseRuleOf({ eatBackExercise: true })).toBe('day');
    expect(exerciseRuleOf({ eatBackExercise: true, exerciseSpread: 'day' })).toBe('day');
    expect(exerciseRuleOf({ eatBackExercise: true, exerciseSpread: 'week' })).toBe('week');
  });
  it('a closed period covers the days up to the day before its until; the current profile covers the rest', () => {
    const p: RuleProfile = { ...WEEK, exerciseRuleHistory: [{ until: '2026-11-01', rule: 'off' }, { until: '2026-11-10', rule: 'day' }] };
    expect(profileRuleOn(p, '2026-10-31')).toBe('off');
    expect(profileRuleOn(p, '2026-11-01')).toBe('day');
    expect(profileRuleOn(p, '2026-11-09')).toBe('day');
    expect(profileRuleOn(p, '2026-11-10')).toBe('week');
    // Order on the wire does not matter.
    expect(profileRuleOn({ ...p, exerciseRuleHistory: [...p.exerciseRuleHistory!].reverse() }, '2026-10-31')).toBe('off');
  });
  it('an older app that flips only the boolean: days after the last period follow it, closed periods stay', () => {
    const p: RuleProfile = { eatBackExercise: true, exerciseSpread: 'week', exerciseRuleHistory: [{ until: '2026-11-10', rule: 'day' }] };
    const flipped = { ...p, eatBackExercise: false }; // the old app keeps the unknown fields
    expect(profileRuleOn(flipped, '2026-11-09')).toBe('day');
    expect(profileRuleOn(flipped, '2026-11-12')).toBe('off');
    const back = { ...flipped, eatBackExercise: true };
    expect(profileRuleOn(back, '2026-11-12')).toBe('week');
  });
});

describe('dayRuleFor', () => {
  it('whether a day adds comes from its snapshot; how it spreads only from the profile', () => {
    const p: RuleProfile = { ...WEEK, exerciseRuleHistory: [{ until: '2026-11-10', rule: 'day' }] };
    const snaps: Snaps = new Map([
      ['2026-11-05', { eatBackExercise: true }],
      ['2026-11-06', { eatBackExercise: false }],
      ['2026-11-12', { eatBackExercise: true }],
      ['2026-11-13', { eatBackExercise: false }],
    ]);
    const rule = dayRuleFor(p, snaps);
    expect(rule('2026-11-05')).toBe('day');
    expect(rule('2026-11-06')).toBe('off');
    expect(rule('2026-11-07')).toBe('day');
    expect(rule('2026-11-12')).toBe('week');
    expect(rule('2026-11-13')).toBe('off');
    expect(rule('2026-11-14')).toBe('week');
  });
  it('a snapshot that adds on a day the profile had off adds the same-day way', () => {
    const p: RuleProfile = { ...WEEK, exerciseRuleHistory: [{ until: '2026-11-10', rule: 'off' }] };
    expect(dayRuleFor(p, new Map([['2026-11-05', { eatBackExercise: true }]]))('2026-11-05')).toBe('day');
  });
});

describe('exercisePlaced', () => {
  it('reports own and carry', () => {
    const net = { '2026-11-10': 400, '2026-11-12': 290 };
    const r = exercisePlaced('2026-11-12', net, dayRuleFor(WEEK, new Map()));
    expect(r).toEqual({ rule: 'week', own: 41, carry: 57, added: 98 });
    const d = exercisePlaced('2026-11-12', net, dayRuleFor(DAY, new Map()));
    expect(d).toEqual({ rule: 'day', own: 290, carry: 0, added: 290 });
  });
  it('an off receiver takes nothing, and an off giver gives nothing', () => {
    const net = { '2026-11-10': 700 };
    const offReceiver: Snaps = new Map([['2026-11-12', { eatBackExercise: false }]]);
    expect(addedRun('2026-11-10', 7, net, WEEK, offReceiver)).toEqual([100, 100, 0, 100, 100, 100, 100]);
    const offGiver: Snaps = new Map([['2026-11-10', { eatBackExercise: false }]]);
    expect(addedRun('2026-11-10', 8, net, WEEK, offGiver)).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
  });
  it('a day giver adds only on its own day, even to a week receiver after a switch', () => {
    const p = change(DAY, 'week', '2026-11-11');
    expect(addedRun('2026-11-10', 8, { '2026-11-10': 400 }, p)).toEqual([400, 0, 0, 0, 0, 0, 0, 0]);
  });
  it('a late workout raises its own day and the next six, not earlier days', () => {
    const before = addedRun('2026-11-01', 20, { '2026-11-10': 400 }, WEEK);
    const after = addedRun('2026-11-01', 20, { '2026-11-10': 400, '2026-11-05': 700 }, WEEK);
    const diff = after.map((v, i) => v - before[i]);
    expect(diff).toEqual([0, 0, 0, 0, 100, 100, 100, 100, 100, 100, 100, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  });
  it('a deleted workout takes all seven shares with it', () => {
    const net: Record<ISODate, number> = { '2026-11-10': 400, '2026-11-12': 700 };
    const before = addedRun('2026-11-10', 10, net, WEEK);
    delete net['2026-11-12'];
    const after = addedRun('2026-11-10', 10, net, WEEK);
    expect(sum(before) - sum(after)).toBe(700);
    expect(before.slice(0, 2)).toEqual(after.slice(0, 2));
  });
});

describe('effectiveFrom', () => {
  const T = '2026-11-18';
  it('day <-> week waits for tomorrow only when a workout is dated today', () => {
    expect(effectiveFrom('day', 'week', T, true)).toBe('2026-11-19');
    expect(effectiveFrom('week', 'day', T, true)).toBe('2026-11-19');
    expect(effectiveFrom('day', 'week', T, false)).toBe(T);
    expect(effectiveFrom('week', 'day', T, false)).toBe(T);
  });
  it('turning adding off or on applies today', () => {
    expect(effectiveFrom('week', 'off', T, true)).toBe(T);
    expect(effectiveFrom('off', 'week', T, true)).toBe(T);
    expect(effectiveFrom('day', 'off', T, false)).toBe(T);
    expect(effectiveFrom('off', 'day', T, false)).toBe(T);
  });
});

describe('withRuleChange', () => {
  const T = '2026-11-18';
  it('switching day to week on Nov 18 leaves every day through Nov 17 as it was, with and without snapshots', () => {
    const net = { '2026-11-08': 400, '2026-11-12': 300, '2026-11-15': 250 };
    const snaps: Snaps = new Map([
      ['2026-11-13', { eatBackExercise: true }],
      ['2026-11-14', { eatBackExercise: true }],
    ]);
    const days = range('2026-11-05', 25);
    const before = days.map((d) => added(d, net, DAY, snaps));
    const p = change(DAY, 'week', T);
    expect(p).toEqual({ eatBackExercise: true, exerciseSpread: 'week', exerciseRuleHistory: [{ until: T, rule: 'day' }] });
    const after = days.map((d) => added(d, net, p, snaps));
    expect(after.slice(0, 13)).toEqual(before.slice(0, 13));
    expect(after.slice(0, 11)).toEqual([0, 0, 0, 400, 0, 0, 0, 300, 0, 0, 250]);
  });
  it('back and forth on the same day leaves no history', () => {
    const p = change(change(DAY, 'week', T), 'day', T);
    expect(p.exerciseRuleHistory).toBeUndefined();
    expect(exerciseRuleOf(p)).toBe('day');
    const q = change(change(DAY, 'week', '2026-11-19'), 'day', '2026-11-19');
    expect(q.exerciseRuleHistory).toBeUndefined();
  });
  it('week from tomorrow, then day, then week from today', () => {
    let p = change(DAY, 'week', '2026-11-19');
    expect(p.exerciseRuleHistory).toEqual([{ until: '2026-11-19', rule: 'day' }]);
    p = change(p, 'day', '2026-11-19');
    p = change(p, 'week', T);
    expect(p.exerciseRuleHistory).toEqual([{ until: T, rule: 'day' }]);
    expect(exerciseRuleOf(p)).toBe('week');
  });
  it('a tomorrow change replaced by a today change drops the period that covered today', () => {
    let p = change(DAY, 'week', '2026-11-19'); // a workout was dated today
    p = change(p, 'off', T); // turning off applies today
    expect(p.exerciseRuleHistory).toEqual([{ until: T, rule: 'day' }]);
    expect(p.eatBackExercise).toBe(false);
    expect(p.exerciseSpread).toBe('week');
  });
  it('turning off keeps the spread, so turning on again returns to it', () => {
    let p = change(WEEK, 'off', T);
    expect(p).toEqual({ eatBackExercise: false, exerciseSpread: 'week', exerciseRuleHistory: [{ until: T, rule: 'week' }] });
    p = change(p, 'week', '2026-11-25');
    expect(p.exerciseRuleHistory).toEqual([
      { until: T, rule: 'week' },
      { until: '2026-11-25', rule: 'off' },
    ]);
    expect(exerciseRuleOf(p)).toBe('week');
  });
  it('neighbouring periods with the same rule merge', () => {
    let p = change(DAY, 'week', '2026-11-01');
    p = change(p, 'off', '2026-11-05');
    p = change(p, 'off', '2026-11-08'); // no change of rule
    expect(p.exerciseRuleHistory).toEqual([
      { until: '2026-11-01', rule: 'day' },
      { until: '2026-11-05', rule: 'week' },
    ]);
  });
  it(`keeps at most ${RULE_HISTORY_MAX} periods; the oldest days take the next period's rule`, () => {
    let p: RuleProfile = DAY;
    for (let i = 0; i < RULE_HISTORY_MAX + 5; i++) p = change(p, i % 2 === 0 ? 'week' : 'day', addDays('2026-01-01', i * 2));
    expect(p.exerciseRuleHistory).toHaveLength(RULE_HISTORY_MAX);
    const h = p.exerciseRuleHistory!;
    for (let i = 1; i < h.length; i++) expect(h[i - 1].until < h[i].until).toBe(true);
    expect(profileRuleOn(p, '2025-12-01')).toBe(h[0].rule);
  });
});

// ------------------------------------------------------------------ properties

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface World {
  p: RuleProfile;
  net: Record<ISODate, number>;
  snaps: Snaps;
  saves: { today: ISODate; prev: ExerciseRule; next: ExerciseRule; before: number[]; after: number[]; upTo: number }[];
}

/**
 * Lives through `days` days from `start` as the app would: each day the app is
 * opened (or not, so some days have no snapshot), workouts arrive (some late,
 * onto earlier days, some deleted), and now and then the person saves a new rule
 * in Goals through effectiveFrom and withRuleChange. Every save records every
 * day's added calories just before and just after it.
 */
function live(seed: number, days: number, start: ISODate, initial: RuleProfile, rules: ExerciseRule[]): World {
  const r = rng(seed);
  const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)];
  const w: World = { p: initial, net: {}, snaps: new Map(), saves: [] };
  const all = range(start, days + 7);
  const snapshot = (d: ISODate) => w.snaps.set(d, { eatBackExercise: exerciseRuleOf(w.p) !== 'off' });
  for (let i = 0; i < days; i++) {
    const today = addDays(start, i);
    const opened = r() < 0.8;
    if (opened) snapshot(today);
    if (r() < 0.3) w.net[today] = Math.round(100 + r() * 900);
    if (r() < 0.05) w.net[addDays(today, -1 - Math.floor(r() * 10))] = Math.round(100 + r() * 600); // late from a watch
    if (r() < 0.04) {
      const gone = pick(Object.keys(w.net));
      if (gone) delete w.net[gone];
    }
    if (r() < 0.25) {
      const prev = exerciseRuleOf(w.p);
      const next = pick(rules);
      if (next !== prev) {
        const before = all.map((d) => added(d, w.net, w.p, w.snaps));
        const from = effectiveFrom(prev, next, today, !!w.net[today]);
        w.p = change(w.p, next, from);
        if (opened) snapshot(today); // recordToday rewrites today's snapshot after the save
        const after = all.map((d) => added(d, w.net, w.p, w.snaps));
        w.saves.push({ today, prev, next, before, after, upTo: i });
      }
    }
    if (r() < 0.15) w.net[today] = (w.net[today] ?? 0) + Math.round(50 + r() * 300); // after the save
  }
  return w;
}

/** What each workout day gives, worked out giver by giver (the other way round from exercisePlaced). */
function givenByEachWorkout(w: World): Map<ISODate, { net: number; given: number; dropped: number }> {
  const rule = dayRuleFor(w.p, w.snaps);
  const out = new Map<ISODate, { net: number; given: number; dropped: number }>();
  for (const [x, n] of Object.entries(w.net)) {
    const alone = { [x]: n };
    let given = 0;
    for (let k = 0; k < SPREAD_DAYS + 3; k++) given += added(addDays(x, k), alone, w.p, w.snaps);
    // Allowed losses: an 'off' giver, and the 'week' shares that fall on an 'off' receiver.
    let dropped = 0;
    if (rule(x) === 'off') dropped = n;
    else if (rule(x) === 'week') spreadShares(n).forEach((s, k) => (rule(addDays(x, k)) === 'off' ? (dropped += s) : null));
    out.set(x, { net: n, given, dropped });
  }
  return out;
}

describe('properties over random workout and rule histories', () => {
  const START = '2026-03-02';
  const DAYS = 160;
  const SEEDS = Array.from({ length: 60 }, (_, i) => 1000 + i);

  it('switching only between day and week: every workout is added exactly once, in full', () => {
    for (const seed of SEEDS) {
      const w = live(seed, DAYS, START, seed % 2 ? DAY : WEEK, ['day', 'week']);
      for (const [x, g] of givenByEachWorkout(w)) {
        expect({ seed, x, given: g.given }).toEqual({ seed, x, given: g.net });
      }
      // Over the whole stretch (to six days after the last), calories added equal the workouts' net calories.
      const total = sum(range(addDays(START, -10), DAYS + 20).map((d) => added(d, w.net, w.p, w.snaps)));
      expect(total).toBe(sum(Object.values(w.net)));
      expect(w.saves.length).toBeGreaterThan(3);
    }
  });

  it('with off in the mix: never counted twice, and lost only by the rules that say so', () => {
    let sawDrop = 0;
    for (const seed of SEEDS) {
      const w = live(seed, DAYS, START, seed % 3 === 0 ? DAY : WEEK, ['day', 'week', 'off']);
      let expected = 0;
      for (const [x, g] of givenByEachWorkout(w)) {
        expect(g.given).toBeLessThanOrEqual(g.net);
        expect({ seed, x, given: g.given }).toEqual({ seed, x, given: g.net - g.dropped });
        expected += g.net - g.dropped;
        if (g.dropped > 0) sawDrop++;
      }
      const total = sum(range(addDays(START, -10), DAYS + 20).map((d) => added(d, w.net, w.p, w.snaps)));
      expect(total).toBe(expected);
    }
    expect(sawDrop).toBeGreaterThan(0);
  });

  it('a save never moves the budget of today or an earlier day (turning adding off or on moves today only)', () => {
    let switches = 0;
    let toggles = 0;
    for (const seed of SEEDS) {
      const w = live(seed, DAYS, START, seed % 2 ? DAY : WEEK, ['day', 'week', 'off']);
      for (const s of w.saves) {
        const toggle = s.prev === 'off' || s.next === 'off';
        const fixedUpTo = toggle ? s.upTo - 1 : s.upTo;
        expect({ seed, today: s.today, days: s.after.slice(0, fixedUpTo + 1) }).toEqual({ seed, today: s.today, days: s.before.slice(0, fixedUpTo + 1) });
        if (toggle) toggles++;
        else switches++;
      }
    }
    expect(switches).toBeGreaterThan(50);
    expect(toggles).toBeGreaterThan(50);
  });

  it('Same day with no history is exactly the old formula, day by day', () => {
    for (const seed of SEEDS.slice(0, 20)) {
      const w = live(seed, DAYS, START, DAY, ['day']);
      expect(w.p.exerciseRuleHistory).toBeUndefined();
      for (const d of range(START, DAYS)) {
        const snap = w.snaps.get(d);
        const eatBack = snap ? snap.eatBackExercise : w.p.eatBackExercise;
        expect(added(d, w.net, w.p, w.snaps)).toBe(eatBack ? (w.net[d] ?? 0) : 0);
      }
    }
  });
});

describe('rangeRule and ruleOfDates: words about several days', () => {
  it('names the one spread every adding day has, else mixed; off days do not decide', () => {
    expect(rangeRule([])).toBe('off');
    expect(rangeRule(['off', 'off'])).toBe('off');
    expect(rangeRule(['day', 'off', 'day'])).toBe('day');
    expect(rangeRule(['week', 'off'])).toBe('week');
    expect(rangeRule(['day', 'week'])).toBe('mixed');
  });

  it('an import of workouts dated before a switch is described by their dates, not by today’s rule', () => {
    // Over 7 days since Nov 18, Same day before it.
    const p: RuleProfile = { eatBackExercise: true, exerciseSpread: 'week', exerciseRuleHistory: [{ until: '2026-11-18', rule: 'day' }] };
    expect(ruleOfDates(p, new Map(), ['2026-10-03', '2026-10-10'])).toBe('day');
    expect(ruleOfDates(p, new Map(), ['2026-11-18'])).toBe('week');
    expect(ruleOfDates(p, new Map(), ['2026-11-17', '2026-11-18'])).toBe('mixed');
    // The reverse: Same day now, Over 7 days before.
    const q: RuleProfile = { eatBackExercise: true, exerciseSpread: 'day', exerciseRuleHistory: [{ until: '2026-11-18', rule: 'week' }] };
    expect(ruleOfDates(q, new Map(), ['2026-11-01'])).toBe('week');
    // A snapshot that did not add makes its day off, which does not decide.
    expect(ruleOfDates(p, new Map([['2026-11-17', { eatBackExercise: false }]]), ['2026-11-17', '2026-11-18'])).toBe('week');
  });
});

describe('ruleFieldsOnSave: what a Goals save writes', () => {
  const T = '2026-11-18';
  // Device A's history after week from Nov 9, day from Nov 15, week again from Nov 17.
  const current: RuleProfile = {
    eatBackExercise: true,
    exerciseSpread: 'week',
    exerciseRuleHistory: [
      { until: '2026-11-09', rule: 'day' },
      { until: '2026-11-15', rule: 'week' },
      { until: '2026-11-17', rule: 'day' },
    ],
  };
  // Device B's Goals draft, opened before it pulled A's changes.
  const staleDraft: RuleProfile = { eatBackExercise: true, exerciseSpread: 'week', exerciseRuleHistory: [{ until: '2026-11-09', rule: 'day' }] };

  it('an unchanged rule keeps the saved history, whatever the draft carries, so no past budget moves', () => {
    const fields = ruleFieldsOnSave(current, exerciseRuleOf(staleDraft), T, true);
    expect(fields.exerciseRuleHistory).toEqual(current.exerciseRuleHistory);
    // As goals.tsx merges it: the draft first, the rule fields over it.
    const written = { ...staleDraft, ...fields };
    expect(written.exerciseRuleHistory).toEqual(current.exerciseRuleHistory);
    const net: Record<ISODate, number> = { '2026-11-08': 400, '2026-11-10': 300, '2026-11-13': 400, '2026-11-15': 290, '2026-11-17': 500 };
    expect(addedRun('2026-11-01', 18, net, written)).toEqual(addedRun('2026-11-01', 18, net, current));
  });

  it('a changed rule is built from the saved profile through effectiveFrom and withRuleChange', () => {
    expect(ruleFieldsOnSave(current, 'day', T, true)).toEqual(withRuleChange(current, 'day', '2026-11-19'));
    expect(ruleFieldsOnSave(current, 'day', T, false)).toEqual(withRuleChange(current, 'day', T));
    expect(ruleFieldsOnSave(current, 'off', T, true)).toEqual(withRuleChange(current, 'off', T));
  });

  it('a profile with no rule fields saved with its own rule writes none', () => {
    const fields = ruleFieldsOnSave(DAY, 'day', T, false);
    expect(JSON.parse(JSON.stringify(fields))).toEqual({ eatBackExercise: true });
  });
});
