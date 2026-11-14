/**
 * What a friend is allowed to see of a week: active minutes, sessions, the
 * logging streak and recent workouts (name, length, distance). Calories,
 * weight and food are never part of it. Pure, so the rule is unit-tested;
 * the server rebuilds the summary from the same short list of fields.
 */
import { addDays, startOfWeek } from '@/lib/dates';
import { guidelineMinutes } from '@/lib/exercise';
import { computeConsistency } from '@/store/selectors';
import type { ActivityEntry, FoodEntry, ISODate } from '@/types';

export interface SocialSharing {
  /** Recent workouts: what and how long. */
  workouts: boolean;
  /** The logging streak in days. */
  streak: boolean;
  /** Active minutes and number of sessions this week. */
  minutes: boolean;
}

export const DEFAULT_SHARING: SocialSharing = { workouts: true, streak: true, minutes: true };

export interface FriendWorkout {
  id: string;
  name: string;
  emoji: string;
  minutes: number;
  date: ISODate;
  distanceKm?: number;
}

export interface FriendSummary {
  /** Monday of the week the numbers are for. */
  week?: ISODate;
  /** Minutes toward the weekly activity guideline, counted as on the Train screen. */
  minutes?: number;
  sessions?: number;
  streak?: number;
  workouts?: FriendWorkout[];
}

/** Workouts older than this are not shown to friends. */
export const WORKOUT_WINDOW_DAYS = 14;
export const MAX_SHARED_WORKOUTS = 8;

export function buildFriendSummary(input: { activities: ActivityEntry[]; foodEntries: FoodEntry[]; today: ISODate; sharing: SocialSharing }): FriendSummary {
  const { today, sharing } = input;
  const week = startOfWeek(today);
  const live = input.activities.filter((a) => !a.deleted && a.date <= today);
  const summary: FriendSummary = { week };

  if (sharing.minutes) {
    const thisWeek = live.filter((a) => a.date >= week);
    summary.minutes = Math.round(guidelineMinutes(thisWeek));
    summary.sessions = thisWeek.length;
  }
  if (sharing.streak) {
    const dates = new Set(input.foodEntries.filter((e) => !e.deleted).map((e) => e.date));
    summary.streak = computeConsistency(dates, today).streak;
  }
  if (sharing.workouts) {
    const since = addDays(today, -(WORKOUT_WINDOW_DAYS - 1));
    summary.workouts = live
      .filter((a) => a.date >= since)
      .sort((a, b) => b.date.localeCompare(a.date) || b.loggedAt.localeCompare(a.loggedAt))
      .slice(0, MAX_SHARED_WORKOUTS)
      .map((a) => ({
        id: a.id,
        name: a.name,
        emoji: a.emoji,
        minutes: Math.round(a.durationMin),
        date: a.date,
        ...(a.distanceKm && a.distanceKm > 0 ? { distanceKm: Math.round(a.distanceKm * 10) / 10 } : null),
      }));
  }
  return summary;
}

/** A stable text form, to tell whether the summary changed since it was last sent. */
export function summarySignature(s: FriendSummary): string {
  return JSON.stringify([s.week ?? null, s.minutes ?? null, s.sessions ?? null, s.streak ?? null, (s.workouts ?? []).map((w) => [w.id, w.name, w.minutes, w.date, w.distanceKm ?? null])]);
}

/** A friend's code as typed or pasted: letters and digits only, upper case. */
export function normalizeCode(text: string): string {
  return text.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 8);
}

/** Codes are eight characters from an alphabet without look-alikes. */
export function isCompleteCode(code: string): boolean {
  return /^[A-HJKMNP-Z2-9]{8}$/.test(code);
}

/** 'ABCD2345' -> 'ABCD 2345', easier to read out. */
export function formatCode(code: string): string {
  const c = normalizeCode(code);
  return c.length > 4 ? `${c.slice(0, 4)} ${c.slice(4)}` : c;
}

/** The reference a cheer for a whole day carries. */
export const dayRef = (date: ISODate) => `day:${date}`;
