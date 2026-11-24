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

const partOf = (d: Date) => (d.getDate() <= 10 ? 'early' : d.getDate() <= 20 ? 'mid' : 'late');

/** "early March", "mid April 2028": a date as loosely as a projection deserves. */
export function looseDate(d: Date, now: Date = new Date()): string {
  const year = d.getFullYear() !== now.getFullYear() ? ` ${d.getFullYear()}` : '';
  return `${partOf(d)} ${MONTHS[d.getMonth()]}${year}`;
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

/**
 * "Late Jan to mid Mar": the title's range (`rangeText`) in short months, for the chart's goal label,
 * so the chart never pins the goal to a day the title does not claim. The year is the title's to say;
 * it is added here only when both ends would otherwise read the same ("Mid Mar 2027 to mid Mar 2028").
 */
export function rangeShort(p: Projection, now: Date = new Date()): string {
  const short = (d: Date, year: boolean) => `${partOf(d)} ${SHORT[d.getMonth()]}${year ? ` ${d.getFullYear()}` : ''}`;
  const a = short(p.fastDate, false);
  const b = short(p.slowDate, false);
  const text =
    a !== b
      ? `${a} to ${b}`
      : p.fastDate.getFullYear() === p.slowDate.getFullYear() || rangeText(p, now).startsWith('around')
        ? `around ${b}`
        : `${short(p.fastDate, true)} to ${short(p.slowDate, true)}`;
  return text.charAt(0).toUpperCase() + text.slice(1);
}
