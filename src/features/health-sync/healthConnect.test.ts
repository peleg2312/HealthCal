/**
 * Health Connect's records, typed with the library's own types, into plain workouts.
 */
import type { AggregateResult, AggregationGroupResult, RecordResult } from 'react-native-health-connect';
import { describe, expect, it } from 'vitest';

import { addDays } from '@/lib/dates';

import { accessFrom, availabilityFrom, ownFigure, READ_PERMISSIONS, sessionRef, sessionToWorkout, sleepFromSession, sleepStageOf, stepDaysFromPeriods, toHealthError, type SleepSessionRaw } from './healthConnect';
import { nightsFrom } from './sleep';
import { zoneClock } from './steps';
import { HealthError } from './types';

const GARMIN = 'com.garmin.android.apps.connectmobile';

const session = (over: Partial<RecordResult<'ExerciseSession'>> = {}): RecordResult<'ExerciseSession'> => ({
  startTime: '2026-11-12T06:00:00Z',
  endTime: '2026-11-12T06:45:00Z',
  startZoneOffset: { id: '+01:00', totalSeconds: 3600 },
  exerciseType: 56,
  title: ' Morning Run ',
  metadata: { id: 'abc-123', dataOrigin: GARMIN, device: { manufacturer: 'Garmin', model: 'Forerunner 265' } },
  ...over,
});

const energy = (kcal: number) => ({ inCalories: kcal * 1000, inJoules: kcal * 4184, inKilocalories: kcal, inKilojoules: kcal * 4.184 });
const active = (kcal: number, dataOrigins = [GARMIN]): AggregateResult<'ActiveCaloriesBurned'> => ({ ACTIVE_CALORIES_TOTAL: energy(kcal), dataOrigins });
const total = (kcal: number, dataOrigins = [GARMIN]): AggregateResult<'TotalCaloriesBurned'> => ({ ENERGY_TOTAL: energy(kcal), dataOrigins });
const distance = (m: number, dataOrigins = [GARMIN]): AggregateResult<'Distance'> => ({
  DISTANCE: { inMeters: m, inKilometers: m / 1000, inMiles: m / 1609.344, inInches: m * 39.37, inFeet: m * 3.281 },
  dataOrigins,
});

describe('Health Connect mapping', () => {
  it('asks for six read permissions and nothing else', () => {
    expect(READ_PERMISSIONS).toEqual([
      { accessType: 'read', recordType: 'ExerciseSession' },
      { accessType: 'read', recordType: 'ActiveCaloriesBurned' },
      { accessType: 'read', recordType: 'TotalCaloriesBurned' },
      { accessType: 'read', recordType: 'Distance' },
      { accessType: 'read', recordType: 'Steps' },
      { accessType: 'read', recordType: 'SleepSession' },
    ]);
  });

  it('reads what is granted from the permission list', () => {
    expect(accessFrom([])).toEqual({ workouts: false, activeEnergy: false, totalEnergy: false, distance: false, steps: false, sleep: false });
    expect(accessFrom([{ accessType: 'read', recordType: 'ExerciseSession' }, { accessType: 'read', recordType: 'Distance' }, { accessType: 'write', recordType: 'ActiveCaloriesBurned' }])).toEqual({
      workouts: true,
      activeEnergy: false,
      totalEnergy: false,
      distance: true,
      steps: false,
      sleep: false,
    });
    expect(accessFrom(READ_PERMISSIONS)).toEqual({ workouts: true, activeEnergy: true, totalEnergy: true, distance: true, steps: true, sleep: true });
    // A phone that allowed the first five before sleep was read: sleep is not shared until asked.
    expect(accessFrom(READ_PERMISSIONS.slice(0, 5)).sleep).toBe(false);
  });

  it('takes the steps per day from Health Connect\'s own day totals', () => {
    // The shape aggregateGroupByPeriod resolves with (ReactStepsRecord.parseAggregationResultGroupedByPeriod):
    // LocalDateTime strings for the period, the de-duplicated COUNT_TOTAL and the apps that went into it.
    const day = (start: string, count: number, dataOrigins = ['com.sec.android.app.shealth', 'com.google.android.apps.fitness']): AggregationGroupResult<'Steps'> => ({
      result: { COUNT_TOTAL: count, dataOrigins },
      startTime: `${start}T00:00`,
      endTime: `${addDays(start, 1)}T00:00`,
    });
    expect(stepDaysFromPeriods([day('2026-11-12', 7950.4), day('2026-11-13', 0, []), day('2026-11-14', 1520)])).toEqual([
      { day: '2026-11-12', count: 7950 },
      { day: '2026-11-14', count: 1520 },
    ]);
    // The last period ends now, not at midnight; a period that starts at a time other than midnight still names its day.
    expect(stepDaysFromPeriods([{ result: { COUNT_TOTAL: 300, dataOrigins: [] }, startTime: '2026-11-15T00:00', endTime: '2026-11-15T09:12:03' }])).toEqual([{ day: '2026-11-15', count: 300 }]);
    expect(stepDaysFromPeriods([{ result: { COUNT_TOTAL: Number.NaN, dataOrigins: [] }, startTime: '2026-11-15T00:00', endTime: '2026-11-15T09:00' }])).toEqual([]);
    expect(stepDaysFromPeriods([{ result: { COUNT_TOTAL: 10, dataOrigins: [] }, startTime: 'garbage', endTime: '' }])).toEqual([]);
  });

  it('reads the SDK status numbers', () => {
    expect(availabilityFrom(3)).toBe('available');
    expect(availabilityFrom(2)).toBe('update-required');
    expect(availabilityFrom(1)).toBe('not-installed');
  });

  it('turns a session and its aggregates into a workout', () => {
    expect(sessionToWorkout(session(), { active: active(480), total: total(552), distance: distance(8200) })).toEqual({
      store: 'health-connect',
      id: 'abc-123',
      origin: GARMIN,
      startTime: '2026-11-12T06:00:00Z',
      endTime: '2026-11-12T06:45:00Z',
      exerciseType: 56,
      zoneOffsetSec: 3600,
      title: 'Morning Run',
      activeKcal: 480,
      totalKcal: 552,
      distanceM: 8200,
      device: 'Garmin Forerunner 265',
    });
  });

  it('a session without calories or distance has none: Health Connect answers 0 for nothing', () => {
    const w = sessionToWorkout(session({ startZoneOffset: undefined, title: undefined }), { active: active(0, []), total: total(0, []), distance: distance(0, []) });
    expect(w).toMatchObject({ activeKcal: null, totalKcal: null, distanceM: null, zoneOffsetSec: null, title: null });
  });

  it('details that were not read, or may not be read, are null', () => {
    expect(sessionToWorkout(session(), null)).toMatchObject({ activeKcal: null, totalKcal: null, distanceM: null });
    expect(sessionToWorkout(session(), { active: null, total: total(552), distance: null })).toMatchObject({ activeKcal: null, totalKcal: 552, distanceM: null });
  });

  it('a figure made only of other apps\' data is not this workout\'s', () => {
    expect(ownFigure(300, ['com.other.app'], GARMIN)).toBeNull();
    expect(ownFigure(300, [GARMIN, 'com.other.app'], GARMIN)).toBe(300);
    // No origins listed: the figure is taken (energy.ts rejects a resting-level total).
    expect(ownFigure(300, [], GARMIN)).toBe(300);
    expect(ownFigure(undefined, [GARMIN], GARMIN)).toBeNull();
  });

  it('skips a record without an id or an origin', () => {
    expect(sessionRef(session({ metadata: { id: 'x' } }))).toBeNull();
    expect(sessionToWorkout(session({ metadata: undefined }), null)).toBeNull();
  });

  it('does not repeat the maker in the device name', () => {
    expect(sessionToWorkout(session({ metadata: { id: 'a', dataOrigin: GARMIN, device: { manufacturer: 'Garmin', model: 'Garmin fenix 7' } } }), null)?.device).toBe('Garmin fenix 7');
    expect(sessionToWorkout(session({ metadata: { id: 'a', dataOrigin: GARMIN } }), null)?.device).toBeNull();
  });

  it('names the library\'s errors: a refused read, a missing service, anything else', () => {
    const coded = (code: string, message: string) => Object.assign(new Error(message), { code });
    expect(toHealthError(coded('PERMISSION_ERROR', 'java.lang.SecurityException')).code).toBe('permission');
    expect(toHealthError(coded('CLIENT_NOT_INITIALIZED', 'Health Connect client is not initialized')).code).toBe('unavailable');
    expect(toHealthError(coded('SERVICE_UNAVAILABLE', 'x')).code).toBe('unavailable');
    expect(toHealthError(coded('UNKNOWN_ERROR', 'boom')).code).toBe('failed');
    expect(toHealthError('boom').code).toBe('failed');
    const own = new HealthError('timeout', 't');
    expect(toHealthError(own)).toBe(own);
  });
});

/**
 * A SleepSession as react-native-health-connect 4.1.3 hands it back
 * (ReactSleepSessionRecord.kt parseRecord): times as Instant strings, stages
 * with `stage` as a number, the zone offsets as { id, totalSeconds } or null,
 * metadata with the app's package and the device.
 */
const sleepSession = (over: Partial<SleepSessionRaw> = {}): SleepSessionRaw => ({
  startTime: '2026-11-11T22:40:00Z',
  endTime: '2026-11-12T06:10:00Z',
  startZoneOffset: { id: '+01:00', totalSeconds: 3600 },
  endZoneOffset: { id: '+01:00', totalSeconds: 3600 },
  title: undefined,
  notes: undefined,
  stages: [
    { startTime: '2026-11-11T22:40:00Z', endTime: '2026-11-11T22:55:00Z', stage: 1 },
    { startTime: '2026-11-11T22:55:00Z', endTime: '2026-11-12T01:00:00Z', stage: 4 },
    { startTime: '2026-11-12T01:00:00Z', endTime: '2026-11-12T02:30:00Z', stage: 5 },
    { startTime: '2026-11-12T02:30:00Z', endTime: '2026-11-12T02:40:00Z', stage: 7 },
    { startTime: '2026-11-12T02:40:00Z', endTime: '2026-11-12T04:40:00Z', stage: 6 },
    { startTime: '2026-11-12T04:40:00Z', endTime: '2026-11-12T06:10:00Z', stage: 4 },
  ],
  metadata: { id: 'sleep-1', dataOrigin: GARMIN, device: { manufacturer: 'Garmin', model: 'Forerunner 265' } },
  ...over,
});

describe('Health Connect sleep', () => {
  const clock = zoneClock('Europe/Amsterdam');
  const now = Date.parse('2026-11-12T12:00:00Z');

  it('maps every stage number, 7 (awake in bed) included', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8, undefined].map(sleepStageOf)).toEqual(['unknown', 'awake', 'asleep', 'awake', 'light', 'deep', 'rem', 'awake', 'unknown', 'unknown']);
  });

  it('lists a staged session as one sample per stage, with the app, the end offset and the session id', () => {
    const samples = sleepFromSession(sleepSession());
    expect(samples).toHaveLength(6);
    expect(samples[0]).toEqual({
      store: 'healthConnect',
      origin: GARMIN,
      kind: 'watch',
      zoneOffsetSec: 3600,
      sessionId: 'sleep-1',
      start: '2026-11-11T22:40:00.000Z',
      end: '2026-11-11T22:55:00.000Z',
      stage: 'awake',
    });
    expect(samples.map((x) => x.stage)).toEqual(['awake', 'light', 'deep', 'awake', 'rem', 'light']);
    // Through the rules: awake (stage 1 and stage 7) is not sleep.
    const [night] = nightsFrom(samples, { now, clock });
    expect(night).toMatchObject({ date: '2026-11-12', store: 'healthConnect', origin: GARMIN, hours: 7.08, stages: { light: 215, deep: 90, rem: 120, awake: 10 } });
    // (The 15 min awake before falling asleep is outside the night, so only the 10 min of stage 7 count as awake.)
  });

  it('makes a session without stages one unstaged block over its whole span', () => {
    const samples = sleepFromSession(sleepSession({ stages: [] }));
    expect(samples).toEqual([expect.objectContaining({ stage: 'asleep', start: '2026-11-11T22:40:00.000Z', end: '2026-11-12T06:10:00.000Z' })]);
    expect(nightsFrom(samples, { now, clock })[0]).toMatchObject({ hours: 7.5, stages: null });
  });

  it('counts a session of only unknown and awake stages as sleep apart from its awake time', () => {
    const samples = sleepFromSession(
      sleepSession({
        stages: [
          { startTime: '2026-11-11T22:40:00Z', endTime: '2026-11-12T03:00:00Z', stage: 0 },
          { startTime: '2026-11-12T03:00:00Z', endTime: '2026-11-12T03:30:00Z', stage: 1 },
          { startTime: '2026-11-12T03:30:00Z', endTime: '2026-11-12T06:10:00Z', stage: 0 },
        ],
      }),
    );
    expect(samples.map((x) => x.stage)).toEqual(['asleep', 'awake']);
    expect(nightsFrom(samples, { now, clock })[0]).toMatchObject({ hours: 7, stages: null });
  });

  it('falls back to the start offset, then to none, and finds the kind from the device type', () => {
    expect(sleepFromSession(sleepSession({ endZoneOffset: null }))[0].zoneOffsetSec).toBe(3600);
    expect(sleepFromSession(sleepSession({ endZoneOffset: undefined, startZoneOffset: null }))[0].zoneOffsetSec).toBeNull();
    const other = (type: number | undefined) =>
      sleepFromSession(sleepSession({ metadata: { id: 's', dataOrigin: 'com.example.sleep', device: type === undefined ? undefined : { type } } }))[0].kind;
    expect([other(1), other(2), other(0), other(undefined)]).toEqual(['watch', 'phone', 'other', 'other']);
  });

  it('skips a session without an app or with no length, and stages with no length', () => {
    expect(sleepFromSession(sleepSession({ metadata: { id: 'x' } }))).toEqual([]);
    expect(sleepFromSession(sleepSession({ endTime: '2026-11-11T22:40:00Z' }))).toEqual([]);
    const samples = sleepFromSession(sleepSession({ stages: [{ startTime: '2026-11-12T01:00:00Z', endTime: '2026-11-12T01:00:00Z', stage: 4 }, { startTime: 'x', endTime: 'y', stage: 4 }] }));
    expect(samples).toEqual([expect.objectContaining({ stage: 'asleep' })]);
  });
});
