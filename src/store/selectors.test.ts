import { describe, expect, it, vi } from 'vitest';

// selectors.ts imports the zustand store, which pulls in AsyncStorage and expo-crypto.
// Only the pure compute* functions are under test, so the store module is stubbed out.
vi.mock('./index', () => ({ useStore: vi.fn() }));

import path from 'node:path';

import { addDays, diffDays, startOfWeek } from '@/lib/dates';
import { formulaTdee } from '@/lib/energy';
import { withRuleChange } from '@/lib/exerciseBudget';
import type { ActivityEntry, DaySnapshot, FoodEntry, Profile, WaterEntry, WeightEntry } from '@/types';

import {
  computeConsistency,
  computeDay,
  computeDayFromStore,
  computeDays,
  computeEnergyModel,
  exerciseByDate,
  intakeByDate,
  live,
  modelInputs,
} from './selectors';

const DAY = '2026-06-15';
const profile: Profile = {
  name: 'T',
  sex: 'male',
  birthDate: '1990-01-01', // 36 in June 2026 (age is read from the real clock; see below)
  heightCm: 180,
  weightKg: 80,
  activityLevel: 'moderate',
  goal: 'maintain',
  weeklyRateKg: 0,
  units: 'metric',
  eatBackExercise: true,
  useAdaptiveTdee: true,
  onboardedAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

let seq = 0;
const food = (date: string, kcal: number, extra: Partial<FoodEntry> = {}): FoodEntry => ({
  id: `f${seq++}`,
  updatedAt: '2026-01-01T00:00:00Z',
  date,
  meal: 'lunch',
  name: 'x',
  source: 'custom',
  verified: false,
  servingLabel: '1',
  quantity: 1,
  grams: 100,
  nutrients: { kcal, protein: 0, carbs: 0, fat: 0 },
  loggedAt: `${date}T12:00:00Z`,
  ...extra,
});
const act = (date: string, kcalNet: number, kcalGross: number, extra: Partial<ActivityEntry> = {}): ActivityEntry => ({
  id: `a${seq++}`,
  updatedAt: '2026-01-01T00:00:00Z',
  date,
  activityId: 'running',
  name: 'Run',
  emoji: 'x',
  category: 'running' as never,
  intensity: 'moderate',
  durationMin: 60,
  met: 9,
  kcalNet,
  kcalGross,
  loggedAt: `${date}T08:00:00Z`,
  ...extra,
});
const water = (date: string, ml: number, beverage: WaterEntry['beverage'] = 'water'): WaterEntry => ({
  id: `w${seq++}`,
  updatedAt: '2026-01-01T00:00:00Z',
  date,
  ml,
  beverage,
  loggedAt: `${date}T09:00:00Z`,
});
const weight = (date: string, kg: number): WeightEntry => ({ id: `kg${seq++}`, updatedAt: '2026-01-01T00:00:00Z', date, kg });

// Dates tied to the real clock are avoided: BMR depends on age "today", so expected values below
// are derived from the model returned for the same profile rather than hard-coded kcal.

describe('live', () => {
  it('drops soft-deleted records only', () => {
    const a = food(DAY, 100);
    const b = food(DAY, 200, { deleted: true });
    const c = food(DAY, 300, { deleted: false });
    expect(live({ [a.id]: a, [b.id]: b, [c.id]: c }).map((e) => e.nutrients.kcal)).toEqual([100, 300]);
  });
});

describe('intakeByDate', () => {
  it('sums kcal per date', () => {
    expect(intakeByDate([food('2026-06-01', 500), food('2026-06-01', 700), food('2026-06-02', 300)])).toEqual({
      '2026-06-01': 1200,
      '2026-06-02': 300,
    });
    expect(intakeByDate([])).toEqual({});
  });
  it('does not drop zero-kcal days (they are present with 0)', () => {
    expect(intakeByDate([food('2026-06-01', 0)])).toEqual({ '2026-06-01': 0 });
  });
});

describe('computeEnergyModel', () => {
  it('with no data: formula TDEE is used, adaptive is not', () => {
    const m = computeEnergyModel(profile, [], [], DAY);
    expect(m.usingAdaptive).toBe(false);
    expect(m.tdee).toBe(m.formulaTdee);
    expect(m.formulaTdee).toBeCloseTo(m.bmr * 1.55, 9);
    expect(m.bmrMethod).toBe('mifflin-st-jeor');
    expect(m.adaptive.observed).toBeNull();
    expect(m.target.tdee).toBe(m.tdee);
  });

  // 120 days of weights falling 0.5 kg/week and 28 days at 2000 kcal, all ending YESTERDAY.
  // True expenditure by construction: 2000 + 0.5*7700/7 = 2550.
  const end = DAY;
  const yesterday = addDays(end, -1);
  const weights = Array.from({ length: 120 }, (_, i) => weight(addDays(yesterday, i - 119), 90 - (0.5 / 7) * i));
  const eaten = Array.from({ length: 28 }, (_, i) => food(addDays(yesterday, -i), 2000));

  it('uses the adaptive estimate when enabled and available: blend of formula and 2550', () => {
    const m = computeEnergyModel(profile, eaten, weights, end);
    expect(m.adaptive.observed).toBe(2550);
    expect(m.usingAdaptive).toBe(true);
    const c = m.adaptive.confidence;
    expect(m.tdee).toBe(Math.round(m.formulaTdee * (1 - c) + 2550 * c));
    expect(m.target.tdee).toBe(m.tdee);
  });
  it('ignores the adaptive estimate when the profile switches it off', () => {
    const m = computeEnergyModel({ ...profile, useAdaptiveTdee: false }, eaten, weights, end);
    expect(m.adaptive.observed).toBe(2550); // still computed for display
    expect(m.usingAdaptive).toBe(false);
    expect(m.tdee).toBe(m.formulaTdee);
  });
  it("today's partial log is not part of the window (window ends yesterday)", () => {
    const withToday = [...eaten, food(end, 300)];
    const a = computeEnergyModel(profile, eaten, weights, end);
    const b = computeEnergyModel(profile, withToday, weights, end);
    expect(b.adaptive.observed).toBe(a.adaptive.observed);
    expect(b.adaptive.loggedDays).toBe(28);
  });
  it('the calorie target is built from the model tdee, not the formula', () => {
    const m = computeEnergyModel({ ...profile, goal: 'lose', weeklyRateKg: 0.5 }, eaten, weights, end);
    expect(m.target.target).toBe(Math.round((m.tdee - (0.5 * 7700) / 7) / 10) * 10);
  });
});

describe('computeDay', () => {
  const model = computeEnergyModel(profile, [], [], DAY);
  const target = model.target.target;
  const foods = [food(DAY, 600, { loggedAt: '2026-06-15T12:00:00Z' }), food(DAY, 400, { meal: 'breakfast', loggedAt: '2026-06-15T08:00:00Z' }), food('2026-06-14', 9999)];
  const acts = [act(DAY, 300, 450), act('2026-06-14', 999, 999)];

  it('sums only the requested date and sorts by loggedAt', () => {
    const d = computeDay(DAY, profile, model, foods, acts, []);
    expect(d.entries.map((e) => e.nutrients.kcal)).toEqual([400, 600]);
    expect(d.eaten.kcal).toBe(1000);
    expect(d.byMeal.breakfast).toHaveLength(1);
    expect(d.byMeal.lunch).toHaveLength(1);
    expect(d.activities).toHaveLength(1);
  });
  it('eating back exercise adds NET calories (300), not gross (450)', () => {
    const d = computeDay(DAY, { ...profile, eatBackExercise: true }, model, foods, acts, []);
    expect(d.exerciseNet).toBe(300);
    expect(d.exerciseGross).toBe(450);
    expect(d.target).toBe(target);
    expect(d.budget).toBe(target + 300);
    expect(d.remaining).toBe(target + 300 - 1000);
  });
  it('with eatBackExercise off the budget equals the base target', () => {
    const d = computeDay(DAY, { ...profile, eatBackExercise: false }, model, foods, acts, []);
    expect(d.budget).toBe(target);
    expect(d.remaining).toBe(target - 1000);
    expect(d.exerciseNet).toBe(300); // still reported
  });
  it('remaining goes negative when over budget', () => {
    const d = computeDay(DAY, profile, model, [food(DAY, target + 500)], [], []);
    expect(d.remaining).toBe(-500);
  });
  it('active minutes sum over the day', () => {
    const d = computeDay(DAY, profile, model, [], [act(DAY, 100, 150, { durationMin: 30 }), act(DAY, 100, 150, { durationMin: 45 })], []);
    expect(d.activeMinutes).toBe(75);
  });
  it('macro targets are derived from the budget including exercise', () => {
    const d = computeDay(DAY, profile, model, [], acts, []);
    const fat = Math.round(((target + 300) * 0.28) / 9);
    expect(Math.abs(d.macros.fatG - fat)).toBeLessThanOrEqual(1);
  });
  it('an empty day is all zeros with the full budget remaining', () => {
    const d = computeDay('2026-06-01', profile, model, foods, acts, []);
    expect(d.eaten.kcal).toBe(0);
    expect(d.exerciseNet).toBe(0);
    expect(d.remaining).toBe(target);
  });

  describe('water', () => {
    it('base goal for 80 kg man is 2650 ml; one hour of moderate exercise adds 550 -> 3200', () => {
      expect(computeDay(DAY, profile, model, [], [], []).waterGoalMl).toBe(2650);
      const d = computeDay(DAY, profile, model, [], [act(DAY, 300, 450, { durationMin: 60, intensity: 'moderate' })], []);
      expect(d.waterGoalMl).toBe(3200);
    });
    it('goal grows with more exercise, and only that day exercise counts', () => {
      const light = computeDay(DAY, profile, model, [], [act(DAY, 1, 1, { durationMin: 30, intensity: 'light' })], []);
      const heavy = computeDay(DAY, profile, model, [], [act(DAY, 1, 1, { durationMin: 90, intensity: 'vigorous' })], []);
      expect(heavy.waterGoalMl).toBeGreaterThan(light.waterGoalMl);
      expect(computeDay('2026-06-13', profile, model, [], [act(DAY, 1, 1)], []).waterGoalMl).toBe(2650);
    });
    it('a manual override replaces the whole goal, exercise included', () => {
      const d = computeDay(DAY, { ...profile, waterGoalMlOverride: 3000 }, model, [], acts, []);
      expect(d.waterGoalMl).toBe(3000);
    });
    it('beverages are hydration weighted: 500 water + 500 coffee = 950', () => {
      const d = computeDay(DAY, profile, model, [], [], [water(DAY, 500), water(DAY, 500, 'coffee'), water('2026-06-14', 800)]);
      expect(d.waterMl).toBe(950);
      expect(d.waterRemainingMl).toBe(2650 - 950);
    });
    it('remaining never goes negative', () => {
      const d = computeDay(DAY, profile, model, [], [], [water(DAY, 5000)]);
      expect(d.waterRemainingMl).toBe(0);
    });
  });
});

describe('soft-deleted records and computeDayFromStore', () => {
  const rec = <T extends { id: string }>(...xs: T[]) => Object.fromEntries(xs.map((x) => [x.id, x]));
  const store = (over: object = {}) =>
    ({
      profile,
      foodEntries: rec(food(DAY, 500), food(DAY, 700, { deleted: true })),
      activities: rec(act(DAY, 300, 450), act(DAY, 400, 600, { deleted: true })),
      water: rec(water(DAY, 500), { ...water(DAY, 1000), deleted: true }),
      weights: rec(weight('2026-06-01', 80)),
      days: {},
      ...over,
    }) as never;

  it('excludes deleted food, activities and water', () => {
    const d = computeDayFromStore(store(), DAY)!;
    expect(d.eaten.kcal).toBe(500);
    expect(d.exerciseNet).toBe(300);
    expect(d.waterMl).toBe(500);
  });
  it('computeDay itself trusts its inputs (callers must pass live records)', () => {
    const m = computeEnergyModel(profile, [], [], DAY);
    expect(computeDay(DAY, profile, m, [food(DAY, 700, { deleted: true })], [], []).eaten.kcal).toBe(700);
  });
  it('deleted weights and food do not feed the adaptive estimate', () => {
    const yesterday = addDays(DAY, -1);
    const deletedWeights = Object.fromEntries(
      Array.from({ length: 40 }, (_, i) => {
        const w = { ...weight(addDays(yesterday, -i), 80), deleted: true };
        return [w.id, w];
      }),
    );
    const deletedFood = Object.fromEntries(
      Array.from({ length: 28 }, (_, i) => {
        const f = food(addDays(yesterday, -i), 2000, { deleted: true });
        return [f.id, f];
      }),
    );
    const s = store({ weights: deletedWeights, foodEntries: deletedFood });
    const d = computeDayFromStore(s, DAY)!;
    const m = computeEnergyModel(profile, [], [], DAY);
    expect(d.target).toBe(m.target.target);
  });
  it('returns null until onboarding is complete', () => {
    expect(computeDayFromStore(store({ profile: { ...profile, onboardedAt: undefined } }), DAY)).toBeNull();
    expect(computeDayFromStore(store({ profile: null }), DAY)).toBeNull();
  });
});

describe('computeConsistency (forgiving streak)', () => {
  const END = '2026-06-17'; // a Wednesday (2026-01-01 was a Thursday)
  const set = (...offsets: number[]) => new Set(offsets.map((o) => addDays(END, o)));

  it('counts consecutive days ending today', () => {
    const c = computeConsistency(set(0, -1, -2), END);
    expect(c.streak).toBe(3);
    expect(c.loggedToday).toBe(true);
    expect(c.totalDaysLogged).toBe(3);
  });
  it('today not logged yet does not break the streak', () => {
    const c = computeConsistency(set(-1, -2, -3), END);
    expect(c.streak).toBe(3);
    expect(c.loggedToday).toBe(false);
  });
  it('bridges exactly one missed day', () => {
    // logged: today, (missed -1), -2, -3 -> 3 logged days in the streak
    expect(computeConsistency(set(0, -2, -3), END).streak).toBe(3);
  });
  it('two missed days in a row end the streak', () => {
    // today logged, -1 and -2 missed, -3 and -4 logged -> streak is only today
    expect(computeConsistency(set(0, -3, -4), END).streak).toBe(1);
  });
  it('every single missed day is bridged, not just the first one', () => {
    // today, miss, -2, miss, -4: both gaps are single days, so all three logged days count
    expect(computeConsistency(set(0, -2, -4), END).streak).toBe(3);
  });
  it('two missed days in a row end the streak wherever they fall', () => {
    // today, miss, -2, miss, miss, -5: the run stops before the double gap
    expect(computeConsistency(set(0, -2, -5), END).streak).toBe(2);
  });
  it('a missed yesterday with today still open is bridged once', () => {
    // nothing today or yesterday, -2 and -3 logged: yesterday is the one forgiven gap
    expect(computeConsistency(set(-2, -3), END).streak).toBe(2);
  });
  it('nothing for three days resets to 0', () => {
    expect(computeConsistency(set(-3, -4), END).streak).toBe(0);
  });
  it('empty history', () => {
    expect(computeConsistency(new Set(), END)).toEqual({ streak: 0, daysThisWeek: 0, loggedToday: false, totalDaysLogged: 0 });
  });
  it('streak crosses month and year boundaries', () => {
    const dates = new Set(['2025-12-30', '2025-12-31', '2026-01-01', '2026-01-02']);
    expect(computeConsistency(dates, '2026-01-02').streak).toBe(4);
  });
  it('daysThisWeek counts the Monday-based week up to today (Mon 15, Tue 16, Wed 17)', () => {
    // Sunday 14 June belongs to last week; it must not count.
    const c = computeConsistency(new Set(['2026-06-14', '2026-06-15', '2026-06-17']), END);
    expect(c.daysThisWeek).toBe(2);
  });
  it('daysThisWeek on a Monday is 0 or 1', () => {
    expect(computeConsistency(new Set(['2026-06-14']), '2026-06-15').daysThisWeek).toBe(0);
    expect(computeConsistency(new Set(['2026-06-15']), '2026-06-15').daysThisWeek).toBe(1);
  });
  it('daysThisWeek on Sunday covers the full week', () => {
    const all = new Set(['2026-06-15', '2026-06-16', '2026-06-17', '2026-06-18', '2026-06-19', '2026-06-20', '2026-06-21']);
    expect(computeConsistency(all, '2026-06-21').daysThisWeek).toBe(7);
  });
});

describe('exercise is not counted twice once expenditure is learned from data', () => {
  const END = '2026-07-01';
  const p = { ...profile, useAdaptiveTdee: true, eatBackExercise: true, goal: 'maintain' as const, weeklyRateKg: 0 };
  // 28 days: weight flat at 80 kg, 2,800 kcal eaten and a 400 kcal (net) workout every day.
  const dates = Array.from({ length: 28 }, (_, i) => addDays(END, -1 - i));
  const foods = dates.map((d) => food(d, 2800));
  const weights = dates.map((d) => weight(d, 80));
  const acts = dates.map((d) => act(d, 400, 520));

  it('the learned baseline excludes workouts, and a workout day\'s budget equals what the user really burns', () => {
    const m = computeEnergyModel(p, foods, weights, END, acts);
    expect(m.usingAdaptive).toBe(true);
    expect(m.adaptive.observedTotal).toBe(2800);
    expect(m.adaptive.observed).toBe(2400);
    const day = computeDay(END, p, m, [], [act(END, 400, 520)], []);
    // Target is close to the 2,400 baseline (blended with the formula); with today's
    // 400 kcal session the budget lands near the 2,800 actually burned, not near 3,200.
    expect(day.budget).toBeGreaterThan(day.target + 399);
    expect(day.budget).toBeLessThan(2800 + 0.15 * Math.abs(m.formulaTdee - 2400) + 15);
  });

  it('with eating back turned off, the average workout burn is part of the target instead', () => {
    const off = { ...p, eatBackExercise: false };
    const withBack = computeEnergyModel(p, foods, weights, END, acts);
    const without = computeEnergyModel(off, foods, weights, END, acts);
    expect(Math.round(without.tdee - withBack.tdee)).toBe(400);
    const day = computeDay(END, off, without, [], [act(END, 400, 520)], []);
    expect(day.budget).toBe(day.target);
  });
});

describe('a past day keeps the target it had at the time', () => {
  it('uses the recorded snapshot instead of today\'s model, including its eat-back setting', () => {
    const m = computeEnergyModel(profile, [], [], DAY);
    const snap = { id: 's', updatedAt: '', date: DAY, target: 1500, tdee: 2000, eatBackExercise: false, weightKg: 80 };
    const d = computeDay(DAY, { ...profile, eatBackExercise: true }, m, [food(DAY, 400)], [act(DAY, 300, 450)], [], [snap]);
    expect(d.target).toBe(1500);
    expect(d.budget).toBe(1500);
    expect(d.remaining).toBe(1100);
  });
  it('falls back to the current model for days without a snapshot', () => {
    const m = computeEnergyModel(profile, [], [], DAY);
    const other = { id: 's', updatedAt: '', date: addDays(DAY, -1), target: 1500, tdee: 2000, eatBackExercise: true, weightKg: 80 };
    expect(computeDay(DAY, profile, m, [], [], [], [other]).target).toBe(m.target.target);
  });
});

describe('a past day has one budget, whichever way it is asked for', () => {
  it('the per-date model used for a run of days equals the model for that single day', () => {
    // A history in which the learned expenditure moves: intake rises half-way through at flat weight.
    const END = '2026-08-30';
    const p = { ...profile, useAdaptiveTdee: true, goal: 'maintain' as const, weeklyRateKg: 0 };
    const dates = Array.from({ length: 60 }, (_, i) => addDays(END, -i));
    const foods = dates.map((d, i) => food(d, i < 30 ? 2600 : 2100));
    const weights = dates.map((d) => weight(d, 80));
    const inputs = modelInputs(foods, weights, []);
    for (const d of [addDays(END, -5), addDays(END, -20), addDays(END, -33)]) {
      const single = computeEnergyModel(p, foods, weights, d);
      const shared = computeEnergyModel(p, foods, weights, d, [], inputs);
      expect(shared.target.target).toBe(single.target.target);
      expect(shared.tdee).toBe(single.tdee);
    }
    // And the model really does differ between dates here, so the check above is not vacuous.
    expect(computeEnergyModel(p, foods, weights, END).tdee).not.toBe(computeEnergyModel(p, foods, weights, addDays(END, -33)).tdee);
  });
});

describe('workout calories over 7 days', () => {
  const T = '2026-11-18';
  const week: Profile = { ...profile, eatBackExercise: true, exerciseSpread: 'week' };
  const model = computeEnergyModel(week, [], [], T);
  const target = model.target.target;
  const snap = (date: string, eatBackExercise: boolean): DaySnapshot => ({ id: `d${date}`, updatedAt: '', date, target, tdee: 2500, eatBackExercise, weightKg: 80 });
  // 400 net on Sunday Nov 15, 290 net today.
  const acts = [act('2026-11-15', 400, 520), act(T, 290, 380)];

  it('reports the rule, what is added and the part carried from earlier days', () => {
    const d = computeDay(T, week, model, [], acts, []);
    expect(d.exerciseRule).toBe('week');
    expect(d.exerciseCarry).toBe(57);
    expect(d.exerciseAdded).toBe(57 + 41);
    expect(d.budget).toBe(target + 98);
    expect(d.exerciseAdded).toBe(d.budget - d.target);
    expect(d.exerciseNet).toBe(290); // the day's own burn is still reported whole
    expect(d.remaining).toBe(target + 98);
  });
  it('same day reports no carry and adds the day in full; off adds nothing', () => {
    const day = computeDay(T, profile, model, [], acts, []);
    expect([day.exerciseRule, day.exerciseAdded, day.exerciseCarry]).toEqual(['day', 290, 0]);
    const off = computeDay(T, { ...week, eatBackExercise: false }, model, [], acts, []);
    expect([off.exerciseRule, off.exerciseAdded, off.exerciseCarry]).toEqual(['off', 0, 0]);
  });
  it('macro targets follow the spread budget', () => {
    const d = computeDay(T, week, model, [], acts, []);
    const fat = Math.round(((target + 98) * 0.28) / 9);
    expect(Math.abs(d.macros.fatG - fat)).toBeLessThanOrEqual(1);
  });
  it('water stays on the workout day only', () => {
    const d = computeDay(T, week, model, [], [act('2026-11-15', 400, 520, { durationMin: 60 })], []);
    expect(d.waterGoalMl).toBe(computeDay(T, week, model, [], [], []).waterGoalMl);
  });
  it('the spread follows the profile history, not the snapshot', () => {
    const p = { ...week, ...withRuleChange({ eatBackExercise: true }, 'week', T) };
    expect(p.exerciseRuleHistory).toEqual([{ until: T, rule: 'day' }]);
    // Sunday is a snapshotted 'day' day: its 400 stays on Sunday, nothing carries into today.
    const snaps = [snap('2026-11-15', true), snap('2026-11-16', true)];
    const sunday = computeDay('2026-11-15', p, model, [], acts, [], snaps);
    expect([sunday.exerciseRule, sunday.exerciseAdded]).toEqual(['day', 400]);
    const today = computeDay(T, p, model, [], acts, [], snaps);
    expect([today.exerciseRule, today.exerciseAdded, today.exerciseCarry]).toEqual(['week', 41, 0]);
  });
  it('a snapshot with eatBackExercise false is off whatever the history says', () => {
    const d = computeDay('2026-11-15', week, model, [], acts, [], [snap('2026-11-15', false)]);
    expect([d.exerciseRule, d.exerciseAdded, d.budget]).toEqual(['off', 0, target]);
    // and an off day gives nothing to the days after it
    expect(computeDay(T, week, model, [], acts, [], [snap('2026-11-15', false)]).exerciseCarry).toBe(0);
  });
  it('a run of days (useDays) and one day (useDay) agree under week', () => {
    const many: ActivityEntry[] = [];
    for (let i = 0; i < 40; i++) if (i % 3 === 0) many.push(act(addDays(T, -i), 150 + i * 13, 300));
    const foods = Array.from({ length: 40 }, (_, i) => food(addDays(T, -i), 2000 + i));
    const weights = Array.from({ length: 40 }, (_, i) => weight(addDays(T, -i), 80 - i * 0.02));
    const snaps = [snap(addDays(T, -3), true), snap(addDays(T, -4), false)];
    const run = computeDays(30, T, week, foods, weights, many, [], snaps);
    for (const d of run) {
      const m = computeEnergyModel(week, foods, weights, d.date, many);
      const one = computeDay(d.date, week, m, foods, many, [], snaps);
      expect({ date: d.date, budget: d.budget, added: d.exerciseAdded, carry: d.exerciseCarry, rule: d.exerciseRule }).toEqual({
        date: d.date,
        budget: one.budget,
        added: one.exerciseAdded,
        carry: one.exerciseCarry,
        rule: one.exerciseRule,
      });
    }
    expect(run.some((d) => d.exerciseCarry > 0)).toBe(true);
    const fromStore = computeDayFromStore(
      {
        profile: week,
        foodEntries: Object.fromEntries(foods.map((f) => [f.id, f])),
        weights: Object.fromEntries(weights.map((w) => [w.id, w])),
        activities: Object.fromEntries(many.map((a) => [a.id, a])),
        water: {},
        days: Object.fromEntries(snaps.map((x) => [x.id, x])),
      } as never,
      T,
    )!;
    expect(fromStore.budget).toBe(run[run.length - 1].budget);
  });
});

describe('Same day with no history gives the numbers the old code gave, on the demo data', () => {
  it('every day of the seed, by the old formula', async () => {
    const seedPath = path.resolve(__dirname, '../../scripts/dev/seed.mjs');
    const { buildSeed } = await import(/* @vite-ignore */ seedPath);
    const { state } = buildSeed();
    const liveOf = <T extends { deleted?: boolean }>(m: Record<string, T> | undefined): T[] => Object.values(m ?? {}).filter((r) => !r.deleted);
    const p: Profile = state.profile;
    expect(p.exerciseSpread).toBeUndefined();
    const foods = liveOf<FoodEntry>(state.foodEntries);
    const weights = liveOf<WeightEntry>(state.weights);
    const acts = liveOf<ActivityEntry>(state.activities);
    const snaps = liveOf<DaySnapshot>(state.days);
    const dates = [...new Set([...foods.map((f) => f.date), ...acts.map((a) => a.date)])].sort();
    const end = dates[dates.length - 1];
    const run = computeDays(dates.length + 3, end, p, foods, weights, acts, [], snaps);
    let withWorkout = 0;
    for (const d of run) {
      const m = computeEnergyModel(p, foods, weights, d.date, acts);
      const snapshot = snaps.find((x) => x.date === d.date);
      const target = snapshot ? snapshot.target : m.target.target;
      const eatBack = snapshot ? snapshot.eatBackExercise : p.eatBackExercise;
      const exerciseNet = acts.filter((a) => a.date === d.date).reduce((s, a) => s + a.kcalNet, 0);
      expect({ date: d.date, budget: d.budget }).toEqual({ date: d.date, budget: Math.round(target + (eatBack ? exerciseNet : 0)) });
      expect(d.exerciseCarry).toBe(0);
      if (exerciseNet > 0) withWorkout++;
    }
    expect(withWorkout).toBeGreaterThan(5);
    // The same for the demo with adding turned off.
    const off = { ...p, eatBackExercise: false };
    for (const d of computeDays(dates.length, end, off, foods, weights, acts, [], [])) expect(d.budget).toBe(d.target);
  });
});

describe('learned expenditure with workouts over 7 days (section 4.2 of the specification)', () => {
  // Male, 180 cm, 85 kg, light activity, losing 0.5 kg a week, learned expenditure on. His true
  // non-exercise expenditure is 6% above the formula. He eats exactly each day's budget, and his
  // weight follows energy balance. Workouts: 400 net on Tuesdays and Thursdays.
  const sim: Profile = {
    ...profile,
    name: 'Sim',
    sex: 'male',
    birthDate: '1990-06-01',
    heightCm: 180,
    weightKg: 85,
    activityLevel: 'light',
    goal: 'lose',
    weeklyRateKg: 0.5,
    useAdaptiveTdee: true,
    eatBackExercise: true,
  };
  const START = '2026-08-03';
  const trueE = Math.round(formulaTdee(sim) * 1.06);

  function run(p: Profile, days: number, workoutsFrom: number) {
    const acts: ActivityEntry[] = [];
    for (let i = workoutsFrom; i < days; i++) {
      const d = addDays(START, i);
      const w = diffDays(startOfWeek(d), d);
      if (w === 1 || w === 3) acts.push(act(d, 400, 520));
    }
    const exercise = exerciseByDate(acts);
    const inputs = { weights: [] as { date: string; kg: number }[], intake: {} as Record<string, number>, exercise };
    let kg = 85;
    const budgets: number[] = [];
    const targets: number[] = [];
    for (let i = 0; i < days; i++) {
      const d = addDays(START, i);
      inputs.weights.push({ date: d, kg: Math.round(kg * 100) / 100 });
      const m = computeEnergyModel(p, [], [], d, acts, inputs);
      const b = computeDay(d, p, m, [], acts, []).budget;
      inputs.intake[d] = b;
      budgets.push(b);
      targets.push(m.target.target);
      kg += (b - trueE - (exercise[d] ?? 0)) / 7700;
    }
    return { budgets, targets, kg };
  }
  const weekP: Profile = { ...sim, exerciseSpread: 'week' };
  const sumOf = (xs: number[]) => xs.reduce((s, v) => s + v, 0);
  // The documented bound on the learned target's lag under 'week': 6/7 of the change in weekly net
  // burn (800), over 28 days, times the confidence (at most 0.85), plus the target's 10 kcal rounding.
  const BOUND = Math.ceil(((6 / 7) * 800 * 0.85) / 28) + 10;

  it('steady state, 2 x 400 a week for 112 days: the same budget and weight as Same day', () => {
    const day = run(sim, 112, 0);
    const wk = run(weekP, 112, 0);
    const last28 = (xs: number[]) => sumOf(xs.slice(-28));
    expect(Math.abs(last28(wk.budgets) - last28(day.budgets)) / last28(day.budgets)).toBeLessThan(0.005);
    expect(Math.abs(wk.kg - day.kg)).toBeLessThan(0.1);
    // The specification's figures (60,600 and 60,640 kcal; 76.45 and 76.42 kg), within 0.5%.
    expect(Math.abs(last28(day.budgets) - 60600) / 60600).toBeLessThan(0.005);
    expect(Math.abs(last28(wk.budgets) - 60640) / 60640).toBeLessThan(0.005);
    expect(Math.abs(day.kg - 76.45) / 76.45).toBeLessThan(0.005);
    expect(Math.abs(wk.kg - 76.42) / 76.42).toBeLessThan(0.005);
  });

  it('ramp: 56 days without workouts, then 2 x 400 a week for 84 days; the target stays inside the documented bound', () => {
    const day = run(sim, 140, 56);
    const wk = run(weekP, 140, 56);
    const after = (xs: number[]) => sumOf(xs.slice(56));
    expect(Math.abs(after(wk.budgets) - after(day.budgets)) / after(day.budgets)).toBeLessThan(0.005);
    expect(Math.abs(after(day.budgets) - 181800) / 181800).toBeLessThan(0.005);
    expect(Math.abs(after(wk.budgets) - 181750) / 181750).toBeLessThan(0.005);
    expect(Math.abs(wk.kg - day.kg)).toBeLessThan(0.1);
    expect(Math.abs(day.kg - 74.32) / 74.32).toBeLessThan(0.005);
    const diff = wk.targets.map((t, i) => t - day.targets[i]);
    expect(Math.max(...diff.map(Math.abs))).toBeLessThanOrEqual(BOUND);
    // Measured: -10 to +20 kcal; 181,800 and 181,750 kcal after the ramp; 74.32 kg both.
    expect(Math.min(...diff)).toBeGreaterThanOrEqual(-BOUND);
  });
});
