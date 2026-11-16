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
 * binding (docs/health-sync.md, "Finishing the iPhone side") hands the real
 * module to `createHealthKitAdapter`, and the type checker then holds the
 * module to these shapes.
 *
 * Calories: HKWorkout.totalEnergyBurned is "the total active energy burned
 * during the workout" (Apple's documentation; deprecated in iOS 18 for the
 * workout's ActiveEnergyBurned statistic), so it is the *active* figure here.
 * HealthKit holds no workout total with resting included unless the app reads
 * basal energy, which HealthCal does not ask for: an Apple Health workout is
 * priced by the "only active" row of energy.ts (gross = active + the resting
 * rate for those minutes, net = gross minus the resting share), the same rule
 * Health Connect uses when an app writes only active energy.
 */
import { appleExerciseType, HK_TYPE } from './appleHealthTypes';
import { appleOrigin, isAppleOrigin, isKnownOrigin } from './origins';
import { HealthError, NO_ACCESS, type HealthAccess, type HealthWorkout, type StepDayTotal } from './types';

/** HealthKit's identifiers for what is read. Nothing else is ever asked for, and nothing is written. */
export const HK = {
  workout: 'HKWorkoutTypeIdentifier',
  activeEnergy: 'HKQuantityTypeIdentifierActiveEnergyBurned',
  walkingRunningDistance: 'HKQuantityTypeIdentifierDistanceWalkingRunning',
  cyclingDistance: 'HKQuantityTypeIdentifierDistanceCycling',
  steps: 'HKQuantityTypeIdentifierStepCount',
} as const;

/** The five read permissions, in the order the system sheet lists them. */
export const READ_TYPES = [HK.workout, HK.activeEnergy, HK.walkingRunningDistance, HK.cyclingDistance, HK.steps] as const;

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
  readonly startDate?: Date;
  readonly endDate?: Date;
}

/** `WorkoutProxy` (src/specs/WorkoutProxy.nitro.ts): the sample plus calls on it. */
export interface HKWorkoutProxy extends HKWorkoutSample {
  getStatistic(quantityType: string, unitOverride?: string): Promise<HKStatistics | undefined>;
  /** Frees the native workout at once (README, "Memory considerations"). */
  dispose(): void;
}

/** `DateFilter` inside `FilterForSamples` (src/types/QueryOptions.ts). */
export interface HKDateFilter {
  readonly filter?: { readonly date?: { readonly startDate?: Date; readonly endDate?: Date } };
}

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
  getRequestStatusForAuthorization(toCheck: { toRead: typeof READ_TYPES }): Promise<number>;
  requestAuthorization(toRequest: { toRead: typeof READ_TYPES }): Promise<boolean>;
  queryWorkoutSamples(options: HKDateFilter & { limit: number; ascending?: boolean }): Promise<readonly HKWorkoutProxy[]>;
  queryStatisticsCollectionForQuantity(
    identifier: typeof HK.steps,
    statistics: readonly 'cumulativeSum'[],
    anchorDate: Date,
    intervalComponents: { readonly day?: number },
    options?: HKDateFilter & { unit?: string },
  ): Promise<readonly HKStatistics[]>;
}

// ---------------------------------------------------------------- rules

/**
 * What may be read. HealthKit never says whether a read was allowed (a refused
 * type simply returns nothing, so no one can tell that data exists), only
 * whether the question still has to be asked. Once asked, everything counts as
 * readable; a type the person refused comes back empty and the screen says
 * where to allow it.
 */
export function accessFromRequestStatus(status: number): HealthAccess {
  if (status !== REQUEST_STATUS.unnecessary) return NO_ACCESS;
  return { workouts: true, activeEnergy: true, totalEnergy: false, distance: true, steps: true };
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
