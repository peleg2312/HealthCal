/**
 * What automatic sync remembers on this phone, and the small rules about time.
 *
 * None of this is in the synced settings: the permission belongs to one phone,
 * so the switch does too. It is kept in on-device storage under its own key
 * (store.ts) and never leaves the device.
 */
import type { ActivityEntry } from '@/types';

import { NO_DAY_ENERGY, type DayEnergyMemory, type EnergyDays } from './dayEnergy';
import type { Handled, OriginSeen, ReviewItem } from './plan';
import { NO_STEPS, type FileSteps, type StepDays, type StepsMemory } from './steps';
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
  /**
   * What the last successful sync changed (`nights`: nights of sleep added or
   * updated, absent before sleep was read; `weighIns`: weigh-ins added or updated,
   * absent before weigh-ins were read).
   */
  lastResult: { at: string; added: number; updated: number; nights?: number; weighIns?: number } | null;
  /** Steps per day for the last 35 days (steps.ts): shown on Train, never counted as calories. */
  steps: StepsMemory;
  /**
   * Steps from the Health app's export file, imported on /activity/import
   * (steps.ts, FileSteps): kept apart from the synced ones because a synced day
   * wins over a file's, and because switching sync off clears only what sync read.
   */
  fileSteps: FileSteps | null;
  /**
   * When sleep was last read successfully (sleep.ts, sleepReadRange): the next
   * read starts the day before, so a phone that was away for a week reads that
   * week. Null: never, so the first read covers 35 days. The nights themselves
   * are diary records ('sleep'); what this phone did with a day is in `handled`
   * under 'sleep:<date>'.
   */
  sleepReadAt: string | null;
  /**
   * When weigh-ins were last read and what that read wrote was confirmed on the
   * device (body.ts, weightReadRange; set in the engine's `rememberSaved`, as
   * `sleepReadAt`). Null: never, so the first read covers 28 days and its toast
   * may say what many weigh-ins now feed (`weighInNote`). The weigh-ins are
   * synced 'weights' records; what this phone did with a day is in `handled`
   * under 'weight:<date>'. Kept when sync is turned off, as `sleepReadAt` is.
   */
  weightReadAt: string | null;
  /**
   * The day's calories burned as the watch counts them, the last 14 days
   * (dayEnergy.ts): shown on Progress beside HealthCal's estimate, never added
   * to anything, never synced, exported, sent to AI or to friends. Cleared when
   * sync is turned off, as steps are.
   */
  dayEnergy: DayEnergyMemory;
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
  steps: NO_STEPS,
  fileSteps: null,
  sleepReadAt: null,
  weightReadAt: null,
  dayEnergy: NO_DAY_ENERGY,
};

const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const text = (x: unknown): string | null => (typeof x === 'string' ? x : null);
const nonNeg = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x) && x >= 0;

/**
 * What was read back from the device, made safe: anything missing or of the
 * wrong shape (an older build, a damaged value) falls back to the start value,
 * so a bad stored value can turn sync off but never break the app.
 */
export function restoreState(saved: unknown): HealthSyncState {
  if (!isRecord(saved)) return INITIAL_STATE;
  const error = isRecord(saved.lastError) && typeof saved.lastError.code === 'string' && typeof saved.lastError.at === 'string' ? (saved.lastError as unknown as SyncError) : null;
  // A build before steps, sleep, weight, day energy or heart rate saved no flag for it: it was not asked for then.
  const a = isRecord(saved.access) && typeof saved.access.workouts === 'boolean' ? saved.access : null;
  const access: HealthAccess | null = a
    ? {
        workouts: a.workouts === true,
        activeEnergy: a.activeEnergy === true,
        totalEnergy: a.totalEnergy === true,
        distance: a.distance === true,
        steps: a.steps === true,
        sleep: a.sleep === true,
        weight: a.weight === true,
        bodyFat: a.bodyFat === true,
        dayEnergy: a.dayEnergy === true,
        heartRate: a.heartRate === true,
      }
    : null;
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
  const days: StepDays = {};
  const savedSteps = isRecord(saved.steps) ? saved.steps : null;
  if (savedSteps && isRecord(savedSteps.days)) {
    for (const [day, n] of Object.entries(savedSteps.days)) if (/^\d{4}-\d{2}-\d{2}$/.test(day) && typeof n === 'number' && Number.isFinite(n) && n > 0) days[day] = Math.round(n);
  }
  let fileSteps: FileSteps | null = null;
  if (isRecord(saved.fileSteps) && isRecord(saved.fileSteps.days) && typeof saved.fileSteps.asOf === 'string' && typeof saved.fileSteps.asOfDay === 'string') {
    const fd: StepDays = {};
    for (const [day, n] of Object.entries(saved.fileSteps.days)) if (/^\d{4}-\d{2}-\d{2}$/.test(day) && typeof n === 'number' && Number.isFinite(n) && n > 0) fd[day] = Math.round(n);
    fileSteps = { days: fd, asOf: saved.fileSteps.asOf, asOfDay: saved.fileSteps.asOfDay };
  }
  const energyDays: EnergyDays = {};
  const savedEnergy = isRecord(saved.dayEnergy) ? saved.dayEnergy : null;
  if (savedEnergy && isRecord(savedEnergy.days)) {
    for (const [day, v] of Object.entries(savedEnergy.days)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !isRecord(v) || !nonNeg(v.kcal) || !nonNeg(v.activeKcal)) continue;
      const origins = Array.isArray(v.origins) ? v.origins.filter((o): o is string => typeof o === 'string') : [];
      energyDays[day] = { kcal: v.kcal, activeKcal: v.activeKcal, origins };
    }
  }
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
    steps: { days, readAt: savedSteps ? text(savedSteps.readAt) : null },
    fileSteps,
    sleepReadAt: text(saved.sleepReadAt),
    weightReadAt: text(saved.weightReadAt),
    dayEnergy: { days: energyDays, readAt: savedEnergy ? text(savedEnergy.readAt) : null },
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

/**
 * The workouts from a health store that the diary holds, live or as a deletion
 * marker, and that this phone does not remember yet: what is to be remembered
 * as 'saved' once the diary is confirmed on the device (engine.ts,
 * `rememberSaved`). This is how a workout is first remembered after a sync adds
 * it, and how the memory heals when the two were not written together (the app
 * was closed between the diary reaching the device and the memory): a workout
 * the person deletes later then stays deleted after its marker is cleared from
 * the phone. Left out: workouts still waiting in "Needs a look" (`waiting`),
 * records from elsewhere (hand-logged, a Garmin file), and those older than
 * the memory keeps (pruneHandled would drop them again at once).
 */
export function unremembered(
  handled: Record<string, Handled>,
  existing: readonly Pick<ActivityEntry, 'id' | 'source' | 'startedAt'>[],
  now: number,
  waiting: ReadonlySet<string> = new Set(),
): Record<string, Handled> {
  const cutoff = now - HANDLED_DAYS * DAY_MS;
  const out: Record<string, Handled> = {};
  for (const e of existing) {
    if (e.source !== 'health' || !e.startedAt || handled[e.id] || waiting.has(e.id)) continue;
    const at = Date.parse(e.startedAt);
    if (Number.isFinite(at) && at >= cutoff) out[e.id] = { how: 'saved', at: e.startedAt };
  }
  return out;
}

/**
 * `handled` with these marks added where it has none: what the person said
 * since (a skip, an Undo) always wins. The same object when nothing is added.
 */
export function rememberMarks(handled: Record<string, Handled>, marks: Record<string, Handled>): Record<string, Handled> {
  const add = Object.entries(marks).filter(([id]) => !handled[id]);
  return add.length ? { ...handled, ...Object.fromEntries(add) } : handled;
}

const workouts = (n: number) => `${n} ${n === 1 ? 'workout' : 'workouts'}`;
const nightsOf = (n: number) => `${n} ${n === 1 ? 'night' : 'nights'} of sleep`;
const weighInsOf = (n: number) => `${n} ${n === 1 ? 'weigh-in' : 'weigh-ins'}`;

/** Records of one kind a sync wrote, and the apps they came from. */
export interface KindChange {
  added: number;
  updated: number;
  apps: string[];
}

/** Nights of sleep a sync wrote, and the apps they came from. */
export type NightsChange = KindChange;
/** Weigh-ins a sync wrote, and the apps they came from. */
export type WeighInsChange = KindChange;

/** "A", "A and B", "A, B and C". */
function joinKinds(parts: string[]): string {
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/**
 * The sync's one toast. Each kind with its own counted noun; one app named when
 * every change came from it, else the store.
 *  - one kind: "2 workouts added from Garmin Connect", "1 workout updated from Garmin Connect",
 *    "2 workouts added, 1 updated from Health Connect", "3 weigh-ins added, 1 updated from Garmin Connect";
 *  - several: "1 workout and 3 nights of sleep added from Garmin Connect" (only additions),
 *    "… updated from …" (only updates), else "1 workout, 2 nights of sleep and 3 weigh-ins synced from Health Connect"
 *    (each kind's added plus updated).
 */
export function syncMessage(added: number, updated: number, apps: string[], store: string, nights?: NightsChange, weighIns?: WeighInsChange): string {
  const kinds = [
    { noun: workouts, added, updated, apps },
    { noun: nightsOf, added: nights?.added ?? 0, updated: nights?.updated ?? 0, apps: nights?.apps ?? [] },
    { noun: weighInsOf, added: weighIns?.added ?? 0, updated: weighIns?.updated ?? 0, apps: weighIns?.apps ?? [] },
  ];
  const changed = kinds.filter((k) => k.added + k.updated > 0);
  // Workouts' apps always count (as before nights were read); another kind's only when it changed something.
  const names = [...new Set([...apps, ...changed.filter((k) => k.noun !== workouts).flatMap((k) => k.apps)])];
  const from = names.length === 1 ? names[0] : store;
  const shown = changed.length ? changed : [kinds[0]];
  if (shown.length === 1) {
    const k = shown[0];
    if (k.added && k.updated) return `${k.noun(k.added)} added, ${k.updated} updated from ${from}`;
    return `${k.noun(k.added + k.updated)} ${k.added ? 'added' : 'updated'} from ${from}`;
  }
  if (shown.every((k) => !k.updated)) return `${joinKinds(shown.map((k) => k.noun(k.added)))} added from ${from}`;
  if (shown.every((k) => !k.added)) return `${joinKinds(shown.map((k) => k.noun(k.updated)))} updated from ${from}`;
  return `${joinKinds(shown.map((k) => k.noun(k.added + k.updated)))} synced from ${from}`;
}

/** A first read that adds at least this many weigh-ins says what they now feed (`weighInNote`). */
export const MANY_WEIGH_INS = 5;

/**
 * The second sentence of the sync's toast when the first weigh-in read brings
 * many at once, appended to `syncMessage`'s line, the full stop included:
 * ". They cover the last 4 weeks." `firstRead`: weightReadAt was null before
 * this read. '' otherwise. What they now feed (the weight trend, and the burn
 * estimate the targets use when the learned estimate is on, `learns`) is said
 * under the sync screen's Weight row instead: the longer sentence took four
 * lines of the toast at 360 px (the specification's fallback, section 6.4).
 */
export function weighInNote(added: number, firstRead: boolean, learns: boolean): string {
  if (!firstRead || added < MANY_WEIGH_INS) return '';
  void learns;
  return '. They cover the last 4 weeks.';
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
    case 'not-entitled':
      return `${store} is not available in this install of HealthCal. Apple lets only a copy signed with HealthKit access read it.`;
    case 'unavailable':
      return `${store} did not answer. It may be updating; try again in a moment.`;
    case 'timeout':
      return `${store} took too long to answer. Try again in a moment.`;
    default:
      return `The last sync did not finish. Nothing was changed; try again.`;
  }
}
