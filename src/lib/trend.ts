/**
 * Weight trend and adaptive expenditure.
 *
 * Scale weight swings by a kilo or more day to day from water, salt and gut
 * content. The trend is an exponentially smoothed series that follows real
 * change and ignores that noise. Comparing how fast weight is really changing
 * with logged intake then gives an expenditure estimate that is personal to
 * the user and improves on any formula once enough data exists.
 */
import type { ISODate } from '@/types';

import { addDays, diffDays } from './dates';
import { KCAL_PER_KG } from './energy';
import { clamp } from './units';

export interface WeightPoint {
  date: ISODate;
  kg: number;
}

export interface TrendPoint extends WeightPoint {
  /** Smoothed value for that day. */
  trend: number;
  /** True when no weigh-in exists for the day and the value is interpolated. */
  interpolated: boolean;
}

/** Smoothing factor per day. 0.1 is the classic value: ~20 days of memory. */
export const TREND_ALPHA = 0.1;

/**
 * Daily smoothed series from the first to the last weigh-in. Missing days are
 * linearly interpolated before smoothing so gaps do not stall the trend.
 */
export function weightTrend(points: WeightPoint[], alpha: number = TREND_ALPHA): TrendPoint[] {
  const sorted = dedupeByDate(points);
  if (sorted.length === 0) return [];
  const out: TrendPoint[] = [];
  let trend = sorted[0].kg;
  for (let i = 0; i < sorted.length; i++) {
    const cur = sorted[i];
    if (i > 0) {
      const prev = sorted[i - 1];
      const gap = diffDays(prev.date, cur.date);
      for (let g = 1; g < gap; g++) {
        const kg = prev.kg + ((cur.kg - prev.kg) * g) / gap;
        trend = trend + alpha * (kg - trend);
        out.push({ date: addDays(prev.date, g), kg, trend, interpolated: true });
      }
      trend = trend + alpha * (cur.kg - trend);
    }
    out.push({ date: cur.date, kg: cur.kg, trend, interpolated: false });
  }
  return out;
}

function dedupeByDate(points: WeightPoint[]): WeightPoint[] {
  const byDate = new Map<ISODate, number>();
  for (const p of points) if (p.kg > 0) byDate.set(p.date, p.kg);
  return [...byDate.entries()].map(([date, kg]) => ({ date, kg })).sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Least-squares slope through a set of weigh-ins, in kg per day (signed).
 * Unlike the difference of two smoothed values it has no start-up lag, so it
 * stays unbiased for someone who only began weighing in a few weeks ago.
 */
export function linearSlope(points: WeightPoint[]): number | null {
  const pts = dedupeByDate(points);
  if (pts.length < 2) return null;
  const xs = pts.map((p) => diffDays(pts[0].date, p.date));
  const meanX = xs.reduce((a, b) => a + b, 0) / xs.length;
  const meanY = pts.reduce((a, p) => a + p.kg, 0) / pts.length;
  let num = 0;
  let den = 0;
  for (let i = 0; i < pts.length; i++) {
    num += (xs[i] - meanX) * (pts[i].kg - meanY);
    den += (xs[i] - meanX) ** 2;
  }
  return den > 0 ? num / den : null;
}

/** A rate older than this many days is history, not a current pace. */
export const RATE_STALE_AFTER_DAYS = 10;

/**
 * Current rate of weight change in kg per week (signed): the slope of a
 * straight line through the real weigh-ins of the last `days` days.
 *
 * The smoothed trend is right for drawing a calm line, but its slope lags for
 * the first weeks (it would report a 0.5 kg/week loss as 0.24 after a
 * fortnight), so the rate is measured on the weigh-ins themselves. Returns
 * null with fewer than three weigh-ins, less than a week of span, or, when
 * `asOf` is given, when the newest weigh-in is too old to call the rate current.
 */
export function weeklyRate(trend: TrendPoint[], days = 21, asOf?: ISODate): number | null {
  const real = trend.filter((t) => !t.interpolated);
  if (real.length < 2) return null;
  const last = real[real.length - 1];
  if (asOf && diffDays(last.date, asOf) > RATE_STALE_AFTER_DAYS) return null;
  const from = addDays(last.date, -days);
  const recent = real.filter((t) => t.date >= from);
  if (recent.length < 2 || diffDays(recent[0].date, last.date) < 7) return null;
  const slope = linearSlope(recent);
  return slope === null ? null : slope * 7;
}

export interface AdaptiveTdee {
  /** Blended estimate to use for targets. */
  tdee: number;
  /**
   * Data-driven estimate before blending, or null when data is too thin. Like
   * the formula it is a non-exercise figure: logged workouts are subtracted, so
   * adding them back to the daily budget does not count them twice.
   */
  observed: number | null;
  /** Everything burned per day on average, logged workouts included. */
  observedTotal?: number | null;
  /** Average net calories of logged workouts per day over the window. */
  avgExercise?: number;
  /** 0..1: how much weight the observed value gets against the formula. */
  confidence: number;
  loggedDays: number;
  weighIns: number;
  windowDays: number;
  /** What is still needed for a (better) estimate, phrased for the user. */
  needs: string | null;
}

export interface AdaptiveInput {
  formulaTdee: number;
  weights: WeightPoint[];
  /** Calories eaten per day. Days missing from the map count as not logged. */
  intakeByDate: Record<ISODate, number>;
  /** Net calories of logged workouts per day. Days missing from the map count as none. */
  exerciseByDate?: Record<ISODate, number>;
  end: ISODate;
  windowDays?: number;
}

/** Below this, a day's log is treated as unfinished whatever the person's size. */
export const MIN_COMPLETE_DAY_KCAL = 800;

/**
 * Whether a day's food log looks complete enough to average. One rule for the
 * whole app: at least 800 kcal and at least half of the reference (that day's
 * budget, or the expenditure estimate where no budget applies). Half-logged
 * days would otherwise drag averages and the expenditure estimate down.
 */
export function isCompleteDay(kcal: number, reference: number): boolean {
  return kcal >= Math.max(MIN_COMPLETE_DAY_KCAL, reference * 0.5);
}

const MIN_LOGGED_DAYS = 10;
const MIN_WEIGH_INS = 5;
const MIN_SPAN_DAYS = 14;

/**
 * Energy balance over a rolling window:
 *   expenditure = average intake - (rate of weight change x 7700 kcal/kg)
 *   non-exercise expenditure = expenditure - average logged workout calories
 * The rate of change is the least-squares line through the weigh-ins in the
 * window, which averages out daily water noise without the start-up lag a
 * smoothed trend has. The result is blended with the formula estimate
 * according to how much data backs it, and bounded so a few bad logs cannot
 * produce an absurd target.
 */
export function adaptiveTdee(input: AdaptiveInput): AdaptiveTdee {
  const windowDays = input.windowDays ?? 28;
  const start = addDays(input.end, -(windowDays - 1));
  const inWindow = dedupeByDate(input.weights).filter((w) => w.date >= start && w.date <= input.end);
  const weighIns = inWindow.length;

  const intakes: number[] = [];
  for (let i = 0; i < windowDays; i++) {
    const kcal = input.intakeByDate[addDays(start, i)];
    if (kcal !== undefined && isCompleteDay(kcal, input.formulaTdee)) intakes.push(kcal);
  }
  const loggedDays = intakes.length;
  const span = weighIns >= 2 ? diffDays(inWindow[0].date, inWindow[weighIns - 1].date) : 0;
  // A short window cannot hold a longer span than its own length.
  const minSpan = Math.min(MIN_SPAN_DAYS, windowDays - 1);

  let exerciseSum = 0;
  for (let i = 0; i < windowDays; i++) exerciseSum += input.exerciseByDate?.[addDays(start, i)] ?? 0;
  const avgExercise = exerciseSum / windowDays;

  const base: AdaptiveTdee = {
    tdee: input.formulaTdee,
    observed: null,
    observedTotal: null,
    avgExercise: Math.round(avgExercise),
    confidence: 0,
    loggedDays,
    weighIns,
    windowDays,
    needs: null,
  };

  const slope = linearSlope(inWindow);
  if (loggedDays < MIN_LOGGED_DAYS || weighIns < MIN_WEIGH_INS || span < minSpan || slope === null) {
    const parts: string[] = [];
    if (loggedDays < MIN_LOGGED_DAYS) parts.push(`${MIN_LOGGED_DAYS - loggedDays} more fully logged days`);
    if (weighIns < MIN_WEIGH_INS) parts.push(`${MIN_WEIGH_INS - weighIns} more weigh-ins`);
    if (parts.length === 0) parts.push('weigh-ins spread over two weeks');
    return { ...base, needs: parts.join(' and ') };
  }

  const avgIntake = intakes.reduce((a, b) => a + b, 0) / loggedDays;
  // Energy balance gives everything burned. The budget is built on what is burned outside
  // logged workouts (those are added back per session), so they come out here.
  const observedTotal = avgIntake - slope * KCAL_PER_KG;
  const observed = clamp(observedTotal - avgExercise, input.formulaTdee * 0.65, input.formulaTdee * 1.45);

  const coverage = Math.min(1, loggedDays / (windowDays * 0.85));
  const weighCoverage = Math.min(1, weighIns / 12);
  const confidence = clamp(0.25 + 0.6 * coverage * weighCoverage, 0, 0.85);

  return {
    ...base,
    observed: Math.round(observed),
    observedTotal: Math.round(observedTotal),
    confidence,
    tdee: Math.round(input.formulaTdee * (1 - confidence) + observed * confidence),
  };
}
