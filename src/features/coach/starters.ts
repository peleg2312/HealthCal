/**
 * The coach's first view and the next step after an answer, as pure functions: the header's short
 * line (`shareLine`), the greeting (`coachHello`), the one true line from the person's own week
 * (`helloLine`, from `weekNumbers`), the two AI starters for this moment (`coachStarters`) and the
 * follow-up chips under the newest message (`followUps`). The screen (src/app/coach.tsx) only places
 * them. Every string is held to the banned list in words.test.ts and starters.test.ts.
 */
import { addDays, toISODate } from '@/lib/dates';
import { formatNumber } from '@/lib/units';
import type { ISODate } from '@/types';

import type { CoachMessage } from './request';
import { HELLO_FRESH, PHONE_ONLY_LINE, SHARE_OFF_LINE, SHARE_ON_LINE, STARTER_AFTER_WORKOUT, STARTER_PLAN, STARTER_PROTEIN, STARTER_WATER } from './words';

/** The header's short line: whether a typed question takes the week with it, or the AI is out of reach. */
export function shareLine(s: { signedIn: boolean; ageOk: boolean; agreed: boolean; share: boolean }): string {
  if (!s.signedIn || !s.ageOk) return PHONE_ONLY_LINE;
  return s.agreed && s.share ? SHARE_ON_LINE : SHARE_OFF_LINE;
}

/** "Good afternoon, Alex", or the greeting alone with no name. */
export function coachHello(greeting: string, name: string | null | undefined): string {
  const n = (name ?? '').trim();
  return n ? `${greeting}, ${n}` : greeting;
}

/** The workouts of the last 7 days (today and the 6 before): how many, and their minutes as logged. */
export function weekNumbers(activities: readonly { date: ISODate; durationMin: number }[], today: ISODate): { sessions: number; minutes: number } {
  const from = addDays(today, -6);
  let sessions = 0;
  let minutes = 0;
  for (const a of activities) {
    if (a.date < from || a.date > today) continue;
    sessions += 1;
    minutes += Math.max(0, Number.isFinite(a.durationMin) ? a.durationMin : 0);
  }
  return { sessions, minutes: Math.round(minutes) };
}

/**
 * The one true line under the greeting, from what the phone holds:
 * "2 workouts, 95 min in 7 days · 941 kcal left today". With nothing logged yet (no workout in 7 days
 * and no food today) it says what the coach answers from, never a number that means nothing yet. Over
 * the budget it says so in plain figures ("120 kcal above today's budget"), never a verdict.
 * `kcalLeft` is null when there is no budget to count from.
 */
export function helloLine(input: { sessions: number; minutes: number; kcalLeft: number | null; foodToday: boolean }): string {
  const { sessions, minutes, kcalLeft, foodToday } = input;
  if (sessions <= 0 && !foodToday) return HELLO_FRESH;
  const move =
    sessions > 0 ? `${sessions === 1 ? '1 workout' : `${formatNumber(sessions)} workouts`}, ${formatNumber(minutes)} min in 7 days` : 'No workouts in the last 7 days';
  if (kcalLeft === null || !Number.isFinite(kcalLeft)) return move;
  const k = Math.round(kcalLeft);
  const food = k >= 0 ? `${formatNumber(k)} kcal left today` : `${formatNumber(-k)} kcal above today’s budget`;
  return `${move} · ${food}`;
}

/**
 * The two AI starters for now, the first two that apply of: after a workout logged today; from 15:00
 * with protein under 60% of today's target; planning next week; water around a workout.
 */
export function coachStarters(s: { workoutToday: boolean; proteinShare: number; hour: number }): [string, string] {
  const all: string[] = [];
  if (s.workoutToday) all.push(STARTER_AFTER_WORKOUT);
  if (s.hour >= 15 && s.proteinShare < 0.6) all.push(STARTER_PROTEIN);
  all.push(STARTER_PLAN, STARTER_WATER);
  return [all[0], all[1]];
}

export type FollowUp = 'training' | 'ideas' | 'share';

/** The day a message was written, in the phone's own calendar. */
function dayOf(at: number): ISODate {
  return toISODate(new Date(at));
}

/**
 * The chips under the newest message, at most two: the phone question not just answered (both after
 * anything else), and none while a question is on its way. `offerShare` (ruling L6: the first AI answer
 * of this opening while the week is not shared) puts "Let the coach see my week" first.
 */
export function followUps(newest: CoachMessage | null | undefined, today: ISODate, opts: { busy?: boolean; offerShare?: boolean } = {}): FollowUp[] {
  if (!newest || opts.busy || newest.role === 'user') return [];
  const fresh = dayOf(newest.at) === today;
  if (newest.source === 'ai' && opts.offerShare) return ['share', 'ideas'];
  if (fresh && newest.source === 'local') return newest.topic === 'training' ? ['ideas'] : ['training'];
  return ['training', 'ideas'];
}

/** The calendar day of a message (for the chat's day dividers and "is it from today"). */
export function messageDay(at: number): ISODate {
  return dayOf(at);
}
