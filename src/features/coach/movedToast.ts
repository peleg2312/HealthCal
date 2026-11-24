/**
 * The one-time word on where the coach went. The coach moved from Train to the first cup of every
 * tab header; someone who used the app before this version is told so once, by one toast, on their
 * first arrival on a tab: "The coach is now at the top of every tab."
 *
 * - Once per device, kept under its own key (`COACH_MOVED_KEY`), never in the store (not a
 *   settings write, so it cannot race a sync and the updater never sees it as something written).
 * - Only for a person whose setup was done before this run started (`launch.onboarded`): someone
 *   setting up now never knew the old place.
 * - Never over a sheet (`sheetOnScreen()`), and only while the tab is still in front after a short
 *   settle; when either fails it is left for the next arrival, not marked as said.
 * - Never in an automated browser or a test build unless the test asks, with
 *   `window.__healthcalCoachMoved = true` before the app loads (the morning page's gate).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { Platform } from 'react-native';

import { launch } from '@/features/morning/launch';
import { sheetOnScreen, toast } from '@/ui';

declare global {
  interface Window {
    /** Tests: true lets the one-time "the coach moved" toast show in an automated browser or a test build. */
    __healthcalCoachMoved?: boolean;
  }
}

export const COACH_MOVED_KEY = 'healthcal.coachMovedSaid';
export const COACH_MOVED_TEXT = 'The coach is now at the top of every tab.';
/** How long a tab is in front before the toast is said (after the morning page's 900 ms look). */
export const COACH_MOVED_DELAY_MS = 1600;

function automated(): boolean {
  const driven = Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.webdriver === true;
  // Written out in full: Expo inlines EXPO_PUBLIC_ values only where they appear literally.
  return driven || process.env.EXPO_PUBLIC_E2E === '1';
}

/** Whether the toast may be said here at all. Never throws. */
export function coachMovedAllowed(): boolean {
  try {
    if (!automated()) return true;
    return typeof window !== 'undefined' && window.__healthcalCoachMoved === true;
  } catch {
    return false;
  }
}

/** The pure rule: say it only to someone set up before this run, never twice, never over a sheet. */
export function shouldSayCoachMoved(input: { allowed: boolean; onboardedAtLaunch: boolean | null; said: boolean; sheetOpen: boolean }): boolean {
  return input.allowed && input.onboardedAtLaunch === true && !input.said && !input.sheetOpen;
}

let said: boolean | null = null;
let reading: Promise<boolean> | null = null;

function loadSaid(): Promise<boolean> {
  if (said !== null) return Promise.resolve(said);
  if (!reading) {
    reading = AsyncStorage.getItem(COACH_MOVED_KEY)
      .then((v) => v === '1')
      // Unreadable: treat as said, so a broken storage never repeats it on every start.
      .catch(() => true)
      .then((v) => {
        if (said === null) said = v;
        return said;
      });
  }
  return reading;
}

function markSaid(): void {
  said = true;
  AsyncStorage.setItem(COACH_MOVED_KEY, '1').catch((e: unknown) => {
    if (typeof __DEV__ !== 'undefined' && __DEV__) console.warn('[coach] could not keep the moved notice', e);
  });
}

/** Rendered by the tab header: on each arrival on a tab, says the coach moved, once per device. */
export function useCoachMovedToast(): void {
  useFocusEffect(
    useCallback(() => {
      if (said === true || !coachMovedAllowed()) return undefined;
      let live = true;
      const timer = setTimeout(() => {
        loadSaid().then((done) => {
          if (!live) return;
          if (!shouldSayCoachMoved({ allowed: true, onboardedAtLaunch: launch.onboarded, said: done || said === true, sheetOpen: sheetOnScreen() })) return;
          markSaid();
          toast(COACH_MOVED_TEXT);
        });
      }, COACH_MOVED_DELAY_MS);
      return () => {
        live = false;
        clearTimeout(timer);
      };
    }, []),
  );
}
