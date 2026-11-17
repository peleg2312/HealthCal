/**
 * The last day the morning page opened by itself on this device, kept on the device under its
 * own key (never in the store, so writing it is not a settings write: it cannot race this
 * morning's sync, and the updater does not see it as something written since the return).
 *
 * The synced `settings.morningSeenDay` carries the same day to the person's other devices, but
 * it is written only once this morning's pull has landed (./useMorningPage); the rule asks for
 * the later of the two (`laterDay` in ./rule).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { ISODate } from '@/types';

export const MORNING_SEEN_KEY = 'healthcal-morning/seen';

/** A stored value that is a real day key, else undefined. */
export function readSeenDay(raw: string | null | undefined): ISODate | undefined {
  return typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? (raw as ISODate) : undefined;
}

let seen: ISODate | undefined;
let loading: Promise<ISODate | undefined> | null = null;

/** The day kept on this device (read from storage once per run; undefined when none or unreadable). */
export function loadSeenDay(): Promise<ISODate | undefined> {
  if (!loading) {
    loading = (async () => {
      try {
        const stored = readSeenDay(await AsyncStorage.getItem(MORNING_SEEN_KEY));
        // A day marked while the read was in flight is newer than what was stored.
        if (seen === undefined) seen = stored;
      } catch {
        // Unreadable: nothing seen. The synced day still counts for someone signed in.
      }
      return seen;
    })();
  }
  return loading.then(() => seen);
}

/** Marks `day` as seen on this device: at once for this run, then on the device (a failed write is only logged). */
export function markSeenDay(day: ISODate): void {
  seen = day;
  AsyncStorage.setItem(MORNING_SEEN_KEY, day).catch((e: unknown) => {
    if (typeof __DEV__ !== 'undefined' && __DEV__) console.warn('[morning] could not keep the seen day', e);
  });
}
