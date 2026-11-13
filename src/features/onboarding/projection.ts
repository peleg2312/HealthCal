/**
 * The road to a target weight for the plan reveal: a straight line at the
 * planned pace, a band for a pace between 0.75x and 1.25x of it (real weeks
 * vary), and waypoints a quarter, half and three quarters of the way.
 * Pure: no React, no storage.
 */


export const PACE_LOW = 0.75;
export const PACE_HIGH = 1.25;

export interface Waypoint {
  /** 0.25, 0.5 or 0.75 of the way. */
  share: number;
  kg: number;
  weeks: number;
  date: Date;
}

export interface Projection {
  startKg: number;
  targetKg: number;
  /** Weeks to the target at the planned pace, and at the fast and slow ends of the band. */
  weeks: number;
  fastWeeks: number;
  slowWeeks: number;
  date: Date;
  fastDate: Date;
  slowDate: Date;
  waypoints: Waypoint[];
}

const plusWeeks = (from: Date, weeks: number) => {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate(), 12);
  d.setDate(d.getDate() + Math.round(weeks * 7));
  return d;
};

/** Null when there is no road: no target, no pace, or a pace in the wrong direction. */
export function projectTo(startKg: number, targetKg: number | undefined, weeklyKgSigned: number, now: Date = new Date()): Projection | null {
  if (targetKg === undefined || !Number.isFinite(targetKg)) return null;
  const remaining = targetKg - startKg;
  if (Math.abs(remaining) < 0.5 || Math.abs(weeklyKgSigned) < 0.02 || Math.sign(remaining) !== Math.sign(weeklyKgSigned)) return null;
  const weeks = remaining / weeklyKgSigned;
  const fastWeeks = weeks / PACE_HIGH;
  const slowWeeks = weeks / PACE_LOW;
  return {
    startKg,
    targetKg,
    weeks,
    fastWeeks,
    slowWeeks,
    date: plusWeeks(now, weeks),
    fastDate: plusWeeks(now, fastWeeks),
    slowDate: plusWeeks(now, slowWeeks),
    waypoints: [0.25, 0.5, 0.75].map((share) => ({ share, kg: startKg + remaining * share, weeks: weeks * share, date: plusWeeks(now, weeks * share) })),
  };
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "early March", "mid April 2028": a date as loosely as a projection deserves. */
export function looseDate(d: Date, now: Date = new Date()): string {
  const part = d.getDate() <= 10 ? 'early' : d.getDate() <= 20 ? 'mid' : 'late';
  const year = d.getFullYear() !== now.getFullYear() ? ` ${d.getFullYear()}` : '';
  return `${part} ${MONTHS[d.getMonth()]}${year}`;
}

/** "between early March and mid April", or one phrase when both ends land in the same part of a month. */
export function rangeText(p: Projection, now: Date = new Date()): string {
  const b = looseDate(p.slowDate, now);
  // The year is said once, at the end, when both ends share it.
  const sameYear = p.fastDate.getFullYear() === p.slowDate.getFullYear();
  const a = looseDate(p.fastDate, sameYear ? p.fastDate : now);
  if (a === b || looseDate(p.fastDate, now) === b) return `around ${b}`;
  return `between ${a} and ${b}`;
}

/** "Mar 14": a waypoint label. */
export function shortDate(d: Date): string {
  return `${SHORT[d.getMonth()]} ${d.getDate()}`;
}

