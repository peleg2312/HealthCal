/**
 * The steps around the rules in ./rules.ts, with everything outside them passed in (the library,
 * the clock, the screen in front, saving), so the tests drive it with ./fake.ts. ./updates.ts
 * wires it to the app. Nothing here throws: every failure is a console.warn and the app goes on.
 */
import type { Away } from '@/features/today/backToToday';
import type { ISODate } from '@/types';

import type { UpdatesPort } from './port';
import { checkDue, restartOnReturn, type RestartAttempt, type ReturnFacts } from './rules';

export interface UpdaterEnv {
  port: UpdatesPort;
  now: () => number;
  today: () => ISODate;
  /** One of the four tabs is the screen in front. */
  onTab: () => boolean;
  sheetOpen: () => boolean;
  /** Writes whatever the store has not saved yet; true when it is all on the device. */
  flush: () => Promise<boolean>;
  readAttempt: () => Promise<RestartAttempt | null>;
  writeAttempt: (a: RestartAttempt) => Promise<void>;
  /** The screen colour shown for the moment the restart takes. */
  background: () => string;
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
  /** Start the downloaded update now, after saving (About's "Restart to update"). False when it could not. */
  restartNow: () => Promise<boolean>;
}

export function createUpdater(env: UpdaterEnv): Updater {
  const { port } = env;
  // The library looked at launch (checkAutomatically ON_LOAD), so the first return does not ask again.
  let lastCheckAt: number | null = env.now();
  let reloadFailed = false;
  let looking: Promise<LookResult> | null = null;
  let away: Away | null = null;

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

  const safely = <T>(fn: () => T, fallback: T): T => {
    try {
      return fn();
    } catch (error) {
      env.warn('[updates] could not read the app state', error);
      return fallback;
    }
  };

  /** Saves, records the attempt (so it is never repeated), then reloads. */
  const restart = async (target: string | null): Promise<boolean> => {
    try {
      await env.writeAttempt({ target, at: env.now() });
    } catch (error) {
      // Without the record a restart that does not stick could repeat: wait for the next cold start.
      env.warn('[updates] could not record the restart, leaving it for the next start', error);
      return false;
    }
    try {
      await port.reload(env.background());
      return true;
    } catch (error) {
      reloadFailed = true;
      env.warn('[updates] restarting into the update failed; it starts at the next cold start', error);
      return false;
    }
  };

  const look = (): Promise<LookResult> => {
    if (looking) return looking;
    looking = (async (): Promise<LookResult> => {
      lastCheckAt = env.now();
      try {
        if (port.pending().pending) return 'ready';
        if (!(await port.check())) return 'current';
        const got = await port.fetch();
        return got || port.pending().pending ? 'ready' : 'current';
      } catch (error) {
        env.warn('[updates] looking for an update failed', error);
        return 'failed';
      } finally {
        looking = null;
      }
    })();
    return looking;
  };

  return {
    left: () => {
      // iOS passes through 'inactive' on the way to 'background': the first one counts.
      if (!away) away = { at: env.now(), day: env.today() };
    },
    returned: async () => {
      const was = away;
      away = null;
      try {
        const now = env.now();
        // Cheap facts first (saving assumed); only when they allow a restart is anything awaited.
        if (restartOnReturn(facts(was, now, true, null))) {
          const [saved, attempt] = await Promise.all([env.flush().catch(() => false), env.readAttempt().catch(() => null)]);
          // Read the screen again: a sheet may have opened while the save ran.
          const f = facts(was, now, saved, attempt);
          if (restartOnReturn(f) && (await restart(f.pendingId))) return 'restarted';
        }
        if (was && checkDue(lastCheckAt, now)) {
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
      if (!port.pending().pending) return false;
      const saved = await env.flush().catch(() => false);
      if (!saved) {
        env.warn('[updates] not restarting: the last save did not reach the device');
        return false;
      }
      return restart(port.pending().id);
    },
  };
}
