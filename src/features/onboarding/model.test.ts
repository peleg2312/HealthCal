import { describe, expect, it } from 'vitest';

import { buildPlan, convertUnits, emptyDraft, stepsFor, validateStep, type Draft } from './model';

const NOW = new Date(2026, 10, 13, 12);

function draft(patch: Partial<Draft> = {}): Draft {
  return {
    ...emptyDraft(),
    units: 'metric',
    name: 'Maya',
    goal: 'lose',
    sex: 'female',
    dobDay: 14,
    dobMonth: 2,
    dobYear: 1990,
    heightCm: 165,
    weight: 72,
    bodyFatMode: 'unknown',
    activity: 'light',
    target: 64,
    ...patch,
  };
}

describe('onboarding model', () => {
  it('skips the target step for maintain', () => {
    expect(stepsFor('maintain')).not.toContain('target');
    expect(stepsFor('lose')).toContain('target');
  });

  it('rejects impossible dates and under-age birth dates', () => {
    expect(validateStep('about', draft({ dobDay: 31, dobMonth: 2 }), NOW).dob).toMatch(/does not exist/);
    expect(validateStep('about', draft({ dobYear: 2015 }), NOW).dob).toMatch(/aged 16/);
    expect(validateStep('about', draft(), NOW)).toEqual({});
  });

  it('needs a lower target to lose weight', () => {
    expect(validateStep('target', draft({ target: 80 }), NOW).target).toBeTruthy();
    expect(validateStep('target', draft(), NOW)).toEqual({});
  });

  it('builds a metric profile from imperial input', () => {
    const d = draft({ units: 'imperial', heightFt: 5, heightIn: 5, weight: 160, target: 140 });
    const plan = buildPlan(d, NOW)!;
    expect(plan.profile.heightCm).toBeCloseTo(165.1, 1);
    expect(plan.profile.weightKg).toBeCloseTo(72.57, 2);
    expect(plan.profile.targetWeightKg).toBeCloseTo(63.5, 1);
  });

  it('uses Katch-McArdle only when body fat is given', () => {
    expect(buildPlan(draft(), NOW)!.bmrMethod).toBe('mifflin-st-jeor');
    expect(buildPlan(draft({ bodyFatMode: 'direct', bodyFatPct: 28 }), NOW)!.bmrMethod).toBe('katch-mcardle');
    // An entered value is ignored once the person switches back to "I don't know".
    expect(buildPlan(draft({ bodyFatMode: 'unknown', bodyFatPct: 28 }), NOW)!.profile.bodyFatPct).toBeUndefined();
  });

  it('reports when the calorie floor limits the pace', () => {
    const plan = buildPlan(draft({ weight: 55, target: 50, activity: 'sedentary', weeklyRateKg: 0.55 }), NOW)!;
    expect(plan.target.limitedByFloor).toBe(true);
    expect(plan.target.target).toBe(1200);
  });

  it('keeps typed values when switching units', () => {
    const imp = convertUnits(draft(), 'imperial');
    expect(imp.weight).toBeCloseTo(158.7, 1);
    expect(imp.heightFt).toBe(5);
    expect(convertUnits(imp, 'metric').weight).toBeCloseTo(72, 0);
  });
});
