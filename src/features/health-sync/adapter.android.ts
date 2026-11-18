/**
 * Android: workouts from Health Connect, through react-native-health-connect.
 *
 * Only this file loads the native module (Metro picks it by its .android
 * extension; iOS and web get the files beside it). It makes the calls and
 * nothing else: every rule about what the answers mean is in the pure modules.
 *
 * Read only, nine record types (exercise, active and total calories, distance,
 * steps, sleep, weight, body fat, heart rate), no background reads and no
 * history beyond Health Connect's default 30 days before the first permission
 * (app.json must list the same nine).
 * None of this can run outside an Android build; see docs/health-sync.md for
 * what still has to be checked on a phone.
 */
import { Linking } from 'react-native';
import { aggregateGroupByPeriod, aggregateRecord, getGrantedPermissions, getSdkStatus, initialize, openHealthConnectSettings, readRecords, requestPermission } from 'react-native-health-connect';

import {
  accessFrom,
  availabilityFrom,
  bodyFatFromRecord,
  dayEnergyFromPeriods,
  permissionsFor,
  sessionRef,
  sessionToWorkout,
  sleepFromSession,
  stepDaysFromPeriods,
  toHealthError,
  weighInFromRecord,
  type SessionDetails,
  type SessionRecord,
  type SleepSessionRaw,
} from './healthConnect';
import {
  HealthError,
  type AccessRequest,
  type BodySample,
  type DayEnergyDay,
  type HealthAccess,
  type HealthAdapter,
  type HealthAvailability,
  type HealthWorkout,
  type ReadOptions,
  type SleepSample,
  type StepDayTotal,
  type StepsRange,
} from './types';

const PROVIDER = 'com.google.android.apps.healthdata';
/** Sessions per page, and a ceiling on pages so a misbehaving token cannot loop for ever. */
const PAGE_SIZE = 500;
const MAX_PAGES = 20;

let client: Promise<void> | null = null;

/** The client has to be created once before any other call. A failed start is tried again next time. */
function ready(): Promise<void> {
  if (!client) {
    const starting = initialize().then((ok) => {
      if (!ok) throw new HealthError('unavailable', 'Health Connect could not be started.');
    });
    starting.catch(() => {
      if (client === starting) client = null;
    });
    client = starting;
  }
  return client;
}

async function availability(): Promise<HealthAvailability> {
  try {
    return availabilityFrom(await getSdkStatus());
  } catch (e) {
    throw toHealthError(e);
  }
}

async function access(): Promise<HealthAccess> {
  try {
    await ready();
    return accessFrom(await getGrantedPermissions());
  } catch (e) {
    throw toHealthError(e);
  }
}

async function requestAccess(what: AccessRequest = 'all'): Promise<HealthAccess> {
  try {
    await ready();
    await requestPermission(permissionsFor(what));
    // Ask again what is granted: the sheet's own answer only lists what was requested this time.
    return accessFrom(await getGrantedPermissions());
  } catch (e) {
    throw toHealthError(e);
  }
}

async function details(ref: Pick<HealthWorkout, 'origin' | 'startTime' | 'endTime'>, allowed: HealthAccess): Promise<SessionDetails> {
  // Only this session's own interval, and only what its own app wrote.
  const scope = {
    timeRangeFilter: { operator: 'between' as const, startTime: ref.startTime, endTime: ref.endTime },
    dataOriginFilter: [ref.origin],
  };
  const [active, total, distance, heart] = await Promise.all([
    allowed.activeEnergy ? aggregateRecord({ recordType: 'ActiveCaloriesBurned', ...scope }) : null,
    allowed.totalEnergy ? aggregateRecord({ recordType: 'TotalCaloriesBurned', ...scope }) : null,
    allowed.distance ? aggregateRecord({ recordType: 'Distance', ...scope }) : null,
    // Heart rate is extra: a refused or failed question leaves the workout without it, never without the workout.
    allowed.heartRate ? aggregateRecord({ recordType: 'HeartRate', ...scope }).catch(() => null) : null,
  ]);
  return { active, total, distance, heart };
}

async function readWorkouts(range: { from: string; to: string }, allowed: HealthAccess, options?: ReadOptions): Promise<HealthWorkout[]> {
  try {
    await ready();
    const sessions: SessionRecord[] = [];
    let pageToken: string | undefined;
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const result = await readRecords('ExerciseSession', {
        timeRangeFilter: { operator: 'between', startTime: range.from, endTime: range.to },
        ascendingOrder: true,
        pageSize: PAGE_SIZE,
        ...(pageToken ? { pageToken } : null),
      });
      sessions.push(...result.records);
      if (!result.pageToken || result.records.length === 0) break;
      pageToken = result.pageToken;
    }

    const out: HealthWorkout[] = [];
    // One session at a time: Health Connect limits how fast an app may ask.
    for (const session of sessions) {
      const ref = sessionRef(session);
      if (!ref) continue;
      const wanted = Date.parse(ref.endTime) > Date.parse(ref.startTime) && (options?.needsDetail ? options.needsDetail(ref) : true);
      const workout = sessionToWorkout(session, wanted ? await details(ref, allowed) : null);
      if (workout) out.push(workout);
    }
    return out;
  } catch (e) {
    throw toHealthError(e);
  }
}

/**
 * Steps per day, totalled by Health Connect itself: one count where apps
 * overlap, by its own data-source priority, so the figure matches what Health
 * Connect reports for the day. The library turns the two instants into local
 * date-times in the phone's zone, which is how the days are cut.
 */
async function readStepDays(range: StepsRange, allowed: HealthAccess): Promise<StepDayTotal[]> {
  if (!allowed.steps) return [];
  try {
    await ready();
    const groups = await aggregateGroupByPeriod({
      recordType: 'Steps',
      timeRangeFilter: { operator: 'between', startTime: range.from, endTime: range.to },
      timeRangeSlicer: { period: 'DAYS', length: 1 },
    });
    return stepDaysFromPeriods(groups);
  } catch (e) {
    throw toHealthError(e);
  }
}

function openSettings(): void {
  try {
    openHealthConnectSettings();
  } catch {
    // Nothing to open on this phone; the screen's own text already says where to look.
  }
}

function openInstall(): void {
  // Google's documented link: the Play Store page, continuing into Health Connect's setup.
  Linking.openURL(`market://details?id=${PROVIDER}&url=healthconnect%3A%2F%2Fonboarding`).catch(() =>
    Linking.openURL(`https://play.google.com/store/apps/details?id=${PROVIDER}`).catch(() => {}),
  );
}

/**
 * Every sleep session overlapping the range, from every app, paged like the
 * workouts, as raw stage samples (healthConnect.ts, sleepFromSession). Never
 * the SLEEP_DURATION_TOTAL aggregate: it is the session's length, time awake
 * included. Empty when sleep may not be read.
 */
async function readSleep(range: { from: string; to: string }, allowed: HealthAccess): Promise<SleepSample[]> {
  if (!allowed.sleep) return [];
  try {
    await ready();
    const out: SleepSample[] = [];
    let pageToken: string | undefined;
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const result = await readRecords('SleepSession', {
        timeRangeFilter: { operator: 'between', startTime: range.from, endTime: range.to },
        ascendingOrder: true,
        pageSize: PAGE_SIZE,
        ...(pageToken ? { pageToken } : null),
      });
      for (const session of result.records) out.push(...sleepFromSession(session as SleepSessionRaw));
      if (!result.pageToken || result.records.length === 0) break;
      pageToken = result.pageToken;
    }
    return out;
  } catch (e) {
    throw toHealthError(e);
  }
}

/** Every record of one instantaneous type in the range, paged like the sessions. */
async function readAll<T extends 'Weight' | 'BodyFat'>(recordType: T, range: { from: string; to: string }) {
  const out = [];
  let pageToken: string | undefined;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const result = await readRecords(recordType, {
      timeRangeFilter: { operator: 'between', startTime: range.from, endTime: range.to },
      ascendingOrder: true,
      pageSize: PAGE_SIZE,
      ...(pageToken ? { pageToken } : null),
    });
    out.push(...result.records);
    if (!result.pageToken || result.records.length === 0) break;
    pageToken = result.pageToken;
  }
  return out;
}

/**
 * Every weight reading in the range, from every app, and the body-fat readings
 * beside them when body fat may be read, as raw samples (body.ts chooses the
 * one weigh-in a day). Empty when weight may not be read; a failed body-fat
 * read leaves the weights without it.
 */
async function readWeighIns(range: { from: string; to: string }, allowed: HealthAccess): Promise<BodySample[]> {
  if (!allowed.weight) return [];
  try {
    await ready();
    const out: BodySample[] = [];
    for (const r of await readAll('Weight', range)) {
      const s = weighInFromRecord(r);
      if (s) out.push(s);
    }
    if (allowed.bodyFat) {
      // Body fat is the optional part: a failed read keeps the weights, and a
      // late body fat is filled in on a later run (body.ts, rule f(ii)).
      try {
        const fat: BodySample[] = [];
        for (const r of await readAll('BodyFat', range)) {
          const s = bodyFatFromRecord(r);
          if (s) fat.push(s);
        }
        out.push(...fat);
      } catch {
        // Weights alone.
      }
    }
    return out;
  } catch (e) {
    throw toHealthError(e);
  }
}

/**
 * The calories burned on each local day, as Health Connect totals them (one
 * count where apps overlap): total and active energy, sliced by calendar day in
 * the phone's zone like the steps. Shown on Progress only (dayEnergy.ts).
 */
async function readDayEnergy(range: StepsRange, allowed: HealthAccess): Promise<DayEnergyDay[]> {
  if (!allowed.dayEnergy) return [];
  try {
    await ready();
    const scope = {
      timeRangeFilter: { operator: 'between' as const, startTime: range.from, endTime: range.to },
      timeRangeSlicer: { period: 'DAYS' as const, length: 1 },
    };
    const total = await aggregateGroupByPeriod({ recordType: 'TotalCaloriesBurned', ...scope });
    const active = await aggregateGroupByPeriod({ recordType: 'ActiveCaloriesBurned', ...scope });
    return dayEnergyFromPeriods(total, active);
  } catch (e) {
    throw toHealthError(e);
  }
}

export const adapter: HealthAdapter = {
  store: 'health-connect',
  availability,
  access,
  requestAccess,
  readWorkouts,
  readStepDays,
  readSleep,
  readWeighIns,
  readDayEnergy,
  openSettings,
  openInstall,
};
