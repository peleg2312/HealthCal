import { describe, expect, it } from 'vitest';

import { buildPlan, convertUnits, emptyDraft, heightRangeText, stepsFor, validateStep, weightRangeText, type Draft } from './model';

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

  it('asks sex and date of birth one at a time', () => {
    expect(stepsFor('lose').slice(0, 4)).toEqual(['basics', 'goal', 'sex', 'about']);
    expect(validateStep('sex', draft({ sex: null }), NOW).sex).toBeTruthy();
    expect(validateStep('sex', draft(), NOW)).toEqual({});
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

  it('reports the floor that applies when expenditure is already below the minimum', () => {
    const plan = buildPlan(draft({ weight: 40, heightCm: 150, dobYear: 1955, activity: 'sedentary', target: 38 }), NOW)!;
    expect(plan.target.belowFloor).toBe(true);
    expect(plan.floor).toBe(plan.target.target);
    expect(plan.floor).toBeLessThan(1200);
    expect(buildPlan(draft({ weight: 55, target: 50, activity: 'sedentary', weeklyRateKg: 0.55 }), NOW)!.floor).toBe(1200);
  });

  it('asks about the day, then the look, before the plan for every goal', () => {
    expect(stepsFor('lose').slice(-3)).toEqual(['routine', 'theme', 'plan']);
    expect(stepsFor('maintain').slice(-3)).toEqual(['routine', 'theme', 'plan']);
    expect(validateStep('theme', draft(), NOW)).toEqual({});
    expect(validateStep('routine', draft(), NOW)).toEqual({});
  });

  it('keeps typed values when switching units', () => {
    const imp = convertUnits(draft(), 'imperial');
    expect(imp.weight).toBeCloseTo(158.7, 1);
    expect(imp.heightFt).toBe(5);
    expect(convertUnits(imp, 'metric').weight).toBeCloseTo(72, 0);
  });
});

describe('stated limits', () => {
  it('accepts the imperial bounds it states', () => {
    const body = (p: Partial<Draft>) => validateStep('body', draft({ units: 'imperial', heightFt: 5, heightIn: 6, weight: 150, ...p }), NOW);
    expect(heightRangeText('imperial')).toBe(`4'0" and 7'6"`);
    expect(weightRangeText('imperial')).toBe('78 and 661 lb');
    expect(body({ heightFt: 4, heightIn: 0 })).toEqual({});
    expect(body({ heightFt: 7, heightIn: 6 })).toEqual({});
    expect(body({ weight: 78 })).toEqual({});
    expect(body({ weight: 661 })).toEqual({});
    // Just outside, the error repeats the same text.
    expect(body({ heightFt: 3, heightIn: 11 }).height).toContain(heightRangeText('imperial'));
    expect(body({ weight: 77 }).weight).toContain(weightRangeText('imperial'));
  });

  it('states metric limits exactly', () => {
    expect(heightRangeText('metric')).toBe('120 and 230 cm');
    expect(weightRangeText('metric')).toBe('35 and 300 kg');
  });
});
