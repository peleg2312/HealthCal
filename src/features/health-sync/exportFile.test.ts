import { describe, expect, it } from 'vitest';

import { toActivityEntry } from '@/features/import/convert';
import { entriesToSave, prepareImport } from '@/features/import/plan';
import { createHealthScanner } from '@/features/import/appleExport';
import { utf8 } from '@/features/import/zipBuilder';
import { ACTIVITY_BY_ID } from '@/data/activities';
import type { ActivityEntry } from '@/types';

import { appleTypeFromName, APPLE_HEALTH_TYPES, HK_ACTIVITY_TYPE_NAMES, INDOOR, OPEN_WATER } from './appleHealthTypes';
import { recordIdFor, toImportedWorkout } from './convert';
import { createStepTally, exportKcal, exportMetres, exportOrigin, exportWorkouts, parseExportDate, workoutFromExport } from './exportFile';
import { DEVICES, exportXml, newWorkout, oldWorkout } from './exportFixture';
import { workoutFromHealthKit } from './healthKit';
import { syncedFrom } from './origins';
import { zoneClock } from './steps';

const ctx = { weightKg: 70, baselineKcalPerDay: 2400, bmrKcalPerDay: 1600 };

function raw(xml: string) {
  const s = createHealthScanner();
  s.push(utf8(exportXml(xml)));
  return s.finish().workouts;
}

describe('dates and units', () => {
  it('reads the export date format with its offset', () => {
    expect(parseExportDate('2026-11-15 10:00:00 +0200')).toEqual({ ms: Date.parse('2026-11-15T08:00:00Z'), offsetMin: 120 });
    expect(parseExportDate('2026-11-15 10:00:00 -0530')?.offsetMin).toBe(-330);
    expect(parseExportDate('15/11/2026')).toBeNull();
  });

  it('converts every energy and distance unit', () => {
    expect(exportKcal(300, 'kcal')).toBe(300);
    expect(exportKcal(300, 'Cal')).toBe(300);
    expect(exportKcal(1255.2, 'kJ')).toBeCloseTo(300, 5);
    expect(exportKcal(1_255_200, 'J')).toBeCloseTo(300, 5);
    expect(exportKcal(300_000, 'cal')).toBeCloseTo(300, 5);
    expect(exportKcal(300, 'furlong')).toBeNull();
    expect(exportKcal(0, 'kcal')).toBeNull();
    expect(exportMetres(5, 'km')).toBe(5000);
    expect(exportMetres(1, 'mi')).toBeCloseTo(1609.344, 3);
    expect(exportMetres(1500, 'm')).toBe(1500);
    expect(exportMetres(100, 'yd')).toBeCloseTo(91.44, 3);
    expect(exportMetres(1000, 'ft')).toBeCloseTo(304.8, 3);
    expect(exportMetres(5, 'parsec')).toBeNull();
  });
});

describe('activity type names', () => {
  it('names every type the number table has, and only those', () => {
    const numbers = new Set(Object.values(HK_ACTIVITY_TYPE_NAMES));
    for (const key of Object.keys(APPLE_HEALTH_TYPES).map(Number)) {
      const base = key >= OPEN_WATER ? key - OPEN_WATER : key >= INDOOR ? key - INDOOR : key;
      expect(numbers.has(base), String(key)).toBe(true);
    }
    for (const n of numbers) expect(APPLE_HEALTH_TYPES[n], String(n)).toBeDefined();
    expect(appleTypeFromName('HKWorkoutActivityTypeRunning')).toBe(37);
    expect(appleTypeFromName('HKWorkoutActivityTypeMixedMetabolicCardioTraining')).toBe(30);
    expect(appleTypeFromName('Swimming')).toBe(46);
    expect(appleTypeFromName('HKWorkoutActivityTypeSomethingNew')).toBeNull();
    expect(appleTypeFromName('constructor')).toBeNull();
  });
});

describe('where a workout came from', () => {
  it('keeps the kind of device or the app, never a name', () => {
    expect(exportOrigin('Dana’s Apple Watch', DEVICES.watch)).toBe('com.apple.health.watch');
    expect(exportOrigin('Dana’s iPhone', DEVICES.phone)).toBe('com.apple.health.iphone');
    expect(exportOrigin('Dana’s Apple Watch', '')).toBe('com.apple.health.watch');
    expect(exportOrigin('Garmin Connect', '')).toBe('com.garmin.connect.mobile');
    expect(exportOrigin('Strava', '')).toBe('com.strava.stravaride');
    // A name that could be anyone's is never kept: it becomes Apple Health.
    expect(exportOrigin('Dana Smith', '')).toBe('com.apple.health.device');
    expect(exportOrigin('Trail Tracker 3000', '<<HKDevice: 0x1>, name:Thing, manufacturer:Acme, model:T1, hardware:T1, software:1>')).toBe('com.apple.health.device');
  });

  it('no personal name, device UUID or serial survives into a saved record', () => {
    const device = '&lt;&lt;HKDevice: 0x283a1c0f0&gt;, name:Dana’s Apple Watch, manufacturer:Apple Inc., model:Watch, hardware:Watch6,1, software:10.1, localIdentifier:9F3C2B1A-0D4E-4F5A-8B6C-7D8E9F0A1B2C, UDIDeviceIdentifier:SERIAL12345&gt;';
    const r = raw(newWorkout({ type: 'HKWorkoutActivityTypeRunning', start: '2026-11-15 07:00:00 +0100', end: '2026-11-15 07:40:00 +0100', source: 'Dana’s Apple Watch', device, kcal: 400, distance: 7 }));
    const { workouts } = exportWorkouts(r, 'export.zip', ctx);
    const [row] = prepareImport(workouts, [], ctx);
    const saved = JSON.stringify({ workouts, entries: entriesToSave([row]) });
    expect(saved).not.toMatch(/Dana|9F3C2B1A|SERIAL12345|0x283a1c0f0/);
    expect(entriesToSave([row])[0]).toMatchObject({ source: 'health', externalId: 'health:com.apple.health.watch:2026-11-15T06:00:00Z' });
    expect(syncedFrom(entriesToSave([row])[0])).toBe('Apple Watch');
  });
});

describe('workouts from both generations of the file', () => {
  const older = oldWorkout({ type: 'HKWorkoutActivityTypeRunning', start: '2026-11-14 07:00:00 +0100', end: '2026-11-14 07:42:00 +0100', kcal: 455, distance: 7.6 });
  const newer = newWorkout({ type: 'HKWorkoutActivityTypeCycling', start: '2026-11-15 17:30:00 +0100', end: '2026-11-15 18:34:00 +0100', kcal: 610, distance: 24.8, distanceType: 'HKQuantityTypeIdentifierDistanceCycling', metadata: { HKIndoorWorkout: '0' } });

  it('reads totals on the element (before iOS 16) and in WorkoutStatistics (iOS 16 and later)', () => {
    const [a, b] = raw(older + newer).map((r, i) => workoutFromExport(r, i)!);
    expect(a).toMatchObject({ store: 'apple-health', exerciseType: 37, activeKcal: 455, distanceM: 7600, startTime: '2026-11-14T06:00:00.000Z', zoneOffsetSec: 3600 });
    expect(b).toMatchObject({ exerciseType: 13, activeKcal: 610, distanceM: 24800, origin: 'com.apple.health.watch', device: 'Apple Watch' });
  });

  it('reads energy and distance in every unit the file can use', () => {
    const w = (kcal: number, kcalUnit: string, distance: number, distanceUnit: string, old = false) =>
      workoutFromExport(
        raw(
          old
            ? oldWorkout({ type: 'HKWorkoutActivityTypeWalking', start: '2026-11-15 10:00:00 +0000', end: '2026-11-15 11:00:00 +0000', kcal, kcalUnit, distance, distanceUnit })
            : newWorkout({ type: 'HKWorkoutActivityTypeWalking', start: '2026-11-15 10:00:00 +0000', end: '2026-11-15 11:00:00 +0000', kcal, kcalUnit, distance, distanceUnit }),
        )[0],
        0,
      )!;
    expect(w(300, 'kcal', 5, 'km').activeKcal).toBe(300);
    expect(w(300, 'Cal', 3.106856, 'mi').distanceM).toBeCloseTo(5000, 0);
    expect(w(1255.2, 'kJ', 5000, 'm').activeKcal).toBeCloseTo(300, 5);
    expect(w(1255.2, 'kJ', 5000, 'm', true).activeKcal).toBeCloseTo(300, 5);
    expect(w(300, 'kcal', 3.106856, 'mi', true).distanceM).toBeCloseTo(5000, 0);
  });

  it('reads indoor and open water from metadata, and an unknown type asks', () => {
    const indoor = newWorkout({ type: 'HKWorkoutActivityTypeWalking', start: '2026-11-15 10:00:00 +0000', end: '2026-11-15 10:30:00 +0000', metadata: { HKIndoorWorkout: '1' } });
    const open = newWorkout({ type: 'HKWorkoutActivityTypeSwimming', start: '2026-11-15 12:00:00 +0000', end: '2026-11-15 12:30:00 +0000', distance: 1500, distanceUnit: 'm', distanceType: 'HKQuantityTypeIdentifierDistanceSwimming', metadata: { HKSwimmingLocationType: '2' } });
    const unknown = newWorkout({ type: 'HKWorkoutActivityTypeZorbing', start: '2026-11-15 14:00:00 +0000', end: '2026-11-15 14:30:00 +0000' });
    const rows = prepareImport(exportWorkouts(raw(indoor + open + unknown), 'export.zip', ctx).workouts, [], ctx);
    const by = (start: string) => rows.find((r) => r.workout.startUtc === start)!;
    expect(by('2026-11-15T10:00:00Z').activityId).toBe('treadmill_walking');
    expect(by('2026-11-15T12:00:00Z').activityId).toBe('open_water_swimming');
    expect(by('2026-11-15T12:00:00Z').workout.distanceM).toBe(1500);
    expect(by('2026-11-15T14:00:00Z')).toMatchObject({ activityId: null, entry: null, selected: false });
    expect(by('2026-11-15T14:00:00Z').workout.sport).toBe('Workout');
  });

  it('prices a workout as HealthKit does (energy.ts, only active)', () => {
    const [fromFile] = exportWorkouts(raw(newer), 'export.zip', ctx).workouts;
    const fromHealthKit = workoutFromHealthKit(
      {
        uuid: 'u1',
        startDate: new Date('2026-11-15T16:30:00Z'),
        endDate: new Date('2026-11-15T17:34:00Z'),
        workoutActivityType: 13,
        totalEnergyBurned: { unit: 'kcal', quantity: 610 },
        totalDistance: { unit: 'm', quantity: 24800 },
        sourceRevision: { source: { name: 'Dana’s Apple Watch', bundleIdentifier: 'com.apple.health.81F2D0A4-1B2C-4D5E-8F90-123456789ABC' }, productType: 'Watch6,1' },
        metadata: {},
      },
      {},
    )!;
    const viaHealthKit = toImportedWorkout(fromHealthKit, 0, ctx)!;
    expect(fromFile.kcal).toBe(viaHealthKit.kcal);
    const a = toActivityEntry(fromFile, ACTIVITY_BY_ID.cycling, ctx);
    const b = toActivityEntry(viaHealthKit, ACTIVITY_BY_ID.cycling, ctx);
    expect(a.kcalNet).toBe(b.kcalNet);
    expect(a.id).toBe(b.id);
    expect(a.id).toBe(recordIdFor('2026-11-15T16:30:00Z'));
  });

  it('keeps one reading when two sources recorded the same session', () => {
    const watch = newWorkout({ type: 'HKWorkoutActivityTypeRunning', start: '2026-11-15 07:00:00 +0100', end: '2026-11-15 07:40:00 +0100', kcal: 400 });
    const garmin = oldWorkout({ type: 'HKWorkoutActivityTypeRunning', start: '2026-11-15 07:00:20 +0100', end: '2026-11-15 07:40:10 +0100', kcal: 410, source: 'Garmin Connect', device: '' });
    const out = exportWorkouts(raw(watch + garmin), 'export.zip', ctx);
    expect(out.workouts).toHaveLength(1);
    expect(out.leftOut.otherSource).toBe(1);
    // Both measured: Garmin Connect wins, as in the sync, and keeps a Garmin file's identity.
    expect(out.workouts[0].externalId).toBe('garmin:2026-11-15T06:00:20Z');
  });
});

describe('duplicates against what the diary has', () => {
  const run = newWorkout({ type: 'HKWorkoutActivityTypeRunning', start: '2026-11-15 07:00:00 +0100', end: '2026-11-15 07:40:00 +0100', kcal: 400, distance: 7 });

  it('a workout already imported from a Garmin file at the same start is not added again', () => {
    const fit = { format: 'fit' as const, fileName: 'run.fit', index: 1, startUtc: '2026-11-15T06:00:00Z', startFromLocalTime: false, durationSec: 2400, elapsedSec: 2400, durationIncludesPauses: false, distanceM: 7000, kcal: 520, avgHeartRate: 150, maxHeartRate: 170, sport: 'running', subSport: null, title: null, device: null };
    const stored: ActivityEntry = { ...toActivityEntry(fit, ACTIVITY_BY_ID.running, ctx), updatedAt: '2026-11-15T08:00:00Z' };
    const rows = prepareImport(exportWorkouts(raw(run), 'export.zip', ctx).workouts, [stored], ctx);
    expect(rows[0].status).toBe('already-imported');
    expect(rows[0].entry?.id).toBe(stored.id);
    expect(entriesToSave(rows)).toEqual([]);
  });

  it('nor one synced from HealthKit, nor the same file twice', () => {
    const first = prepareImport(exportWorkouts(raw(run), 'export.zip', ctx).workouts, [], ctx);
    const saved = entriesToSave(first).map((e) => ({ ...e, updatedAt: 'x' }) as ActivityEntry);
    expect(saved).toHaveLength(1);
    const again = prepareImport(exportWorkouts(raw(run), 'export.zip', ctx).workouts, saved, ctx);
    expect(again[0].status).toBe('already-imported');
  });

  it('an estimate already stored is updated with the file’s measured calories, keeping its source', () => {
    const gpx = { format: 'gpx' as const, fileName: 'run.gpx', index: 1, startUtc: '2026-11-15T06:00:00Z', startFromLocalTime: false, durationSec: 2400, elapsedSec: 2400, durationIncludesPauses: true, distanceM: 7000, kcal: null, avgHeartRate: null, maxHeartRate: null, sport: 'running', subSport: null, title: null, device: null };
    const stored: ActivityEntry = { ...toActivityEntry(gpx, ACTIVITY_BY_ID.running, ctx), updatedAt: 'x' };
    const rows = prepareImport(exportWorkouts(raw(run), 'export.zip', ctx).workouts, [stored], ctx);
    expect(rows[0].status).toBe('update');
    expect(entriesToSave(rows)[0]).toMatchObject({ id: stored.id, source: 'garmin', externalId: stored.externalId, measured: true });
  });
});

describe('daily steps from samples', () => {
  const amsterdam = zoneClock('Europe/Amsterdam');
  const at = (s: string) => Date.parse(s);

  it('an iPhone and a Watch counting the same walk count once (the source with more steps leads; another fills hours it has none in)', () => {
    const t = createStepTally(amsterdam, '2026-11-10', '2026-11-16');
    t.add('iPhone', at('2026-11-15T09:00:00Z'), at('2026-11-15T09:30:00Z'), 3000);
    t.add('Watch', at('2026-11-15T09:05:00Z'), at('2026-11-15T09:35:00Z'), 3600);
    // A different hour that only the phone saw.
    t.add('iPhone', at('2026-11-15T14:00:00Z'), at('2026-11-15T14:10:00Z'), 500);
    // The watch (3,600) leads the phone (3,500): 09:00 is the watch's, 14:00 only the phone has.
    expect(t.days()).toEqual({ '2026-11-15': 4100 });
  });

  it('two devices that split the same walk differently across an hour never give the day more than one of them counted', () => {
    // Review finding: the highest source per hour took 1,500 from the watch and 1,000 from the phone, 2,500 for a 2,000-step walk.
    const t = createStepTally(zoneClock('UTC'), '2026-11-10', '2026-11-16');
    t.add('iPhone', at('2026-11-15T10:00:00Z'), at('2026-11-15T12:00:00Z'), 2000);
    t.add('Watch', at('2026-11-15T10:00:00Z'), at('2026-11-15T11:00:00Z'), 1500);
    t.add('Watch', at('2026-11-15T11:00:00Z'), at('2026-11-15T12:00:00Z'), 500);
    expect(t.days()).toEqual({ '2026-11-15': 2000 });
    // Whichever way the totals lean, the day is one device's count.
    const u = createStepTally(zoneClock('UTC'), '2026-11-10', '2026-11-16');
    u.add('iPhone', at('2026-11-15T10:00:00Z'), at('2026-11-15T12:00:00Z'), 2000);
    u.add('Watch', at('2026-11-15T10:00:00Z'), at('2026-11-15T11:00:00Z'), 1600);
    u.add('Watch', at('2026-11-15T11:00:00Z'), at('2026-11-15T12:00:00Z'), 500);
    expect(u.days()).toEqual({ '2026-11-15': 2100 });
  });

  it('the order of sources is the same for every day and does not depend on the order of the file', () => {
    const samples: [string, string, string, number][] = [
      ['Watch', '2026-11-14T10:00:00Z', '2026-11-14T10:20:00Z', 900],
      ['iPhone', '2026-11-14T10:00:00Z', '2026-11-14T10:20:00Z', 1000],
      ['Watch', '2026-11-15T10:00:00Z', '2026-11-15T10:20:00Z', 3000],
      ['iPhone', '2026-11-15T10:00:00Z', '2026-11-15T10:20:00Z', 2500],
    ];
    const a = createStepTally(zoneClock('UTC'), '2026-11-10', '2026-11-16');
    for (const [src, s, e, n] of samples) a.add(src, at(s), at(e), n);
    const b = createStepTally(zoneClock('UTC'), '2026-11-10', '2026-11-16');
    for (const [src, s, e, n] of [...samples].reverse()) b.add(src, at(s), at(e), n);
    // The watch has more over the window (3,900 to 3,500), so it leads on both days, also where the phone counted more.
    expect(a.days()).toEqual({ '2026-11-14': 900, '2026-11-15': 3000 });
    expect(b.days()).toEqual(a.days());
  });

  it('one source written in pieces of different lengths is never compared against itself', () => {
    const t = createStepTally(amsterdam, '2026-11-10', '2026-11-16');
    for (let q = 0; q < 4; q++) t.add('Watch', at('2026-11-15T09:00:00Z') + q * 900_000, at('2026-11-15T09:00:00Z') + (q + 1) * 900_000, 250);
    t.add('Garmin Connect', at('2026-11-15T09:00:00Z'), at('2026-11-15T10:00:00Z'), 1000);
    expect(t.days()).toEqual({ '2026-11-15': 1000 });
  });

  it('a day with only one source is that source; a sample over midnight is split between the days', () => {
    const t = createStepTally(amsterdam, '2026-11-10', '2026-11-16');
    t.add('Watch', at('2026-11-14T22:30:00Z'), at('2026-11-14T23:30:00Z'), 600); // 23:30 to 00:30 in Amsterdam
    expect(t.days()).toEqual({ '2026-11-14': 300, '2026-11-15': 300 });
  });

  it('keeps only the window', () => {
    const t = createStepTally(amsterdam, '2026-11-10', '2026-11-16');
    t.add('Watch', at('2026-11-01T10:00:00Z'), at('2026-11-01T10:10:00Z'), 900);
    t.add('Watch', at('2026-11-17T10:00:00Z'), at('2026-11-17T10:10:00Z'), 900);
    t.add('Watch', at('2026-11-10T10:00:00Z'), at('2026-11-10T10:10:00Z'), 900);
    expect(t.days()).toEqual({ '2026-11-10': 900 });
  });

  it('uses the phone’s calendar across a time zone change (samples written in another offset)', () => {
    const t = createStepTally(amsterdam, '2026-11-10', '2026-11-16');
    // Written in New York, -0500: 20:00 there is 02:00 the next day in Amsterdam.
    t.addRecord({ sourceName: 'iPhone', startDate: '2026-11-12 20:00:00 -0500', endDate: '2026-11-12 20:10:00 -0500', value: '400' }, (s) => parseExportDate(s)?.ms ?? null);
    t.addRecord({ sourceName: 'iPhone', startDate: '2026-11-13 09:00:00 +0100', endDate: '2026-11-13 09:10:00 +0100', value: '600' }, (s) => parseExportDate(s)?.ms ?? null);
    expect(t.days()).toEqual({ '2026-11-13': 1000 });
  });

  it('counts the hours of a day when the clocks change', () => {
    const t = createStepTally(amsterdam, '2026-10-20', '2026-10-30');
    // 25 October 2026: clocks go back at 03:00, the day has 25 hours. Every hour of it, from two sources.
    const start = amsterdam.midnightOf('2026-10-25');
    for (let h = 0; h < 25; h++) {
      t.add('iPhone', start + h * 3_600_000, start + h * 3_600_000 + 600_000, 100);
      t.add('Watch', start + h * 3_600_000, start + h * 3_600_000 + 600_000, 120);
    }
    expect(t.days()).toEqual({ '2026-10-25': 3000 });
  });
});
