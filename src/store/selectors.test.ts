import { describe, expect, it, vi } from 'vitest';

// selectors.ts imports the zustand store, which pulls in AsyncStorage and expo-crypto.
// Only the pure compute* functions are under test, so the store module is stubbed out.
vi.mock('./index', () => ({ useStore: vi.fn() }));

import { addDays } from '@/lib/dates';
import type { ActivityEntry, FoodEntry, Profile, WaterEntry, WeightEntry } from '@/types';

import {
  computeConsistency,
  computeDay,
  computeDayFromStore,
  computeEnergyModel,
  intakeByDate,
  live,
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
  it('only one bridge is allowed per streak', () => {
    // today, miss, -2, miss, -4: second gap is not bridged -> today and -2
    expect(computeConsistency(set(0, -2, -4), END).streak).toBe(2);
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
