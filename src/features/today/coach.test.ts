import { describe, expect, it } from 'vitest';

import type { DaySummary } from '@/store/selectors';
import type { FoodEntry } from '@/types';

import { coachTip, expectedWaterFraction } from './coach';

const entry = (meal: FoodEntry['meal'], protein = 20): FoodEntry =>
  ({ id: meal, meal, name: meal, nutrients: { kcal: 400, protein, carbs: 40, fat: 10 } }) as FoodEntry;

function day(patch: Partial<DaySummary> = {}): DaySummary {
  const entries = patch.entries ?? [];
  const byMeal: DaySummary['byMeal'] = { breakfast: [], lunch: [], dinner: [], snack: [] };
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
    macros: { proteinG: 150, carbsG: 200, fatG: 60, fiberG: 28, split: { protein: 0.3, carbs: 0.4, fat: 0.3 } },
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

  it('asks about a meal only once its usual time has clearly passed and it is still missing', () => {
    const d = day({ entries: [entry('breakfast')] });
    expect(coachTip(d, 'metric', at(12, 30)).id).not.toBe('meal-lunch');
    expect(coachTip(d, 'metric', at(14)).id).toBe('meal-lunch');
    const withLunch = day({ entries: [entry('breakfast'), entry('lunch')] });
    expect(coachTip(withLunch, 'metric', at(14)).id).not.toBe('meal-lunch');
  });

  it('flags water only when well behind an even pace, in the user\'s units', () => {
    const d = day({ entries: [entry('breakfast'), entry('lunch'), entry('dinner', 120)], waterMl: 300, waterRemainingMl: 2300 });
    const tip = coachTip(d, 'metric', at(16));
    expect(tip.id).toBe('water');
    expect(tip.title).toContain('2.3 L');
    expect(coachTip(d, 'imperial', at(16)).title).toContain('fl oz');
    // Early morning: being at 300 ml is not behind yet.
    expect(coachTip(d, 'metric', at(9)).id).not.toBe('water');
  });

  it('quotes the protein gap late in the day', () => {
    const d = day({ entries: [entry('breakfast', 20), entry('lunch', 25), entry('dinner', 10)] });
    const tip = coachTip(d, 'metric', at(21, 30));
    expect(tip.id).toBe('protein');
    expect(tip.title).toBe('95 g of protein to go');
  });

  it('states an overage neutrally', () => {
    const d = day({ entries: [entry('breakfast', 60), entry('lunch', 60), entry('dinner', 60)], remaining: -320 });
    const tip = coachTip(d, 'metric', at(22));
    expect(tip.id).toBe('over');
    expect(tip.title).toBe('320 kcal over today\'s budget');
    expect(`${tip.title} ${tip.body}`).not.toMatch(/fail|bad|cheat|guilt|!/i);
  });

  it('reports on track when nothing needs attention', () => {
    const d = day({ entries: [entry('breakfast', 60), entry('lunch', 60), entry('dinner', 60)], activities: [{} as never] });
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
