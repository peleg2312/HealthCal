/**
 * Exercise energy from MET values (Compendium of Physical Activities).
 *
 * Two numbers matter and most apps blur them:
 *  - gross: everything burned during the session, resting metabolism included
 *  - net:   what the session burned on top of what the daily budget already
 *           assumes for that time. Only this is added back to the budget,
 *           otherwise the resting share would be counted twice.
 */
import type { Intensity } from '@/types';

/** Oxygen cost of 1 MET, ml O2 per kg per minute. */
const ML_O2_PER_KG_MIN = 3.5;
/** Energy per litre of oxygen consumed. */
const KCAL_PER_L_O2 = 5;

/** Standard Compendium conversion: kcal/min = MET x 3.5 x kg / 200. */
export function grossKcal(met: number, weightKg: number, minutes: number): number {
  return (met * ML_O2_PER_KG_MIN * weightKg * KCAL_PER_L_O2 * minutes) / 1000;
}

/**
 * Calories above the day's baseline for the same minutes.
 * `baselineKcalPerDay` is the non-exercise expenditure the budget is built on
 * (BMR x activity factor), so its per-minute share is removed from the session.
 */
export function netKcal(met: number, weightKg: number, minutes: number, baselineKcalPerDay: number): number {
  const baseline = (baselineKcalPerDay / 1440) * minutes;
  return Math.max(0, grossKcal(met, weightKg, minutes) - baseline);
}

/**
 * Honest uncertainty band. MET tables describe an average adult; individual
 * cost for the same activity commonly differs by around a fifth either way.
 */
export function kcalRange(kcal: number): [number, number] {
  return [Math.round(kcal * 0.8), Math.round(kcal * 1.2)];
}

export const INTENSITY_LABELS: Record<Intensity, { title: string; hint: string }> = {
  light: { title: 'Easy', hint: 'Can talk and sing' },
  moderate: { title: 'Moderate', hint: 'Can talk, not sing' },
  vigorous: { title: 'Hard', hint: 'Only a few words at a time' },
};

// ------------------------------------------------- weekly activity guideline

/** WHO guideline for adults: 150 minutes of moderate activity a week (hard, vigorous minutes count double). */
export const WEEKLY_GUIDELINE_MINUTES = 150;
/** Compendium bands the guideline uses: moderate 3 to under 6 MET, vigorous 6 MET and up. */
export const MODERATE_MET = 3;
export const VIGOROUS_MET = 6;

/** True when a session counts double: 6 MET or more, and not one the user rated easy or moderate. */
export function countsDouble(met: number | undefined, intensity?: Intensity): boolean {
  return (met ?? 0) >= VIGOROUS_MET && (intensity === undefined || intensity === 'vigorous');
}

/**
 * Minutes a single session adds toward the guideline: none under 3 MET, its
 * length from 3 MET, and double only when it is both 6 MET or more and logged
 * as hard. A steady ride the user called moderate counts once even though its
 * table value is above 6, so the label on the session and its credit agree.
 * (Sessions without an effort level are judged on MET alone.)
 */
export function sessionGuidelineMinutes(met: number | undefined, durationMin: number | undefined, intensity?: Intensity): number {
  const m = met ?? 0;
  const min = Math.max(0, durationMin ?? 0);
  if (countsDouble(m, intensity)) return 2 * min;
  if (m >= MODERATE_MET) return min;
  return 0;
}

/**
 * Minutes that count toward the weekly guideline. Every screen that shows
 * "minutes toward 150" uses this one rule, so Train, Progress and the recap agree.
 */
export function guidelineMinutes(activities: readonly { met?: number; durationMin?: number; intensity?: Intensity }[]): number {
  return activities.reduce((sum, a) => sum + sessionGuidelineMinutes(a.met, a.durationMin, a.intensity), 0);
}

/** Running/walking MET from speed where distance was entered, falling back to the table value. */
export function paceKmh(distanceKm: number | undefined, minutes: number): number | null {
  if (!distanceKm || distanceKm <= 0 || minutes <= 0) return null;
  return distanceKm / (minutes / 60);
}

/** Total volume lifted in a strength session, kg. */
export function strengthVolumeKg(exercises: { sets: { reps: number; weightKg: number }[] }[]): number {
  return exercises.reduce(
    (sum, ex) => sum + ex.sets.reduce((s, set) => s + set.reps * set.weightKg, 0),
    0,
  );
}

/** Epley one-rep-max estimate. */
export function estimateOneRepMax(weightKg: number, reps: number): number {
  if (reps <= 0 || weightKg <= 0) return 0;
  if (reps === 1) return weightKg;
  return weightKg * (1 + reps / 30);
}

export interface StrengthRecord {
  exercise: string;
  kind: 'e1rm' | 'heaviest';
  /** New best, kg. */
  valueKg: number;
  /** Previous best, kg. */
  previousKg: number;
}

type SetLike = { reps: number; weightKg: number };
type ExerciseLike = { name: string; sets: SetLike[] };

function bests(sets: SetLike[]): { e1rm: number; heaviest: number } {
  let e1rm = 0;
  let heaviest = 0;
  for (const s of sets) {
    if (!(s.reps > 0) || !(s.weightKg > 0)) continue;
    e1rm = Math.max(e1rm, estimateOneRepMax(s.weightKg, s.reps));
    heaviest = Math.max(heaviest, s.weightKg);
  }
  return { e1rm, heaviest };
}

/**
 * Personal records in a session against earlier sessions: a better estimated
 * one-rep max, else a heavier set. An exercise with no earlier weighted sets
 * sets no record (there is nothing to beat), and ties are not records.
 * Exercise names match case-insensitively.
 */
export function findStrengthRecords(session: ExerciseLike[], history: ExerciseLike[][]): StrengthRecord[] {
  const prior = new Map<string, { e1rm: number; heaviest: number }>();
  for (const s of history) for (const ex of s) {
    const k = ex.name.trim().toLowerCase();
    const b = bests(ex.sets);
    const p = prior.get(k);
    prior.set(k, { e1rm: Math.max(p?.e1rm ?? 0, b.e1rm), heaviest: Math.max(p?.heaviest ?? 0, b.heaviest) });
  }
  const now = new Map<string, { name: string; e1rm: number; heaviest: number }>();
  for (const ex of session) {
    const k = ex.name.trim().toLowerCase();
    const b = bests(ex.sets);
    const c = now.get(k);
    now.set(k, { name: c?.name ?? ex.name.trim(), e1rm: Math.max(c?.e1rm ?? 0, b.e1rm), heaviest: Math.max(c?.heaviest ?? 0, b.heaviest) });
  }
  const out: StrengthRecord[] = [];
  const EPS = 1e-6;
  for (const [k, c] of now) {
    const p = prior.get(k);
    if (!p || p.e1rm <= 0) continue;
    if (c.e1rm > p.e1rm + EPS) out.push({ exercise: c.name, kind: 'e1rm', valueKg: c.e1rm, previousKg: p.e1rm });
    else if (c.heaviest > p.heaviest + EPS) out.push({ exercise: c.name, kind: 'heaviest', valueKg: c.heaviest, previousKg: p.heaviest });
  }
  return out;
}
