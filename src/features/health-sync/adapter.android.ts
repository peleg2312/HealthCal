/**
 * Android: workouts from Health Connect, through react-native-health-connect.
 *
 * Only this file loads the native module (Metro picks it by its .android
 * extension; iOS and web get the files beside it). It makes the calls and
 * nothing else: every rule about what the answers mean is in the pure modules.
 *
 * Read only, four record types, no background reads and no history beyond
 * Health Connect's default 30 days (app.json lists the same four permissions).
 * None of this can run outside an Android build; see docs/health-sync.md for
 * what still has to be checked on a phone.
 */
import { Linking } from 'react-native';
import { aggregateRecord, getGrantedPermissions, getSdkStatus, initialize, openHealthConnectSettings, readRecords, requestPermission } from 'react-native-health-connect';

import { accessFrom, availabilityFrom, READ_PERMISSIONS, sessionRef, sessionToWorkout, toHealthError, type SessionDetails, type SessionRecord } from './healthConnect';
import { HealthError, type HealthAccess, type HealthAdapter, type HealthAvailability, type HealthWorkout, type ReadOptions } from './types';

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

async function requestAccess(): Promise<HealthAccess> {
  try {
    await ready();
    await requestPermission(READ_PERMISSIONS);
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
  const [active, total, distance] = await Promise.all([
    allowed.activeEnergy ? aggregateRecord({ recordType: 'ActiveCaloriesBurned', ...scope }) : null,
    allowed.totalEnergy ? aggregateRecord({ recordType: 'TotalCaloriesBurned', ...scope }) : null,
    allowed.distance ? aggregateRecord({ recordType: 'Distance', ...scope }) : null,
  ]);
  return { active, total, distance };
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

export const adapter: HealthAdapter = { store: 'health-connect', availability, access, requestAccess, readWorkouts, openSettings, openInstall };
