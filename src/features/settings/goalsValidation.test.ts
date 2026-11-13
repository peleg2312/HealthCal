import { describe, expect, it } from 'vitest';

import { birthDateError, customSplitError, heightError, rateForGoal, targetWeightError } from './goalsValidation';
import { calorieTarget, formulaTdee } from '@/lib/energy';
import type { Profile } from '@/types';

const NOW = new Date(2026, 10, 13, 12);

describe('birthDateError', () => {
  it('accepts a real date in range', () => {
    expect(birthDateError('1990-04-21', NOW)).toBeNull();
  });
  it('rejects dates that roll over', () => {
    expect(birthDateError('1990-02-31', NOW)).toMatch(/does not exist/);
    expect(birthDateError('1990-13-40', NOW)).toMatch(/does not exist/);
  });
  it('rejects the wrong format and the future', () => {
    expect(birthDateError('21/04/1990', NOW)).toMatch(/format/);
    expect(birthDateError('2027-01-01', NOW)).toMatch(/future/);
  });
  it('uses the onboarding age range of 16 to 100', () => {
    expect(birthDateError('2012-01-01', NOW)).toMatch(/16 and over/);
    expect(birthDateError('2010-11-13', NOW)).toBeNull();
    expect(birthDateError('1920-01-01', NOW)).toMatch(/100 years/);
  });
});

describe('targetWeightError', () => {
  it('rejects impossible weights', () => {
    expect(targetWeightError('lose', 80, 1, 'metric')).toMatch(/between 35 kg and 300 kg/);
    expect(targetWeightError('gain', 80, 900, 'metric')).toMatch(/between/);
    expect(targetWeightError('lose', 80, 0.5 / 2.20462, 'imperial')).toMatch(/lb/);
  });
  it('needs a 0.2 kg margin on the right side', () => {
    expect(targetWeightError('lose', 80, 79.9, 'metric')).toMatch(/below/);
    expect(targetWeightError('lose', 80, 79.8, 'metric')).toBeNull();
    expect(targetWeightError('gain', 80, 80.1, 'metric')).toMatch(/above/);
    expect(targetWeightError('gain', 80, 85, 'metric')).toBeNull();
  });
  it('allows no target and ignores maintain', () => {
    expect(targetWeightError('lose', 80, undefined, 'metric')).toBeNull();
    expect(targetWeightError('maintain', 80, 1, 'metric')).toBeNull();
  });
});

describe('customSplitError', () => {
  it('rejects negative parts even when they add to 100', () => {
    expect(customSplitError({ protein: 110, carbs: -10, fat: 0 })).toMatch(/between 0 and 100/);
  });
  it('asks for at least 10% protein', () => {
    expect(customSplitError({ protein: 5, carbs: 60, fat: 35 })).toMatch(/protein/);
  });
  it('reports the total when it is off', () => {
    expect(customSplitError({ protein: 30, carbs: 40, fat: 20 })).toBe('Total 90%, add 10 to reach 100%.');
    expect(customSplitError({ protein: 30, carbs: 40, fat: 30 })).toBeNull();
  });
});

describe('rateForGoal', () => {
  const woman: Profile = {
    sex: 'female',
    birthDate: '1990-01-01',
    heightCm: 170,
    weightKg: 80,
    activityLevel: 'sedentary',
    goal: 'maintain',
    weeklyRateKg: 0,
    units: 'metric',
    eatBackExercise: true,
    useAdaptiveTdee: false,
    updatedAt: '',
  } as unknown as Profile;

  it('gives a pace when switching from maintain, so the plan has a deficit', () => {
    const rate = rateForGoal('lose', 0, 80);
    expect(rate).toBe(0.5);
    const p = { ...woman, goal: 'lose' as const, weeklyRateKg: rate };
    expect(calorieTarget(p).target).toBeLessThan(Math.round(formulaTdee(p) / 10) * 10);
    expect(rateForGoal('gain', 0, 80)).toBe(0.25);
  });
  it('keeps a set pace and clamps it to the new maximum', () => {
    expect(rateForGoal('lose', 0.3, 80)).toBe(0.3);
    expect(rateForGoal('gain', 0.8, 80)).toBeCloseTo(0.4, 6);
  });
});

describe('heightError', () => {
  it('writes the range in the user units', () => {
    expect(heightError(66, 'imperial')).toBe('Enter a height between 3\'4" and 8\'2".');
    expect(heightError(290, 'metric')).toBe('Enter a height between 100 and 250 cm.');
    expect(heightError(170, 'imperial')).toBeNull();
  });
});
