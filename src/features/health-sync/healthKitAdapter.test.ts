/**
 * The iPhone adapter against an in-memory stand-in for
 * @kingstinct/react-native-healthkit: the calls it makes, what it asks for,
 * what it does with a copy of the app that HealthKit refuses, and that every
 * native workout is freed once read.
 */
import { describe, expect, it } from 'vitest';

import type { HealthKitApi, HKCategorySample, HKQuantitySample, HKStatistics, HKWorkoutProxy } from './healthKit';
import { createHealthKitAdapter } from './healthKitAdapter';
import { zoneClock } from './steps';
import { NO_ACCESS } from './types';

const ENTITLEMENT = 'Missing com.apple.developer.healthkit entitlement.';

interface Stand {
  api: HealthKitApi;
  calls: string[];
  disposed: string[];
  status: number;
  available: boolean;
  /** The message HealthKit refuses every authorization call with, as a copy without the entitlement is. */
  refuse: string | null;
  workouts: HKWorkoutProxy[];
  /** The statistics collection HealthKit answers a steps question with (one entry per day with data). */
  steps: HKStatistics[];
  /** Sleep-analysis samples, and the request status of the sleep type on its own (1: not asked yet). */
  sleep: HKCategorySample[];
  sleepStatus: number;
  /** The request status of each list added after sleep (1: not asked yet). */
  weightStatus: number;
  energyStatus: number;
  heartStatus: number;
  /** Body-mass and body-fat samples. */
  bodyMass: HKQuantitySample[];
  bodyFat: HKQuantitySample[];
  /** The statistics collections for active and basal energy. */
  activeDays: HKStatistics[];
  basalDays: HKStatistics[];
  /** What queryStatisticsForQuantity answers for heart rate over a workout's time. */
  heartWindow: HKStatistics;
  opened: number;
}

/** Which list a status question or a request is about, by its first type. */
const LIST_OF: Record<string, 'main' | 'sleep' | 'weight' | 'energy' | 'heart'> = {
  HKWorkoutTypeIdentifier: 'main',
  HKCategoryTypeIdentifierSleepAnalysis: 'sleep',
  HKQuantityTypeIdentifierBodyMass: 'weight',
  HKQuantityTypeIdentifierBasalEnergyBurned: 'energy',
  HKQuantityTypeIdentifierHeartRate: 'heart',
};
const STATUS_KEY = { main: 'status', sleep: 'sleepStatus', weight: 'weightStatus', energy: 'energyStatus', heart: 'heartStatus' } as const;

function stand(init: Partial<Pick<Stand, 'status' | 'available' | 'refuse' | 'sleepStatus' | 'weightStatus' | 'energyStatus' | 'heartStatus'>> = {}): Stand {
  const s = {
    calls: [],
    disposed: [],
    status: 1,
    available: true,
    refuse: null,
    workouts: [],
    steps: [],
    sleep: [],
    sleepStatus: 1,
    weightStatus: 1,
    energyStatus: 1,
    heartStatus: 1,
    bodyMass: [],
    bodyFat: [],
    activeDays: [],
    basalDays: [],
    heartWindow: { sources: [] },
    opened: 0,
    ...init,
  } as Omit<Stand, 'api'> & { api?: HealthKitApi };
  const listOf = (types: readonly string[]) => LIST_OF[types[0]];
  const guard = () => {
    if (s.refuse) throw new Error(s.refuse);
  };
  s.api = {
    isHealthDataAvailable: () => s.available,
    getRequestStatusForAuthorization: async (toCheck) => {
      const list = listOf(toCheck.toRead);
      s.calls.push(list === 'main' ? `status:${toCheck.toRead.length}` : `status:${list}`);
      guard();
      return s[STATUS_KEY[list]];
    },
    requestAuthorization: async (toRequest) => {
      s.calls.push(`request:${toRequest.toRead.join(',')}`);
      guard();
      // Asked types are answered (whatever the person chose: HealthKit never says which reads were allowed).
      for (const t of toRequest.toRead) if (LIST_OF[t]) s[STATUS_KEY[LIST_OF[t]]] = 2;
      return true;
    },
    queryQuantitySamples: async (identifier, options) => {
      s.calls.push(`samples:${identifier}:${options.limit}:${options.ascending}:${options.unit}:${options.filter?.date?.startDate?.toISOString()}:${options.filter?.date?.endDate?.toISOString()}`);
      guard();
      return identifier === 'HKQuantityTypeIdentifierBodyMass' ? s.bodyMass : s.bodyFat;
    },
    queryStatisticsForQuantity: async (identifier, statistics, options) => {
      const d = options?.filter?.date;
      s.calls.push(`statistic:${identifier}:${statistics.join(',')}:${options?.unit}:${d?.startDate?.toISOString()}:${d?.endDate?.toISOString()}:${d?.strictStartDate}:${d?.strictEndDate}`);
      guard();
      return s.heartWindow;
    },
    queryCategorySamples: async (identifier, options) => {
      s.calls.push(`category:${identifier}:${options.limit}:${options.ascending}:${options.filter?.date?.startDate?.toISOString()}:${options.filter?.date?.endDate?.toISOString()}`);
      guard();
      return s.sleep;
    },
    queryWorkoutSamples: async (options) => {
      s.calls.push(`workouts:${options.limit}:${options.filter?.date?.startDate?.toISOString()}:${options.filter?.date?.endDate?.toISOString()}`);
      guard();
      return s.workouts;
    },
    queryStatisticsCollectionForQuantity: async (identifier, statistics, anchorDate, interval, options) => {
      s.calls.push(`collection:${identifier}:${statistics.join(',')}:${anchorDate.toISOString()}:${JSON.stringify(interval)}:${options?.unit}:${options?.filter?.date?.startDate?.toISOString()}:${options?.filter?.date?.endDate?.toISOString()}`);
      guard();
      if (identifier === 'HKQuantityTypeIdentifierActiveEnergyBurned') return s.activeDays;
      if (identifier === 'HKQuantityTypeIdentifierBasalEnergyBurned') return s.basalDays;
      return s.steps;
    },
  };
  return s as Stand;
}

const proxy = (id: string, start: string, minutes: number, stats: Record<string, number | HKStatistics> = {}, s?: Stand): HKWorkoutProxy => ({
  uuid: id,
  startDate: new Date(start),
  endDate: new Date(Date.parse(start) + minutes * 60_000),
  workoutActivityType: 37,
  totalEnergyBurned: { unit: 'kcal', quantity: 400 },
  totalDistance: undefined,
  sourceRevision: { source: { name: 'Connect', bundleIdentifier: 'com.garmin.connect.mobile' } },
  metadata: {},
  getStatistic: async (type, unit) => {
    s?.calls.push(`stat:${id}:${type}${type.includes('HeartRate') ? `:${unit}` : ''}`);
    const v = stats[type];
    if (v === undefined) return undefined;
    return typeof v === 'number' ? { sumQuantity: { unit: type.includes('Energy') ? 'kcal' : 'm', quantity: v } } : v;
  },
  dispose: () => {
    s?.disposed.push(id);
  },
});

const RANGE = { from: '2026-10-15T12:00:00.000Z', to: '2026-11-14T12:00:00.000Z' };

describe('the iPhone adapter', () => {
  it('is Apple Health, available, and asks once for every list: the five, sleep, weight, resting energy and heart rate', async () => {
    const s = stand();
    const a = createHealthKitAdapter(s.api, { openHealth: () => void (s.opened += 1) });
    expect(a.store).toBe('apple-health');
    expect(await a.availability()).toBe('available');
    expect(await a.access()).toEqual(NO_ACCESS);
    const access = await a.requestAccess();
    expect(access).toEqual({ workouts: true, activeEnergy: true, totalEnergy: false, distance: true, steps: true, sleep: true, weight: true, bodyFat: true, dayEnergy: true, heartRate: true });
    expect(s.calls).toContain(
      'request:HKWorkoutTypeIdentifier,HKQuantityTypeIdentifierActiveEnergyBurned,HKQuantityTypeIdentifierDistanceWalkingRunning,HKQuantityTypeIdentifierDistanceCycling,HKQuantityTypeIdentifierStepCount,HKCategoryTypeIdentifierSleepAnalysis,HKQuantityTypeIdentifierBodyMass,HKQuantityTypeIdentifierBodyFatPercentage,HKQuantityTypeIdentifierBasalEnergyBurned,HKQuantityTypeIdentifierHeartRate',
    );
    expect(s.calls.filter((c) => c.startsWith('request:'))).toHaveLength(1);
    a.openSettings();
    expect(s.opened).toBe(1);
  });

  it('says "not available in this install" for a copy HealthKit refuses for its entitlement, before anything is asked', async () => {
    const s = stand({ refuse: ENTITLEMENT });
    const a = createHealthKitAdapter(s.api, { openHealth: () => {} });
    expect(await a.availability()).toBe('not-entitled');
    await expect(a.requestAccess()).rejects.toMatchObject({ code: 'not-entitled' });
    await expect(a.readWorkouts(RANGE, { ...NO_ACCESS, workouts: true })).rejects.toMatchObject({ code: 'not-entitled' });
  });

  it('is unsupported where the device has no Apple Health (an older iPad)', async () => {
    expect(await createHealthKitAdapter(stand({ available: false }).api, { openHealth: () => {} }).availability()).toBe('unsupported');
  });

  it('lists every workout in the range, reads statistics only where asked, and frees each native workout', async () => {
    const s = stand({ status: 2 });
    s.workouts = [
      proxy('w1', '2026-11-12T06:00:00Z', 45, { HKQuantityTypeIdentifierActiveEnergyBurned: 482, HKQuantityTypeIdentifierDistanceWalkingRunning: 8200 }, s),
      proxy('w2', '2026-11-13T06:00:00Z', 30, {}, s),
    ];
    const a = createHealthKitAdapter(s.api, { openHealth: () => {} });
    const access = await a.access();
    const out = await a.readWorkouts(RANGE, access, { needsDetail: (w) => w.id === 'w1' });
    expect(s.calls).toContain('workouts:0:2026-10-15T12:00:00.000Z:2026-11-14T12:00:00.000Z');
    expect(out.map((w) => [w.id, w.activeKcal, w.distanceM])).toEqual([
      ['w1', 482, 8200],
      ['w2', null, null],
    ]);
    expect(s.calls.filter((c) => c.startsWith('stat:'))).toEqual(['stat:w1:HKQuantityTypeIdentifierActiveEnergyBurned', 'stat:w1:HKQuantityTypeIdentifierDistanceWalkingRunning']);
    expect(s.disposed).toEqual(['w1', 'w2']);
  });

  it('asks HealthKit for one total a day from the first day\'s midnight, and nothing when steps may not be read', async () => {
    const s = stand({ status: 2 });
    s.steps = [
      { sumQuantity: { unit: 'count', quantity: 6400 }, startDate: new Date('2026-11-12T23:00:00Z'), endDate: new Date('2026-11-13T23:00:00Z') },
      { sumQuantity: { unit: 'count', quantity: 900 }, startDate: new Date('2026-11-13T23:00:00Z'), endDate: new Date('2026-11-14T23:00:00Z') },
    ];
    const a = createHealthKitAdapter(s.api, { openHealth: () => {} }, zoneClock('Europe/Amsterdam'));
    const range = { from: '2026-11-12T23:00:00.000Z', to: '2026-11-14T12:00:00.000Z', fromDay: '2026-11-13', toDay: '2026-11-14' };
    expect(await a.readStepDays(range, await a.access())).toEqual([
      { day: '2026-11-13', count: 6400 },
      { day: '2026-11-14', count: 900 },
    ]);
    expect(s.calls).toContain('collection:HKQuantityTypeIdentifierStepCount:cumulativeSum:2026-11-12T23:00:00.000Z:{"day":1}:count:2026-11-12T23:00:00.000Z:2026-11-14T12:00:00.000Z');
    const before = s.calls.length;
    expect(await a.readStepDays(range, { ...NO_ACCESS, workouts: true })).toEqual([]);
    expect(s.calls.length).toBe(before);
  });

  it('turns a refused steps question into a HealthError', async () => {
    const s = stand({ status: 2 });
    const a = createHealthKitAdapter(s.api, { openHealth: () => {} });
    const access = await a.access();
    s.refuse = ENTITLEMENT;
    await expect(a.readStepDays({ from: '2026-11-12T23:00:00.000Z', to: '2026-11-14T12:00:00.000Z', fromDay: '2026-11-13', toDay: '2026-11-14' }, access)).rejects.toMatchObject({ code: 'not-entitled' });
  });
});

const night = (value: number, start: string, end: string, over: Partial<HKCategorySample> = {}): HKCategorySample => ({
  uuid: `${value}-${start}`,
  startDate: new Date(start),
  endDate: new Date(end),
  value,
  sourceRevision: { source: { name: 'Apple Watch', bundleIdentifier: 'com.apple.health.81B2C3D4-0000-4000-8000-000000000001' }, productType: 'Watch7,1' },
  metadata: { HKTimeZone: 'Europe/Amsterdam' },
  ...over,
});

describe('Apple Health sleep', () => {
  it('reads the five as allowed and sleep as not asked on a phone that allowed sync before sleep was read', async () => {
    const s = stand({ status: 2, sleepStatus: 1 });
    const a = createHealthKitAdapter(s.api, { openHealth: () => {} });
    expect(await a.access()).toEqual({ ...NO_ACCESS, workouts: true, activeEnergy: true, totalEnergy: false, distance: true, steps: true, sleep: false });
    expect(s.calls).toEqual(['status:5', 'status:sleep', 'status:weight', 'status:energy', 'status:heart']);
  });

  it('asks for sleep alone from the Sleep row, and then reads it as allowed', async () => {
    const s = stand({ status: 2, sleepStatus: 1 });
    const a = createHealthKitAdapter(s.api, { openHealth: () => {} });
    const access = await a.requestAccess('sleep');
    expect(s.calls).toContain('request:HKCategoryTypeIdentifierSleepAnalysis');
    expect(access).toMatchObject({ workouts: true, sleep: true });
  });

  it('lists every sleep sample in the range as raw stages, with no strict edges, and nothing without access', async () => {
    const s = stand({ status: 2, sleepStatus: 2 });
    s.sleep = [
      night(0, '2026-11-13T21:30:00Z', '2026-11-14T05:40:00Z', { sourceRevision: { source: { name: 'iPhone', bundleIdentifier: 'com.apple.health.81B2C3D4-0000-4000-8000-000000000002' }, productType: 'iPhone15,2' } }),
      night(3, '2026-11-13T22:00:00Z', '2026-11-14T01:00:00Z'),
      night(4, '2026-11-14T01:00:00Z', '2026-11-14T02:00:00Z'),
      night(2, '2026-11-14T02:00:00Z', '2026-11-14T02:10:00Z'),
      night(5, '2026-11-14T02:10:00Z', '2026-11-14T05:30:00Z'),
      night(1, '2026-11-14T05:30:00Z', '2026-11-14T05:30:00Z'),
    ];
    const a = createHealthKitAdapter(s.api, { openHealth: () => {} });
    expect(await a.readSleep(RANGE, { ...NO_ACCESS, workouts: true })).toEqual([]);
    expect(s.calls.some((c) => c.startsWith('category:'))).toBe(false);
    const samples = await a.readSleep(RANGE, { ...NO_ACCESS, workouts: true, sleep: true });
    expect(s.calls).toContain(`category:HKCategoryTypeIdentifierSleepAnalysis:0:true:${RANGE.from}:${RANGE.to}`);
    // The sample with no length is left out; the device UUIDs never appear.
    expect(samples.map((x) => [x.origin, x.kind, x.stage])).toEqual([
      ['com.apple.health.iphone', 'phone', 'inBed'],
      ['com.apple.health.watch', 'watch', 'light'],
      ['com.apple.health.watch', 'watch', 'deep'],
      ['com.apple.health.watch', 'watch', 'awake'],
      ['com.apple.health.watch', 'watch', 'rem'],
    ]);
    expect(samples[1]).toEqual({ store: 'healthKit', origin: 'com.apple.health.watch', kind: 'watch', start: '2026-11-13T22:00:00.000Z', end: '2026-11-14T01:00:00.000Z', zoneOffsetSec: 3600, stage: 'light' });
  });

  it('turns a refused or failed read into the feature\'s error', async () => {
    const s = stand({ status: 2, sleepStatus: 2, refuse: 'Authorization not determined' });
    const a = createHealthKitAdapter(s.api, { openHealth: () => {} });
    await expect(a.readSleep(RANGE, { ...NO_ACCESS, sleep: true })).rejects.toMatchObject({ code: 'permission' });
  });
});

const GARMIN_IOS = 'com.garmin.connect.mobile';
const quantity = (value: number, at: string, bundle = GARMIN_IOS, over: Partial<HKQuantitySample> = {}): HKQuantitySample => ({
  quantity: value,
  startDate: new Date(at),
  sourceRevision: { source: { name: 'Connect', bundleIdentifier: bundle } },
  metadata: { HKTimeZone: 'Europe/Amsterdam' },
  ...over,
});

describe('Apple Health weigh-ins, the day\'s calories and workout heart rate', () => {
  it('reads weight, energy and heart rate as not asked on a phone that allowed the five and sleep', async () => {
    const s = stand({ status: 2, sleepStatus: 2 });
    const a = createHealthKitAdapter(s.api, { openHealth: () => {} });
    expect(await a.access()).toMatchObject({ workouts: true, sleep: true, weight: false, bodyFat: false, dayEnergy: false, heartRate: false });
  });

  it('asks each new row\'s list alone, and only that row changes', async () => {
    const s = stand({ status: 2, sleepStatus: 2 });
    const a = createHealthKitAdapter(s.api, { openHealth: () => {} });
    expect(await a.requestAccess('weight')).toMatchObject({ weight: true, bodyFat: true, dayEnergy: false, heartRate: false });
    expect(await a.requestAccess('dayEnergy')).toMatchObject({ weight: true, dayEnergy: true, heartRate: false });
    expect(await a.requestAccess('heartRate')).toMatchObject({ heartRate: true });
    expect(s.calls.filter((c) => c.startsWith('request:'))).toEqual([
      'request:HKQuantityTypeIdentifierBodyMass,HKQuantityTypeIdentifierBodyFatPercentage',
      'request:HKQuantityTypeIdentifierBasalEnergyBurned',
      'request:HKQuantityTypeIdentifierHeartRate',
    ]);
  });

  it('asks the Steps row for the first list alone, never the newer rows', async () => {
    const s = stand({ status: 2, sleepStatus: 2 });
    const a = createHealthKitAdapter(s.api, { openHealth: () => {} });
    await a.requestAccess('steps');
    const asked = s.calls.filter((c) => c.startsWith('request:'));
    expect(asked).toHaveLength(1);
    expect(asked[0]).toContain('HKQuantityTypeIdentifierStepCount');
    for (const t of ['SleepAnalysis', 'BodyMass', 'BasalEnergyBurned', 'HeartRate']) expect(asked[0]).not.toContain(t);
  });

  it('counts the day\'s calories as allowed only when active energy (the five) was asked too', async () => {
    const s = stand({ status: 1, energyStatus: 2 });
    expect(await createHealthKitAdapter(s.api, { openHealth: () => {} }).access()).toMatchObject({ dayEnergy: false });
  });

  it('reads body mass in kg and body fat in % (a fraction), with origins and zones, and body fat only when allowed', async () => {
    const s = stand({ status: 2, weightStatus: 2 });
    s.bodyMass = [quantity(82.4, '2026-11-14T06:12:00Z'), quantity(81.9, '2026-11-13T06:10:00Z', 'com.apple.Health', { metadata: {} })];
    s.bodyFat = [quantity(0.182, '2026-11-14T06:12:00Z')];
    const a = createHealthKitAdapter(s.api, { openHealth: () => {} });
    const access = await a.access();
    const out = await a.readWeighIns(RANGE, access);
    expect(s.calls).toContain(`samples:HKQuantityTypeIdentifierBodyMass:0:true:kg:${RANGE.from}:${RANGE.to}`);
    expect(s.calls).toContain(`samples:HKQuantityTypeIdentifierBodyFatPercentage:0:true:%:${RANGE.from}:${RANGE.to}`);
    expect(out).toEqual([
      { store: 'healthKit', origin: GARMIN_IOS, time: '2026-11-14T06:12:00.000Z', zoneOffsetSec: 3600, kind: 'weight', value: 82.4 },
      { store: 'healthKit', origin: 'com.apple.Health', time: '2026-11-13T06:10:00.000Z', zoneOffsetSec: null, kind: 'weight', value: 81.9 },
      { store: 'healthKit', origin: GARMIN_IOS, time: '2026-11-14T06:12:00.000Z', zoneOffsetSec: 3600, kind: 'bodyFat', value: 0.182 },
    ]);
    const before = s.calls.length;
    expect((await a.readWeighIns(RANGE, { ...access, bodyFat: false })).map((x) => x.kind)).toEqual(['weight', 'weight']);
    expect(s.calls.slice(before).some((c) => c.includes('BodyFat'))).toBe(false);
    expect(await a.readWeighIns(RANGE, { ...access, weight: false })).toEqual([]);
  });

  it('keeps the weights when the body-fat read fails, and fails only when the weights do', async () => {
    const s = stand({ status: 2, weightStatus: 2 });
    s.bodyMass = [quantity(82.4, '2026-11-14T06:12:00Z')];
    const read = s.api.queryQuantitySamples;
    s.api.queryQuantitySamples = async (identifier, options) => {
      if (identifier === 'HKQuantityTypeIdentifierBodyFatPercentage') throw new Error('boom');
      return read(identifier, options);
    };
    const a = createHealthKitAdapter(s.api, { openHealth: () => {} });
    const access = await a.access();
    expect((await a.readWeighIns(RANGE, access)).map((x) => [x.kind, x.value])).toEqual([['weight', 82.4]]);
    s.api.queryQuantitySamples = async () => {
      throw new Error('boom');
    };
    await expect(a.readWeighIns(RANGE, access)).rejects.toBeTruthy();
  });

  it('adds the active and basal statistics collections per day, from the first day\'s midnight', async () => {
    const s = stand({ status: 2, energyStatus: 2 });
    const day = (start: string, end: string, kcal: number, bundle = GARMIN_IOS): HKStatistics => ({ sumQuantity: { unit: 'kcal', quantity: kcal }, startDate: new Date(start), endDate: new Date(end), sources: [{ name: 'Connect', bundleIdentifier: bundle }] });
    s.activeDays = [day('2026-11-12T23:00:00Z', '2026-11-13T23:00:00Z', 640), day('2026-11-13T23:00:00Z', '2026-11-14T23:00:00Z', 210)];
    s.basalDays = [day('2026-11-12T23:00:00Z', '2026-11-13T23:00:00Z', 1700.4), day('2026-11-13T23:00:00Z', '2026-11-14T23:00:00Z', 900)];
    const a = createHealthKitAdapter(s.api, { openHealth: () => {} }, zoneClock('Europe/Amsterdam'));
    const range = { from: '2026-11-12T23:00:00.000Z', to: '2026-11-14T12:00:00.000Z', fromDay: '2026-11-13', toDay: '2026-11-14' };
    expect(await a.readDayEnergy(range, await a.access())).toEqual([
      { day: '2026-11-13', kcal: 2340, activeKcal: 640, origins: [GARMIN_IOS] },
      { day: '2026-11-14', kcal: 1110, activeKcal: 210, origins: [GARMIN_IOS] },
    ]);
    expect(s.calls).toContain('collection:HKQuantityTypeIdentifierActiveEnergyBurned:cumulativeSum:2026-11-12T23:00:00.000Z:{"day":1}:kcal:2026-11-12T23:00:00.000Z:2026-11-14T12:00:00.000Z');
    expect(s.calls).toContain('collection:HKQuantityTypeIdentifierBasalEnergyBurned:cumulativeSum:2026-11-12T23:00:00.000Z:{"day":1}:kcal:2026-11-12T23:00:00.000Z:2026-11-14T12:00:00.000Z');
    const before = s.calls.length;
    expect(await a.readDayEnergy(range, { ...NO_ACCESS, workouts: true })).toEqual([]);
    expect(s.calls.length).toBe(before);
  });

  it('takes a workout\'s heart rate from its own statistic, else from the samples inside its time, and only when allowed', async () => {
    const s = stand({ status: 2, heartStatus: 2 });
    const own: HKStatistics = { averageQuantity: { unit: 'count/min', quantity: 142.4 }, maximumQuantity: { unit: 'count/min', quantity: 171.2 } };
    s.workouts = [proxy('w1', '2026-11-12T06:00:00Z', 45, { HKQuantityTypeIdentifierHeartRate: own }, s), proxy('w2', '2026-11-13T06:00:00Z', 30, {}, s)];
    s.heartWindow = { averageQuantity: { unit: 'count/min', quantity: 128 }, maximumQuantity: { unit: 'count/min', quantity: 160 }, sources: [{ name: 'Connect', bundleIdentifier: 'com.garmin.connect.mobile' }] };
    const a = createHealthKitAdapter(s.api, { openHealth: () => {} });
    const access = await a.access();
    const out = await a.readWorkouts(RANGE, access);
    expect(out.map((w) => [w.id, w.avgHeartRate, w.maxHeartRate])).toEqual([
      ['w1', 142, 171],
      ['w2', 128, 160],
    ]);
    expect(s.calls).toContain('stat:w1:HKQuantityTypeIdentifierHeartRate:count/min');
    expect(s.calls.filter((c) => c.startsWith('statistic:'))).toEqual([
      'statistic:HKQuantityTypeIdentifierHeartRate:discreteAverage,discreteMax:count/min:2026-11-13T06:00:00.000Z:2026-11-13T06:30:00.000Z:true:true',
    ]);
    // Not allowed: never asked, and the workouts carry none.
    const s2 = stand({ status: 2 });
    s2.workouts = [proxy('w3', '2026-11-12T06:00:00Z', 45, { HKQuantityTypeIdentifierHeartRate: own }, s2)];
    const b = createHealthKitAdapter(s2.api, { openHealth: () => {} });
    const [w3] = await b.readWorkouts(RANGE, await b.access());
    expect(w3.avgHeartRate).toBeUndefined();
    expect(s2.calls.some((c) => c.includes('HeartRate'))).toBe(false);
  });

  it('leaves a workout without heart rate when the samples in its time came from another source too, or name none', async () => {
    const window = (sources: HKStatistics['sources']): HKStatistics => ({ averageQuantity: { unit: 'count/min', quantity: 128 }, maximumQuantity: { unit: 'count/min', quantity: 160 }, sources });
    for (const [sources, expected] of [
      [[{ name: 'Connect', bundleIdentifier: 'com.garmin.connect.mobile' }, { name: 'Dana\'s Apple Watch', bundleIdentifier: 'com.apple.health.ABCDEF12-3456-7890' }], undefined],
      [[{ name: 'Powerbeats', bundleIdentifier: 'com.apple.health.11111111-2222' }], undefined],
      [[], undefined],
      [undefined, undefined],
      [[{ name: 'Connect', bundleIdentifier: 'com.garmin.connect.mobile' }], 128],
    ] as const) {
      const s = stand({ status: 2, heartStatus: 2 });
      s.workouts = [proxy('w1', '2026-11-12T06:00:00Z', 45, {}, s)];
      s.heartWindow = window(sources as HKStatistics['sources']);
      const a = createHealthKitAdapter(s.api, { openHealth: () => {} });
      const [w] = await a.readWorkouts(RANGE, await a.access());
      expect(w.id).toBe('w1');
      expect(w.avgHeartRate).toBe(expected);
    }
  });

  it('keeps the workout when its heart-rate question fails', async () => {
    const s = stand({ status: 2, heartStatus: 2 });
    const w = proxy('w1', '2026-11-12T06:00:00Z', 45, { HKQuantityTypeIdentifierActiveEnergyBurned: 400 }, s);
    s.workouts = [{ ...w, getStatistic: async (type) => {
      if (type.includes('HeartRate')) throw new Error('boom');
      return w.getStatistic(type);
    } }];
    s.api.queryStatisticsForQuantity = async () => {
      throw new Error('boom');
    };
    const a = createHealthKitAdapter(s.api, { openHealth: () => {} });
    const out = await a.readWorkouts(RANGE, await a.access());
    expect(out.map((x) => [x.id, x.activeKcal, x.avgHeartRate])).toEqual([['w1', 400, undefined]]);
  });
});
