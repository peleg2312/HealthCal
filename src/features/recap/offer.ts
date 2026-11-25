/**
 * The gentle one-time line on Progress when a month or a year has ended ("Your October in cups"): one quiet
 * row, never a pop-up and never over logging. Which period it offers is one pure rule, `periodOffer`:
 *
 * - a year from December 26 to January 7 (the year in its last days, then the year just ended), when the phone
 *   holds at least `OFFER_YEAR_MIN_DAYS` days with food logged in it;
 * - else a month in the first `OFFER_MONTH_DAYS` days of the next one, when that month had at least
 *   `OFFER_MONTH_MIN_DAYS` days with food logged;
 * - never a period already dealt with on this device (opened, or put away with the X), never in the month of
 *   the first record (nothing has ended yet), and one line at a time (the year first).
 *
 * What was dealt with is kept on this device under its own key (a per-device convenience, never synced, never
 * a store write), like the diary's save hint. Null until read, so the line never flashes; unreadable storage
 * means show. In an automated browser or a test build it shows only when the page sets
 * `window.__healthcalPeriodOffer = true` before loading (a state's `flags`), so no scripted run meets it unasked.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

import { shiftMonth } from '@/features/progress/consistency';
import type { ISODate } from '@/types';

import { loggedBetween, monthKeyOf, monthPeriod, yearKeyOf, yearPeriod, type Period } from './period';

export const OFFER_KEY = 'healthcal.periodRecapDealt';
/** The first days of a month that offer the month before. */
export const OFFER_MONTH_DAYS = 7;
export const OFFER_MONTH_MIN_DAYS = 5;
export const OFFER_YEAR_MIN_DAYS = 14;
/** December from this day offers the year in its last days; January up to the 7th offers the year just ended. */
export const OFFER_YEAR_FROM = '12-26';
export const OFFER_YEAR_UNTIL = '01-07';
/** How many dealt periods are kept: far more than can be offered at once. */
const KEEP = 8;

declare global {
  interface Window {
    /** Tests: true lets Progress offer a month or a year in cups in an automated browser or a test build. */
    __healthcalPeriodOffer?: boolean;
  }
}

/** The period to offer on `today`, or null. `dealt` holds the periods' keys dealt with on this device (null: unread). */
export function periodOffer(today: ISODate, loggedDates: ReadonlySet<ISODate>, firstDate: ISODate | null, dealt: readonly string[] | null): Period | null {
  if (dealt === null || !firstDate || firstDate > today) return null;
  const md = today.slice(5);
  const yearKey = md >= OFFER_YEAR_FROM ? yearKeyOf(today) : md <= OFFER_YEAR_UNTIL ? String(Number(yearKeyOf(today)) - 1) : null;
  if (yearKey && !dealt.includes(yearKey)) {
    const y = yearPeriod(yearKey);
    if (loggedBetween(loggedDates, y.start, y.end < today ? y.end : today) >= OFFER_YEAR_MIN_DAYS) return y;
  }
  if (Number(today.slice(8)) > OFFER_MONTH_DAYS) return null;
  const monthKey = shiftMonth(monthKeyOf(today), -1);
  if (dealt.includes(monthKey) || monthKeyOf(firstDate) > monthKey) return null;
  const m = monthPeriod(monthKey);
  return loggedBetween(loggedDates, m.start, m.end) >= OFFER_MONTH_MIN_DAYS ? m : null;
}

/** The stored list read back: only period keys, newest kept last. Anything else is an empty list. */
export function parseDealt(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((k): k is string => typeof k === 'string' && /^\d{4}(-\d{2})?$/.test(k)).slice(-KEEP) : [];
  } catch {
    return [];
  }
}

/** The list with `key` added once, the oldest dropped past `KEEP`. */
export function withDealt(list: readonly string[], key: string): string[] {
  return [...list.filter((k) => k !== key), key].slice(-KEEP);
}

function automated(): boolean {
  const driven = Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.webdriver === true;
  // Written out in full: Expo inlines EXPO_PUBLIC_ values only where they appear literally.
  return driven || process.env.EXPO_PUBLIC_E2E === '1';
}

/** Whether the line may show here at all (the test-hook gate). Never throws. */
export function offerAllowed(): boolean {
  try {
    if (!automated()) return true;
    return typeof window !== 'undefined' && window.__healthcalPeriodOffer === true;
  } catch {
    return false;
  }
}

let dealt: string[] | null = null;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function load(): Promise<void> {
  if (!loading) {
    loading = (async () => {
      let stored: string[] = [];
      try {
        stored = parseDealt(await AsyncStorage.getItem(OFFER_KEY));
      } catch {
        // Unreadable: offer as if nothing was dealt with.
      }
      // A period opened while the read was in flight is newer than what was stored.
      dealt = dealt === null ? stored : [...stored.filter((k) => !dealt!.includes(k)), ...dealt].slice(-KEEP);
      emit();
    })();
  }
  return loading;
}

function save(next: string[]) {
  dealt = next;
  emit();
  try {
    AsyncStorage.setItem(OFFER_KEY, JSON.stringify(next)).catch((e: unknown) => {
      if (typeof __DEV__ !== 'undefined' && __DEV__) console.warn('[period offer] could not keep the answer', e);
    });
  } catch {
    // Storage is not there (a private window): it may be offered again next time, which is harmless.
  }
}

/** The period was opened or put away: never offer it again on this device. */
export function markPeriodDealt(key: string): void {
  save(withDealt(dealt ?? [], key));
}

/** Undo of the X: offer it again. */
export function unmarkPeriodDealt(key: string): void {
  save((dealt ?? []).filter((k) => k !== key));
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** The keys dealt with on this device, null until read. */
export function useDealtPeriods(): readonly string[] | null {
  const value = useSyncExternalStore(subscribe, () => dealt, () => dealt);
  useEffect(() => {
    void load();
  }, []);
  return value;
}
