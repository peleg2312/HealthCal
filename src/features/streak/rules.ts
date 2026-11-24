/**
 * The streak moments on Today: when the day's first entry extends the streak,
 * and the fuller moment at 7, 30 and 100 days. The streak itself (forgiving one
 * missed day) is `useConsistency`; these rules only read its numbers. Pure,
 * unit-tested.
 */
import type { ISODate } from '@/types';

export const STREAK_MILESTONES = [7, 30, 100] as const;
export type StreakMilestone = (typeof STREAK_MILESTONES)[number];

export interface StreakState {
  streak: number;
  loggedToday: boolean;
}

/**
 * True when the day's first entry extended the streak: today was not logged
 * before, it is now, and the count went up. A first day ever (0 to 1) is not
 * a streak yet.
 */
export function justExtended(before: StreakState, after: StreakState): boolean {
  return !before.loggedToday && after.loggedToday && after.streak > before.streak && after.streak >= 2;
}

/** The milestone this exact count is, or null. */
export function milestoneFor(streak: number): StreakMilestone | null {
  return (STREAK_MILESTONES as readonly number[]).includes(streak) ? (streak as StreakMilestone) : null;
}

/** The key a shown milestone is remembered under: the milestone and the day it was reached. */
export function milestoneKey(milestone: StreakMilestone, date: ISODate): string {
  return `${milestone}:${date}`;
}

/**
 * The milestone to show now, or null. A milestone is reached on a day when
 * that day is logged and the streak equals it (logging today is what took it
 * there), so this also holds after a reload. Each one shows once on this
 * device: `shown` holds the keys already seen.
 */
export function dueMilestone(state: StreakState, today: ISODate, shown: readonly string[]): StreakMilestone | null {
  if (!state.loggedToday) return null;
  const m = milestoneFor(state.streak);
  if (!m) return null;
  return shown.includes(milestoneKey(m, today)) ? null : m;
}

/** The one line under the streak when it grows: "12 days. A day without a log will not break it." */
export function streakLine(streak: number): string {
  return `${streak} days. A day without a log will not break it.`;
}

/** The words of a milestone moment. Neutral, no exclamation marks. */
export function milestoneCopy(m: StreakMilestone): { title: string; line: string } {
  switch (m) {
    case 7:
      return { title: 'A week of logging', line: 'Seven days in a row. A day without a log here and there will not break it.' };
    case 30:
      return { title: 'A month of logging', line: 'Thirty days. Logged every day but one is still a streak here.' };
    case 100:
      return { title: 'A hundred days of logging', line: 'A hundred days. The habit is yours now.' };
  }
}

/**
 * The pour order of cup `i` of `n` in the milestone row: one step per cup up
 * to 25 steps, so a row of 100 still fills in about a second.
 */
export function pourIndex(i: number, n: number, steps = 25): number {
  if (n <= steps) return i;
  return Math.round((i * (steps - 1)) / Math.max(1, n - 1));
}
