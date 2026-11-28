/**
 * "Together this week", logging buddies and kind notes: the rules the screens draw by. The server
 * (supabase/migrations/20261202000000_friends_together.sql) checks every one of them; these are for drawing and
 * for offering only what will be accepted. Pure.
 */
import { addDays, diffDays } from '@/lib/dates';
import type { BuddyDay, ISODate, TogetherCircle, TogetherKind } from '@/types';

export { NOTE_KINDS } from '@/services/friendsWire';

export const TOGETHER_RULES = {
  /** People in a circle, the starter included. */
  minPeople: 2,
  maxPeople: 6,
  /** Targets the server accepts, per kind. */
  target: { minutes: { min: 30, max: 6000 }, days: { min: 2, max: 42 } } as Record<TogetherKind, { min: number; max: number }>,
  /** Logging buddies at once (asks sent count). */
  maxBuddies: 3,
  /** Notes: one a day to each friend, this many a day in all. */
  notesPerDay: 5,
} as const;

/** The circle's cup: the share poured (0 to 1, for `Vessel` pass `value`/`max` as is) and whether the goal is reached. */
export function togetherProgress(c: Pick<TogetherCircle, 'total' | 'target'>): { share: number; reached: boolean; left: number } {
  const target = Math.max(1, c.target);
  return { share: Math.min(1, Math.max(0, c.total) / target), reached: c.total >= target, left: Math.max(0, target - c.total) };
}

/** Days left in the week of `week` (Monday), today included: 7 on Monday, 1 on Sunday, 0 once it is over. */
export function daysLeftInWeek(week: ISODate, today: ISODate): number {
  return Math.max(0, Math.min(7, diffDays(today, addDays(week, 7))));
}

const roundTo = (x: number, step: number) => Math.max(step, Math.round(x / step) * step);

/**
 * Three targets to offer, low to high, that a circle of `people` can reach: from last week's total when there is
 * one (about it, a little less and a little more), else from a gentle share of the guideline (minutes: 150 a person,
 * offered at 60%, 80% and 100%; days: 7 a person, at 4, 5 and 6 days each). Always within the server's bounds.
 */
export function togetherGoalChoices(kind: TogetherKind, people: number, lastWeekTotal?: number | null): number[] {
  const n = Math.min(TOGETHER_RULES.maxPeople, Math.max(TOGETHER_RULES.minPeople, Math.round(people)));
  const { min, max } = TOGETHER_RULES.target[kind];
  const step = kind === 'minutes' ? 30 : 1;
  const clamp = (x: number) => Math.min(max, Math.max(min, x));
  const base = lastWeekTotal && lastWeekTotal > 0 ? [0.8, 1, 1.15].map((f) => lastWeekTotal * f) : kind === 'minutes' ? [0.6, 0.8, 1].map((f) => 150 * n * f) : [4, 5, 6].map((d) => d * n);
  const out = [...new Set(base.map((x) => clamp(roundTo(x, step))))].sort((a, b) => a - b);
  // Fewer than three after rounding (a small last week): fill upwards by a step.
  while (out.length < 3 && out[out.length - 1] + step <= max) out.push(out[out.length - 1] + step);
  return out;
}

/** How a buddy's day is drawn: both logged (full), one of the two (half), none, or a day still to come / before the pair. */
export function buddyCup(count: BuddyDay['count']): 'full' | 'half' | 'empty' | 'none' {
  return count === 2 ? 'full' : count === 1 ? 'half' : count === 0 ? 'empty' : 'none';
}

/** Days of the week both logged. */
export function buddyDaysTogether(week: readonly BuddyDay[]): number {
  return week.filter((d) => d.count === 2).length;
}
