/**
 * Apple Health's own shapes turned into this feature's plain ones. Pure: the
 * iPhone adapter (healthKitAdapter.ts) only makes the calls and passes the
 * answers through here, so every rule is tested without an iPhone.
 *
 * The shapes below are the parts of @kingstinct/react-native-healthkit 16.2.0's
 * own types this app reads, written out structurally so the rules and their
 * tests do not load the native module (read from the package's
 * src/types/Workouts.ts `WorkoutSample`, src/specs/WorkoutProxy.nitro.ts,
 * src/types/QuantityType.ts, src/specs/QuantityTypeModule.nitro.ts and
 * @react-native-healthkit/core src/types/{Shared,Source,Device}.ts). The iPhone
 * binding, adapter.ios.ts (docs/health-sync.md, "How the iPhone side is
 * bound"), hands the real module to `createHealthKitAdapter`, and the type
 * checker holds the module to these shapes.
 *
 * Calories: HKWorkout.totalEnergyBurned is "the total active energy burned
 * during the workout" (Apple's documentation; deprecated in iOS 18 for the
 * workout's ActiveEnergyBurned statistic), so it is the *active* figure here.
 * Basal energy is read only as a day's total for Progress (ENERGY_READ_TYPES,
 * dayEnergy.ts), never for a workout: an Apple Health workout is
 * priced by the "only active" row of energy.ts (gross = active + the resting
 * rate for those minutes, net = gross minus the resting share), the same rule
 * Health Connect uses when an app writes only active energy.
 */
import { appleExerciseType, HK_TYPE } from './appleHealthTypes';
import { appleOrigin, isAppleOrigin, isKnownOrigin } from './origins';
import { heartFigures } from './heart';
import { sleepKindOf } from './sleep';
import {
  HealthError,
  NO_ACCESS,
  type BodySample,
  type DayEnergyDay,
  type HealthAccess,
  type HealthWorkout,
  type SleepSample,
  type SleepStage,
  type StepDayTotal,
} from './types';

/** HealthKit's identifiers for what is read. Nothing else is ever asked for, and nothing is written. */
export const HK = {
  workout: 'HKWorkoutTypeIdentifier',
  activeEnergy: 'HKQuantityTypeIdentifierActiveEnergyBurned',
  walkingRunningDistance: 'HKQuantityTypeIdentifierDistanceWalkingRunning',
  cyclingDistance: 'HKQuantityTypeIdentifierDistanceCycling',
  steps: 'HKQuantityTypeIdentifierStepCount',
  sleep: 'HKCategoryTypeIdentifierSleepAnalysis',
  bodyMass: 'HKQuantityTypeIdentifierBodyMass',
  bodyFat: 'HKQuantityTypeIdentifierBodyFatPercentage',
  basalEnergy: 'HKQuantityTypeIdentifierBasalEnergyBurned',
  heartRate: 'HKQuantityTypeIdentifierHeartRate',
} as const;

/** The five read permissions, in the order the system sheet lists them. */
export const READ_TYPES = [HK.workout, HK.activeEnergy, HK.walkingRunningDistance, HK.cyclingDistance, HK.steps] as const;

/**
 * Sleep is asked for apart from READ_TYPES, never added to it: HealthKit
 * answers "already asked" for a list only when every type in it was asked, so
 * a phone that allowed the five above before sleep was read would otherwise
 * look as if it had never been asked at all. The first switch-on asks both
 * lists at once; the sync screen's "Allow" asks this one alone.
 */
export const SLEEP_READ_TYPES = [HK.sleep] as const;

/**
 * The rows added after sleep, each its own list for the same reason, never
 * merged into READ_TYPES or into each other: weigh-ins with body fat (body.ts),
 * resting energy for the day's total burn on Progress (dayEnergy.ts; active
 * energy is already in READ_TYPES), and heart rate inside a workout (heart.ts).
 * Turning sync on asks all five lists in one sheet; each row's "Allow" asks its
 * own list alone.
 */
export const WEIGHT_READ_TYPES = [HK.bodyMass, HK.bodyFat] as const;
export const ENERGY_READ_TYPES = [HK.basalEnergy] as const;
export const HEART_READ_TYPES = [HK.heartRate] as const;

/** Every type the app may ask to read. */
export type HealthKitReadType =
  | (typeof READ_TYPES)[number]
  | (typeof SLEEP_READ_TYPES)[number]
  | (typeof WEIGHT_READ_TYPES)[number]
  | (typeof ENERGY_READ_TYPES)[number]
  | (typeof HEART_READ_TYPES)[number];

/** HKAuthorizationRequestStatus (the library's AuthorizationRequestStatus enum). */
export const REQUEST_STATUS = { unknown: 0, shouldRequest: 1, unnecessary: 2 } as const;

// ---------------------------------------------------------------- the library's shapes

/** `Quantity` (src/types/QuantityType.ts). */
export interface HKQuantity {
  readonly unit: string;
  readonly quantity: number;
}

/**
 * `SourceRevision` (core src/types/Source.ts), the part read here. The iPhone's
 * own sensors and an Apple Watch both write under 'com.apple.health.<device
 * UUID>'; `productType` ('iPhone15,2', 'Watch6,1') says which kind of device.
 */
export interface HKSourceRevision {
  readonly source: { readonly name: string; readonly bundleIdentifier: string };
  readonly productType?: string;
}

/** `Device` (core src/types/Device.ts), the part read here. */
export interface HKDevice {
  readonly name?: string;
  readonly manufacturer?: string;
  readonly model?: string;
}

/** What a workout carries (`WorkoutSample`, src/types/Workouts.ts), the part read here. */
export interface HKWorkoutSample {
  readonly uuid: string;
  readonly startDate: Date;
  readonly endDate: Date;
  /** HKWorkoutActivityType's raw value. */
  readonly workoutActivityType: number;
  /** Active energy, in kcal as the library serialises it. */
  readonly totalEnergyBurned?: HKQuantity;
  /** Metres. */
  readonly totalDistance?: HKQuantity;
  readonly sourceRevision: HKSourceRevision;
  readonly device?: HKDevice;
  /** HKTimeZone, HKIndoorWorkout, HKSwimmingLocationType and the rest. */
  readonly metadata: Readonly<Record<string, unknown>>;
}

/**
 * `QueryStatisticsResponse` (src/types/QuantityType.ts), the part read here. In
 * a statistics collection each one is an interval (a day here), from `startDate`.
 */
export interface HKStatistics {
  readonly sumQuantity?: HKQuantity;
  /** `discreteAverage`, `discreteMax` (heart rate). */
  readonly averageQuantity?: HKQuantity;
  readonly maximumQuantity?: HKQuantity;
  readonly startDate?: Date;
  readonly endDate?: Date;
  /** The apps whose samples went into the figure. */
  readonly sources?: readonly { readonly name?: string; readonly bundleIdentifier: string }[];
}

/** `QuantitySample` (src/types/QuantitySample.ts, BaseSample in core src/types/Shared.ts), the part read here. */
export interface HKQuantitySample {
  readonly quantity: number;
  readonly startDate: Date;
  readonly sourceRevision: HKSourceRevision;
  /** HKTimeZone when the writing app gave one. */
  readonly metadata: Readonly<Record<string, unknown>>;
}

/** `WorkoutProxy` (src/specs/WorkoutProxy.nitro.ts): the sample plus calls on it. */
export interface HKWorkoutProxy extends HKWorkoutSample {
  getStatistic(quantityType: string, unitOverride?: string): Promise<HKStatistics | undefined>;
  /** Frees the native workout at once (README, "Memory considerations"). */
  dispose(): void;
}

/**
 * `CategorySample` (src/types/CategoryType.ts, BaseSample in core
 * src/types/Shared.ts), the part read here. For sleep analysis `value` is
 * CategoryValueSleepAnalysis (src/generated/healthkit.generated.ts): 0 inBed,
 * 1 asleepUnspecified (also the old `asleep`), 2 awake, 3 asleepCore, 4
 * asleepDeep, 5 asleepREM.
 */
export interface HKCategorySample {
  readonly uuid: string;
  readonly startDate: Date;
  readonly endDate: Date;
  readonly value: number;
  readonly sourceRevision: HKSourceRevision;
  readonly device?: HKDevice;
  /** HKTimeZone when the writing app gave one. */
  readonly metadata: Readonly<Record<string, unknown>>;
}

/** `DateFilter` inside `FilterForSamples` (src/types/QueryOptions.ts; core src/types/QueryOptions.ts). */
export interface HKDateFilter {
  readonly filter?: { readonly date?: { readonly startDate?: Date; readonly endDate?: Date; readonly strictStartDate?: boolean; readonly strictEndDate?: boolean } };
}

/** The quantity types read as raw samples (weigh-ins). */
export type HKSampleType = typeof HK.bodyMass | typeof HK.bodyFat;
/** The quantity types read as statistics. */
export type HKStatisticsType = typeof HK.steps | typeof HK.activeEnergy | typeof HK.basalEnergy | typeof HK.heartRate;

/**
 * The calls the iPhone adapter makes, with the library's own names and
 * arguments (src/healthkit.ios.ts exports; CoreModule.nitro.ts,
 * WorkoutsModule.nitro.ts, QuantityTypeModule.nitro.ts). Steps are asked as a
 * statistics collection (HKStatisticsCollectionQuery, one interval per day,
 * `cumulativeSum`): HealthKit then keeps one count where the iPhone and the
 * watch overlap, by the person's own source order, as the Health app does.
 */
export interface HealthKitApi {
  isHealthDataAvailable(): boolean;
  getRequestStatusForAuthorization(toCheck: { toRead: readonly HealthKitReadType[] }): Promise<number>;
  requestAuthorization(toRequest: { toRead: readonly HealthKitReadType[] }): Promise<boolean>;
  /**
   * Sleep-analysis samples (CategoryTypeModule.queryCategorySamples). With the
   * date filter's strict flags left unset, samples that cross the range's
   * edges are included. There is no statistics query for this type.
   */
  queryCategorySamples(identifier: typeof HK.sleep, options: HKDateFilter & { limit: number; ascending?: boolean }): Promise<readonly HKCategorySample[]>;
  queryWorkoutSamples(options: HKDateFilter & { limit: number; ascending?: boolean }): Promise<readonly HKWorkoutProxy[]>;
  queryStatisticsCollectionForQuantity(
    identifier: HKStatisticsType,
    statistics: readonly 'cumulativeSum'[],
    anchorDate: Date,
    intervalComponents: { readonly day?: number },
    options?: HKDateFilter & { unit?: string },
  ): Promise<readonly HKStatistics[]>;
  /** Weight and body-fat samples (QuantityTypeModule.queryQuantitySamples); `limit` 0 is all. */
  queryQuantitySamples(identifier: HKSampleType, options: HKDateFilter & { limit: number; ascending?: boolean; unit?: string }): Promise<readonly HKQuantitySample[]>;
  /** One statistic over a time range (QuantityTypeModule.queryStatisticsForQuantity): a workout's heart rate when it carries none. */
  queryStatisticsForQuantity(identifier: HKStatisticsType, statistics: readonly ('discreteAverage' | 'discreteMax')[], options?: HKDateFilter & { unit?: string }): Promise<HKStatistics>;
}

// ---------------------------------------------------------------- rules

/**
 * What may be read. HealthKit never says whether a read was allowed (a refused
 * type simply returns nothing, so no one can tell that data exists), only
 * whether the question still has to be asked. Once asked, everything counts as
 * readable; a type the person refused comes back empty and the screen says
 * where to allow it.
 */
export function accessFromRequestStatus(
  status: number,
  sleepStatus: number = REQUEST_STATUS.unknown,
  weightStatus: number = REQUEST_STATUS.unknown,
  energyStatus: number = REQUEST_STATUS.unknown,
  heartStatus: number = REQUEST_STATUS.unknown,
): HealthAccess {
  // Each later list has its own question, so READ_TYPES' status says nothing about them.
  const asked = (x: number) => x === REQUEST_STATUS.unnecessary;
  const main = asked(status);
  const rows = {
    sleep: asked(sleepStatus),
    weight: asked(weightStatus),
    bodyFat: asked(weightStatus),
    heartRate: asked(heartStatus),
    // The day's total is active (READ_TYPES) plus resting (ENERGY_READ_TYPES): both lists.
    dayEnergy: asked(energyStatus) && main,
  };
  if (!main) return { ...NO_ACCESS, ...rows };
  return { ...NO_ACCESS, workouts: true, activeEnergy: true, totalEnergy: false, distance: true, steps: true, ...rows };
}

/** The distance statistic a workout's type is measured in, when the workout has no total distance. */
export function distanceTypeFor(activityType: number): string | null {
  if (activityType === HK_TYPE.cycling) return HK.cyclingDistance;
  if (activityType === HK_TYPE.swimming) return null; // Swimming distance is not asked for.
  return HK.walkingRunningDistance;
}

/** Offset of an IANA zone ('Europe/Amsterdam') from UTC at an instant, in seconds; null when the zone is unknown. */
export function zoneOffsetSecAt(timeZone: unknown, ms: number): number | null {
  if (typeof timeZone !== 'string' || !timeZone.trim()) return null;
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timeZone.trim(),
      hour12: false,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    }).formatToParts(new Date(ms));
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
    const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'));
    const offset = Math.round((asUtc - Math.floor(ms / 1000) * 1000) / 1000);
    return Number.isFinite(offset) ? offset : null;
  } catch {
    return null;
  }
}

const positive = (q: HKQuantity | undefined | null, scale = 1): number | null =>
  q && typeof q.quantity === 'number' && Number.isFinite(q.quantity) && q.quantity > 0 ? q.quantity * scale : null;

/** Kilocalories from an energy quantity in the units the library can hand back. */
export function kcalOf(q: HKQuantity | undefined | null): number | null {
  if (!q) return null;
  const unit = q.unit.toLowerCase();
  if (unit === 'kcal' || unit === 'cal' || unit === 'kilocalorie' || unit === 'kilocalories' || unit === 'calories') return positive(q);
  if (unit === 'kj') return positive(q, 1 / 4.184);
  if (unit === 'j') return positive(q, 1 / 4184);
  return null;
}

/** Metres from a length quantity in the units the library can hand back. */
export function metresOf(q: HKQuantity | undefined | null): number | null {
  if (!q) return null;
  const unit = q.unit.toLowerCase();
  if (unit === 'm' || unit === 'meter' || unit === 'meters' || unit === 'metre' || unit === 'metres') return positive(q);
  if (unit === 'km') return positive(q, 1000);
  if (unit === 'mi') return positive(q, 1609.344);
  if (unit === 'yd') return positive(q, 0.9144);
  if (unit === 'ft') return positive(q, 0.3048);
  return null;
}

/** 'Apple Watch', 'Garmin Forerunner 265', or null. */
function deviceName(d: HKDevice | undefined): string | null {
  const name = d?.name?.trim() ?? '';
  const maker = d?.manufacturer?.trim() ?? '';
  const model = d?.model?.trim() ?? '';
  // An Apple device's name is the person's own ("Dana's Apple Watch"): the model says what it is.
  if (/^apple/i.test(maker)) return model ? `Apple ${model.replace(/^apple\s*/i, '')}` : 'Apple device';
  if (maker || model) return model.toLowerCase().startsWith(maker.toLowerCase()) ? model || null : `${maker} ${model}`.trim();
  return name || null;
}

/** What identifies a workout before its statistics are read. */
export function workoutRef(w: HKWorkoutSample): Pick<HealthWorkout, 'id' | 'origin' | 'startTime' | 'endTime'> | null {
  const start = w.startDate instanceof Date ? w.startDate.getTime() : Number.NaN;
  const end = w.endDate instanceof Date ? w.endDate.getTime() : Number.NaN;
  const bundle = w.sourceRevision?.source?.bundleIdentifier;
  if (!w.uuid || !bundle || !Number.isFinite(start) || !Number.isFinite(end)) return null;
  return { id: w.uuid, origin: appleOrigin(bundle, w.sourceRevision?.productType), startTime: new Date(start).toISOString(), endTime: new Date(end).toISOString() };
}

/** What was read from a workout's own statistics; null fields: not there, or not read. */
export interface WorkoutStats {
  activeEnergy?: HKStatistics | null;
  distance?: HKStatistics | null;
  /** Heart rate in count/min: the workout's own statistic, else the samples inside its time (averageQuantity, maximumQuantity). */
  heartRate?: HKStatistics | null;
}

/** Beats per minute from a heart-rate quantity asked in 'count/min' (or 'count/s', which the library uses by default). */
export function bpmOf(q: HKQuantity | undefined | null): number | null {
  if (!q || typeof q.quantity !== 'number' || !Number.isFinite(q.quantity) || q.quantity <= 0) return null;
  const unit = q.unit.toLowerCase();
  if (unit === 'count/min') return q.quantity;
  if (unit === 'count/s') return q.quantity * 60;
  return null;
}

/**
 * Heart rate asked over a workout's time from every source (the query cannot
 * filter by source without native objects) is the workout's own only when the
 * answer's sources (the library always asks `separateBySource`) are all the
 * app that recorded the workout, by its raw bundle id. Another source's beats
 * (an Apple Watch, earbuds, a strap app) or no sources at all: null, so the
 * workout carries no heart rate rather than a blend.
 */
export function ownHeartWindow(st: HKStatistics | null | undefined, workoutBundle: string | null | undefined): HKStatistics | null {
  if (!st || !workoutBundle) return null;
  const sources = st.sources ?? [];
  if (sources.length === 0) return null;
  return sources.every((src) => src?.bundleIdentifier === workoutBundle) ? st : null;
}

/** A heart-rate statistic as a workout's two figures (heart.ts), or nothing. */
export function heartFromStatistics(st: HKStatistics | null | undefined): Pick<HealthWorkout, 'avgHeartRate' | 'maxHeartRate'> {
  const hr = heartFigures(bpmOf(st?.averageQuantity), bpmOf(st?.maximumQuantity));
  return hr ? { avgHeartRate: hr.avg, maxHeartRate: hr.max } : {};
}

/**
 * One HealthKit workout as a HealthWorkout. `stats` null: details were not
 * read for it (the sync only asks where the answer can still change something),
 * so energy and distance are left null as the Android adapter does.
 */
export function workoutFromHealthKit(w: HKWorkoutSample, stats: WorkoutStats | null): HealthWorkout | null {
  const ref = workoutRef(w);
  if (!ref) return null;
  const source = w.sourceRevision.source;
  const metadata = w.metadata ?? {};
  return {
    store: 'apple-health',
    ...ref,
    // Apple's own sources and known apps are named by the table (a device's own name, "Dana's Apple Watch", is the person's).
    originName: isAppleOrigin(ref.origin) || isKnownOrigin(ref.origin) ? null : source.name?.trim() || null,
    exerciseType: appleExerciseType(typeof w.workoutActivityType === 'number' ? w.workoutActivityType : HK_TYPE.other, metadata),
    zoneOffsetSec: zoneOffsetSecAt(metadata.HKTimeZone, Date.parse(ref.startTime)),
    title: null,
    activeKcal: stats ? (kcalOf(stats.activeEnergy?.sumQuantity) ?? kcalOf(w.totalEnergyBurned)) : null,
    totalKcal: null,
    distanceM: stats ? (metresOf(w.totalDistance) ?? metresOf(stats.distance?.sumQuantity)) : null,
    device: deviceName(w.device),
    ...(stats ? heartFromStatistics(stats.heartRate) : {}),
  };
}

/**
 * A statistics collection of step counts (one interval per day, anchored at a
 * local midnight) as day totals. The day is the one the middle of the interval
 * falls on, so an interval that starts at a midnight a clock change moved is
 * still its own day. An interval with nothing is left out.
 */
export function stepDaysFromStatistics(stats: readonly HKStatistics[], dayOf: (ms: number) => string): StepDayTotal[] {
  const out: StepDayTotal[] = [];
  for (const st of stats) {
    const start = st?.startDate instanceof Date ? st.startDate.getTime() : Number.NaN;
    if (!Number.isFinite(start)) continue;
    const end = st.endDate instanceof Date ? st.endDate.getTime() : Number.NaN;
    const middle = Number.isFinite(end) && end > start ? (start + end) / 2 : start + 12 * 3_600_000;
    const q = st.sumQuantity;
    if (!q || q.unit.toLowerCase() !== 'count' || typeof q.quantity !== 'number' || !Number.isFinite(q.quantity) || q.quantity <= 0) continue;
    out.push({ day: dayOf(middle), count: Math.round(q.quantity) });
  }
  return out;
}

/**
 * One weight (kg) or body-fat sample (the library's '%' is HKUnit.percent(),
 * a fraction: 0.25 is 25 %, which body.ts turns into percent) as a raw body
 * sample. The app is appleOrigin's; the zone is the sample's HKTimeZone when
 * the writing app gave one. Null when it has no source or no time.
 */
export function bodyFromHealthKit(x: HKQuantitySample, kind: BodySample['kind']): BodySample | null {
  const ms = x?.startDate instanceof Date ? x.startDate.getTime() : Number.NaN;
  const bundle = x?.sourceRevision?.source?.bundleIdentifier;
  if (!bundle || !Number.isFinite(ms) || typeof x.quantity !== 'number' || !Number.isFinite(x.quantity)) return null;
  return {
    store: 'healthKit',
    origin: appleOrigin(bundle, x.sourceRevision?.productType),
    time: new Date(ms).toISOString(),
    zoneOffsetSec: zoneOffsetSecAt(x.metadata?.HKTimeZone, ms),
    kind,
    value: x.quantity,
  };
}

/**
 * The day's calories burned from two statistics collections (active and basal
 * energy, one interval a day, `cumulativeSum` in kcal), named as the steps are
 * (the day the middle of the interval falls on). `kcal` is active plus basal;
 * the apps are each interval's sources, by appleOrigin. A day with neither is left out.
 */
export function dayEnergyFromStatistics(active: readonly HKStatistics[], basal: readonly HKStatistics[], dayOf: (ms: number) => string): DayEnergyDay[] {
  const days = new Map<string, { kcal: number; activeKcal: number; origins: Set<string> }>();
  const add = (stats: readonly HKStatistics[], isActive: boolean) => {
    for (const st of stats) {
      const start = st?.startDate instanceof Date ? st.startDate.getTime() : Number.NaN;
      if (!Number.isFinite(start)) continue;
      const end = st.endDate instanceof Date ? st.endDate.getTime() : Number.NaN;
      const kcal = kcalOf(st.sumQuantity);
      if (kcal === null) continue;
      const day = dayOf(Number.isFinite(end) && end > start ? (start + end) / 2 : start + 12 * 3_600_000);
      const d = days.get(day) ?? { kcal: 0, activeKcal: 0, origins: new Set<string>() };
      d.kcal += kcal;
      if (isActive) d.activeKcal += kcal;
      for (const src of st.sources ?? []) if (src?.bundleIdentifier) d.origins.add(appleOrigin(src.bundleIdentifier));
      days.set(day, d);
    }
  };
  add(active, true);
  add(basal, false);
  return [...days.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, d]) => ({ day, kcal: Math.round(d.kcal), activeKcal: Math.round(d.activeKcal), origins: [...d.origins].sort() }));
}

/** CategoryValueSleepAnalysis as this feature's stages ('light' is Apple's "core"). */
export function sleepStageFromValue(value: unknown): SleepStage {
  switch (value) {
    case 0:
      return 'inBed';
    case 1:
      return 'asleep';
    case 2:
      return 'awake';
    case 3:
      return 'light';
    case 4:
      return 'deep';
    case 5:
      return 'rem';
    default:
      return 'unknown';
  }
}

/**
 * One sleep-analysis sample as a raw sleep sample (sleep.ts makes the night).
 * The app is appleOrigin's: an Apple Watch and the iPhone by their kind, never
 * their UUID or name. The zone is the sample's HKTimeZone at its end, when the
 * writing app gave one. Null when it has no source or no length.
 */
export function sleepFromHealthKit(x: HKCategorySample): SleepSample | null {
  const start = x?.startDate instanceof Date ? x.startDate.getTime() : Number.NaN;
  const end = x?.endDate instanceof Date ? x.endDate.getTime() : Number.NaN;
  const bundle = x?.sourceRevision?.source?.bundleIdentifier;
  if (!bundle || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  const origin = appleOrigin(bundle, x.sourceRevision?.productType);
  return {
    store: 'healthKit',
    origin,
    kind: sleepKindOf(origin),
    start: new Date(start).toISOString(),
    end: new Date(end).toISOString(),
    zoneOffsetSec: zoneOffsetSecAt(x.metadata?.HKTimeZone, end),
    stage: sleepStageFromValue(x.value),
  };
}

/**
 * HealthKit's errors as this feature's. A copy of the app signed without the
 * HealthKit entitlement is refused with "Missing com.apple.developer.healthkit
 * entitlement." (HKError, code 4): that one says what it is, so the screen can
 * say this install cannot read Apple Health instead of "try again".
 */
export function toHealthKitError(e: unknown): HealthError {
  if (e instanceof HealthError) return e;
  const message = e instanceof Error ? e.message : typeof e === 'object' && e !== null && 'message' in e ? String((e as { message: unknown }).message) : String(e ?? '');
  if (/entitlement/i.test(message)) return new HealthError('not-entitled', message);
  if (/not available|unavailable|restricted|protected data|database.*inaccessible/i.test(message)) return new HealthError('unavailable', message || 'Apple Health is not available.');
  if (/authoriz|not determined|denied|permission/i.test(message)) return new HealthError('permission', message || 'Apple Health refused the read.');
  return new HealthError('failed', message || 'Apple Health could not be read.');
}
