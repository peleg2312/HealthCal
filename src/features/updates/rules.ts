/**
 * When an over-the-air update is looked for and when a downloaded one starts. No React, no
 * expo-updates: the glue in ./updates.ts asks these and does what they say. Unit-tested.
 *
 * The library itself checks and downloads at every cold start (app.json: checkAutomatically
 * ON_LOAD) and starts a downloaded update at the next cold start. An app can stay in memory for
 * days, so the app also looks when it comes back to the front, at most every CHECK_EVERY_MS.
 * A downloaded update is started early only at the moment Today and the diary already go back to
 * today (backToToday.ts: five minutes or more away, or another calendar day), and only when
 * nothing can be lost: a tab is showing, no sheet is open, everything is saved on the device,
 * and the same update was not already tried (so a restart can never loop).
 */
import { backToTodayOnReturn, type Away } from '@/features/today/backToToday';
import { formatShortDate, toISODate } from '@/lib/dates';
import type { ISODate } from '@/types';

/** Looked for on return to the front at most this often (the launch check counts). */
export const CHECK_EVERY_MS = 4 * 3_600_000;

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
  if (!backToTodayOnReturn(f.away, f.now, f.today)) return false;
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
  if (r.emergency) return 'Running the installed version';
  if (r.embedded || !r.createdAt || Number.isNaN(r.createdAt.getTime())) return null;
  const day = toISODate(r.createdAt);
  const year = day.slice(0, 4);
  return `Updated ${formatShortDate(day)}${year === today.slice(0, 4) ? '' : `, ${year}`}`;
}

/** The manual check on About. */
export type CheckPhase = 'idle' | 'checking' | 'current' | 'ready' | 'failed' | 'restart-failed';

/** The words beside the check control, or null when it says nothing. */
export function checkLine(phase: CheckPhase): string | null {
  switch (phase) {
    case 'current':
      return 'Up to date';
    case 'failed':
      return 'Could not check right now';
    case 'ready':
      return 'An update is ready';
    case 'restart-failed':
      return 'Close and open the app to update';
    default:
      return null;
  }
}
