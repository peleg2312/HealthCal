/**
 * The steps around the rules in ./rules.ts, with everything outside them passed in (the library,
 * the clock, the screen in front, saving), so the tests drive it with ./fake.ts. ./updates.ts
 * wires it to the app. Nothing here throws: every failure is a console.warn and the app goes on.
 */
import type { Away } from '@/features/today/backToToday';
import type { ISODate } from '@/types';

import type { UpdatesPort } from './port';
import { checkDue, CHECK_EVERY_MS, QUIET_MS, restartOnReturn, RETRY_AFTER_FAIL_MS, SETTLE_MAX_MS, wroteSince, type RestartAttempt, type RestartResult, type ReturnFacts } from './rules';

export interface UpdaterEnv {
  port: UpdatesPort;
  now: () => number;
  today: () => ISODate;
  /** One of the four tabs is the screen in front. */
  onTab: () => boolean;
  sheetOpen: () => boolean;
  /** Something is writing now (Health Connect's sync, the cloud sync): never restart under it. */
  busy: () => boolean;
  /**
   * What the person or this phone has written and not yet sent, one mark per change (writeMarks in
   * ./rules). Compared from the moment the app left to just before the restart: a new mark in
   * between (a reminder's "Add 250 ml", a synced workout) means no restart this time.
   */
  revision: () => readonly string[];
  /** Writes whatever the store has not saved yet; true when it is all on the device. */
  flush: () => Promise<boolean>;
  readAttempt: () => Promise<RestartAttempt | null>;
  /** null removes the record. */
  writeAttempt: (a: RestartAttempt | null) => Promise<void>;
  /** The screen colour shown for the moment the restart takes. */
  background: () => string;
  sleep: (ms: number) => Promise<void>;
  warn: (...args: unknown[]) => void;
}

/** What looking for an update found. */
export type LookResult = 'current' | 'ready' | 'failed';
/** What coming back to the front did. */
export type ReturnResult = 'restarted' | 'looked' | 'nothing';

export interface Updater {
  /** The app left the front (background, or inactive on the way there). */
  left: () => void;
  /** The app is in front again. */
  returned: () => Promise<ReturnResult>;
  /** Ask the server now and download what it has (About's check, and the return to the front). */
  look: () => Promise<LookResult>;
  /** Start the downloaded update now, after saving (About's "Restart to update"); says why when it did not. */
  restartNow: () => Promise<RestartResult>;
}

export function createUpdater(env: UpdaterEnv): Updater {
  const { port } = env;
  // The library looked at launch (checkAutomatically ON_LOAD), so the first return does not ask again.
  let lastCheckAt: number | null = env.now();
  let reloadFailed = false;
  let looking: Promise<LookResult> | null = null;
  let away: Away | null = null;
  /** What was written when the app left: any write since then (in the background or on the way back) means no restart. */
  let leftRevision: readonly string[] | null = null;
  /** Counts the times the app left the front, so a wait can tell it left again meanwhile. */
  let leaves = 0;

  const safely = <T>(fn: () => T, fallback: T): T => {
    try {
      return fn();
    } catch (error) {
      env.warn('[updates] could not read the app state', error);
      return fallback;
    }
  };

  const facts = (was: Away | null, now: number, saved: boolean, attempt: RestartAttempt | null): ReturnFacts => {
    const p = port.pending();
    return {
      away: was,
      now,
      today: env.today(),
      pending: p.pending,
      pendingId: p.id,
      runningId: port.running.updateId,
      onTab: safely(env.onTab, false),
      sheetOpen: safely(env.sheetOpen, true),
      saved,
      emergency: port.running.emergency,
      reloadFailed,
      attempt,
    };
  };

  const busy = () => safely(env.busy, true);
  const revision = () => safely<readonly string[] | null>(env.revision, null);

  /**
   * Records the attempt (so it is never repeated), checks once more that nothing was written since
   * `since` and nothing is running, then reloads. `still` re-checks whatever else must hold.
   */
  const restart = async (target: string | null, since: readonly string[] | null, previous: RestartAttempt | null, still: () => boolean): Promise<RestartResult> => {
    try {
      await env.writeAttempt({ target, at: env.now() });
    } catch (error) {
      // Without the record a restart that does not stick could repeat: wait for the next cold start.
      env.warn('[updates] could not record the restart, leaving it for the next start', error);
      return 'failed';
    }
    // The record took a moment to write: the last look, in the same tick as the reload.
    if (busy() || wroteSince(since, revision()) || !still()) {
      await env.writeAttempt(previous).catch((error) => env.warn('[updates] could not put the restart record back', error));
      return 'busy';
    }
    try {
      await port.reload(env.background());
      return 'restarted';
    } catch (error) {
      reloadFailed = true;
      env.warn('[updates] restarting into the update failed; it starts at the next cold start', error);
      return 'failed';
    }
  };

  /** Waits for a running sync to end; false when it did not in time or the app left meanwhile. */
  const settle = async (leftAt: number): Promise<boolean> => {
    await env.sleep(QUIET_MS);
    for (let waited = 0; busy(); waited += 500) {
      if (waited >= SETTLE_MAX_MS || leaves !== leftAt) return false;
      await env.sleep(500);
    }
    return leaves === leftAt;
  };

  const look = (): Promise<LookResult> => {
    if (looking) return looking;
    looking = (async (): Promise<LookResult> => {
      const startedAt = env.now();
      try {
        let result: LookResult;
        if (port.pending().pending) result = 'ready';
        else if (!(await port.check())) result = 'current';
        else result = (await port.fetch()) || port.pending().pending ? 'ready' : 'current';
        lastCheckAt = startedAt;
        return result;
      } catch (error) {
        env.warn('[updates] looking for an update failed', error);
        // Offline: look again on a return RETRY_AFTER_FAIL_MS from now, not hours later.
        lastCheckAt = startedAt - CHECK_EVERY_MS + RETRY_AFTER_FAIL_MS;
        return 'failed';
      } finally {
        looking = null;
      }
    })();
    return looking;
  };

  return {
    left: () => {
      leaves += 1;
      // iOS passes through 'inactive' on the way to 'background': the first one counts.
      if (!away) {
        away = { at: env.now(), day: env.today() };
        leftRevision = revision();
      }
    },
    returned: async () => {
      const was = away;
      // What was unsent when the app left (null when it could not be read: then nothing restarts).
      const since = was ? leftRevision : revision();
      away = null;
      leftRevision = null;
      const leftAt = leaves;
      try {
        const now = env.now();
        // Cheap facts first (saving assumed); only when they allow a restart is anything awaited.
        if (restartOnReturn(facts(was, now, true, null)) && (await settle(leftAt))) {
          const [saved, attempt] = await Promise.all([env.flush().catch(() => false), env.readAttempt().catch(() => null)]);
          // Read the screen again: a sheet may have opened while the save ran.
          const f = facts(was, now, saved, attempt);
          if (restartOnReturn(f) && leaves === leftAt) {
            const still = () => leaves === leftAt && restartOnReturn(facts(was, now, saved, attempt));
            if ((await restart(f.pendingId, since, attempt, still)) === 'restarted') return 'restarted';
          }
        }
        if (was && leaves === leftAt && checkDue(lastCheckAt, env.now())) {
          // Downloaded now, started at the next qualifying return or cold start: never under the person's finger.
          await look();
          return 'looked';
        }
      } catch (error) {
        env.warn('[updates] return to the front', error);
      }
      return 'nothing';
    },
    look,
    restartNow: async () => {
      if (!port.pending().pending) return 'nothing-waiting';
      // This run of the app could not reload once: it will not now either. The next cold start takes it.
      if (reloadFailed) return 'failed';
      if (busy()) return 'busy';
      const since = revision();
      const [saved, previous] = await Promise.all([env.flush().catch(() => false), env.readAttempt().catch(() => null)]);
      if (!saved) {
        env.warn('[updates] not restarting: the last save did not reach the device');
        return 'unsaved';
      }
      return restart(port.pending().id, since, previous, () => port.pending().pending);
    },
  };
}
