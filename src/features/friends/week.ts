/**
 * Pure helpers for the Friends screens: a friend's week built from the parts
 * they share, plain-words labels for days, cheers and request outcomes, and
 * how a person's mark (initials or an emoji) is shown. No React, no storage.
 */
import { addDays, diffDays, formatShortDate, fromISODate, startOfWeek, toISODate } from '@/lib/dates';
import type { ISODate } from '@/types';

import type { FriendSummary, FriendWorkout } from './summary';

/** Minutes that fill a friend's day cup to the brim. A full cup is an hour; more never shows as "over". */
export const CUP_FULL_MINUTES = 60;

export interface FriendDay {
  date: ISODate;
  minutes: number;
  /** 0..1 of a full cup. */
  progress: number;
  future: boolean;
}

/**
 * Seven days (Monday first) of the week containing `today`, filled from the
 * friend's shared workouts. Null when the friend does not share workouts:
 * the row of cups is left out rather than drawn empty.
 */
export function friendWeek(summary: FriendSummary, today: ISODate): FriendDay[] | null {
  if (!summary.workouts) return null;
  const monday = startOfWeek(today);
  const byDate = new Map<string, number>();
  for (const w of summary.workouts) {
    if (!w.date || typeof w.minutes !== 'number') continue;
    byDate.set(w.date, (byDate.get(w.date) ?? 0) + w.minutes);
  }
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(monday, i);
    const minutes = byDate.get(date) ?? 0;
    return { date, minutes, progress: Math.min(1, minutes / CUP_FULL_MINUTES), future: date > today };
  });
}

/** Whether the minutes and sessions are for the week containing `today` (a friend's device may not have sent this week yet). */
export function isCurrentWeek(summary: FriendSummary, today: ISODate): boolean {
  return !summary.week || summary.week === startOfWeek(today);
}

/** The newest shared workout, if any. */
export function latestWorkout(summary: FriendSummary): FriendWorkout | null {
  const list = (summary.workouts ?? []).filter((w) => w && w.id);
  if (!list.length) return null;
  return [...list].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))[0];
}

/** Whether the friend shares anything at all right now. */
export function sharesAnything(summary: FriendSummary): boolean {
  return typeof summary.minutes === 'number' || typeof summary.streak === 'number' || (summary.workouts?.length ?? 0) > 0;
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** "Today", "Yesterday", "Wednesday" within the last week, else "Nov 2". `today` is passed in so nothing reads the clock while rendering. */
export function dayLabel(date: ISODate, today: ISODate): string {
  const ago = diffDays(date, today);
  if (ago === 0) return 'Today';
  if (ago === 1) return 'Yesterday';
  if (ago > 1 && ago < 7) return WEEKDAYS[fromISODate(date).getDay()];
  return formatShortDate(date);
}

/** A cheer's reference in the user's words: "your run", "your day on Monday". */
export function cheerTarget(ref: string, ownWorkouts: Map<string, { name: string }>, today: ISODate): string {
  if (ref.startsWith('day:')) {
    const date = ref.slice(4);
    // Only a real date of the last few weeks is named (a cheer is shown for two weeks).
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || toISODate(fromISODate(date)) !== date) return 'your day';
    const ago = diffDays(date, today);
    if (ago < 0 || ago > 28) return 'your day';
    const label = dayLabel(date, today);
    return label === 'Today' ? 'your day today' : label === 'Yesterday' ? 'your day yesterday' : `your day on ${label}`;
  }
  const w = ownWorkouts.get(ref);
  return w ? `your ${activityNoun(w.name)}` : 'a workout of yours';
}

/** "Running" -> "run", "Strength training" -> "strength training". Reads naturally after "your". */
export function activityNoun(name: string): string {
  const n = name.trim().toLowerCase();
  const nouns: Record<string, string> = { running: 'run', walking: 'walk', cycling: 'ride', swimming: 'swim', hiking: 'hike', rowing: 'row' };
  return nouns[n] ?? (n || 'workout');
}

/** True when an avatar is an emoji (anything that is not plain letters and digits). */
export function isEmojiAvatar(avatar: string): boolean {
  const a = avatar.trim();
  return a.length > 0 && !/^[\p{L}\p{N}]+$/u.test(a);
}

/** Up to two initials from a name: "Sam Ortiz" -> "SO", "maya" -> "M". */
export function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  const first = Array.from(parts[0])[0] ?? '';
  const last = parts.length > 1 ? (Array.from(parts[parts.length - 1])[0] ?? '') : '';
  return (first + last).toUpperCase();
}

/** What a person's mark shows: their emoji, the letters they chose, or initials of their name. */
export function personMark(name: string, avatar: string): { kind: 'emoji' | 'initials'; text: string } {
  const a = avatar.trim();
  if (isEmojiAvatar(a)) return { kind: 'emoji', text: a };
  if (a) return { kind: 'initials', text: Array.from(a).slice(0, 2).join('').toUpperCase() };
  return { kind: 'initials', text: initialsFor(name) };
}

export type RequestOutcomeKey = 'sent' | 'accepted' | 'already_friends' | 'not_found' | 'self' | 'too_many' | 'limit' | 'setup_needed';

/** Every answer `requestFriend` can give, in plain words. `good` marks the ones where something worked. */
export function outcomeMessage(outcome: string, name?: string): { title: string; message: string; good: boolean } {
  const who = name?.trim() || 'They';
  const them = name?.trim() || 'them';

  switch (outcome as RequestOutcomeKey) {
    case 'sent':
      return { title: 'Request sent', message: `${who} will see it next time they open Friends. You will see their week once they accept.`, good: true };
    case 'accepted':
      return { title: 'You are now friends', message: `${who} had already asked to be friends, so entering their code accepted it.`, good: true };
    case 'already_friends':
      return { title: 'Already friends', message: `You and ${them} are already friends.`, good: true };
    case 'not_found':
      return { title: 'No one has that code', message: 'Check the eight letters and numbers and try again. Codes never use I, L, O, 0 or 1.', good: false };
    case 'self':
      return { title: 'That is your own code', message: 'Share it with a friend so they can add you, or enter theirs here.', good: false };
    case 'too_many':
      return { title: 'Too many tries', message: 'Several codes in the last hour did not match anyone. Try again in an hour.', good: false };
    case 'limit':
      return { title: 'Limit reached', message: 'You have as many friends or open requests as the app allows. Remove one or take a request back to add someone new.', good: false };
    case 'setup_needed':
      return { title: 'Turn on friends first', message: 'Choose the name friends will see and what you share, then add them.', good: false };
    default:
      return { title: 'Something went wrong', message: 'The request could not be sent. Try again.', good: false };
  }
}

/** The sentence under the invite code: what friends see, and what they never see. */
export function sharingSentence(sharing: { workouts: boolean; streak: boolean; minutes: boolean }): string {
  const parts = [sharing.minutes ? 'minutes and sessions' : null, sharing.streak ? 'streak' : null, sharing.workouts ? 'workouts' : null].filter(Boolean) as string[];
  const seen = parts.length === 0 ? 'only your name' : parts.length === 1 ? `your ${parts[0]}` : `your ${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
  return `Friends see ${seen}. Never calories, weight or food.`;
}
