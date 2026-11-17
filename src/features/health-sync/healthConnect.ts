/**
 * Health Connect's own shapes turned into this feature's plain ones. Pure, and
 * typed against react-native-health-connect's real types (type imports only, so
 * nothing native is loaded): the Android adapter only makes the calls and
 * passes the answers through here.
 */
import type { AggregateResult, AggregationGroupResult, Permission, RecordResult } from 'react-native-health-connect';

import { sleepKindOf } from './sleep';
import { HealthError, NO_ACCESS, type HealthAccess, type HealthWorkout, type SleepSample, type SleepSourceKind, type SleepStage, type StepDayTotal } from './types';

export type SessionRecord = RecordResult<'ExerciseSession'>;
/** One day's steps from `aggregateGroupByPeriod({ recordType: 'Steps', timeRangeSlicer: { period: 'DAYS', length: 1 } })`. */
export type StepsDayGroup = AggregationGroupResult<'Steps'>;

/**
 * A sleep session as the library hands it back. Its TypeScript leaves out the
 * zone offsets, but ReactSleepSessionRecord.kt's parseRecord returns them
 * (`startZoneOffset`, `endZoneOffset`: `{ id, totalSeconds }` or null).
 */
export type SleepSessionRaw = RecordResult<'SleepSession'> & {
  startZoneOffset?: { id: string; totalSeconds: number } | null;
  endZoneOffset?: { id: string; totalSeconds: number } | null;
};

/**
 * The six things the app reads. Nothing else is ever requested. Adding one
 * means app.json (android.permissions), this list, the explanation sheet,
 * docs/health-sync.md and the Play Console declaration together.
 */
export const READ_PERMISSIONS: Permission[] = [
  { accessType: 'read', recordType: 'ExerciseSession' },
  { accessType: 'read', recordType: 'ActiveCaloriesBurned' },
  { accessType: 'read', recordType: 'TotalCaloriesBurned' },
  { accessType: 'read', recordType: 'Distance' },
  { accessType: 'read', recordType: 'Steps' },
  { accessType: 'read', recordType: 'SleepSession' },
];

/** What a list of granted permissions lets the app read. */
export function accessFrom(granted: readonly { accessType: string; recordType: string }[]): HealthAccess {
  const can = (recordType: string) => granted.some((p) => p.accessType === 'read' && p.recordType === recordType);
  return {
    ...NO_ACCESS,
    workouts: can('ExerciseSession'),
    activeEnergy: can('ActiveCaloriesBurned'),
    totalEnergy: can('TotalCaloriesBurned'),
    distance: can('Distance'),
    steps: can('Steps'),
    sleep: can('SleepSession'),
  };
}

/**
 * Health Connect's steps per day as day totals. `aggregateGroupByPeriod` cuts
 * the range into calendar days in the phone's zone and answers each with
 * `COUNT_TOTAL`, already one count where apps overlap (Health Connect's own
 * data-source priority). `startTime` is a local date-time ('2026-11-12T00:00'):
 * its date is the day. A day with nothing is 0 and left out.
 */
export function stepDaysFromPeriods(groups: readonly StepsDayGroup[]): StepDayTotal[] {
  const out: StepDayTotal[] = [];
  for (const g of groups) {
    const day = typeof g?.startTime === 'string' ? /^(\d{4}-\d{2}-\d{2})/.exec(g.startTime)?.[1] : undefined;
    const count = g?.result?.COUNT_TOTAL;
    if (!day || typeof count !== 'number' || !Number.isFinite(count) || count <= 0) continue;
    out.push({ day, count: Math.round(count) });
  }
  return out;
}

/** Health Connect's getSdkStatus numbers (SdkAvailabilityStatus): 1 unavailable, 2 provider update required, 3 available. */
export function availabilityFrom(status: number): 'available' | 'update-required' | 'not-installed' {
  if (status === 3) return 'available';
  return status === 2 ? 'update-required' : 'not-installed';
}

/**
 * A figure an aggregate returned for one app. Health Connect answers with 0
 * when there is nothing, and lists the apps whose data went into the answer:
 * a figure that came from other apps only is not this workout's.
 */
export function ownFigure(value: number | undefined, dataOrigins: readonly string[] | undefined, origin: string): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  if (dataOrigins && dataOrigins.length > 0 && !dataOrigins.includes(origin)) return null;
  return value;
}

export interface SessionDetails {
  active?: AggregateResult<'ActiveCaloriesBurned'> | null;
  total?: AggregateResult<'TotalCaloriesBurned'> | null;
  distance?: AggregateResult<'Distance'> | null;
}

/** 'Garmin Forerunner 265' from the record's device, when it names one. */
function deviceName(device: { manufacturer?: string; model?: string } | undefined | null): string | null {
  const maker = device?.manufacturer?.trim() ?? '';
  const model = device?.model?.trim() ?? '';
  if (!maker && !model) return null;
  return model.toLowerCase().startsWith(maker.toLowerCase()) ? model : `${maker} ${model}`.trim();
}

/** What identifies a session before its details are read. Null when the record has no id or origin. */
export function sessionRef(s: SessionRecord): Pick<HealthWorkout, 'id' | 'origin' | 'startTime' | 'endTime'> | null {
  const id = s.metadata?.id;
  const origin = s.metadata?.dataOrigin;
  if (!id || !origin || !s.startTime || !s.endTime) return null;
  return { id, origin, startTime: s.startTime, endTime: s.endTime };
}

/** One exercise session and what was aggregated over its interval for its own app. `details` null: not read. */
export function sessionToWorkout(s: SessionRecord, details: SessionDetails | null): HealthWorkout | null {
  const ref = sessionRef(s);
  if (!ref) return null;
  const offset = s.startZoneOffset?.totalSeconds;
  return {
    store: 'health-connect',
    ...ref,
    exerciseType: typeof s.exerciseType === 'number' ? s.exerciseType : 0,
    zoneOffsetSec: typeof offset === 'number' && Number.isFinite(offset) ? offset : null,
    title: s.title?.trim() || null,
    activeKcal: ownFigure(details?.active?.ACTIVE_CALORIES_TOTAL?.inKilocalories, details?.active?.dataOrigins, ref.origin),
    totalKcal: ownFigure(details?.total?.ENERGY_TOTAL?.inKilocalories, details?.total?.dataOrigins, ref.origin),
    distanceM: ownFigure(details?.distance?.DISTANCE?.inMeters, details?.distance?.dataOrigins, ref.origin),
    device: deviceName(s.metadata?.device),
  };
}

/**
 * SleepSessionRecord's stage numbers (Android SDK): 0 unknown, 1 awake, 2
 * sleeping (no stage), 3 out of bed, 4 light, 5 deep, 6 REM, 7 awake in bed.
 * The library's SleepStageType constant stops at 6; 7 is STAGE_TYPE_AWAKE_IN_BED
 * and is time awake like 1 and 3.
 */
export function sleepStageOf(code: unknown): SleepStage {
  switch (code) {
    case 2:
      return 'asleep';
    case 4:
      return 'light';
    case 5:
      return 'deep';
    case 6:
      return 'rem';
    case 1:
    case 3:
    case 7:
      return 'awake';
    default:
      return 'unknown';
  }
}

/** Health Connect's Device.TYPE_WATCH and TYPE_PHONE (the library's DeviceType enum leaves out TYPE_WATCH = 1). */
const DEVICE_WATCH = 1;
const DEVICE_PHONE = 2;

/** The kind of device: Garmin Connect is a watch whatever it says; else the record's device type when it gives one. */
function sleepKindFor(origin: string, deviceType: unknown): SleepSourceKind {
  const byOrigin = sleepKindOf(origin);
  if (byOrigin !== 'other') return byOrigin;
  if (deviceType === DEVICE_WATCH) return 'watch';
  if (deviceType === DEVICE_PHONE) return 'phone';
  return 'other';
}

const offsetOf = (o: { totalSeconds?: unknown } | null | undefined): number | null =>
  typeof o?.totalSeconds === 'number' && Number.isFinite(o.totalSeconds) ? o.totalSeconds : null;

/**
 * One sleep session as raw samples (sleep.ts makes the night). Each stage is a
 * sample; a session without stages is one unstaged 'asleep' sample over its
 * whole span; a session whose stages are only unknown or awake is 'asleep' over
 * its span with those awake stages beside it (sleep.ts counts each moment once,
 * awake over unstaged sleep). Never the session's length as the time asleep:
 * that includes time awake. Empty when the session has no origin or no times.
 */
export function sleepFromSession(s: SleepSessionRaw): SleepSample[] {
  const origin = s?.metadata?.dataOrigin;
  const start = Date.parse(s?.startTime ?? '');
  const end = Date.parse(s?.endTime ?? '');
  if (!origin || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) return [];
  const base = {
    store: 'healthConnect' as const,
    origin,
    kind: sleepKindFor(origin, s.metadata?.device?.type),
    zoneOffsetSec: offsetOf(s.endZoneOffset) ?? offsetOf(s.startZoneOffset),
    ...(s.metadata?.id ? { sessionId: s.metadata.id } : null),
  };
  const stages: SleepSample[] = [];
  for (const st of Array.isArray(s.stages) ? s.stages : []) {
    const a = Date.parse(st?.startTime ?? '');
    const b = Date.parse(st?.endTime ?? '');
    if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) continue;
    stages.push({ ...base, start: new Date(a).toISOString(), end: new Date(b).toISOString(), stage: sleepStageOf(st.stage) });
  }
  const whole: SleepSample = { ...base, start: new Date(start).toISOString(), end: new Date(end).toISOString(), stage: 'asleep' };
  if (!stages.length) return [whole];
  const staged = stages.some((x) => x.stage === 'asleep' || x.stage === 'light' || x.stage === 'deep' || x.stage === 'rem');
  if (staged) return stages;
  // Only unknown and awake: the session is sleep apart from its awake stretches.
  return [whole, ...stages.filter((x) => x.stage === 'awake')];
}

/** The library rejects with a `code` naming the Java exception class it caught (ExceptionsUtils.kt). */
export function toHealthError(e: unknown): HealthError {
  if (e instanceof HealthError) return e;
  const code = typeof e === 'object' && e !== null && 'code' in e ? String((e as { code: unknown }).code) : '';
  const message = e instanceof Error ? e.message : String(e ?? '');
  if (code === 'PERMISSION_ERROR' || /SecurityException|permission/i.test(message)) return new HealthError('permission', message || 'Health Connect refused the read.');
  if (code === 'CLIENT_NOT_INITIALIZED' || code === 'SERVICE_UNAVAILABLE' || code === 'SDK_VERSION_ERROR' || code === 'UNDERLYING_ERROR') {
    return new HealthError('unavailable', message || 'Health Connect is not available.');
  }
  return new HealthError('failed', message || 'Health Connect could not be read.');
}
