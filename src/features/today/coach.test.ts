import { describe, expect, it } from 'vitest';

import type { DaySummary } from '@/store/selectors';
import type { FoodEntry } from '@/types';

import { coachTip, DEFAULT_RHYTHM, expectedWaterFraction, rhythmFromReminders, type CoachRhythm } from './coach';

const entry = (meal: FoodEntry['meal'], protein = 20): FoodEntry =>
  ({
    id: meal,
    meal,
    name: meal,
    nutrients: { kcal: 400, protein, carbs: 40, fat: 10 },
  }) as FoodEntry;

function day(patch: Partial<DaySummary> = {}): DaySummary {
  const entries = patch.entries ?? [];
  const byMeal: DaySummary['byMeal'] = {
    breakfast: [],
    lunch: [],
    dinner: [],
    snack: [],
  };
  for (const e of entries) byMeal[e.meal].push(e);
  const kcal = entries.reduce((s, e) => s + e.nutrients.kcal, 0);
  const protein = entries.reduce((s, e) => s + e.nutrients.protein, 0);
  return {
    date: '2026-03-10',
    entries,
    byMeal,
    eaten: { kcal, protein, carbs: 0, fat: 0 },
    activities: [],
    exerciseNet: 0,
    exerciseGross: 0,
    activeMinutes: 0,
    target: 2000,
    budget: 2000,
    remaining: 2000 - kcal,
    macros: {
      proteinG: 150,
      carbsG: 200,
      fatG: 60,
      fiberG: 28,
      split: { protein: 0.3, carbs: 0.4, fat: 0.3 },
    },
    waterEntries: [],
    waterMl: 2600,
    waterGoalMl: 2600,
    waterRemainingMl: 0,
    ...patch,
  };
}

const at = (h: number, m = 0) => new Date(2026, 2, 10, h, m);

describe('coachTip', () => {
  it('invites the first log of the day with the meal that fits the hour', () => {
    const tip = coachTip(day(), 'metric', at(8));
    expect(tip.id).toBe('start');
    expect(tip.action?.href).toContain('meal=breakfast');
    expect(coachTip(day(), 'metric', at(13)).action?.href).toContain('meal=lunch');
  });

  it('says a day closed within budget the next morning, not as a pop-up', () => {
    const tip = coachTip(day(), 'metric', at(8), DEFAULT_RHYTHM, { eaten: 1840, budget: 1990 });
    expect(tip.id).toBe('closed');
    expect(tip.title).toBe('Yesterday closed within budget');
    expect(tip.body).toBe("1,840 of 1,990 kcal. Today's budget is 2,000 kcal.");
    // The first-log action is still there.
    expect(tip.action?.href).toContain('meal=breakfast');
    // Over budget, or a half-logged day, is not called closed within budget.
    expect(coachTip(day(), 'metric', at(8), DEFAULT_RHYTHM, { eaten: 2100, budget: 1990 }).id).toBe('start');
    expect(coachTip(day(), 'metric', at(8), DEFAULT_RHYTHM, { eaten: 600, budget: 1990 }).id).toBe('start');
    // Once today has an entry the line moves on.
    expect(coachTip(day({ entries: [entry('breakfast')] }), 'metric', at(9), DEFAULT_RHYTHM, { eaten: 1840, budget: 1990 }).id).not.toBe('closed');
  });

  it('gives water left that adds up with the amount shown', () => {
    const tip = coachTip(day({ entries: [entry('breakfast'), entry('lunch')], waterMl: 1225, waterGoalMl: 3300, waterRemainingMl: 2075 }), 'metric', at(16));
    expect(tip.id).toBe('water');
    expect(tip.title).toBe('2.07 L of water to go');
  });

  it('asks about a meal only once its usual time has clearly passed and it is still missing', () => {
    const d = day({ entries: [entry('breakfast')] });
    expect(coachTip(d, 'metric', at(12, 30)).id).not.toBe('meal-lunch');
    expect(coachTip(d, 'metric', at(14)).id).toBe('meal-lunch');
    const withLunch = day({ entries: [entry('breakfast'), entry('lunch')] });
    expect(coachTip(withLunch, 'metric', at(14)).id).not.toBe('meal-lunch');
  });

  it("flags water only when well behind an even pace, in the user's units", () => {
    const d = day({
      entries: [entry('breakfast'), entry('lunch'), entry('dinner', 120)],
      waterMl: 300,
      waterRemainingMl: 2300,
    });
    const tip = coachTip(d, 'metric', at(16));
    expect(tip.id).toBe('water');
    expect(tip.title).toContain('2.3 L');
    expect(coachTip(d, 'imperial', at(16)).title).toContain('fl oz');
    // Early morning: being at 300 ml is not behind yet.
    expect(coachTip(d, 'metric', at(9)).id).not.toBe('water');
  });

  it('quotes the protein gap late in the day', () => {
    const d = day({
      entries: [entry('breakfast', 20), entry('lunch', 25), entry('dinner', 10)],
    });
    const tip = coachTip(d, 'metric', at(21, 30));
    expect(tip.id).toBe('protein');
    expect(tip.title).toBe('95 g of protein to go');
    expect(tip.quick).toEqual({ kind: 'fits' });
  });

  it('states an overage neutrally', () => {
    const d = day({
      entries: [entry('breakfast', 60), entry('lunch', 60), entry('dinner', 60)],
      remaining: -320,
    });
    const tip = coachTip(d, 'metric', at(22));
    expect(tip.id).toBe('over');
    expect(tip.title).toBe("320 kcal over today's budget");
    expect(`${tip.title} ${tip.body}`).not.toMatch(/fail|bad|cheat|guilt|!/i);
  });

  it('reports on track when nothing needs attention', () => {
    const d = day({
      entries: [entry('breakfast', 60), entry('lunch', 60), entry('dinner', 60)],
      activities: [{} as never],
    });
    const tip = coachTip(d, 'metric', at(22));
    expect(tip.id).toBe('on-track');
    expect(tip.tone).toBe('positive');
  });
});

describe('expectedWaterFraction', () => {
  it('runs from 0 at 07:00 to 1 at 22:00', () => {
    expect(expectedWaterFraction(6)).toBe(0);
    expect(expectedWaterFraction(7)).toBe(0);
    expect(expectedWaterFraction(14.5)).toBeCloseTo(0.5);
    expect(expectedWaterFraction(23)).toBe(1);
  });
});

describe('coachTip quick actions', () => {
  it('offers a one-tap glass on the water tip', () => {
    const tip = coachTip(
      day({
        entries: [entry('breakfast'), entry('lunch')],
        waterMl: 300,
        waterRemainingMl: 2300,
      }),
      'metric',
      at(15),
    );
    expect(tip.id).toBe('water');
    expect(tip.quick).toEqual({ kind: 'water' });
  });
  it('offers to repeat the meal that is due', () => {
    const tip = coachTip(day({ entries: [entry('breakfast')] }), 'metric', at(14));
    expect(tip.id).toBe('meal-lunch');
    expect(tip.quick).toEqual({ kind: 'repeat', meal: 'lunch' });
  });
  it('offers to repeat the current meal before the first log, but not a snack', () => {
    expect(coachTip(day(), 'metric', at(8)).quick).toEqual({
      kind: 'repeat',
      meal: 'breakfast',
    });
    expect(coachTip(day(), 'metric', at(22)).quick).toBeUndefined();
  });
});

describe("coachTip follows the user's own day", () => {
  const rhythm = (patch: Partial<CoachRhythm> & { lunch?: string } = {}): CoachRhythm => ({
    ...DEFAULT_RHYTHM,
    ...patch,
    meals: { ...DEFAULT_RHYTHM.meals, ...(patch.meals ?? {}), ...(patch.lunch ? { lunch: patch.lunch } : {}) },
  });

  it('asks about lunch from an hour after the stated lunch time, not a fixed one', () => {
    const d = day({ entries: [entry('breakfast')] });
    const late = rhythm({ lunch: '14:30' });
    expect(coachTip(d, 'metric', at(13, 30), late).id).not.toBe('meal-lunch');
    expect(coachTip(d, 'metric', at(15, 0), late).id).not.toBe('meal-lunch');
    expect(coachTip(d, 'metric', at(15, 30), late).id).toBe('meal-lunch');
    const early = rhythm({ lunch: '11:30' });
    expect(coachTip(d, 'metric', at(12, 30), early).id).toBe('meal-lunch');
  });

  it('stops asking about a meal once the next one is due', () => {
    const d = day({ entries: [entry('lunch'), entry('dinner')] });
    const r = rhythm({ meals: { breakfast: '08:00', lunch: '10:30', dinner: '19:00' } });
    expect(coachTip(d, 'metric', at(9, 30), r).id).toBe('meal-breakfast');
    expect(coachTip(d, 'metric', at(11, 0), r).id).not.toBe('meal-breakfast');
  });

  it('reads the waking day from quiet hours, across midnight for a night shift', () => {
    const night = rhythmFromReminders({
      quietStart: '09:00',
      quietEnd: '17:00',
      meals: { breakfast: '17:30', lunch: '00:30', dinner: '06:00' },
    });
    // The log restarts at midnight, so the pace counts the waking hours of the date so far:
    // 00:00 to 09:00 at the end of one shift, then from 17:00 at the start of the next.
    expect(expectedWaterFraction(0.5, night)).toBeCloseTo(0.5 / 16);
    expect(expectedWaterFraction(8.5, night)).toBeCloseTo(8.5 / 16);
    expect(expectedWaterFraction(16, night)).toBeCloseTo(9 / 16);
    expect(expectedWaterFraction(20, night)).toBeCloseTo(12 / 16);
    const d = day({
      entries: [entry('breakfast'), entry('lunch'), entry('dinner', 120)],
      waterMl: 300,
      waterRemainingMl: 2300,
    });
    // At 08:00 a day worker has barely started; the night worker is eight waking hours into the date.
    expect(coachTip(d, 'metric', at(8)).id).not.toBe('water');
    expect(coachTip(d, 'metric', at(8), night).id).toBe('water');
    // Two hours after midnight nobody is "behind" on a log that started two hours ago.
    expect(coachTip(d, 'metric', at(2), night).id).not.toBe('water');
    expect(coachTip(d, 'metric', at(0, 30)).id).not.toBe('water');
    expect(expectedWaterFraction(0.5)).toBe(0);
    // Lunch at 00:30 is due from 01:30.
    const noLunch = day({ entries: [entry('breakfast')], waterMl: 2600, waterRemainingMl: 0 });
    expect(coachTip(noLunch, 'metric', at(1, 45), night).id).toBe('meal-lunch');
    expect(coachTip(noLunch, 'metric', at(23, 0), night).id).not.toBe('meal-lunch');
  });

  it('picks the first meal of the day from the stated times', () => {
    const r = rhythm({ meals: { breakfast: '10:00', lunch: '15:00', dinner: '20:00' } });
    expect(coachTip(day(), 'metric', at(12), r).action?.href).toContain('meal=breakfast');
    expect(coachTip(day(), 'metric', at(14), r).action?.href).toContain('meal=lunch');
  });

  it('falls back to the defaults when a time does not parse', () => {
    const r = rhythm({ wake: 'nope', sleep: '' });
    expect(expectedWaterFraction(14.5, r)).toBeCloseTo(0.5);
  });

  it('only suggests activity that counts toward weekly minutes', () => {
    const d = day({ entries: [entry('breakfast', 60), entry('lunch', 60), entry('dinner', 60)] });
    const tip = coachTip(d, 'metric', at(21));
    expect(tip.id).toBe('move');
    expect(tip.body).toMatch(/brisk/);
  });
});
