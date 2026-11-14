/**
 * Onboarding answers, validation and the plan they produce.
 *
 * Inputs are kept in the units the person typed them in (so a half-typed
 * "180." is never rewritten by a round trip through kg); everything is
 * converted to metric once, in `toMetric`, before it reaches the engine.
 */
import { create } from 'zustand';

import { navyBodyFatPct } from '@/lib/body';
import { ageFromBirthDate, toISODate } from '@/lib/dates';
import {
  ACTIVITY_FACTORS,
  bmr,
  calorieTarget,
  isPlausibleBodyFat,
  leanMassKg,
  macroTargets,
  maxWeeklyRateKg,
  projectedGoalDate,
  type BmrMethod,
  type CalorieTarget,
  type MacroTargets,
} from '@/lib/energy';
import { baseWaterGoalMl } from '@/lib/hydration';
import { cmToFtIn, cmToIn, ftInToCm, inToCm, kgToLb, lbToKg, round } from '@/lib/units';
import type { ActivityLevel, GoalType, Profile, Sex, UnitSystem } from '@/types';

import { defaultRoutine, validateRoutine, type Routine } from './routine';

export type BodyFatMode = 'unknown' | 'direct' | 'tape';

export interface Draft {
  units: UnitSystem;
  name: string;
  goal: GoalType | null;
  sex: Sex | null;
  dobDay: number | null;
  dobMonth: number | null;
  dobYear: number | null;
  /** Metric height input. */
  heightCm: number | null;
  /** Imperial height inputs. */
  heightFt: number | null;
  heightIn: number | null;
  /** Weight in the chosen unit (kg or lb). */
  weight: number | null;
  bodyFatMode: BodyFatMode | null;
  bodyFatPct: number | null;
  /** Tape measurements in the chosen unit (cm or in). */
  neck: number | null;
  waist: number | null;
  hip: number | null;
  activity: ActivityLevel | null;
  /** Target weight in the chosen unit. */
  target: number | null;
  /** Weekly pace in kg; null means "use the default for this goal". */
  weeklyRateKg: number | null;
  /** The optional "Your day" step. */
  routine: Routine;
  /** The answer to "Turn on reminders": null until the step is passed. */
  remindersOn: boolean | null;
}

/**
 * The questions in order. `sex` and `about` (date of birth) are one decision
 * each; `theme` is the last question, picked while looking at the real app.
 */
export type StepId = 'basics' | 'goal' | 'sex' | 'about' | 'body' | 'bodyfat' | 'activity' | 'target' | 'routine' | 'theme' | 'plan';

const ALL_STEPS: StepId[] = ['basics', 'goal', 'sex', 'about', 'body', 'bodyfat', 'activity', 'target', 'routine', 'theme', 'plan'];

export function stepsFor(goal: GoalType | null): StepId[] {
  return goal === 'maintain' ? ALL_STEPS.filter((s) => s !== 'target') : ALL_STEPS;
}

/** Imperial for the few regions that still use it, metric everywhere else. */
function guessUnits(): UnitSystem {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale ?? '';
    return /-(US|LR|MM)\b/i.test(locale) ? 'imperial' : 'metric';
  } catch {
    return 'metric';
  }
}

export function emptyDraft(): Draft {
  return {
    units: guessUnits(),
    name: '',
    goal: null,
    sex: null,
    dobDay: null,
    dobMonth: null,
    dobYear: null,
    heightCm: null,
    heightFt: null,
    heightIn: null,
    weight: null,
    bodyFatMode: null,
    bodyFatPct: null,
    neck: null,
    waist: null,
    hip: null,
    activity: null,
    target: null,
    weeklyRateKg: null,
    routine: defaultRoutine(),
    remindersOn: null,
  };
}

/** Start from whatever is already known (a profile restored by sync without `onboardedAt`). */
export function draftFromProfile(p: Partial<Profile> | null | undefined): Draft {
  const d = emptyDraft();
  if (!p) return d;
  const units = p.units ?? d.units;
  const out: Draft = { ...d, units, name: p.name ?? '', goal: p.goal ?? null, sex: p.sex ?? null, activity: p.activityLevel ?? null };
  if (p.birthDate && /^\d{4}-\d{2}-\d{2}$/.test(p.birthDate)) {
    const [y, m, day] = p.birthDate.split('-').map(Number);
    Object.assign(out, { dobYear: y, dobMonth: m, dobDay: day });
  }
  if (p.heightCm) {
    out.heightCm = round(p.heightCm, 1);
    const { ft, inch } = cmToFtIn(p.heightCm);
    out.heightFt = ft;
    out.heightIn = inch;
  }
  if (p.weightKg) out.weight = round(units === 'imperial' ? kgToLb(p.weightKg) : p.weightKg, 1);
  if (p.targetWeightKg) out.target = round(units === 'imperial' ? kgToLb(p.targetWeightKg) : p.targetWeightKg, 1);
  if (isPlausibleBodyFat(p.bodyFatPct)) {
    out.bodyFatMode = 'direct';
    out.bodyFatPct = p.bodyFatPct;
  }
  if (p.weeklyRateKg) out.weeklyRateKg = p.weeklyRateKg;
  return out;
}

/** Re-express typed values when the unit system changes, so nothing has to be typed again. */
export function convertUnits(d: Draft, units: UnitSystem): Draft {
  if (d.units === units) return d;
  const toImp = units === 'imperial';
  const w = (v: number | null) => (v === null ? null : round(toImp ? kgToLb(v) : lbToKg(v), 1));
  const len = (v: number | null) => (v === null ? null : round(toImp ? cmToIn(v) : inToCm(v), 1));
  const next: Draft = { ...d, units, weight: w(d.weight), target: w(d.target), neck: len(d.neck), waist: len(d.waist), hip: len(d.hip) };
  if (toImp && d.heightCm !== null) {
    const { ft, inch } = cmToFtIn(d.heightCm);
    next.heightFt = ft;
    next.heightIn = inch;
  } else if (!toImp && d.heightFt !== null) {
    next.heightCm = Math.round(ftInToCm(d.heightFt, d.heightIn ?? 0));
  }
  return next;
}

// ------------------------------------------------------------ draft store

interface DraftState {
  draft: Draft;
  step: number;
  set: (patch: Partial<Draft>) => void;
  setStep: (step: number) => void;
  reset: (draft?: Draft) => void;
}

/** In-memory only: answers survive moving between steps and screens, not an app restart. */
export const useOnboardingDraft = create<DraftState>((set) => ({
  draft: emptyDraft(),
  step: 0,
  set: (patch) => set((s) => ({ draft: { ...s.draft, ...patch } })),
  setStep: (step) => set({ step }),
  reset: (draft) => set({ draft: draft ?? emptyDraft(), step: 0 }),
}));

// ---------------------------------------------------------------- metric

export const LIMITS = {
  heightCm: [120, 230] as const,
  weightKg: [35, 300] as const,
  bodyFat: [3, 60] as const,
  age: [16, 100] as const,
  neckCm: [20, 70] as const,
  waistCm: [40, 200] as const,
  hipCm: [50, 200] as const,
};

export interface MetricBody {
  heightCm: number | null;
  weightKg: number | null;
  targetKg: number | null;
  neckCm: number | null;
  waistCm: number | null;
  hipCm: number | null;
}

export function toMetric(d: Draft): MetricBody {
  const imp = d.units === 'imperial';
  const kg = (v: number | null) => (v === null ? null : imp ? lbToKg(v) : v);
  const cm = (v: number | null) => (v === null ? null : imp ? inToCm(v) : v);
  const heightCm = imp ? (d.heightFt === null ? null : ftInToCm(d.heightFt, d.heightIn ?? 0)) : d.heightCm;
  return { heightCm, weightKg: kg(d.weight), targetKg: kg(d.target), neckCm: cm(d.neck), waistCm: cm(d.waist), hipCm: cm(d.hip) };
}

export function birthDateOf(d: Draft): string | null {
  const { dobYear: y, dobMonth: m, dobDay: day } = d;
  if (y === null || m === null || day === null) return null;
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(day)) return null;
  const date = new Date(y, m - 1, day, 12);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== day) return null;
  return toISODate(date);
}

export function tapeEstimate(d: Draft): number | null {
  const m = toMetric(d);
  if (!d.sex || m.heightCm === null || m.neckCm === null || m.waistCm === null) return null;
  return navyBodyFatPct({ sex: d.sex, heightCm: m.heightCm, neckCm: m.neckCm, waistCm: m.waistCm, hipCm: m.hipCm ?? undefined });
}

/** The body fat % that will be stored, if any. */
export function effectiveBodyFat(d: Draft): number | undefined {
  if (d.bodyFatMode === 'direct' && isPlausibleBodyFat(d.bodyFatPct ?? undefined)) return round(d.bodyFatPct!, 1);
  if (d.bodyFatMode === 'tape') {
    const est = tapeEstimate(d);
    if (isPlausibleBodyFat(est ?? undefined)) return est!;
  }
  return undefined;
}

export function defaultRateKg(goal: GoalType, weightKg: number): number {
  if (goal === 'maintain') return 0;
  const preferred = goal === 'lose' ? 0.5 : 0.25;
  return Math.min(preferred, maxWeeklyRateKg(goal, weightKg));
}

export function rateKgOf(d: Draft, weightKg: number): number {
  if (!d.goal || d.goal === 'maintain') return 0;
  const max = maxWeeklyRateKg(d.goal, weightKg);
  return Math.min(d.weeklyRateKg ?? defaultRateKg(d.goal, weightKg), max);
}

// ------------------------------------------------------------- validation

export type Errors = Partial<Record<string, string>>;

const fmt = (n: number, digits = 0) => String(round(n, digits));

/**
 * The limits as the person reads them. Imperial bounds are rounded inward
 * (up at the bottom, down at the top) so every stated bound passes validation.
 */
function rangeText(units: UnitSystem, kind: 'weight' | 'length', [lo, hi]: readonly [number, number]): string {
  if (units === 'imperial') {
    const f = kind === 'weight' ? kgToLb : cmToIn;
    return `${Math.ceil(f(lo) - 1e-9)} and ${Math.floor(f(hi) + 1e-9)} ${kind === 'weight' ? 'lb' : 'in'}`;
  }
  return `${lo} and ${hi} ${kind === 'weight' ? 'kg' : 'cm'}`;
}

export function weightRangeText(units: UnitSystem): string {
  return rangeText(units, 'weight', LIMITS.weightKg);
}

export function heightRangeText(units: UnitSystem): string {
  if (units !== 'imperial') return rangeText(units, 'length', LIMITS.heightCm);
  const ftIn = (inches: number) => `${Math.floor(inches / 12)}'${inches % 12}"`;
  const lo = Math.ceil(cmToIn(LIMITS.heightCm[0]) - 1e-9);
  const hi = Math.floor(cmToIn(LIMITS.heightCm[1]) + 1e-9);
  return `${ftIn(lo)} and ${ftIn(hi)}`;
}

export function validateStep(step: StepId, d: Draft, now: Date = new Date()): Errors {
  const e: Errors = {};
  const m = toMetric(d);
  switch (step) {
    case 'basics':
      if (!d.name.trim()) e.name = 'Add a first name so we know what to call you.';
      else if (d.name.trim().length > 40) e.name = 'Keep it under 40 characters.';
      break;
    case 'goal':
      if (!d.goal) e.goal = 'Choose the goal that fits best. You can change it later.';
      break;
    case 'sex':
      if (!d.sex) e.sex = 'Choose one. It only selects the right equation.';
      break;
    case 'about': {
      if (!d.sex) e.sex = 'Choose one. It only selects the right equation.';
      if (d.dobDay === null || d.dobMonth === null || d.dobYear === null) {
        e.dob = 'Enter your full date of birth.';
        break;
      }
      const iso = birthDateOf(d);
      if (!iso) {
        e.dob = 'That date does not exist. Check the day and month.';
        break;
      }
      const age = ageFromBirthDate(iso, now);
      if (iso > toISODate(now)) e.dob = 'That date is in the future.';
      else if (age < LIMITS.age[0]) e.dob = `HealthCal's equations are designed for people aged ${LIMITS.age[0]} and over.`;
      else if (age > LIMITS.age[1]) e.dob = 'Check the year: that is over 100 years ago.';
      break;
    }
    case 'body': {
      if (d.units === 'imperial') {
        if (d.heightFt === null) e.height = 'Enter your height in feet and inches.';
        else if (d.heightIn !== null && (d.heightIn < 0 || d.heightIn >= 12)) e.height = 'Inches go from 0 to 11.';
      } else if (d.heightCm === null) e.height = 'Enter your height.';
      if (!e.height && m.heightCm !== null && (m.heightCm < LIMITS.heightCm[0] || m.heightCm > LIMITS.heightCm[1])) {
        e.height = `Enter a height between ${heightRangeText(d.units)}.`;
      }
      if (m.weightKg === null) e.weight = 'Enter your current weight.';
      else if (m.weightKg < LIMITS.weightKg[0] || m.weightKg > LIMITS.weightKg[1]) {
        e.weight = `Enter a weight between ${weightRangeText(d.units)}.`;
      }
      break;
    }
    case 'bodyfat': {
      if (!d.bodyFatMode) e.bodyFatMode = 'Pick an option. "I don\'t know" is fine.';
      if (d.bodyFatMode === 'direct') {
        if (d.bodyFatPct === null) e.bodyFatPct = 'Enter your body fat %, or choose "I don\'t know".';
        else if (!isPlausibleBodyFat(d.bodyFatPct)) e.bodyFatPct = `Enter a value between ${LIMITS.bodyFat[0]} and ${LIMITS.bodyFat[1]}%.`;
      }
      if (d.bodyFatMode === 'tape') {
        const check = (key: 'neck' | 'waist' | 'hip', cm: number | null, lim: readonly [number, number], label: string) => {
          if (cm === null) e[key] = `Enter your ${label} measurement.`;
          else if (cm < lim[0] || cm > lim[1]) e[key] = `Enter between ${rangeText(d.units, 'length', lim)}.`;
        };
        check('neck', m.neckCm, LIMITS.neckCm, 'neck');
        check('waist', m.waistCm, LIMITS.waistCm, 'waist');
        if (d.sex === 'female') check('hip', m.hipCm, LIMITS.hipCm, 'hip');
        if (!e.neck && !e.waist && !e.hip && !isPlausibleBodyFat(tapeEstimate(d) ?? undefined)) {
          e.tape = 'These measurements do not give a usable estimate. Check them, or choose "I don\'t know".';
        }
      }
      break;
    }
    case 'activity':
      if (!d.activity) e.activity = 'Choose the one closest to a normal day.';
      break;
    case 'target': {
      if (!d.goal || d.goal === 'maintain' || m.weightKg === null || m.heightCm === null) break;
      const unit = d.units === 'imperial' ? 'lb' : 'kg';
      if (m.targetKg === null) {
        if (d.goal === 'lose') e.target = 'Enter the weight you are aiming for.';
        break;
      }
      if (m.targetKg < LIMITS.weightKg[0] || m.targetKg > LIMITS.weightKg[1]) {
        e.target = `Enter a weight between ${weightRangeText(d.units)}.`;
      } else if (d.goal === 'lose' && m.targetKg >= m.weightKg - 0.2) {
        e.target = `To lose weight, the target needs to be below your current ${fmt(d.weight ?? 0, 1)} ${unit}.`;
      } else if (d.goal === 'gain' && m.targetKg <= m.weightKg + 0.2) {
        e.target = `To gain, the target needs to be above your current ${fmt(d.weight ?? 0, 1)} ${unit}.`;
      }
      break;
    }
    case 'routine':
      Object.assign(e, validateRoutine(d.routine, d.units === 'imperial'));
      break;
    case 'theme':
    case 'plan':
      break;
  }
  return e;
}

// ------------------------------------------------------------------- plan

export interface Plan {
  profile: Omit<Profile, 'updatedAt' | 'onboardedAt'>;
  bmrKcal: number;
  bmrMethod: BmrMethod;
  leanMassKg: number | null;
  activityFactor: number;
  tdee: number;
  target: CalorieTarget;
  macros: MacroTargets;
  waterMl: number;
  floor: number;
  maxRateKg: number;
  goalDate: Date | null;
}

/** Build the profile the answers describe and run it through the engine. Null until the body data is complete. */
export function buildPlan(d: Draft, now: Date = new Date()): Plan | null {
  const m = toMetric(d);
  const birthDate = birthDateOf(d);
  if (!d.sex || !birthDate || m.heightCm === null || m.weightKg === null) return null;
  const goal = d.goal ?? 'maintain';
  const weightKg = round(m.weightKg, 2);
  const bodyFatPct = effectiveBodyFat(d);
  const targetWeightKg = goal !== 'maintain' && m.targetKg !== null ? round(m.targetKg, 2) : undefined;
  const profile: Plan['profile'] = {
    name: d.name.trim(),
    sex: d.sex,
    birthDate,
    heightCm: round(m.heightCm, 1),
    weightKg,
    bodyFatPct,
    activityLevel: d.activity ?? 'light',
    goal,
    targetWeightKg,
    weeklyRateKg: round(rateKgOf(d, weightKg), 3),
    units: d.units,
    eatBackExercise: true,
    useAdaptiveTdee: true,
  };
  const full = { ...profile, updatedAt: now.toISOString() } as Profile;
  const b = bmr(full);
  const factor = ACTIVITY_FACTORS[profile.activityLevel];
  const tdee = b.kcal * factor;
  const target = calorieTarget(full, tdee);
  return {
    profile,
    bmrKcal: b.kcal,
    bmrMethod: b.method,
    leanMassKg: bodyFatPct !== undefined ? leanMassKg(weightKg, bodyFatPct) : null,
    activityFactor: factor,
    tdee,
    target,
    macros: macroTargets(full, target.target),
    waterMl: baseWaterGoalMl(weightKg, d.sex),
    floor: target.floor,
    maxRateKg: maxWeeklyRateKg(goal, weightKg),
    goalDate: projectedGoalDate(weightKg, targetWeightKg, target.impliedWeeklyKg, now),
  };
}

export const METHOD_LABEL: Record<BmrMethod, string> = {
  'mifflin-st-jeor': 'Mifflin-St Jeor',
  'katch-mcardle': 'Katch-McArdle',
};
