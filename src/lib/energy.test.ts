import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Profile } from '@/types';

import {
  ACTIVITY_FACTORS,
  bmr,
  bmrKatchMcArdle,
  bmrMifflin,
  calorieFloor,
  calorieTarget,
  fiberTarget,
  formulaTdee,
  isPlausibleBodyFat,
  leanMassKg,
  macroTargets,
  maxWeeklyRateKg,
  normalizeSplit,
  projectedGoalDate,
  proteinReferenceWeightKg,
} from './energy';

// Fixed "now" so age is deterministic: 2026-06-15 local noon.
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 5, 15, 12, 0, 0));
});
afterEach(() => vi.useRealTimers());

/** Male, 80 kg, 180 cm, born 1996-06-15 -> exactly 30 on the fake "today". */
const man: Profile = {
  name: 'T',
  sex: 'male',
  birthDate: '1996-06-15',
  heightCm: 180,
  weightKg: 80,
  activityLevel: 'moderate',
  goal: 'maintain',
  weeklyRateKg: 0,
  units: 'metric',
  eatBackExercise: true,
  useAdaptiveTdee: true,
  updatedAt: '2026-01-01T00:00:00Z',
};
/** Female, 60 kg, 165 cm, 25 years. */
const woman: Profile = {
  ...man,
  sex: 'female',
  birthDate: '2001-06-15',
  heightCm: 165,
  weightKg: 60,
  activityLevel: 'sedentary',
};

describe('BMR equations', () => {
  it('Mifflin-St Jeor, male: 10*80 + 6.25*180 - 5*30 + 5 = 800+1125-150+5 = 1780', () => {
    expect(bmrMifflin('male', 80, 180, 30)).toBeCloseTo(1780, 6);
  });
  it('Mifflin-St Jeor, female: 600 + 1031.25 - 125 - 161 = 1345.25', () => {
    expect(bmrMifflin('female', 60, 165, 25)).toBeCloseTo(1345.25, 6);
  });
  it('Katch-McArdle: 80 kg at 15% -> lean 68 kg -> 370 + 21.6*68 = 1838.8', () => {
    expect(leanMassKg(80, 15)).toBeCloseTo(68, 9);
    expect(bmrKatchMcArdle(80, 15)).toBeCloseTo(1838.8, 6);
  });
  it('plausible body fat window is 3..60 inclusive', () => {
    expect(isPlausibleBodyFat(undefined)).toBe(false);
    expect(isPlausibleBodyFat(2.9)).toBe(false);
    expect(isPlausibleBodyFat(3)).toBe(true);
    expect(isPlausibleBodyFat(60)).toBe(true);
    expect(isPlausibleBodyFat(60.1)).toBe(false);
    expect(isPlausibleBodyFat(NaN)).toBe(false);
  });
});

describe('bmr()', () => {
  it('uses Mifflin without body fat', () => {
    expect(bmr(man)).toEqual({ kcal: 1780, method: 'mifflin-st-jeor' });
  });
  it('uses Katch-McArdle when inside the +-15% band: 1838.8 within [1513, 2047]', () => {
    const r = bmr({ ...man, bodyFatPct: 15 });
    expect(r.method).toBe('katch-mcardle');
    expect(r.kcal).toBeCloseTo(1838.8, 6);
  });
  it('clamps a very high body fat entry to Mifflin * 0.85', () => {
    // BF 60%: lean 32 -> 370 + 691.2 = 1061.2, below 1780*0.85 = 1513
    const r = bmr({ ...man, bodyFatPct: 60 });
    expect(r.kcal).toBeCloseTo(1513, 6);
    expect(r.method).toBe('katch-mcardle');
  });
  it('clamps a very lean entry to Mifflin * 1.15', () => {
    // 80 kg, 150 cm, 30 y male: 800 + 937.5 - 150 + 5 = 1592.5; BF 3% -> lean 77.6 -> 370+1676.16 = 2046.16
    // upper bound 1592.5 * 1.15 = 1831.375
    const p = { ...man, heightCm: 150, bodyFatPct: 3 };
    expect(bmrMifflin('male', 80, 150, 30)).toBeCloseTo(1592.5, 6);
    expect(bmr(p).kcal).toBeCloseTo(1831.375, 6);
  });
  it('ignores an implausible body fat (2%) and says so via the method', () => {
    expect(bmr({ ...man, bodyFatPct: 2 })).toEqual({ kcal: 1780, method: 'mifflin-st-jeor' });
  });
  it('age turns over on the birthday: the day before is still 29', () => {
    vi.setSystemTime(new Date(2026, 5, 14, 12));
    // 29 y: 800+1125-145+5 = 1785
    expect(bmr(man).kcal).toBeCloseTo(1785, 6);
  });
});

describe('activity factors and TDEE', () => {
  it('has the five standard Harris-Benedict factors', () => {
    expect(ACTIVITY_FACTORS).toEqual({ sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, athlete: 1.9 });
  });
  it('formulaTdee = 1780 * 1.55 = 2759', () => {
    expect(formulaTdee(man)).toBeCloseTo(2759, 6);
  });
  it('formulaTdee for the sedentary woman = 1345.25 * 1.2 = 1614.3', () => {
    expect(formulaTdee(woman)).toBeCloseTo(1614.3, 6);
  });
  it('factors are strictly increasing', () => {
    const v = Object.values(ACTIVITY_FACTORS);
    for (let i = 1; i < v.length; i++) expect(v[i]).toBeGreaterThan(v[i - 1]);
  });
});

describe('floor and pace cap', () => {
  it('floors are 1500 male / 1200 female', () => {
    expect(calorieFloor('male')).toBe(1500);
    expect(calorieFloor('female')).toBe(1200);
  });
  it('max weekly rate: 1% loss, 0.5% gain, 0 maintain', () => {
    expect(maxWeeklyRateKg('lose', 80)).toBeCloseTo(0.8, 9);
    expect(maxWeeklyRateKg('gain', 80)).toBeCloseTo(0.4, 9);
    expect(maxWeeklyRateKg('maintain', 80)).toBe(0);
  });
});

describe('calorieTarget', () => {
  const tdee = 2759;
  it('lose 0.5 kg/week: delta = -0.5*7700/7 = -550 -> raw 2209 -> 2210', () => {
    const t = calorieTarget({ ...man, goal: 'lose', weeklyRateKg: 0.5 }, tdee);
    expect(t.dailyDelta).toBeCloseTo(-550, 6);
    expect(t.target).toBe(2210);
    expect(t.impliedWeeklyKg).toBeCloseTo(-0.5, 6);
    expect(t.limitedByFloor).toBe(false);
    expect(t.source).toBe('calculated');
  });
  it('lose request above the cap is capped at 1% of weight (0.8 kg): -880 -> 1879 -> 1880', () => {
    const t = calorieTarget({ ...man, goal: 'lose', weeklyRateKg: 2 }, tdee);
    expect(t.dailyDelta).toBeCloseTo(-880, 6);
    expect(t.target).toBe(1880);
    expect(t.impliedWeeklyKg).toBeCloseTo(-0.8, 6);
  });
  it('gain 0.25 kg/week: +275 -> 3034 -> 3030', () => {
    const t = calorieTarget({ ...man, goal: 'gain', weeklyRateKg: 0.25 }, tdee);
    expect(t.dailyDelta).toBeCloseTo(275, 6);
    expect(t.target).toBe(3030);
  });
  it('gain request above the 0.5% cap (0.4 kg): +440 -> 3199 -> 3200', () => {
    const t = calorieTarget({ ...man, goal: 'gain', weeklyRateKg: 1 }, tdee);
    expect(t.dailyDelta).toBeCloseTo(440, 6);
    expect(t.target).toBe(3200);
  });
  it('maintain ignores weeklyRateKg and returns TDEE rounded to 10', () => {
    const t = calorieTarget({ ...man, goal: 'maintain', weeklyRateKg: 0.5 }, tdee);
    expect(t.dailyDelta).toBe(0);
    expect(t.target).toBe(2760);
  });
  it('negative weeklyRateKg is treated by magnitude', () => {
    const t = calorieTarget({ ...man, goal: 'lose', weeklyRateKg: -0.5 }, tdee);
    expect(t.dailyDelta).toBeCloseTo(-550, 6);
  });
  it('defaults tdee to the formula', () => {
    expect(calorieTarget(man).tdee).toBeCloseTo(2759, 6);
  });
  it('the floor stops a deep deficit: woman TDEE 1614.3, lose 0.6 -> raw 954.3 -> floor 1200', () => {
    const p = { ...woman, goal: 'lose' as const, weeklyRateKg: 0.6 };
    const t = calorieTarget(p);
    expect(t.target).toBe(1200);
    expect(t.limitedByFloor).toBe(true);
    expect(t.dailyDelta).toBeCloseTo(1200 - 1614.3, 6);
  });
  it('male floor 1500 applies to men', () => {
    const t = calorieTarget({ ...man, goal: 'lose', weeklyRateKg: 0.8 }, 1800); // raw 1800-880 = 920
    expect(t.target).toBe(1500);
    expect(t.limitedByFloor).toBe(true);
  });
  it('a TDEE already below the floor never gets a deficit (target = TDEE)', () => {
    const t = calorieTarget({ ...woman, goal: 'lose', weeklyRateKg: 0.5 }, 1000);
    expect(t.target).toBe(1000);
    expect(t.dailyDelta).toBeCloseTo(0, 9);
    expect(t.limitedByFloor).toBe(true);
  });
  it('maintain at a low TDEE is not "limited by floor"', () => {
    const t = calorieTarget({ ...woman, goal: 'maintain' }, 1000);
    expect(t.limitedByFloor).toBe(false);
  });
  it('gain below the floor is not clamped upward past TDEE+delta', () => {
    const t = calorieTarget({ ...woman, goal: 'gain', weeklyRateKg: 0.3 }, 1000);
    // +0.3 kg is below the 0.5% cap (0.3 kg) -> +330 -> 1330
    expect(t.target).toBe(1330);
  });
  it('manual override replaces the calculation', () => {
    const t = calorieTarget({ ...man, goal: 'lose', weeklyRateKg: 0.5, calorieTargetOverride: 2000.4 }, tdee);
    expect(t.source).toBe('override');
    expect(t.target).toBe(2000);
    expect(t.dailyDelta).toBeCloseTo(2000.4 - tdee, 6);
    expect(t.limitedByFloor).toBe(false);
    expect(t.impliedWeeklyKg).toBeCloseTo(((2000.4 - tdee) * 7) / 7700, 9);
  });
  it('override of 0 or negative is ignored', () => {
    expect(calorieTarget({ ...man, calorieTargetOverride: 0 }, tdee).source).toBe('calculated');
    expect(calorieTarget({ ...man, calorieTargetOverride: -5 }, tdee).source).toBe('calculated');
  });
  it('an override below the floor is honoured (user choice) and not flagged', () => {
    const t = calorieTarget({ ...woman, calorieTargetOverride: 900 }, 1614.3);
    expect(t.target).toBe(900);
  });
});

describe('proteinReferenceWeightKg', () => {
  it('normal BMI uses total weight (80 kg / 180 cm = BMI 24.7)', () => {
    expect(proteinReferenceWeightKg({ weightKg: 80, heightCm: 180 })).toBe(80);
  });
  it('BMI exactly 27.5 still uses total weight; above it uses weight at BMI 25', () => {
    const h = 200; // m^2 = 4
    expect(proteinReferenceWeightKg({ weightKg: 110, heightCm: h })).toBe(110); // BMI 27.5
    expect(proteinReferenceWeightKg({ weightKg: 111, heightCm: h })).toBeCloseTo(100, 9); // 25*4
  });
  it('high BMI 100 kg / 170 cm: 25 * 1.7^2 = 72.25', () => {
    expect(proteinReferenceWeightKg({ weightKg: 100, heightCm: 170 })).toBeCloseTo(72.25, 9);
  });
  it('with body fat: lean mass / 0.85, never above weight', () => {
    // 100 kg, 35% -> lean 65 -> 76.47
    expect(proteinReferenceWeightKg({ weightKg: 100, heightCm: 170, bodyFatPct: 35 })).toBeCloseTo(65 / 0.85, 9);
    // 100 kg, 10% -> lean 90 -> 105.9 -> capped at 100
    expect(proteinReferenceWeightKg({ weightKg: 100, heightCm: 190, bodyFatPct: 10 })).toBe(100);
  });
  it('a lean person (BMI 20) keeps their own weight', () => {
    expect(proteinReferenceWeightKg({ weightKg: 65, heightCm: 180 })).toBe(65);
  });
});

describe('macroTargets (default split)', () => {
  it('lose, 2000 kcal, 80 kg: protein 2.0*80 = 160 g, fat 28% = 62.2 g, carbs the rest = 200 g', () => {
    // 160*4 = 640; 2000*0.28 = 560 kcal fat; remaining 800 kcal -> 200 g carbs
    const m = macroTargets({ ...man, goal: 'lose' }, 2000);
    expect(m.proteinG).toBe(160);
    expect(m.fatG).toBe(62);
    expect(m.carbsG).toBe(200);
    expect(m.split.protein).toBeCloseTo(0.32, 9);
    expect(m.split.carbs).toBeCloseTo(0.4, 9);
    expect(m.split.fat).toBeCloseTo(0.28, 9);
    expect(m.fiberG).toBe(28);
  });
  it('maintain uses 1.6 g/kg, gain 1.8 g/kg', () => {
    expect(macroTargets({ ...man, goal: 'maintain' }, 2500).proteinG).toBe(128);
    expect(macroTargets({ ...man, goal: 'gain' }, 3000).proteinG).toBe(144);
  });
  it('high BMI person: protein is scaled to the BMI-25 weight (72.25 kg), not 100 kg', () => {
    const p = { ...man, weightKg: 100, heightCm: 170, goal: 'lose' as const };
    const m = macroTargets(p, 2200);
    // protein 2*72.25 = 144.5 -> 145 (round half up) ; fat 2200*.28/9 = 68.44 ; carbs (2200-578-616)/4 = 251.5
    expect(Math.abs(m.proteinG - 144.5)).toBeLessThanOrEqual(0.5);
    expect(m.fatG).toBe(68);
    expect(Math.abs(m.carbsG - 251.5)).toBeLessThanOrEqual(0.5); // exactly .5 up to float noise
  });
  it('lean muscular person with known body fat: reference stays at total weight', () => {
    const m = macroTargets({ ...man, weightKg: 100, heightCm: 190, bodyFatPct: 10, goal: 'gain' }, 3500);
    expect(m.proteinG).toBe(180); // 1.8 * 100
  });
  it('protein clamps to 40% of a very low budget: 1400 kcal -> 140 g, not 160', () => {
    const m = macroTargets({ ...man, goal: 'lose' }, 1400);
    expect(m.proteinG).toBe(140);
  });
  it('protein clamps up to 15% on a huge budget: 5000 kcal, lean 50 kg maintain: 80 g -> 187.5 g', () => {
    const p = { ...man, weightKg: 50, heightCm: 170, goal: 'maintain' as const };
    expect(macroTargets(p, 5000).proteinG).toBe(Math.round((5000 * 0.15) / 4));
  });
  it('fat never below 0.6 g/kg: 1400 kcal, 80 kg -> 28% would be 43.6 g, floor is 48 g', () => {
    const m = macroTargets({ ...man, goal: 'lose' }, 1400);
    expect(m.fatG).toBe(48);
    // protein 140 g (560 kcal) + fat 48 (432) leaves 408 kcal = 102 g carbs
    expect(m.carbsG).toBe(102);
  });
  it('low-carb guard: carbs never below 50 g and fat gives way', () => {
    // 100 kg / 200 cm (BMI 25), lose, 1200 kcal. Protein 200 -> clamp 40% = 120 g (480 kcal).
    // fat = max(37.3, 60) = 60 g -> remaining 180 kcal = 45 g carbs < 50 -> carbs 50 g,
    // fat = (1200-480-200)/9 = 57.8 g.
    const m = macroTargets({ ...man, weightKg: 100, heightCm: 200, goal: 'lose' }, 1200);
    expect(m.proteinG).toBe(120);
    expect(m.carbsG).toBe(50);
    expect(m.fatG).toBe(58);
    expect(m.proteinG * 4 + m.carbsG * 4 + m.fatG * 9).toBeLessThanOrEqual(1200 + 9);
  });
  it('macro calories add up to the budget (within rounding) across profiles', () => {
    const cases: [Partial<Profile>, number][] = [
      [{ goal: 'lose' }, 2000],
      [{ goal: 'maintain' }, 2600],
      [{ goal: 'gain' }, 3200],
      [{ goal: 'lose', weightKg: 100, heightCm: 170 }, 2200],
      [{ goal: 'maintain', sex: 'female', weightKg: 60, heightCm: 165 }, 1800],
      [{ goal: 'gain', weightKg: 70, heightCm: 185, bodyFatPct: 12 }, 3400],
    ];
    for (const [patch, kcal] of cases) {
      const m = macroTargets({ ...man, ...patch }, kcal);
      const total = m.proteinG * 4 + m.carbsG * 4 + m.fatG * 9;
      // rounding each of three numbers moves the total by at most 0.5*4+0.5*4+0.5*9 = 8.5
      expect(Math.abs(total - kcal)).toBeLessThanOrEqual(8.5);
      expect(m.split.protein + m.split.carbs + m.split.fat).toBeCloseTo(1, 9);
    }
  });
  it('fibre is 14 g per 1000 kcal', () => {
    expect(fiberTarget(2000)).toBe(28);
    expect(fiberTarget(1800)).toBe(25); // 25.2
  });
});

describe('macroTargets (custom split)', () => {
  it('uses the split and converts with 4/4/9: 30/40/30 of 2000 -> 150, 200, 66.7 g', () => {
    const m = macroTargets({ ...man, macroSplitOverride: { protein: 0.3, carbs: 0.4, fat: 0.3 } }, 2000);
    expect([m.proteinG, m.carbsG, m.fatG]).toEqual([150, 200, 67]);
  });
  it('normalises a split that does not sum to 1: 1:1:2 -> 25/25/50', () => {
    const m = macroTargets({ ...man, macroSplitOverride: { protein: 1, carbs: 1, fat: 2 } }, 2000);
    expect(m.split).toEqual({ protein: 0.25, carbs: 0.25, fat: 0.5 });
    expect([m.proteinG, m.carbsG, m.fatG]).toEqual([125, 125, 111]);
  });
  it('normalizeSplit of all zeros does not produce NaN', () => {
    const s = normalizeSplit({ protein: 0, carbs: 0, fat: 0 });
    expect(Object.values(s).every(Number.isFinite)).toBe(true);
  });
});

describe('projectedGoalDate', () => {
  const from = new Date(2026, 0, 1, 12);
  it('80 -> 70 kg at -0.5 kg/week = 20 weeks = 140 days -> 2026-05-21', () => {
    // Jan 1 + 140: Jan(31) Feb(28) Mar(31) Apr(30) = 120 -> May 1; +20 -> May 21
    const d = projectedGoalDate(80, 70, -0.5, from)!;
    expect([d.getFullYear(), d.getMonth() + 1, d.getDate()]).toEqual([2026, 5, 21]);
  });
  it('gaining towards a higher target works: 60 -> 63 at +0.25 = 12 weeks = 84 days -> 2026-03-26', () => {
    // Jan 1 + 84: Jan has 31 -> Feb 1 is +31; Mar 1 is +59; +84 = Mar 26
    const d = projectedGoalDate(60, 63, 0.25, from)!;
    expect([d.getMonth() + 1, d.getDate()]).toEqual([3, 26]);
  });
  it('wrong direction returns null', () => {
    expect(projectedGoalDate(80, 70, 0.3, from)).toBeNull();
    expect(projectedGoalDate(70, 80, -0.3, from)).toBeNull();
  });
  it('already there (within 0.1 kg) returns the start date', () => {
    expect(projectedGoalDate(70.05, 70, -0.5, from)).toBe(from);
    expect(projectedGoalDate(70, 70, 0, from)).toBe(from);
  });
  it('a rate under 0.02 kg/week never arrives', () => {
    expect(projectedGoalDate(80, 70, -0.01, from)).toBeNull();
    expect(projectedGoalDate(80, 70, 0, from)).toBeNull();
  });
  it('no target returns null', () => {
    expect(projectedGoalDate(80, undefined, -0.5, from)).toBeNull();
  });
  it('does not mutate the input date', () => {
    const f = new Date(2026, 0, 1, 12);
    projectedGoalDate(80, 70, -0.5, f);
    expect(f.getDate()).toBe(1);
  });
});
