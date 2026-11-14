/**
 * What a friend is allowed to see of a week: active minutes, sessions, the
 * logging streak and recent workouts (activity, length, distance, date).
 * Calories, weight, food, heart rate, notes, the time of day and anything
 * naming a place are never part of it. Pure, so the rule is unit-tested; the
 * server rebuilds the summary from the same short list of fields.
 */
import { ACTIVITY_BY_ID } from '@/data/activities';
import { addDays, startOfWeek } from '@/lib/dates';
import { guidelineMinutes } from '@/lib/exercise';
import { sha256Hex } from '@/lib/sha256';
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
  /** An opaque reference (see shareRef), never the record id. Cheers carry it. */
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

/**
 * A friend's summary as the server sent it, made safe to draw: anything that is
 * not the expected shape is dropped, and a workout without a name is "Workout".
 * One malformed entry must never take the Friends screen down.
 */
export function cleanFriendSummary(raw: unknown): FriendSummary {
  if (!raw || typeof raw !== 'object') return {};
  const o = raw as Record<string, unknown>;
  const count = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : undefined);
  const day = (v: unknown): ISODate | undefined => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? (v as ISODate) : undefined);
  const out: FriendSummary = {};
  const week = day(o.week);
  if (week) out.week = week;
  for (const key of ['minutes', 'sessions', 'streak'] as const) {
    const n = count(o[key]);
    if (n !== undefined) out[key] = n;
  }
  if (Array.isArray(o.workouts)) {
    const workouts: FriendWorkout[] = [];
    for (const item of o.workouts) {
      if (!item || typeof item !== 'object') continue;
      const w = item as Record<string, unknown>;
      const date = day(w.date);
      const minutes = count(w.minutes);
      if (typeof w.id !== 'string' || !w.id || !date || minutes === undefined) continue;
      const distanceKm = count(w.distanceKm);
      workouts.push({
        id: w.id,
        name: typeof w.name === 'string' && w.name.trim() ? w.name.trim() : 'Workout',
        emoji: typeof w.emoji === 'string' ? w.emoji : '',
        minutes,
        date,
        ...(distanceKm ? { distanceKm } : null),
      });
    }
    out.workouts = workouts;
  }
  return out;
}

/** Workouts older than this are not shown to friends. */
export const WORKOUT_WINDOW_DAYS = 14;
export const MAX_SHARED_WORKOUTS = 8;

/**
 * How friends refer to one of the user's workouts: the first 32 hex characters
 * of SHA-256(shareKey + ':' + recordId). The record id itself must never be
 * published, because an imported workout's id is derived from its start time.
 * shareKey is a secret the server gives only to its owner, so nobody else can
 * work back from a reference to the id. The database accepts only this shape.
 */
export function shareRef(shareKey: string, recordId: string): string {
  return sha256Hex(`${shareKey}:${recordId}`).slice(0, 32);
}

/** The user's own workouts by the reference friends cheer them with. Empty without a share key. */
export function ownWorkoutsByRef(activities: readonly ActivityEntry[], shareKey: string | null | undefined): Map<string, { name: string }> {
  if (!shareKey) return new Map();
  return new Map(activities.map((a) => [shareRef(shareKey, a.id), { name: a.name }]));
}

/**
 * The activity as friends see it: its catalogue name and emoji, never what is
 * stored on the entry, which for an imported session could have come from the
 * device's title ("Amsterdam Running"). An unknown activity is just a workout.
 */
function publicActivity(a: ActivityEntry): { name: string; emoji: string } {
  const def = ACTIVITY_BY_ID[a.activityId];
  return def ? { name: def.name, emoji: def.emoji } : { name: 'Workout', emoji: '' };
}

export function buildFriendSummary(input: { activities: ActivityEntry[]; foodEntries: FoodEntry[]; today: ISODate; sharing: SocialSharing; shareKey: string | null | undefined }): FriendSummary {
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
  // Without the owner's share key there is no safe reference, so no workouts rather than real ids.
  if (sharing.workouts && input.shareKey) {
    const key = input.shareKey;
    const since = addDays(today, -(WORKOUT_WINDOW_DAYS - 1));
    summary.workouts = live
      .filter((a) => a.date >= since)
      .sort((a, b) => b.date.localeCompare(a.date) || b.loggedAt.localeCompare(a.loggedAt))
      .slice(0, MAX_SHARED_WORKOUTS)
      .map((a) => ({
        id: shareRef(key, a.id),
        ...publicActivity(a),
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
