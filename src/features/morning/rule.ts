/**
 * When the morning page ("Yesterday") opens by itself. Pure: no React, no storage, no clock;
 * the hook (./useMorningPage) gathers the input and acts on the verdict. Unit-tested.
 *
 * The page opens on the first visit of a new day in the morning, once a day (the seen day is kept
 * on the device and, for someone signed in, in the synced settings once this morning's pull has
 * landed), and never over something the person came for: a reminder's action, a deep link,
 * another tab, a pushed screen or an open sheet. Only the verdict 'due' writes anything; every
 * other one marks nothing, so a reminder that opens the app at 07:00 leaves a plain open at 07:30
 * its page, and after noon it does not appear that day.
 */
import { AWAY_MS, type Away } from '@/features/today/backToToday';
import type { ISODate } from '@/types';

/** 04:00, inclusive. Before it the person is still in last evening, so "yesterday" would be wrong. */
export const MORNING_FROM = 4 * 60;
/** 12:00, exclusive. After noon the page would be a delay rather than a greeting. */
export const MORNING_UNTIL = 12 * 60;
/**
 * A reminder answered this long (ms) before a look began, or at any moment after, is what the
 * person came for: no page over it. Measured from the start of the look, not from its end, so a
 * busy start-up that delays the decision cannot let the page open over the reminder's action.
 */
export const REMINDER_WINDOW_MS = 3000;

export type MorningReason =
  | 'automated'
  | 'off'
  | 'no-setup'
  | 'setup-today'
  | 'seen'
  | 'not-morning'
  | 'nothing-yesterday'
  | 'elsewhere'
  | 'sheet'
  | 'reminder'
  | 'link'
  | 'due';

export interface MorningInput {
  today: ISODate;
  /** Local minutes since midnight. */
  minutes: number;
  /** The automation gate (./allowed): false in an automated browser or a test build unless the test asks. */
  allowed: boolean;
  /** settings.morningSummary !== false */
  enabled: boolean;
  /** The local day setup finished, or null without a profile. */
  onboardedDay: ISODate | null;
  /** settings.morningSeenDay */
  seenDay: ISODate | undefined;
  /** Live (not deleted) records dated yesterday. Steps, weigh-ins and sleep do not count. */
  yesterday: { food: number; activities: number; water: number };
  /** Today is the focused route. */
  onToday: boolean;
  /** A sheet is on screen. */
  sheetOpen: boolean;
  /** When a reminder was last answered (ms), or null. */
  reminderAt: number | null;
  /**
   * A reminder answered at or after this moment (ms) belongs to this visit: the look's start less
   * REMINDER_WINDOW_MS (`reminderSince`), or for a cold start the launch itself, so any reminder
   * answered since the app started counts.
   */
  reminderFrom: number;
  /** This visit came from a deep link. */
  linked: boolean;
}

export interface MorningVerdict {
  open: boolean;
  reason: MorningReason;
}

const no = (reason: MorningReason): MorningVerdict => ({ open: false, reason });

/** The checks run in order and the first that fails decides. */
export function morningVerdict(i: MorningInput): MorningVerdict {
  if (!i.allowed) return no('automated');
  if (!i.enabled) return no('off');
  if (i.onboardedDay === null) return no('no-setup');
  // Someone who set up yesterday does see it: yesterday was their first day.
  if (i.onboardedDay >= i.today) return no('setup-today');
  // A seen day later than today (a clock set back, a flight west over the date line) is seen too.
  if (i.seenDay !== undefined && i.seenDay >= i.today) return no('seen');
  if (i.minutes < MORNING_FROM || i.minutes >= MORNING_UNTIL) return no('not-morning');
  const { food, activities, water } = i.yesterday;
  if (food + activities + water === 0) return no('nothing-yesterday');
  if (!i.onToday) return no('elsewhere');
  if (i.sheetOpen) return no('sheet');
  if (i.reminderAt !== null && i.reminderAt >= i.reminderFrom) return no('reminder');
  if (i.linked) return no('link');
  return { open: true, reason: 'due' };
}

export function morningShows(i: MorningInput): boolean {
  return morningVerdict(i).open;
}

/** The start of the reminder window for a look that began at `lookStartedAt` (ms). */
export function reminderSince(lookStartedAt: number): number {
  return lookStartedAt - REMINDER_WINDOW_MS;
}

/**
 * The look found the app on another tab or a pushed screen, and nothing else stood in the way:
 * the page waits for the person's next arrival on Today (that day only). Not after a reminder or
 * a link (they decide first), and not for an open sheet (the person is busy on Today itself).
 */
export function waitsForToday(i: MorningInput): boolean {
  return morningVerdict(i).reason === 'elsewhere' && morningVerdict({ ...i, onToday: true }).open;
}

/**
 * A downloaded over-the-air update starts on a return after AWAY_MS or more away (see
 * src/features/updates/rules.ts): on such a return the morning page stays out of its way, because
 * leaving Today would stop the restart. The restart is a cold start, which looks again.
 */
export function yieldsToUpdate(updatePending: boolean, away: Away | null, now: number): boolean {
  return updatePending && away !== null && now - away.at >= AWAY_MS;
}

/** The later of two seen days (the one on this device and the synced one). */
export function laterDay(a: ISODate | undefined, b: ISODate | undefined): ISODate | undefined {
  if (a === undefined) return b;
  if (b === undefined) return a;
  return a >= b ? a : b;
}

/**
 * The cloud sync ran a whole round (push and pull) that ended after `since` (ms) and left
 * nothing in error: settings written now cannot replace a change another device made overnight.
 */
export function pulledSince(status: string, lastRunAt: string | null, since: number): boolean {
  if (status !== 'idle' || !lastRunAt) return false;
  const at = Date.parse(lastRunAt);
  return Number.isFinite(at) && at >= since;
}

/**
 * Where a link points: its path (no leading or trailing slash; '' is Today) and its query, or
 * null for no link at all (nothing, a development build's launcher link, a page with no address
 * of its own such as about:srcdoc). Handles custom schemes (healthcal://friends/add?invite=...,
 * where the "host" is part of the route), web and universal links (https://host/path), Expo Go's
 * exp://host:port/--/path and a plain path ('/diary?date=...').
 */
export function linkTarget(url: string | null | undefined): { path: string; query: string } | null {
  if (!url || !url.trim()) return null;
  const text = url.trim();
  if (/^(about|blob|data|javascript):/i.test(text)) return null;
  const m = /^([a-z][a-z0-9+.-]*):\/\/(.*)$/i.exec(text);
  let rest: string;
  if (!m) rest = text;
  else {
    const scheme = m[1].toLowerCase();
    rest = m[2];
    if (scheme === 'http' || scheme === 'https' || scheme === 'exp' || scheme === 'exps') {
      // Drop the host (and port): what follows it is the path.
      const slash = rest.search(/[/?#]/);
      rest = slash < 0 ? '' : rest.slice(slash);
      // Expo Go puts the app's own path after /--.
      const at = scheme.startsWith('exp') ? rest.indexOf('/--') : -1;
      if (at >= 0) rest = rest.slice(at + 3);
    } else if (/^expo-development-client(\/|\?|$)/.test(rest)) {
      // A development build opened from its launcher, not a link into the app.
      return null;
    }
  }
  const noHash = rest.split('#')[0];
  const q = noHash.indexOf('?');
  return { path: (q < 0 ? noHash : noHash.slice(0, q)).replace(/^\/+|\/+$/g, ''), query: q < 0 ? '' : noHash.slice(q + 1) };
}

/**
 * Whether a link the app was opened with is a plain open (no link at all, or one to Today with
 * nothing in it) rather than a link to somewhere the person meant to go.
 */
export function isPlainLink(url: string | null | undefined): boolean {
  const t = linkTarget(url);
  return t === null || (t.path === '' && t.query === '');
}

/**
 * The app was started by a link that leads to Today itself with something in it ('/?ref=mail').
 * A start-up link to anywhere else lands on that screen ('elsewhere'); when the person then goes
 * to Today (on web Today is first drawn only then), that is their own visit, not the link's.
 */
export function linkToToday(url: string | null | undefined): boolean {
  const t = linkTarget(url);
  return t !== null && t.path === '' && t.query !== '';
}
