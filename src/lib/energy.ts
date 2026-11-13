/**
 * Energy maths: resting expenditure, daily expenditure and calorie/macro targets.
 * Pure functions, no React or storage imports, so they are unit-testable.
 */
import type { ActivityLevel, GoalType, MacroSplit, Profile, Sex } from '@/types';

import { ageFromBirthDate } from './dates';
import { clamp } from './units';

export const KCAL_PER_KG = 7700;

export type BmrMethod = 'katch-mcardle' | 'mifflin-st-jeor';

/** Mifflin-St Jeor (1990): the most accurate general-population equation. */
export function bmrMifflin(sex: Sex, weightKg: number, heightCm: number, age: number): number {
  return 10 * weightKg + 6.25 * heightCm - 5 * age + (sex === 'male' ? 5 : -161);
}

/** Katch-McArdle: driven by lean mass, preferred when body fat % is known. */
export function bmrKatchMcArdle(weightKg: number, bodyFatPct: number): number {
  return 370 + 21.6 * leanMassKg(weightKg, bodyFatPct);
}

export function leanMassKg(weightKg: number, bodyFatPct: number): number {
  return weightKg * (1 - bodyFatPct / 100);
}

export function isPlausibleBodyFat(pct: number | undefined): pct is number {
  return typeof pct === 'number' && pct >= 3 && pct <= 60;
}

/**
 * Resting expenditure. With a body fat % the lean-mass equation is used, which
 * fits muscular and very lean people better. Body fat readings from tape or
 * smart scales are noisy (several points either way), so the result is kept
 * within 15% of the Mifflin-St Jeor estimate: a mistyped body fat value can
 * then never swing the calorie budget wildly.
 */
export function bmr(p: Pick<Profile, 'sex' | 'weightKg' | 'heightCm' | 'birthDate' | 'bodyFatPct'>): {
  kcal: number;
  method: BmrMethod;
} {
  const mifflin = bmrMifflin(p.sex, p.weightKg, p.heightCm, ageFromBirthDate(p.birthDate));
  if (isPlausibleBodyFat(p.bodyFatPct)) {
    const katch = bmrKatchMcArdle(p.weightKg, p.bodyFatPct);
    return { kcal: clamp(katch, mifflin * 0.85, mifflin * 1.15), method: 'katch-mcardle' };
  }
  return { kcal: mifflin, method: 'mifflin-st-jeor' };
}

/**
 * Activity factors describe everyday movement outside logged workouts.
 * Logged sessions are added on top as net calories, so they are not counted twice.
 */
export const ACTIVITY_FACTORS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  athlete: 1.9,
};

export const ACTIVITY_LABELS: Record<ActivityLevel, { title: string; hint: string }> = {
  sedentary: { title: 'Mostly sitting', hint: 'Desk job, little walking' },
  light: { title: 'Lightly active', hint: 'On your feet part of the day' },
  moderate: { title: 'Active', hint: 'On your feet most of the day' },
  active: { title: 'Very active', hint: 'Physical job or lots of walking' },
  athlete: { title: 'Extremely active', hint: 'Hard physical labour every day' },
};

export function formulaTdee(p: Profile): number {
  return bmr(p).kcal * ACTIVITY_FACTORS[p.activityLevel];
}

/** Lowest daily intake the app will ever recommend. */
export function calorieFloor(sex: Sex): number {
  return sex === 'male' ? 1500 : 1200;
}

/** Fastest weekly change we recommend: 1% of body weight for loss, 0.5% for gain. */
export function maxWeeklyRateKg(goal: GoalType, weightKg: number): number {
  if (goal === 'lose') return weightKg * 0.01;
  if (goal === 'gain') return weightKg * 0.005;
  return 0;
}

export interface CalorieTarget {
  /** Daily budget before exercise is added. */
  target: number;
  tdee: number;
  /** Negative for a deficit, positive for a surplus. */
  dailyDelta: number;
  /** True when the requested rate was limited by the safety floor. */
  limitedByFloor: boolean;
  /** Weekly change the target actually implies, kg (signed). */
  impliedWeeklyKg: number;
  source: 'override' | 'calculated';
  /**
   * The lowest intake this plan may go to: the recommended minimum, or the
   * person's own expenditure when that is already lower (a deficit is then not
   * possible and the plan is maintenance).
   */
  floor: number;
  /** Estimated expenditure is at or below the recommended minimum, so no deficit is planned. */
  belowFloor: boolean;
}

export function calorieTarget(p: Profile, tdee: number = formulaTdee(p)): CalorieTarget {
  if (p.calorieTargetOverride && p.calorieTargetOverride > 0) {
    const delta = p.calorieTargetOverride - tdee;
    return {
      target: Math.round(p.calorieTargetOverride),
      tdee,
      dailyDelta: delta,
      limitedByFloor: false,
      impliedWeeklyKg: (delta * 7) / KCAL_PER_KG,
      source: 'override',
      floor: Math.min(calorieFloor(p.sex), Math.round(tdee / 10) * 10),
      belowFloor: tdee <= calorieFloor(p.sex),
    };
  }
  const direction = p.goal === 'lose' ? -1 : p.goal === 'gain' ? 1 : 0;
  const rate = Math.min(Math.abs(p.weeklyRateKg), maxWeeklyRateKg(p.goal, p.weightKg) || 0);
  const requestedDelta = (direction * rate * KCAL_PER_KG) / 7;
  const floor = calorieFloor(p.sex);
  const raw = tdee + requestedDelta;
  const target = Math.max(raw, Math.min(floor, tdee));
  const delta = target - tdee;
  return {
    target: Math.round(target / 10) * 10,
    tdee,
    dailyDelta: delta,
    limitedByFloor: raw < target - 1,
    impliedWeeklyKg: (delta * 7) / KCAL_PER_KG,
    source: 'calculated',
    floor: Math.min(floor, Math.round(tdee / 10) * 10),
    belowFloor: tdee <= floor,
  };
}

export interface MacroTargets {
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
  split: MacroSplit;
}

/** Protein in g per kg of reference body weight, by goal. */
const PROTEIN_PER_KG: Record<GoalType, number> = { lose: 2.0, maintain: 1.6, gain: 1.8 };

/**
 * Weight used for protein targets. For people carrying a lot of fat, scaling
 * protein by total weight overshoots, so lean mass (when known) or the weight
 * at BMI 25 is used as the reference instead.
 */
export function proteinReferenceWeightKg(p: Pick<Profile, 'weightKg' | 'heightCm' | 'bodyFatPct'>): number {
  const m = p.heightCm / 100;
  const bmi = p.weightKg / (m * m);
  if (isPlausibleBodyFat(p.bodyFatPct)) {
    // Lean mass plus an allowance for essential fat keeps targets comparable to the per-kg guidance.
    return Math.min(p.weightKg, leanMassKg(p.weightKg, p.bodyFatPct) / 0.85);
  }
  if (bmi > 27.5) return 25 * m * m;
  return p.weightKg;
}

export function macroTargets(p: Profile, calories: number): MacroTargets {
  if (p.macroSplitOverride) {
    const s = normalizeSplit(p.macroSplitOverride);
    return {
      proteinG: Math.round((calories * s.protein) / 4),
      carbsG: Math.round((calories * s.carbs) / 4),
      fatG: Math.round((calories * s.fat) / 9),
      fiberG: fiberTarget(calories),
      split: s,
    };
  }
  const ref = proteinReferenceWeightKg(p);
  let proteinG = PROTEIN_PER_KG[p.goal] * ref;
  // Keep protein inside a sensible share of the budget for very low or very high targets.
  proteinG = clamp(proteinG, (calories * 0.15) / 4, (calories * 0.4) / 4);
  // Fat: 28% of calories, never below 0.6 g/kg for hormonal health.
  let fatG = Math.max((calories * 0.28) / 9, 0.6 * ref);
  const remaining = calories - proteinG * 4 - fatG * 9;
  let carbsG = remaining / 4;
  if (carbsG < 50) {
    carbsG = 50;
    fatG = Math.max(20, (calories - proteinG * 4 - carbsG * 4) / 9);
  }
  const split = normalizeSplit({
    protein: proteinG * 4,
    carbs: carbsG * 4,
    fat: fatG * 9,
  });
  return {
    proteinG: Math.round(proteinG),
    carbsG: Math.round(carbsG),
    fatG: Math.round(fatG),
    fiberG: fiberTarget(calories),
    split,
  };
}

/** 14 g of fibre per 1000 kcal (Dietary Guidelines for Americans). */
export function fiberTarget(calories: number): number {
  return Math.round((calories / 1000) * 14);
}

/** Shares that add up to 1. Negative or non-numeric parts count as 0, so no share can come out negative or above 1. */
export function normalizeSplit(s: MacroSplit): MacroSplit {
  const part = (x: number) => (Number.isFinite(x) && x > 0 ? x : 0);
  const protein = part(s.protein);
  const carbs = part(s.carbs);
  const fat = part(s.fat);
  const total = protein + carbs + fat || 1;
  return { protein: protein / total, carbs: carbs / total, fat: fat / total };
}

/** Estimated date of reaching the target weight at the implied rate, or null if not applicable. */
export function projectedGoalDate(
  currentKg: number,
  targetKg: number | undefined,
  weeklyKgSigned: number,
  from: Date = new Date(),
): Date | null {
  if (!targetKg) return null;
  const remaining = targetKg - currentKg;
  if (Math.abs(remaining) < 0.1) return from;
  if (Math.abs(weeklyKgSigned) < 0.02 || Math.sign(remaining) !== Math.sign(weeklyKgSigned)) return null;
  const weeks = remaining / weeklyKgSigned;
  const d = new Date(from);
  d.setDate(d.getDate() + Math.round(weeks * 7));
  return d;
}
