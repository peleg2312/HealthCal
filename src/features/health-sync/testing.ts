/**
 * Builders shared by this folder's tests (not used by the app): a workout as
 * the health store would return it, a hand-logged session, and a diary and
 * phone memory that live in memory.
 */
import { ACTIVITY_BY_ID } from '@/data/activities';
import { buildActivityEntry } from '@/features/activity/build';
import type { ActivityEntry } from '@/types';

import type { HealthEntry } from './convert';
import type { Diary } from './engine';
import { INITIAL_STATE, type HealthSyncState } from './state';
import type { HealthWorkout } from './types';

export const GARMIN = 'com.garmin.android.apps.connectmobile';
export const SAMSUNG = 'com.sec.android.app.shealth';
export const STRAVA = 'com.strava';

/** Health Connect exercise type numbers used in tests. */
export const TYPE = { other: 0, cycling: 8, exerciseClass: 26, breathing: 33, paddling: 46, running: 56, walking: 79, yoga: 83, handball: 35 } as const;

/** A person's pricing: weight, the baseline the budget assumes, and the resting rate (BMR) a device's active figure is above. */
export const CTX = { weightKg: 78.8, baselineKcalPerDay: 2200, bmrKcalPerDay: 1650 };

/** What the budget already holds for these minutes (the resting share subtracted from every gross figure). */
export const restingKcal = (minutes: number) => (CTX.baselineKcalPerDay / 1440) * minutes;
/** A device's total for a workout it reported only an active figure for: active plus the resting rate. */
export const totalFromActive = (active: number, minutes: number) => active + (CTX.bmrKcalPerDay / 1440) * minutes;

let seq = 0;

export interface WorkoutInput extends Partial<HealthWorkout> {
  /** Start instant, ISO with a zone. */
  start: string;
  minutes: number;
}

/** A Garmin Connect run by default, with no calories or distance unless given. */
export function workout({ start, minutes, ...over }: WorkoutInput): HealthWorkout {
  seq += 1;
  const startMs = Date.parse(start);
  return {
    store: 'health-connect',
    id: `hc-${seq}`,
    origin: GARMIN,
    exerciseType: TYPE.running,
    startTime: new Date(startMs).toISOString(),
    endTime: new Date(startMs + minutes * 60_000).toISOString(),
    zoneOffsetSec: null,
    title: null,
    activeKcal: null,
    totalKcal: null,
    distanceM: null,
    device: null,
    ...over,
  };
}

/** A session logged by hand in the app: no source, no start time, only when it was saved. */
export function handLogged(activityId: string, durationMin: number, date: string, loggedAtLocal: string, over: Partial<ActivityEntry> = {}): ActivityEntry {
  const loggedAt = new Date(loggedAtLocal).toISOString();
  return {
    ...buildActivityEntry({ activity: ACTIVITY_BY_ID[activityId], intensity: 'moderate', durationMin, date, ...CTX, loggedAt }),
    id: `hand-${activityId}-${date}`,
    updatedAt: loggedAt,
    ...over,
  };
}

/** A saved record as the store returns it. */
export const stored = (entry: HealthEntry | ActivityEntry, over: Partial<ActivityEntry> = {}): ActivityEntry => ({ updatedAt: '2026-11-01T00:00:00.000Z', ...entry, ...over });

export interface MemoryDiary extends Diary {
  records: Map<string, ActivityEntry>;
  /** Live records only. */
  live(): ActivityEntry[];
  /** Drop a soft-deleted record for good, as the store does once its marker is old. */
  purge(id: string): void;
}

export function memoryDiary(initial: ActivityEntry[] = [], profile = true): MemoryDiary {
  const records = new Map(initial.map((e) => [e.id, e]));
  let stamp = 0;
  const next = () => new Date(Date.UTC(2026, 10, 14, 12, 0, (stamp += 1))).toISOString();
  return {
    records,
    all: () => [...records.values()],
    live: () => [...records.values()].filter((e) => !e.deleted),
    context: () => (profile ? CTX : null),
    save: (entries) => {
      for (const e of entries) records.set(e.id, { ...e, updatedAt: next(), deleted: false });
    },
    remove: (id) => {
      const e = records.get(id);
      if (e) records.set(id, { ...e, deleted: true, updatedAt: next() });
    },
    purge: (id) => void records.delete(id),
  };
}

export function memoryState(initial: Partial<HealthSyncState> = {}) {
  let value: HealthSyncState = { ...INITIAL_STATE, ...initial };
  return {
    get: () => value,
    set: (patch: Partial<HealthSyncState>) => {
      value = { ...value, ...patch };
    },
  };
}
