/** Time helpers shared by the readers. */
import { ImportError } from './types';

/** Seconds between the Unix epoch and the FIT epoch, 1989-12-31T00:00:00Z. */
export const FIT_EPOCH_OFFSET_S = 631065600;
/** FIT date_time values below this are seconds since the device was switched on, not real time. */
export const FIT_MIN_DATE_TIME = 0x10000000;

/** '2024-09-19T11:05:15Z' from epoch milliseconds (rounded to the second). */
export function isoSeconds(ms: number): string {
  return new Date(Math.round(ms / 1000) * 1000).toISOString().replace('.000Z', 'Z');
}

/** Epoch ms of an ISO 8601 date-time with zone. NaN when unreadable or without a zone. */
export function parseIsoInstant(s: string | null | undefined): number {
  if (!s) return Number.NaN;
  const t = s.trim();
  // Require an explicit zone: a bare date-time would be read in the device zone by Date.parse.
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/i.test(t)) return Number.NaN;
  return Date.parse(t);
}

export interface WallTime {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
}

export function validWallTime(w: WallTime): boolean {
  return (
    w.year >= 1990 && w.year <= 2200 && w.month >= 1 && w.month <= 12 && w.day >= 1 && w.day <= 31 &&
    w.hour >= 0 && w.hour <= 23 && w.minute >= 0 && w.minute <= 59 && w.second >= 0 && w.second < 61
  );
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function zoneFormatter(timeZone: string, file: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    try {
      f = new Intl.DateTimeFormat('en-US', {
        timeZone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric',
      });
    } catch {
      throw new ImportError('bad-time-zone', `"${timeZone}" is not a time zone this device knows. Choose another one.`, file);
    }
    formatters.set(timeZone, f);
  }
  return f;
}

/** Offset of `timeZone` from UTC at instant `ms`, in ms (positive east of Greenwich). */
function zoneOffsetMs(ms: number, timeZone: string, file: string): number {
  const parts = zoneFormatter(timeZone, file).formatToParts(new Date(ms));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'));
  return asUtc - Math.floor(ms / 1000) * 1000;
}

export function isDeviceZone(timeZone: string | undefined): boolean {
  return !timeZone || timeZone === 'device';
}

/**
 * Epoch ms of a wall-clock time in a time zone. Without a zone (or 'device')
 * the device's own zone is used. In a daylight-saving gap or overlap the
 * result is the nearest real instant, as the device clock would show it.
 */
export function wallTimeToEpoch(w: WallTime, timeZone: string | undefined, file: string): number {
  if (isDeviceZone(timeZone)) return new Date(w.year, w.month - 1, w.day, w.hour, w.minute, w.second).getTime();
  const naive = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  // Two passes settle the offset, including across a daylight-saving change.
  let guess = naive - zoneOffsetMs(naive, timeZone as string, file);
  guess = naive - zoneOffsetMs(guess, timeZone as string, file);
  return guess;
}

/** Wall time from FIT local_date_time seconds (same epoch as UTC date_time, but local). */
export function fitLocalToWallTime(localSeconds: number): WallTime {
  const d = new Date((localSeconds + FIT_EPOCH_OFFSET_S) * 1000);
  return {
    year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(),
    hour: d.getUTCHours(), minute: d.getUTCMinutes(), second: d.getUTCSeconds(),
  };
}
