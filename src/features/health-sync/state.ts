/**
 * What automatic sync remembers on this phone, and the small rules about time.
 *
 * None of this is in the synced settings: the permission belongs to one phone,
 * so the switch does too. It is kept in on-device storage under its own key
 * (store.ts) and never leaves the device.
 */
import type { Handled, OriginSeen, ReviewItem } from './plan';
import type { HealthAccess, HealthAvailability, HealthErrorCode } from './types';

/** Why the last sync did not finish. */
export type SyncErrorCode = HealthErrorCode | Exclude<HealthAvailability, 'available'>;

export interface SyncError {
  code: SyncErrorCode;
  at: string;
  /** The health store's own words, for the person who reports a problem. */
  detail?: string;
}

export interface HealthSyncState {
  /** The switch. */
  enabled: boolean;
  /** Any attempt, successful or not: automatic syncs wait 15 minutes after it. */
  lastAttemptAt: string | null;
  /** The last sync that read the health store successfully. */
  lastSyncedAt: string | null;
  lastError: SyncError | null;
  /** What could be read at the last sync (without energy, synced workouts use the app's estimate). */
  access: HealthAccess | null;
  /** Apps whose workouts were found in the last 30 days. */
  origins: OriginSeen[];
  /** Workouts waiting in "Needs a look". */
  review: ReviewItem[];
  /** What this phone already did with a workout, by record id, so a deleted or skipped workout stays that way. */
  handled: Record<string, Handled>;
  /** Activities the person chose for a kind of workout (plan.ts, `choiceKey`). */
  choices: Record<string, string>;
  /** What the last successful sync changed. */
  lastResult: { at: string; added: number; updated: number } | null;
}

export const INITIAL_STATE: HealthSyncState = {
  enabled: false,
  lastAttemptAt: null,
  lastSyncedAt: null,
  lastError: null,
  access: null,
  origins: [],
  review: [],
  handled: {},
  choices: {},
  lastResult: null,
};

const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const text = (x: unknown): string | null => (typeof x === 'string' ? x : null);

/**
 * What was read back from the device, made safe: anything missing or of the
 * wrong shape (an older build, a damaged value) falls back to the start value,
 * so a bad stored value can turn sync off but never break the app.
 */
export function restoreState(saved: unknown): HealthSyncState {
  if (!isRecord(saved)) return INITIAL_STATE;
  const error = isRecord(saved.lastError) && typeof saved.lastError.code === 'string' && typeof saved.lastError.at === 'string' ? (saved.lastError as unknown as SyncError) : null;
  const access = isRecord(saved.access) && typeof saved.access.workouts === 'boolean' ? (saved.access as unknown as HealthAccess) : null;
  const result = isRecord(saved.lastResult) && typeof saved.lastResult.at === 'string' ? (saved.lastResult as HealthSyncState['lastResult']) : null;
  const review = Array.isArray(saved.review)
    ? (saved.review.filter((r) => isRecord(r) && typeof r.id === 'string' && isRecord(r.workout) && typeof r.workout.startTime === 'string' && typeof r.reason === 'string') as ReviewItem[])
    : [];
  const origins = Array.isArray(saved.origins) ? (saved.origins.filter((o) => isRecord(o) && typeof o.origin === 'string' && typeof o.name === 'string' && typeof o.latest === 'string') as OriginSeen[]) : [];
  const handled: Record<string, Handled> = {};
  if (isRecord(saved.handled)) {
    for (const [id, h] of Object.entries(saved.handled)) {
      if (isRecord(h) && (h.how === 'saved' || h.how === 'skipped') && typeof h.at === 'string') handled[id] = { how: h.how, at: h.at };
    }
  }
  const choices: Record<string, string> = {};
  if (isRecord(saved.choices)) for (const [k, v] of Object.entries(saved.choices)) if (typeof v === 'string') choices[k] = v;
  return {
    enabled: saved.enabled === true,
    lastAttemptAt: text(saved.lastAttemptAt),
    lastSyncedAt: text(saved.lastSyncedAt),
    lastError: error,
    access,
    origins,
    review,
    handled,
    choices,
    lastResult: result,
  };
}

/** Automatic syncs (app to the foreground, Train opened) run at most this often. */
export const AUTO_SYNC_INTERVAL_MS = 15 * 60_000;
/** How far back a sync looks. Health Connect itself gives an app 30 days before its first permission. */
export const WINDOW_DAYS = 30;
const DAY_MS = 86_400_000;
/** A stored estimate this old is no longer re-read by an automatic sync ("Sync now" re-reads everything). */
export const RECHECK_DAYS = 7;
/** Memory of handled workouts is kept a while past the window, then dropped. */
const HANDLED_DAYS = WINDOW_DAYS + 15;

export function shouldAutoSync(state: Pick<HealthSyncState, 'enabled' | 'lastAttemptAt'>, now: number): boolean {
  if (!state.enabled) return false;
  const last = state.lastAttemptAt ? Date.parse(state.lastAttemptAt) : Number.NaN;
  // A clock set back must not stop syncing for good.
  return !Number.isFinite(last) || now - last >= AUTO_SYNC_INTERVAL_MS || last > now;
}

/** The time range a sync reads: the last 30 days up to now. */
export function readRange(now: number): { from: string; to: string } {
  return { from: new Date(now - WINDOW_DAYS * DAY_MS).toISOString(), to: new Date(now).toISOString() };
}

export function pruneHandled(handled: Record<string, Handled>, now: number): Record<string, Handled> {
  const cutoff = now - HANDLED_DAYS * DAY_MS;
  const out: Record<string, Handled> = {};
  for (const [id, h] of Object.entries(handled)) {
    const at = Date.parse(h.at);
    if (!Number.isFinite(at) || at >= cutoff) out[id] = h;
  }
  return out;
}

const workouts = (n: number) => `${n} ${n === 1 ? 'workout' : 'workouts'}`;

/** "2 workouts added from Garmin Connect", "1 workout updated from Garmin Connect", "2 workouts added, 1 updated from Health Connect". */
export function syncMessage(added: number, updated: number, apps: string[], store: string): string {
  const names = [...new Set(apps)];
  const from = names.length === 1 ? names[0] : store;
  if (added && updated) return `${workouts(added)} added, ${updated} updated from ${from}`;
  if (added) return `${workouts(added)} added from ${from}`;
  return `${workouts(updated)} updated from ${from}`;
}

/** What to tell the person about a failed sync, and what they can do. */
export function errorText(error: SyncError, store: string): string {
  switch (error.code) {
    case 'permission':
      return `HealthCal may no longer read workouts from ${store}. Allow it again to keep syncing.`;
    case 'not-installed':
      return `${store} is not on this phone any more. Install it to keep syncing.`;
    case 'update-required':
      return `${store} needs an update before workouts can be read.`;
    case 'unsupported':
      return `${store} is not available on this device.`;
    case 'unavailable':
      return `${store} did not answer. It may be updating; try again in a moment.`;
    case 'timeout':
      return `${store} took too long to answer. Try again in a moment.`;
    default:
      return `The last sync did not finish. Nothing was changed; try again.`;
  }
}
