/**
 * When an over-the-air update is looked for and when a downloaded one starts. No React, no
 * expo-updates: the glue in ./updates.ts asks these and does what they say. Unit-tested.
 *
 * The library itself checks and downloads at every cold start (app.json: checkAutomatically
 * ON_LOAD) and starts a downloaded update at the next cold start. An app can stay in memory for
 * days, so the app also looks when it comes back to the front, at most every CHECK_EVERY_MS.
 * A downloaded update is started early only after five minutes or more away (AWAY_MS, when Today
 * and the diary go back to today too; a new calendar day alone is not enough, so a look just after
 * midnight never restarts), and only when nothing can be lost: a tab is showing, no sheet is open,
 * no sync is running, nothing was written since the return, everything is saved on the device,
 * and the same update was not already tried (so a restart can never loop).
 */
import { AWAY_MS, type Away } from '@/features/today/backToToday';
import { formatShortDate, toISODate } from '@/lib/dates';
import type { ISODate } from '@/types';

/** Looked for on return to the front at most this often (the launch check counts). */
export const CHECK_EVERY_MS = 4 * 3_600_000;

/** After a check that failed (offline), the next return looks again after this long, not CHECK_EVERY_MS. */
export const RETRY_AFTER_FAIL_MS = 15 * 60_000;

/**
 * Back in front, the restart waits this long first, so what the return itself starts (a reminder's
 * action button, Health Connect's sync, the cloud sync) runs and is seen before anything restarts.
 */
export const QUIET_MS = 1500;

/** A sync still running after the quiet moment is waited for this long at most; then no restart this time. */
export const SETTLE_MAX_MS = 10_000;

/**
 * A tab is in front: setup is done and the first route segment in front is the tab group itself.
 * A stack of one screen is not enough (a reset link or a cold-start deep link replaces the tabs
 * with a single pushed screen), and an unknown screen (null) is never a tab.
 */
export function frontIsTab(firstSegment: string | null | undefined, onboarded: boolean): boolean {
  return onboarded && firstSegment === '(tabs)';
}

/** The part of the store's state that shows a write (structural, so this file stays free of the store). */
export interface UnsentState {
  /** Per collection, the ids written on this phone and not yet sent. */
  dirty: Readonly<Record<string, Readonly<Record<string, true>>>>;
  profileDirty: boolean;
  settingsDirty: boolean;
  profile: { updatedAt?: string } | null;
  settings: { updatedAt?: string };
}

/**
 * One mark per unsent change: the record and the time it was written. Every write on this phone
 * (upsert, remove, restore, profile, settings) adds a mark or replaces one with a newer time; the
 * cloud sync's push only takes marks away. So "a mark now that was not there before" means "written
 * since", and a sync that sent what was waiting does not count as a write.
 */
export function writeMarks(s: UnsentState): string[] {
  const marks: string[] = [];
  const records = s as unknown as Record<string, Record<string, { updatedAt?: string } | undefined> | undefined>;
  for (const c of Object.keys(s.dirty)) {
    for (const id of Object.keys(s.dirty[c])) marks.push(`${c}/${id}@${records[c]?.[id]?.updatedAt ?? '?'}`);
  }
  if (s.profileDirty) marks.push(`profile@${s.profile?.updatedAt ?? '?'}`);
  if (s.settingsDirty) marks.push(`settings@${s.settings.updatedAt ?? '?'}`);
  return marks;
}

/** Something was written between the two readings (null: it could not be read, so assume it was). */
export function wroteSince(before: readonly string[] | null, now: readonly string[] | null): boolean {
  if (!before || !now) return true;
  const had = new Set(before);
  return now.some((m) => !had.has(m));
}

/** After an automatic restart, no other one for this long, whatever happens. */
export const RESTART_PAUSE_MS = 6 * 3_600_000;

/** Whether to ask the server again now. A clock set back counts as due. */
export function checkDue(lastCheckAt: number | null, now: number): boolean {
  if (lastCheckAt === null) return true;
  if (now < lastCheckAt) return true;
  return now - lastCheckAt >= CHECK_EVERY_MS;
}

/** The last automatic restart this phone made (kept on the device, so it outlives the restart). */
export interface RestartAttempt {
  /** The update it restarted into, when known. */
  target: string | null;
  at: number;
}

export interface ReturnFacts {
  /** When and on which day the app left the front (null: it never left). */
  away: Away | null;
  now: number;
  today: ISODate;
  /** A newer update is downloaded and waiting. */
  pending: boolean;
  /** Its id, when the library says. */
  pendingId: string | null;
  /** The update running now (null: the code the app was installed with). */
  runningId: string | null;
  /** One of the four tabs is the screen in front. */
  onTab: boolean;
  sheetOpen: boolean;
  /** The store's last write reached the device. */
  saved: boolean;
  /** The library fell back to the built-in code because an update did not start. */
  emergency: boolean;
  /** reloadAsync failed earlier in this run of the app. */
  reloadFailed: boolean;
  attempt: RestartAttempt | null;
}

/** Whether to start the downloaded update now, as the app comes back to the front. */
export function restartOnReturn(f: ReturnFacts): boolean {
  if (!f.pending || f.reloadFailed || f.emergency) return false;
  if (f.pendingId !== null && f.pendingId === f.runningId) return false;
  // Five minutes or more away. A clock set back while away counts as no time away.
  if (!f.away || f.now - f.away.at < AWAY_MS) return false;
  if (!f.onTab || f.sheetOpen || !f.saved) return false;
  if (f.attempt) {
    // That update was started once already and is waiting again: it did not stick. The next cold start takes it.
    if (f.pendingId !== null && f.attempt.target === f.pendingId) return false;
    const since = f.now - f.attempt.at;
    if (since >= 0 && since < RESTART_PAUSE_MS) return false;
  }
  return true;
}

/** What the running code is, for About. */
export interface Running {
  /** The code the app was installed with (no update running). */
  embedded: boolean;
  /** The library fell back to the built-in code after an update did not start. */
  emergency: boolean;
  /** When the running update was published. */
  createdAt: Date | null;
}

/** The line under "HealthCal 1.0.0", or null when the installed code runs normally. */
export function runningLine(r: Running | null, today: ISODate): string | null {
  if (!r) return null;
  if (r.emergency) return 'Running the version you installed. The next update arrives by itself.';
  if (r.embedded || !r.createdAt || Number.isNaN(r.createdAt.getTime())) return null;
  const day = toISODate(r.createdAt);
  const year = day.slice(0, 4);
  return `Updated ${formatShortDate(day)}${year === today.slice(0, 4) ? '' : `, ${year}`}`;
}

/**
 * About's check and restart. 'restart-wait': the restart was refused because something was still
 * saving or syncing (try again in a moment). 'restart-failed': it could not restart this run of the
 * app (the library starts the update at the next cold start by itself).
 */
export type CheckPhase = 'idle' | 'checking' | 'current' | 'ready' | 'failed' | 'restart-wait' | 'restart-failed';

/** What About's restart reported (Updater.restartNow). */
export type RestartResult = 'restarted' | 'nothing-waiting' | 'busy' | 'unsaved' | 'failed';

/** The phase a restart request leaves behind. */
export function phaseAfterRestart(r: RestartResult, stillPending: boolean): CheckPhase {
  if (r === 'busy' || r === 'unsaved') return 'restart-wait';
  if (r === 'failed') return 'restart-failed';
  return stillPending ? 'ready' : 'idle';
}

/** What the foot of About shows: one line of status, and which control. */
export interface AboutState {
  /** The status line ('' says nothing; the line stays mounted so a screen reader hears it change). */
  line: string;
  /** Offer "Restart to update" (a downloaded update is waiting and restarting can work). */
  restart: boolean;
  /** Under the restart button: what a restart does. */
  restartNote: string | null;
}

export const RESTART_NOTE = 'HealthCal closes and opens again on Today. Everything you logged is saved.';

/**
 * The foot of About from the two facts it has. Whether an update is waiting comes first: a check's
 * result ("Up to date", "Could not check right now") never shows beside a waiting update, however
 * the update arrived (About's check, the return to the front, or the library's launch download).
 */
export function aboutState(pending: boolean, phase: CheckPhase): AboutState {
  if (pending) {
    if (phase === 'restart-failed') return { line: 'The update starts the next time HealthCal opens', restart: false, restartNote: null };
    if (phase === 'restart-wait') return { line: 'Something is still saving. Try again in a moment', restart: true, restartNote: null };
    return { line: 'An update is ready', restart: true, restartNote: RESTART_NOTE };
  }
  switch (phase) {
    case 'checking':
      return { line: 'Checking for updates', restart: false, restartNote: null };
    case 'current':
      return { line: 'Up to date', restart: false, restartNote: null };
    case 'failed':
      return { line: 'Could not check right now', restart: false, restartNote: null };
    default:
      return { line: '', restart: false, restartNote: null };
  }
}
