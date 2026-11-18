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
 * Read only: workouts, active energy, walking and running distance, cycling
 * distance and steps (READ_TYPES); sleep analysis (SLEEP_READ_TYPES); body mass
 * and body fat (WEIGHT_READ_TYPES); resting energy (ENERGY_READ_TYPES); heart
 * rate (HEART_READ_TYPES), each later list asked for on its own. No writing, no
 * background delivery, no clinical records. HealthKit gives everything the
 * person allowed, at any age; the sync still only looks at the last 30 days of
 * workouts, 35 days of steps and sleep, 28 of weigh-ins and 14 of day totals.
 */
import {
  accessFromRequestStatus,
  bodyFromHealthKit,
  dayEnergyFromStatistics,
  distanceTypeFor,
  ENERGY_READ_TYPES,
  HEART_READ_TYPES,
  HK,
  ownHeartWindow,
  READ_TYPES,
  SLEEP_READ_TYPES,
  WEIGHT_READ_TYPES,
  sleepFromHealthKit,
  stepDaysFromStatistics,
  toHealthKitError,
  workoutFromHealthKit,
  workoutRef,
  type HealthKitApi,
  type HealthKitReadType,
  type HKStatistics,
  type HKWorkoutProxy,
  type WorkoutStats,
} from './healthKit';
import { localClock, type StepClock } from './steps';
import type { AccessRequest, BodySample, DayEnergyDay, HealthAccess, HealthAdapter, HealthAvailability, HealthWorkout, ReadOptions, SleepSample, StepDayTotal, StepsRange } from './types';

export interface HealthKitLinks {
  /** Open the Health app (where Sharing > Apps > HealthCal lists what may be read). */
  openHealth(): void;
}

/** `clock` decides which day a statistics interval is (default: the phone's own, as `today()`). */
export function createHealthKitAdapter(api: HealthKitApi, links: HealthKitLinks, clock: StepClock = localClock): HealthAdapter {
  const toRead = { toRead: READ_TYPES };
  const sleepToRead = { toRead: SLEEP_READ_TYPES };
  const weightToRead = { toRead: WEIGHT_READ_TYPES };
  const energyToRead = { toRead: ENERGY_READ_TYPES };
  const heartToRead = { toRead: HEART_READ_TYPES };
  /** What each "Allow" asks: a row's own list alone, or every list in one sheet when sync is turned on. */
  const requestFor = (what: AccessRequest): { toRead: readonly HealthKitReadType[] } => {
    // Steps are in the first list (READ_TYPES): a phone missing them is asked that list again, never the newer rows.
    if (what === 'steps') return { toRead: READ_TYPES };
    if (what === 'sleep') return sleepToRead;
    if (what === 'weight') return weightToRead;
    if (what === 'dayEnergy') return energyToRead;
    if (what === 'heartRate') return heartToRead;
    return { toRead: [...READ_TYPES, ...SLEEP_READ_TYPES, ...WEIGHT_READ_TYPES, ...ENERGY_READ_TYPES, ...HEART_READ_TYPES] };
  };

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

  /**
   * The five, then each later list on its own: a phone that allowed the five
   * before sleep (or sleep before weight, energy and heart rate) was read has
   * not been asked about the later ones.
   */
  async function current(): Promise<HealthAccess> {
    const main = await api.getRequestStatusForAuthorization(toRead);
    const sleep = await api.getRequestStatusForAuthorization(sleepToRead);
    const weight = await api.getRequestStatusForAuthorization(weightToRead);
    const energy = await api.getRequestStatusForAuthorization(energyToRead);
    const heart = await api.getRequestStatusForAuthorization(heartToRead);
    return accessFromRequestStatus(main, sleep, weight, energy, heart);
  }

  async function access(): Promise<HealthAccess> {
    try {
      return await current();
    } catch (e) {
      throw toHealthKitError(e);
    }
  }

  /**
   * 'all': every list in one sheet (turning sync on). 'sleep', 'weight',
   * 'dayEnergy', 'heartRate': that row's list alone (the row's "Allow").
   */
  async function requestAccess(what: AccessRequest = 'all'): Promise<HealthAccess> {
    try {
      await api.requestAuthorization(requestFor(what));
      return await current();
    } catch (e) {
      throw toHealthKitError(e);
    }
  }

  async function stats(w: HKWorkoutProxy, allowed: HealthAccess): Promise<WorkoutStats> {
    const distanceType = !w.totalDistance && allowed.distance ? distanceTypeFor(w.workoutActivityType) : null;
    const [activeEnergy, distance, heartRate] = await Promise.all([
      allowed.activeEnergy ? w.getStatistic(HK.activeEnergy, 'kcal') : null,
      distanceType ? w.getStatistic(distanceType, 'm') : null,
      allowed.heartRate ? heartOf(w) : null,
    ]);
    return { activeEnergy: activeEnergy ?? null, distance: distance ?? null, heartRate };
  }

  /**
   * A workout's heart rate in count/min: its own statistic (HKWorkout.statistics(for:)), else the
   * samples inside its time, asked from every source (a source filter needs native objects) and kept
   * only when every source in the answer is the workout's own app (ownHeartWindow). Heart rate is
   * extra: a failed question leaves the workout without it, never without the workout.
   */
  async function heartOf(w: HKWorkoutProxy): Promise<HKStatistics | null> {
    try {
      const own = await w.getStatistic(HK.heartRate, 'count/min');
      if (own?.averageQuantity) return own;
      const window = await api.queryStatisticsForQuantity(HK.heartRate, ['discreteAverage', 'discreteMax'], {
        unit: 'count/min',
        filter: { date: { startDate: w.startDate, endDate: w.endDate, strictStartDate: true, strictEndDate: true } },
      });
      return ownHeartWindow(window, w.sourceRevision?.source?.bundleIdentifier);
    } catch {
      return null;
    }
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

  /**
   * Every sleep-analysis sample overlapping the range, from every source, as
   * raw stages (healthKit.ts, sleepFromHealthKit). The date filter's strict
   * flags are left unset, so a night that began before `from` is included.
   */
  async function readSleep(range: { from: string; to: string }, allowed: HealthAccess): Promise<SleepSample[]> {
    if (!allowed.sleep) return [];
    try {
      const list = await api.queryCategorySamples(HK.sleep, {
        limit: 0,
        ascending: true,
        filter: { date: { startDate: new Date(range.from), endDate: new Date(range.to) } },
      });
      const out: SleepSample[] = [];
      for (const x of list) {
        const sample = sleepFromHealthKit(x);
        if (sample) out.push(sample);
      }
      return out;
    } catch (e) {
      throw toHealthKitError(e);
    }
  }

  /**
   * Every body-mass sample in the range (kg) and, when body fat may be read,
   * every body-fat sample ('%', a fraction), from every source, as raw samples
   * (body.ts chooses one weigh-in a day). A failed body-fat read leaves the
   * weights without it.
   */
  async function readWeighIns(range: { from: string; to: string }, allowed: HealthAccess): Promise<BodySample[]> {
    if (!allowed.weight) return [];
    try {
      const filter = { date: { startDate: new Date(range.from), endDate: new Date(range.to) } };
      const out: BodySample[] = [];
      for (const x of await api.queryQuantitySamples(HK.bodyMass, { limit: 0, ascending: true, unit: 'kg', filter })) {
        const sample = bodyFromHealthKit(x, 'weight');
        if (sample) out.push(sample);
      }
      if (allowed.bodyFat) {
        // Body fat is the optional part: a failed read keeps the weights, and a
        // late body fat is filled in on a later run (body.ts, rule f(ii)).
        try {
          const fat: BodySample[] = [];
          for (const x of await api.queryQuantitySamples(HK.bodyFat, { limit: 0, ascending: true, unit: '%', filter })) {
            const sample = bodyFromHealthKit(x, 'bodyFat');
            if (sample) fat.push(sample);
          }
          out.push(...fat);
        } catch {
          // Weights alone.
        }
      }
      return out;
    } catch (e) {
      throw toHealthKitError(e);
    }
  }

  /**
   * The calories burned on each local day: active plus resting energy, each a
   * statistics collection anchored at the first day's local midnight, one
   * interval a day, `cumulativeSum` in kcal (HealthKit keeps one count where
   * the iPhone and the watch overlap). Shown on Progress only (dayEnergy.ts).
   */
  async function readDayEnergy(range: StepsRange, allowed: HealthAccess): Promise<DayEnergyDay[]> {
    if (!allowed.dayEnergy) return [];
    try {
      const from = new Date(range.from);
      const options = { unit: 'kcal', filter: { date: { startDate: from, endDate: new Date(range.to) } } };
      const active = await api.queryStatisticsCollectionForQuantity(HK.activeEnergy, ['cumulativeSum'], from, { day: 1 }, options);
      const basal = await api.queryStatisticsCollectionForQuantity(HK.basalEnergy, ['cumulativeSum'], from, { day: 1 }, options);
      return dayEnergyFromStatistics(active, basal, clock.dayOf).filter((d) => d.day >= range.fromDay && d.day <= range.toDay);
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
    readSleep,
    readWeighIns,
    readDayEnergy,
    openSettings: () => links.openHealth(),
    // Apple Health is part of iOS: there is nothing to install or update.
    openInstall: () => {},
  };
}
