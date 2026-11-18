import { describe, expect, it } from 'vitest';

import { dayFacts, isNothing, isOverBand, type DayFactsSource } from './facts';

const base: DayFactsSource = {
  date: '2026-11-18',
  entries: [{ source: 'reference' as never }],
  eaten: { kcal: 2095, protein: 159 },
  budget: 2190,
  macros: { proteinG: 152 },
  waterMl: 3400,
  waterGoalMl: 3300,
  waterEntries: [{}],
  activities: [{ name: 'Volleyball', emoji: '🏐', durationMin: 75, met: 4, intensity: 'moderate' }],
};
const src = (patch: Partial<DayFactsSource>) => ({ ...base, ...patch });

describe('dayFacts', () => {
  it('case A: a complete day inside its budget', () => {
    const f = dayFacts(base);
    expect(f).toMatchObject({
      date: '2026-11-18',
      foodLogged: true,
      complete: true,
      overBand: false,
      approx: false,
      kcal: 2095,
      budget: 2190,
      protein: 159,
      proteinG: 152,
      waterMl: 3400,
      waterGoalMl: 3300,
      hasWater: true,
      guidelineMin: 75,
    });
    expect(f.activities).toEqual([{ name: 'Volleyball', emoji: '🏐', durationMin: 75 }]);
  });

  it('exactly 110% is inside the band, a kcal more is over it', () => {
    expect(dayFacts(src({ eaten: { kcal: 2409, protein: 100 } })).overBand).toBe(false);
    expect(dayFacts(src({ eaten: { kcal: 2410, protein: 100 } })).overBand).toBe(true);
    expect(dayFacts(src({ eaten: { kcal: 2200, protein: 100 }, budget: 2000 })).overBand).toBe(false);
  });

  it('a part-logged day is never over the band, and a zero budget never is', () => {
    expect(isOverBand(false, 5000, 2000)).toBe(false);
    expect(isOverBand(true, 5000, 0)).toBe(false);
  });

  it('0 kcal entries: food logged, not complete', () => {
    const f = dayFacts(src({ eaten: { kcal: 0, protein: 0 } }));
    expect(f.foodLogged).toBe(true);
    expect(f.complete).toBe(false);
  });

  it('approx from the entries, or as given', () => {
    expect(dayFacts(src({ entries: [{ source: 'ai' as never }] })).approx).toBe(true);
    expect(dayFacts(src({ entries: [{ source: 'reference' as never, kcalRange: [300, 400] as never }] })).approx).toBe(true);
    expect(dayFacts(base, true).approx).toBe(true);
  });

  it('guideline minutes use the shared rule (hard and 6 MET or more counts double, under 3 MET none)', () => {
    const f = dayFacts(
      src({
        activities: [
          { name: 'Run', emoji: '🏃', durationMin: 30, met: 9, intensity: 'vigorous' },
          { name: 'Stretch', emoji: '🧘', durationMin: 20, met: 2.3, intensity: 'light' },
        ],
      }),
    );
    expect(f.guidelineMin).toBe(60);
  });

  it('isNothing: no food, no activity and no water', () => {
    expect(isNothing(dayFacts(src({ entries: [], eaten: { kcal: 0, protein: 0 }, activities: [], waterEntries: [], waterMl: 0 })))).toBe(true);
    expect(isNothing(dayFacts(src({ entries: [], eaten: { kcal: 0, protein: 0 }, activities: [], waterMl: 1200 })))).toBe(false);
    expect(isNothing(dayFacts(src({ entries: [], eaten: { kcal: 0, protein: 0 }, waterEntries: [] })))).toBe(false);
  });
});
