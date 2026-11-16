/**
 * iPhone: workouts and steps from Apple Health, through
 * @kingstinct/react-native-healthkit. This file makes the calls and nothing
 * else; what the answers mean is decided in healthKit.ts and the shared rules.
 *
 * It takes the library as an argument (`HealthKitApi`, the library's own call
 * names and shapes) instead of importing it, so it is tested against an
 * in-memory stand-in (healthKitAdapter.test.ts) and only adapter.ios.ts ever
 * loads the native module.
 *
 * Read only: five types (workouts, active energy, walking and running distance,
 * cycling distance, steps), no writing, no background delivery, no clinical
 * records. HealthKit gives everything the person allowed, at any age; the sync
 * still only looks at the last 30 days of workouts and 35 days of steps.
 */
import { accessFromRequestStatus, distanceTypeFor, HK, READ_TYPES, stepDaysFromStatistics, toHealthKitError, workoutFromHealthKit, workoutRef, type HealthKitApi, type HKWorkoutProxy, type WorkoutStats } from './healthKit';
import { localClock, type StepClock } from './steps';
import type { HealthAccess, HealthAdapter, HealthAvailability, HealthWorkout, ReadOptions, StepDayTotal, StepsRange } from './types';

export interface HealthKitLinks {
  /** Open the Health app (where Sharing > Apps > HealthCal lists what may be read). */
  openHealth(): void;
}

/** `clock` decides which day a statistics interval is (default: the phone's own, as `today()`). */
export function createHealthKitAdapter(api: HealthKitApi, links: HealthKitLinks, clock: StepClock = localClock): HealthAdapter {
  const toRead = { toRead: READ_TYPES };

  async function availability(): Promise<HealthAvailability> {
    try {
      if (!api.isHealthDataAvailable()) return 'unsupported';
      // A copy without the HealthKit entitlement is refused here already: say so before the switch is touched.
      await api.getRequestStatusForAuthorization(toRead);
      return 'available';
    } catch (e) {
      const error = toHealthKitError(e);
      if (error.code === 'not-entitled') return 'not-entitled';
      throw error;
    }
  }

  async function access(): Promise<HealthAccess> {
    try {
      return accessFromRequestStatus(await api.getRequestStatusForAuthorization(toRead));
    } catch (e) {
      throw toHealthKitError(e);
    }
  }

  async function requestAccess(): Promise<HealthAccess> {
    try {
      await api.requestAuthorization(toRead);
      return accessFromRequestStatus(await api.getRequestStatusForAuthorization(toRead));
    } catch (e) {
      throw toHealthKitError(e);
    }
  }

  async function stats(w: HKWorkoutProxy, allowed: HealthAccess): Promise<WorkoutStats> {
    const distanceType = !w.totalDistance && allowed.distance ? distanceTypeFor(w.workoutActivityType) : null;
    const [activeEnergy, distance] = await Promise.all([
      allowed.activeEnergy ? w.getStatistic(HK.activeEnergy, 'kcal') : null,
      distanceType ? w.getStatistic(distanceType, 'm') : null,
    ]);
    return { activeEnergy: activeEnergy ?? null, distance: distance ?? null };
  }

  async function readWorkouts(range: { from: string; to: string }, allowed: HealthAccess, options?: ReadOptions): Promise<HealthWorkout[]> {
    try {
      const list = await api.queryWorkoutSamples({
        limit: 0,
        ascending: true,
        filter: { date: { startDate: new Date(range.from), endDate: new Date(range.to) } },
      });
      const out: HealthWorkout[] = [];
      for (const w of list) {
        try {
          const ref = workoutRef(w);
          if (!ref) continue;
          const wanted = Date.parse(ref.endTime) > Date.parse(ref.startTime) && (options?.needsDetail ? options.needsDetail(ref) : true);
          const workout = workoutFromHealthKit(w, wanted ? await stats(w, allowed) : null);
          if (workout) out.push(workout);
        } finally {
          // Each workout is a native object; free it as soon as it has been read.
          try {
            w.dispose();
          } catch {
            // Already freed.
          }
        }
      }
      return out;
    } catch (e) {
      throw toHealthKitError(e);
    }
  }

  /**
   * Steps per day as HealthKit totals them: a statistics collection anchored at
   * the first day's local midnight, one interval a day, `cumulativeSum` (one
   * count where the iPhone and the watch overlap, by the Health app's own rule).
   */
  async function readStepDays(range: StepsRange, allowed: HealthAccess): Promise<StepDayTotal[]> {
    if (!allowed.steps) return [];
    try {
      const from = new Date(range.from);
      const stats = await api.queryStatisticsCollectionForQuantity(HK.steps, ['cumulativeSum'], from, { day: 1 }, {
        unit: 'count',
        filter: { date: { startDate: from, endDate: new Date(range.to) } },
      });
      return stepDaysFromStatistics(stats, clock.dayOf).filter((d) => d.day >= range.fromDay && d.day <= range.toDay);
    } catch (e) {
      throw toHealthKitError(e);
    }
  }

  return {
    store: 'apple-health',
    availability,
    access,
    requestAccess,
    readWorkouts,
    readStepDays,
    openSettings: () => links.openHealth(),
    // Apple Health is part of iOS: there is nothing to install or update.
    openInstall: () => {},
  };
}
