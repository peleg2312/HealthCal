/**
 * The iPhone adapter against an in-memory stand-in for
 * @kingstinct/react-native-healthkit: the calls it makes, what it asks for,
 * what it does with a copy of the app that HealthKit refuses, and that every
 * native workout is freed once read.
 */
import { describe, expect, it } from 'vitest';

import type { HealthKitApi, HKStatistics, HKWorkoutProxy } from './healthKit';
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
  opened: number;
}

function stand(init: Partial<Pick<Stand, 'status' | 'available' | 'refuse'>> = {}): Stand {
  const s = { calls: [], disposed: [], status: 1, available: true, refuse: null, workouts: [], steps: [], opened: 0, ...init } as Omit<Stand, 'api'> & { api?: HealthKitApi };
  const guard = () => {
    if (s.refuse) throw new Error(s.refuse);
  };
  s.api = {
    isHealthDataAvailable: () => s.available,
    getRequestStatusForAuthorization: async (toCheck) => {
      s.calls.push(`status:${toCheck.toRead.length}`);
      guard();
      return s.status;
    },
    requestAuthorization: async (toRequest) => {
      s.calls.push(`request:${toRequest.toRead.join(',')}`);
      guard();
      s.status = 2;
      return true;
    },
    queryWorkoutSamples: async (options) => {
      s.calls.push(`workouts:${options.limit}:${options.filter?.date?.startDate?.toISOString()}:${options.filter?.date?.endDate?.toISOString()}`);
      guard();
      return s.workouts;
    },
    queryStatisticsCollectionForQuantity: async (identifier, statistics, anchorDate, interval, options) => {
      s.calls.push(`collection:${identifier}:${statistics.join(',')}:${anchorDate.toISOString()}:${JSON.stringify(interval)}:${options?.unit}:${options?.filter?.date?.startDate?.toISOString()}:${options?.filter?.date?.endDate?.toISOString()}`);
      guard();
      return s.steps;
    },
  };
  return s as Stand;
}

const proxy = (id: string, start: string, minutes: number, stats: Record<string, number> = {}, s?: Stand): HKWorkoutProxy => ({
  uuid: id,
  startDate: new Date(start),
  endDate: new Date(Date.parse(start) + minutes * 60_000),
  workoutActivityType: 37,
  totalEnergyBurned: { unit: 'kcal', quantity: 400 },
  totalDistance: undefined,
  sourceRevision: { source: { name: 'Connect', bundleIdentifier: 'com.garmin.connect.mobile' } },
  metadata: {},
  getStatistic: async (type) => {
    s?.calls.push(`stat:${id}:${type}`);
    return stats[type] !== undefined ? { sumQuantity: { unit: type.includes('Energy') ? 'kcal' : 'm', quantity: stats[type] } } : undefined;
  },
  dispose: () => {
    s?.disposed.push(id);
  },
});

const RANGE = { from: '2026-10-15T12:00:00.000Z', to: '2026-11-14T12:00:00.000Z' };

describe('the iPhone adapter', () => {
  it('is Apple Health, available, and asks once for the five read types', async () => {
    const s = stand();
    const a = createHealthKitAdapter(s.api, { openHealth: () => void (s.opened += 1) });
    expect(a.store).toBe('apple-health');
    expect(await a.availability()).toBe('available');
    expect(await a.access()).toEqual(NO_ACCESS);
    const access = await a.requestAccess();
    expect(access).toMatchObject({ workouts: true, activeEnergy: true, distance: true, steps: true });
    expect(s.calls).toContain('request:HKWorkoutTypeIdentifier,HKQuantityTypeIdentifierActiveEnergyBurned,HKQuantityTypeIdentifierDistanceWalkingRunning,HKQuantityTypeIdentifierDistanceCycling,HKQuantityTypeIdentifierStepCount');
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
