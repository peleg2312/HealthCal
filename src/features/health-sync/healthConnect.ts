/**
 * Health Connect's own shapes turned into this feature's plain ones. Pure, and
 * typed against react-native-health-connect's real types (type imports only, so
 * nothing native is loaded): the Android adapter only makes the calls and
 * passes the answers through here.
 */
import type { AggregateResult, AggregationGroupResult, Permission, RecordResult } from 'react-native-health-connect';

import { HealthError, NO_ACCESS, type HealthAccess, type HealthWorkout, type StepDayTotal } from './types';

export type SessionRecord = RecordResult<'ExerciseSession'>;
/** One day's steps from `aggregateGroupByPeriod({ recordType: 'Steps', timeRangeSlicer: { period: 'DAYS', length: 1 } })`. */
export type StepsDayGroup = AggregationGroupResult<'Steps'>;

/**
 * The five things the app reads. Nothing else is ever requested. Adding one
 * means app.json (android.permissions), this list, the explanation sheet,
 * docs/health-sync.md and the Play Console declaration together.
 */
export const READ_PERMISSIONS: Permission[] = [
  { accessType: 'read', recordType: 'ExerciseSession' },
  { accessType: 'read', recordType: 'ActiveCaloriesBurned' },
  { accessType: 'read', recordType: 'TotalCaloriesBurned' },
  { accessType: 'read', recordType: 'Distance' },
  { accessType: 'read', recordType: 'Steps' },
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
