/**
 * The app a synced workout came from.
 *
 * Health Connect names an origin only by its package name, so the display name
 * comes from this table; an app that is not listed is shown by the readable
 * part of its package name. Only Garmin Connect's ids were checked against the
 * stores (docs/health-sync.md); the rest are the well-known package names and
 * only decide a label, never a rule.
 *
 * A saved workout keeps its origin in `externalId`, the session's identity in
 * the app it came from:
 *   - Garmin Connect: 'garmin:<start>', exactly what the file import writes for
 *     the same workout, so a FIT file and Health Connect find each other.
 *   - any other app: 'health:<package>:<start>'.
 */
import { garminExternalId } from '@/features/import/convert';
import type { ActivityEntry } from '@/types';

/** Garmin Connect on Android (Health Connect data origin) and on iOS (HealthKit source bundle id). */
export const GARMIN_ORIGINS: readonly string[] = ['com.garmin.android.apps.connectmobile', 'com.garmin.connect.mobile'];

export const isGarminOrigin = (origin: string): boolean => GARMIN_ORIGINS.includes(origin);

const GARMIN_NAME = 'Garmin Connect';

const KNOWN: Record<string, string> = {
  'com.garmin.android.apps.connectmobile': GARMIN_NAME,
  'com.garmin.connect.mobile': GARMIN_NAME,
  'com.sec.android.app.shealth': 'Samsung Health',
  'com.samsung.android.wear.shealth': 'Samsung Health',
  'com.google.android.apps.fitness': 'Google Fit',
  'com.fitbit.FitbitMobile': 'Fitbit',
  'com.strava': 'Strava',
  'fi.polar.polarflow': 'Polar Flow',
  'com.stt.android.suunto': 'Suunto',
  'com.yf.smart.coros.dist': 'COROS',
  'com.wahoofitness.fitness': 'Wahoo',
  'com.huami.watch.hmwatchmanager': 'Zepp',
  'com.huawei.health': 'Huawei Health',
  'com.ouraring.oura': 'Oura',
  'com.whoop.android': 'WHOOP',
  'com.withings.wiscale2': 'Withings',
  'com.onepeloton.callisto': 'Peloton',
  'com.nike.plusgps': 'Nike Run Club',
  'com.runtastic.android': 'adidas Running',
  'com.mapmyrun.android2': 'MapMyRun',
  'de.komoot.android': 'Komoot',
  'com.google.android.apps.healthdata': 'Health Connect',
};

/** Package name parts that say nothing about which app it is. */
const GENERIC = new Set(['com', 'org', 'net', 'io', 'co', 'de', 'fi', 'uk', 'us', 'app', 'apps', 'android', 'ios', 'mobile', 'google', 'wear', 'wearable', 'client', 'main', 'prod', 'release', 'free', 'lite']);

/** Last parts that name a kind of app rather than the app ('com.mi.health'): the part before them is kept too. */
const KIND = new Set(['health', 'fitness', 'sport', 'sports', 'run', 'running', 'tracker', 'workout', 'training']);

/** 'com.example.trailTracker' -> 'Trail Tracker', 'com.mi.health' -> 'Mi Health'; null when nothing readable is left. */
function fromPackage(origin: string): string | null {
  const parts = origin.split('.').filter((p) => p && !GENERIC.has(p.toLowerCase()) && !/^\d+$/.test(p));
  const last = parts[parts.length - 1];
  if (!last) return null;
  const named = KIND.has(last.toLowerCase()) && parts.length > 1 ? `${parts[parts.length - 2]} ${last}` : last;
  const words = named
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return null;
  return words.map((w) => (w.length <= 3 && w === w.toUpperCase() ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(' ');
}

/** The name to show for an origin: the platform's own when given, else the table, else the package's readable part. */
export function originName(origin: string, given?: string | null): string {
  const own = given?.trim();
  if (own) return own;
  return KNOWN[origin] ?? fromPackage(origin) ?? 'another app';
}

/** The identity a synced workout is saved with (see the file comment). `startUtc` is whole seconds, 'Z'. */
export function healthExternalId(origin: string, startUtc: string): string {
  return isGarminOrigin(origin) ? garminExternalId({ startUtc }) : `health:${origin}:${startUtc}`;
}

/**
 * The app a saved workout was synced from, for "From Garmin Connect". Null for
 * anything that did not come from the phone's health store.
 */
export function syncedFrom(entry: Pick<ActivityEntry, 'source' | 'externalId'>): string | null {
  if (entry.source !== 'health') return null;
  const ext = entry.externalId ?? '';
  if (ext.startsWith('garmin:')) return GARMIN_NAME;
  const m = /^health:([^:]+):/.exec(ext);
  return m ? originName(m[1]) : 'your health app';
}
