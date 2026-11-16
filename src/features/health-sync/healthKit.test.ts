/**
 * Apple Health's workouts and step totals, in the shapes
 * @kingstinct/react-native-healthkit 16.2.0 returns (WorkoutProxy: a
 * WorkoutSample with Date objects, Quantity { unit, quantity }, a
 * sourceRevision and AnyMap metadata), turned into plain workouts and run
 * through the same pipeline as Health Connect and the Garmin file import.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { garminExternalId, importedEntryId } from '@/features/import/convert';
import { prepareImport } from '@/features/import/plan';
import { readImportFile } from '@/features/import/read';

import { sessionToWorkout } from './healthConnect';
import { accessFromRequestStatus, distanceTypeFor, HK, kcalOf, metresOf, READ_TYPES, stepDaysFromStatistics, toHealthKitError, workoutFromHealthKit, zoneOffsetSecAt, type HKStatistics, type HKWorkoutSample } from './healthKit';
import { originName, syncedFrom } from './origins';
import { planSync } from './plan';
import { zoneClock } from './steps';
import { CTX, restingKcal, stored } from './testing';
import { HealthError, NO_ACCESS } from './types';

/**
 * Apple's own devices write under 'com.apple.health.<device UUID>', the iPhone's
 * own sensors as well as a watch; the source revision's productType says which.
 */
const WATCH_BUNDLE = 'com.apple.health.5F2E1C3A-8B7D-4E2A-9C61-3D0B2A4F7E19';
const IPHONE_BUNDLE = 'com.apple.health.0C7D9A41-6E2B-4F11-8A3C-52D9E0B1C7F4';

/** An Apple Watch outdoor run, as the library hands it over (a proxy's plain fields). */
const watchRun = (over: Partial<HKWorkoutSample> = {}): HKWorkoutSample => ({
  uuid: 'A1B2C3D4-0000-4000-8000-000000000001',
  startDate: new Date('2026-11-12T06:00:00Z'),
  endDate: new Date('2026-11-12T06:45:00Z'),
  workoutActivityType: 37,
  totalEnergyBurned: { unit: 'kcal', quantity: 480 },
  totalDistance: { unit: 'meters', quantity: 8200 },
  sourceRevision: { source: { name: "Dana's Apple Watch", bundleIdentifier: WATCH_BUNDLE }, productType: 'Watch6,1' },
  device: { name: 'Apple Watch', manufacturer: 'Apple Inc.', model: 'Watch' },
  metadata: { HKTimeZone: 'Europe/Amsterdam', HKIndoorWorkout: false, HKAverageMETs: { unit: 'kcal/hr·kg', quantity: 9.1 } },
  ...over,
});

/** The same kind of run written to Apple Health by Garmin Connect (bundle id from Apple's App Store lookup). */
const garminRun = (over: Partial<HKWorkoutSample> = {}): HKWorkoutSample =>
  watchRun({
    uuid: 'G0000000-0000-4000-8000-000000000002',
    sourceRevision: { source: { name: 'Connect', bundleIdentifier: 'com.garmin.connect.mobile' } },
    device: { name: 'Forerunner 265', manufacturer: 'Garmin', model: 'Forerunner 265' },
    metadata: {},
    ...over,
  });

const FULL_STATS = { activeEnergy: { sumQuantity: { unit: 'kcal', quantity: 482.4 } }, distance: null };

describe('Apple Health mapping', () => {
  const tz = process.env.TZ;
  beforeEach(() => {
    process.env.TZ = 'Europe/Amsterdam';
  });
  afterEach(() => {
    process.env.TZ = tz;
  });

  it('turns an Apple Watch workout into a plain workout, without the watch\'s device id or the person\'s name', () => {
    const w = workoutFromHealthKit(watchRun(), FULL_STATS);
    expect(w).toEqual({
      store: 'apple-health',
      id: 'A1B2C3D4-0000-4000-8000-000000000001',
      origin: 'com.apple.health.watch',
      originName: null,
      exerciseType: 37,
      startTime: '2026-11-12T06:00:00.000Z',
      endTime: '2026-11-12T06:45:00.000Z',
      zoneOffsetSec: 3600,
      title: null,
      // The workout's own ActiveEnergyBurned statistic; HealthKit holds no total with resting included.
      activeKcal: 482.4,
      totalKcal: null,
      distanceM: 8200,
      device: 'Apple Watch',
    });
    expect(JSON.stringify(w)).not.toMatch(/Dana|5F2E1C3A/);
  });

  it('uses the workout\'s totalEnergyBurned (active energy, per Apple) when the statistic is missing, and statistics for distance when the workout has none', () => {
    const w = workoutFromHealthKit(watchRun({ totalDistance: undefined }), { activeEnergy: null, distance: { sumQuantity: { unit: 'm', quantity: 8150 } } });
    expect(w?.activeKcal).toBe(480);
    expect(w?.distanceM).toBe(8150);
  });

  it('leaves energy and distance unread when the sync did not ask for them', () => {
    expect(workoutFromHealthKit(watchRun(), null)).toMatchObject({ activeKcal: null, totalKcal: null, distanceM: null });
  });

  it('reads the zone the workout was recorded in, and folds indoor and open water into the type', () => {
    expect(workoutFromHealthKit(watchRun({ metadata: { HKTimeZone: 'America/New_York' } }), null)?.zoneOffsetSec).toBe(-5 * 3600);
    expect(workoutFromHealthKit(watchRun({ metadata: { HKTimeZone: 'Not/AZone' } }), null)?.zoneOffsetSec).toBeNull();
    expect(workoutFromHealthKit(watchRun({ metadata: {} }), null)?.zoneOffsetSec).toBeNull();
    expect(workoutFromHealthKit(watchRun({ workoutActivityType: 13, metadata: { HKIndoorWorkout: true } }), null)?.exerciseType).toBe(100_013);
    expect(workoutFromHealthKit(watchRun({ workoutActivityType: 46, metadata: { HKSwimmingLocationType: 2 } }), null)?.exerciseType).toBe(200_046);
  });

  it('names a known app by the table and any other by its own name, with its device', () => {
    expect(workoutFromHealthKit(garminRun(), FULL_STATS)).toMatchObject({ origin: 'com.garmin.connect.mobile', originName: null, device: 'Garmin Forerunner 265' });
    expect(workoutFromHealthKit(garminRun({ sourceRevision: { source: { name: 'Trail Log', bundleIdentifier: 'com.example.traillog' } } }), FULL_STATS)).toMatchObject({ originName: 'Trail Log' });
    expect(workoutFromHealthKit(garminRun({ sourceRevision: { source: { name: 'Strava Ride', bundleIdentifier: 'com.strava.stravaride' } } }), FULL_STATS)).toMatchObject({ origin: 'com.strava.stravaride', originName: null });
  });

  it('tells a workout the iPhone recorded from one the watch recorded, though both are com.apple.health.<UUID>', () => {
    const phoneWalk = watchRun({ sourceRevision: { source: { name: "Dana's iPhone", bundleIdentifier: IPHONE_BUNDLE }, productType: 'iPhone15,2' }, device: { name: 'iPhone', manufacturer: 'Apple Inc.', model: 'iPhone' } });
    expect(workoutFromHealthKit(phoneWalk, null)).toMatchObject({ origin: 'com.apple.health.iphone', originName: null });
    expect(originName('com.apple.health.iphone')).toBe('iPhone');
    expect(workoutFromHealthKit(watchRun(), null)?.origin).toBe('com.apple.health.watch');
    // Without a product type the kind of device is not guessed; no UUID is kept either way.
    const unknown = workoutFromHealthKit(watchRun({ sourceRevision: { source: { name: "Dana's Apple Watch", bundleIdentifier: WATCH_BUNDLE } } }), null);
    expect(unknown?.origin).toBe('com.apple.health.device');
    expect(originName(unknown!.origin)).toBe('Apple Health');
    expect(JSON.stringify(unknown)).not.toContain('5F2E1C3A');
  });

  it('drops a workout it cannot place', () => {
    expect(workoutFromHealthKit(watchRun({ uuid: '' }), null)).toBeNull();
    expect(workoutFromHealthKit(watchRun({ startDate: new Date('nope') }), null)).toBeNull();
    expect(workoutFromHealthKit(watchRun({ sourceRevision: { source: { name: 'x', bundleIdentifier: '' } } }), null)).toBeNull();
  });

  it('reads energy and length in the units the library may use', () => {
    expect(kcalOf({ unit: 'kcal', quantity: 300 })).toBe(300);
    expect(kcalOf({ unit: 'kJ', quantity: 4184 })).toBeCloseTo(1000);
    expect(kcalOf({ unit: 'kcal', quantity: 0 })).toBeNull();
    expect(kcalOf({ unit: 'count', quantity: 300 })).toBeNull();
    expect(metresOf({ unit: 'km', quantity: 8.2 })).toBe(8200);
    expect(metresOf({ unit: 'mi', quantity: 1 })).toBeCloseTo(1609.344);
    expect(distanceTypeFor(13)).toBe(HK.cyclingDistance);
    expect(distanceTypeFor(37)).toBe(HK.walkingRunningDistance);
    expect(distanceTypeFor(46)).toBeNull();
    expect(zoneOffsetSecAt('Asia/Kathmandu', Date.parse('2026-11-12T06:00:00Z'))).toBe(5 * 3600 + 45 * 60);
  });

  describe('through the shared pipeline', () => {
    it('saves an Apple Watch run with the "only active" calorie rule, as from Apple Watch', () => {
      const w = workoutFromHealthKit(watchRun(), FULL_STATS)!;
      const p = planSync({ workouts: [w], existing: [], ctx: CTX });
      expect(p.review).toEqual([]);
      const { entry, from } = p.add[0];
      expect(from).toBe('Apple Watch');
      // Gross is the active figure plus the resting rate (BMR) for those minutes; net is that minus the share the day already holds.
      const gross = 482.4 + (CTX.bmrKcalPerDay / 1440) * 45;
      expect(entry).toMatchObject({ source: 'health', activityId: 'running', date: '2026-11-12', durationMin: 45, distanceKm: 8.2, startedAt: '2026-11-12T06:00:00Z', measured: true });
      expect(entry.kcalGross).toBeCloseTo(gross, 0);
      expect(entry.kcalNet).toBeCloseTo(gross - restingKcal(45), 0);
      expect(entry.externalId).toBe('health:com.apple.health.watch:2026-11-12T06:00:00Z');
      expect(syncedFrom(entry)).toBe('Apple Watch');
      expect(JSON.stringify(entry)).not.toMatch(/Dana|5F2E1C3A/);
    });

    it('gives a Garmin Connect workout the id and identity a Garmin file gives the same run', () => {
      const p = planSync({ workouts: [workoutFromHealthKit(garminRun(), FULL_STATS)!], existing: [], ctx: CTX });
      const csv = new TextEncoder().encode('Activity Type,Date,Title,Distance,Calories,Time,Elapsed Time\nRunning,2026-11-12 07:00:00,"Morning Run","8.20","552","00:45:00","00:45:00"\n');
      const fromFile = prepareImport(readImportFile(csv, 'Activities.csv', { csv: { distanceUnit: 'km' } }).workouts, [], CTX)[0].entry!;
      expect(p.add[0].entry.id).toBe(fromFile.id);
      expect(p.add[0].entry.id).toBe(importedEntryId(garminExternalId({ startUtc: '2026-11-12T06:00:00Z' })));
      expect(p.add[0].entry.externalId).toBe(fromFile.externalId);
      expect(syncedFrom(p.add[0].entry)).toBe('Garmin Connect');
    });

    it('adds nothing when the same run was imported from a Garmin file before', () => {
      const csv = new TextEncoder().encode('Activity Type,Date,Title,Distance,Calories,Time,Elapsed Time\nRunning,2026-11-12 07:00:00,"Morning Run","8.20","552","00:43:10","00:45:00"\n');
      const file = prepareImport(readImportFile(csv, 'Activities.csv', { csv: { distanceUnit: 'km' } }).workouts, [], CTX)[0].entry!;
      const p = planSync({ workouts: [workoutFromHealthKit(garminRun(), FULL_STATS)!], existing: [stored(file)], ctx: CTX });
      expect(p.add).toEqual([]);
      expect(p.update).toEqual([]);
      expect(p.replace).toEqual([]);
      expect(p.review).toEqual([]);
    });

    it('writes one record when Apple Health on an iPhone and Health Connect on an Android phone both have the run', () => {
      const fromIphone = planSync({ workouts: [workoutFromHealthKit(garminRun(), FULL_STATS)!], existing: [], ctx: CTX }).add[0].entry;
      const hc = sessionToWorkout(
        { startTime: '2026-11-12T06:00:00Z', endTime: '2026-11-12T06:45:00Z', exerciseType: 56, metadata: { id: 'hc-1', dataOrigin: 'com.garmin.android.apps.connectmobile' } } as Parameters<typeof sessionToWorkout>[0],
        null,
      )!;
      const fromAndroid = planSync({ workouts: [hc], existing: [], ctx: CTX }).add[0].entry;
      expect(fromAndroid.id).toBe(fromIphone.id);
      expect(fromAndroid.externalId).toBe(fromIphone.externalId);
      // Synced over to the Android phone, the iPhone's record is already there: nothing is added.
      expect(planSync({ workouts: [hc], existing: [stored(fromIphone)], ctx: CTX }).add).toEqual([]);
    });

    it('keeps one workout when the watch and Garmin Connect both wrote the same run to Apple Health', () => {
      const both = [workoutFromHealthKit(watchRun(), FULL_STATS)!, workoutFromHealthKit(garminRun({ startDate: new Date('2026-11-12T06:00:30Z') }), FULL_STATS)!];
      const p = planSync({ workouts: both, existing: [], ctx: CTX });
      expect(p.add).toHaveLength(1);
      expect(p.add[0].from).toBe('Garmin Connect');
    });
  });
});

describe('Apple Health steps', () => {
  const ams = zoneClock('Europe/Amsterdam');
  /** One day of a statistics collection, as the library serialises it (serializeStatistics: sumQuantity, startDate, endDate, sources). */
  const dayStat = (startIso: string, endIso: string, count: number | null, unit = 'count'): HKStatistics & { sources: { name: string; bundleIdentifier: string }[] } => ({
    ...(count === null ? null : { sumQuantity: { unit, quantity: count } }),
    startDate: new Date(startIso),
    endDate: new Date(endIso),
    sources: [
      { name: "Dana's iPhone", bundleIdentifier: IPHONE_BUNDLE },
      { name: "Dana's Apple Watch", bundleIdentifier: WATCH_BUNDLE },
    ],
  });

  it('takes the steps per day from HealthKit\'s own day totals, which already count the iPhone and the watch once', () => {
    // Intervals anchored at local midnight in Amsterdam (UTC+1 in November).
    expect(
      stepDaysFromStatistics(
        [dayStat('2026-11-11T23:00:00Z', '2026-11-12T23:00:00Z', 7950.6), dayStat('2026-11-12T23:00:00Z', '2026-11-13T23:00:00Z', null), dayStat('2026-11-13T23:00:00Z', '2026-11-14T23:00:00Z', 4200)],
        ams.dayOf,
      ),
    ).toEqual([
      { day: '2026-11-12', count: 7951 },
      { day: '2026-11-14', count: 4200 },
    ]);
  });

  it('names the day by the middle of the interval, so the days around a clock change keep their own dates', () => {
    // 25 October 2026: Amsterdam goes back an hour; that day runs 22:00Z to 23:00Z next day.
    expect(stepDaysFromStatistics([dayStat('2026-10-24T22:00:00Z', '2026-10-25T23:00:00Z', 9000)], ams.dayOf)).toEqual([{ day: '2026-10-25', count: 9000 }]);
    // 29 March 2026: forward an hour; that day runs 23:00Z to 22:00Z.
    expect(stepDaysFromStatistics([dayStat('2026-03-28T23:00:00Z', '2026-03-29T22:00:00Z', 6000)], ams.dayOf)).toEqual([{ day: '2026-03-29', count: 6000 }]);
  });

  it('leaves out what is not a step count', () => {
    expect(stepDaysFromStatistics([dayStat('2026-11-11T23:00:00Z', '2026-11-12T23:00:00Z', 0)], ams.dayOf)).toEqual([]);
    expect(stepDaysFromStatistics([dayStat('2026-11-11T23:00:00Z', '2026-11-12T23:00:00Z', 900, 'kcal')], ams.dayOf)).toEqual([]);
    expect(stepDaysFromStatistics([{ sumQuantity: { unit: 'count', quantity: 900 } }], ams.dayOf)).toEqual([]);
  });
});

describe('Apple Health permission and errors', () => {
  it('asks for exactly five read types and nothing to write', () => {
    expect(READ_TYPES).toEqual([
      'HKWorkoutTypeIdentifier',
      'HKQuantityTypeIdentifierActiveEnergyBurned',
      'HKQuantityTypeIdentifierDistanceWalkingRunning',
      'HKQuantityTypeIdentifierDistanceCycling',
      'HKQuantityTypeIdentifierStepCount',
    ]);
  });

  it('counts everything as readable once asked, since HealthKit never says what was refused', () => {
    expect(accessFromRequestStatus(2)).toEqual({ workouts: true, activeEnergy: true, totalEnergy: false, distance: true, steps: true });
    expect(accessFromRequestStatus(1)).toEqual(NO_ACCESS);
    expect(accessFromRequestStatus(0)).toEqual(NO_ACCESS);
  });

  it('knows a copy without the HealthKit entitlement from any other refusal', () => {
    const missing = Object.assign(new Error('Missing com.apple.developer.healthkit entitlement.'), { code: 4 });
    expect(toHealthKitError(missing)).toMatchObject({ code: 'not-entitled' });
    expect(toHealthKitError(new Error('Health data is unavailable on this device'))).toMatchObject({ code: 'unavailable' });
    expect(toHealthKitError(new Error('Authorization not determined'))).toMatchObject({ code: 'permission' });
    expect(toHealthKitError('boom')).toMatchObject({ code: 'failed', message: 'boom' });
    const own = new HealthError('timeout', 'slow');
    expect(toHealthKitError(own)).toBe(own);
  });
});
