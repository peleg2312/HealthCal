/**
 * Pure helpers for activity sessions: building an entry and summarising a week.
 * No React, storage or native imports so they can be unit-tested.
 */
import { countsDouble, grossKcal, kcalRange, MODERATE_MET, netKcal, sessionGuidelineMinutes, VIGOROUS_MET, WEEKLY_GUIDELINE_MINUTES } from '@/lib/exercise';
import { exerciseWaterMl } from '@/lib/hydration';
import type { ActivityDef, ActivityEntry, Intensity, StrengthExercise, UnitSystem } from '@/types';

export interface BuildActivityInput {
  activity: ActivityDef;
  intensity: Intensity;
  durationMin: number;
  distanceKm?: number | null;
  notes?: string | null;
  date: string;
  exercises?: StrengthExercise[] | null;
  /** Current body weight. */
  weightKg: number;
  /** Non-exercise daily expenditure the budget is built on (formulaTdee). */
  baselineKcalPerDay: number;
  loggedAt: string;
}

export type BuiltActivity = Omit<ActivityEntry, 'id' | 'updatedAt'>;

/** Strip empty sets and exercises; keep the user's order. */
export function cleanExercises(exercises: StrengthExercise[] | null | undefined): StrengthExercise[] | undefined {
  if (!exercises) return undefined;
  const out = exercises
    .map((ex) => ({
      name: ex.name.trim(),
      sets: ex.sets
        .filter((s) => Number.isFinite(s.reps) && s.reps > 0)
        .map((s) => ({ reps: Math.round(s.reps), weightKg: Math.max(0, s.weightKg || 0), ...(s.done ? { done: true } : {}) })),
    }))
    .filter((ex) => ex.name && ex.sets.length > 0);
  return out.length ? out : undefined;
}

export function buildActivityEntry(input: BuildActivityInput): BuiltActivity {
  const { activity, intensity, date, weightKg, baselineKcalPerDay, loggedAt } = input;
  const durationMin = Math.max(1, Math.round(input.durationMin));
  const met = activity.met[intensity];
  const entry: BuiltActivity = {
    date,
    activityId: activity.id,
    name: activity.name,
    emoji: activity.emoji,
    category: activity.category,
    intensity,
    durationMin,
    met,
    kcalGross: grossKcal(met, weightKg, durationMin),
    kcalNet: netKcal(met, weightKg, durationMin, baselineKcalPerDay),
    // Kept with the session so a later edit is priced at the weight it was done at.
    weightKg,
    baselineKcalPerDay,
    loggedAt,
  };
  if (activity.tracksDistance && input.distanceKm && input.distanceKm > 0) entry.distanceKm = Math.round(input.distanceKm * 1000) / 1000;
  const notes = input.notes?.trim();
  if (notes) entry.notes = notes;
  const exercises = cleanExercises(input.exercises);
  if (exercises) entry.exercises = exercises;
  return entry;
}

// ----------------------------------------------------- editing saved sessions

/** The body weight and daily baseline a session's calories were worked out from. */
export interface SessionBasis {
  weightKg: number;
  baselineKcalPerDay: number;
}

const plausibleWeight = (w: number | undefined): w is number => typeof w === 'number' && Number.isFinite(w) && w >= 20 && w <= 400;
const plausibleBaseline = (b: number | undefined): b is number => typeof b === 'number' && Number.isFinite(b) && b >= 600 && b <= 8000;

/**
 * The weight and baseline a saved entry was built with, so an edit months
 * later is not re-priced at today's weight. Entries store both. Older entries
 * do not, but gross kcal is linear in weight and net kcal is gross minus the
 * baseline's share of the minutes, so both can be read back from the stored
 * calories. Falls back per value when neither source can carry it (net clipped
 * to zero, missing or implausible values).
 */
export function basisFromEntry(
  e: Pick<ActivityEntry, 'met' | 'durationMin' | 'kcalGross' | 'kcalNet' | 'weightKg' | 'baselineKcalPerDay'>,
  fallback: SessionBasis,
): SessionBasis {
  const ok = e.met > 0 && e.durationMin > 0 && e.kcalGross > 0;
  const per = ok ? grossKcal(e.met, 1, e.durationMin) : 0;
  const w = per > 0 ? e.kcalGross / per : NaN;
  const weightKg = plausibleWeight(e.weightKg) ? e.weightKg : plausibleWeight(w) ? w : fallback.weightKg;
  const b = ok && e.kcalNet > 0 ? ((e.kcalGross - e.kcalNet) * 1440) / e.durationMin : NaN;
  const baselineKcalPerDay = plausibleBaseline(e.baselineKcalPerDay) ? e.baselineKcalPerDay : plausibleBaseline(b) ? b : fallback.baselineKcalPerDay;
  return { weightKg, baselineKcalPerDay };
}

/**
 * Build the replacement for a saved entry. The calories stay exactly as saved
 * unless the activity, effort or duration changed (notes, distance, date and
 * sets do not move them); when they do change, they are worked out from the
 * weight and baseline the session was first saved with.
 */
export function rebuildActivityEntry(existing: ActivityEntry, input: Omit<BuildActivityInput, 'weightKg' | 'baselineKcalPerDay' | 'loggedAt'>, current: SessionBasis): BuiltActivity {
  const basis = basisFromEntry(existing, current);
  const built = buildActivityEntry({ ...input, ...basis, loggedAt: existing.loggedAt });
  // Where the session came from stays with it: an imported workout that is edited is still that
  // workout, so importing the same file again recognises it instead of adding a second copy.
  if (existing.source) built.source = existing.source;
  if (existing.externalId) built.externalId = existing.externalId;
  if (existing.startedAt) built.startedAt = existing.startedAt;
  if (existing.avgHeartRate) built.avgHeartRate = existing.avgHeartRate;
  if (existing.activityId === built.activityId && existing.intensity === built.intensity && existing.durationMin === built.durationMin) {
    built.met = existing.met;
    built.kcalGross = existing.kcalGross;
    built.kcalNet = existing.kcalNet;
    // The calories are still the ones a device measured.
    if (existing.measured) built.measured = true;
  }
  // Otherwise the activity, effort or length changed, so the calories above are an estimate again.
  return built;
}

/** Live estimate shown while the user fills the form. */
export function estimateSession(met: number, weightKg: number, minutes: number, baselineKcalPerDay: number) {
  const gross = grossKcal(met, weightKg, minutes);
  const net = netKcal(met, weightKg, minutes, baselineKcalPerDay);
  return { gross: Math.round(gross), net: Math.round(net), grossRange: kcalRange(gross), netRange: kcalRange(net) };
}

// ------------------------------------------------------------ week summary

// The guideline's bands and target live in @/lib/exercise so Train, Progress and the recap share one rule.
export { MODERATE_MET, VIGOROUS_MET };
export const WHO_WEEKLY_MINUTES = WEEKLY_GUIDELINE_MINUTES;

export interface WeekSummary {
  /** Moderate minutes + 2 x vigorous minutes. */
  guidelineMinutes: number;
  moderateMinutes: number;
  vigorousMinutes: number;
  /** Every logged minute, light included. */
  totalMinutes: number;
  sessions: number;
  kcalNet: number;
  kcalGross: number;
  byDate: Record<string, { minutes: number; sessions: ActivityEntry[]; kcalNet: number }>;
}

export function summariseWeek(entries: ActivityEntry[], dates: string[]): WeekSummary {
  const set = new Set(dates);
  const byDate: WeekSummary['byDate'] = Object.fromEntries(dates.map((d) => [d, { minutes: 0, sessions: [], kcalNet: 0 }]));
  let moderate = 0;
  let vigorous = 0;
  let total = 0;
  let net = 0;
  let gross = 0;
  let sessions = 0;
  for (const e of entries) {
    if (e.deleted || !set.has(e.date)) continue;
    sessions += 1;
    total += e.durationMin;
    net += e.kcalNet;
    gross += e.kcalGross;
    if (countsDouble(e.met, e.intensity)) vigorous += e.durationMin;
    else if (sessionGuidelineMinutes(e.met, e.durationMin, e.intensity) > 0) moderate += e.durationMin;
    const day = byDate[e.date];
    day.minutes += e.durationMin;
    day.kcalNet += e.kcalNet;
    day.sessions.push(e);
  }
  for (const d of dates) byDate[d].sessions.sort((a, b) => a.loggedAt.localeCompare(b.loggedAt));
  return {
    guidelineMinutes: moderate + 2 * vigorous,
    moderateMinutes: moderate,
    vigorousMinutes: vigorous,
    totalMinutes: total,
    sessions,
    kcalNet: Math.round(net),
    kcalGross: Math.round(gross),
    byDate,
  };
}

// ------------------------------------------------------------- water preview

/**
 * How much one session raises the day's water goal, given the day's other
 * sessions. The day's extra is capped and rounded as a whole, so the session's
 * share is the difference with and without it.
 */
export function sessionWaterMl(
  others: Pick<ActivityEntry, 'durationMin' | 'intensity'>[],
  session: Pick<ActivityEntry, 'durationMin' | 'intensity'>,
): number {
  return Math.max(0, exerciseWaterMl([...others, session]) - exerciseWaterMl(others));
}

// --------------------------------------------------------- speeds in hints

const KMH_RE = /(\d+(?:\.\d+)?)(?:\s*-\s*(\d+(?:\.\d+)?))?\s*km\/h/g;

/** Rewrite "about 10 km/h" in catalogue hints as mph for imperial users (to the nearest half). */
export function localiseSpeedText(text: string, units: UnitSystem): string {
  if (units !== 'imperial') return text;
  const mph = (s: string) => {
    const v = Math.round(Number(s) * 0.621371 * 2) / 2;
    return String(v);
  };
  return text.replace(KMH_RE, (_m, a: string, b?: string) => (b ? `${mph(a)}-${mph(b)} mph` : `${mph(a)} mph`));
}

// --------------------------------------------------------- pace and speed

export type PaceMode = 'pace' | 'speed' | 'swim';

export function paceModeFor(activity: Pick<ActivityDef, 'id' | 'category'>): PaceMode {
  if (activity.category === 'water') return /swim|stroke|butterfly/.test(activity.id) ? 'swim' : 'speed';
  if (/cycl|bik|skat|ski|snowboard|riding/.test(activity.id)) return 'speed';
  return 'pace';
}

/** "5:42" from minutes per unit. */
export function formatPace(minutesPerUnit: number): string {
  let m = Math.floor(minutesPerUnit);
  let s = Math.round((minutesPerUnit - m) * 60);
  if (s === 60) {
    m += 1;
    s = 0;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}
