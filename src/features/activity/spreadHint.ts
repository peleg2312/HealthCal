/**
 * The one-line hint that tells someone on "Same day" that workouts can raise the budget over 7 days
 * instead (Goals > How the budget works). It shows where workouts arrive: the activity log, the
 * import's done view and the Workout sync screen, only while the profile's current rule is 'day'.
 *
 * Whether it was dealt with is kept on this device under its own key (a per-device convenience,
 * never synced, never a store write): a tap on the hint, or one Goals save with the spread control
 * on screen. Beside it, how many visits have shown it (`SPREAD_HINT_SHOWN_KEY`): it shows on at most
 * three in all, then never again (./spreadHintRule). Unreadable or missing storage means "show".
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useId, useSyncExternalStore } from 'react';

import { exerciseRuleOf } from '@/lib/exerciseBudget';
import { useProfile } from '@/store/selectors';

import { parseShownCount, spreadHintCounts, spreadHintVisible } from './spreadHintRule';

export const SPREAD_HINT_KEY = 'healthcal.spreadHintDone';
/** How many visits of a screen have shown the hint on this device. */
export const SPREAD_HINT_SHOWN_KEY = 'healthcal.spreadHintShown';

export const SPREAD_HINT_TEXT = 'Workouts can raise your budget over 7 days instead. Choose in Goals.';

/** null until read: nothing is drawn before the stored answer is known, so the hint never flashes. */
let done: boolean | null = null;
/** Visits that showed it; null until read. */
let shown: number | null = null;
/** The visits (one per mounted hint, by `useId`) that have counted their showing: each counts once. */
let countedVisits: ReadonlySet<string> = new Set();
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function load(): Promise<void> {
  if (!loading) {
    loading = (async () => {
      let stored = false;
      let count = 0;
      try {
        stored = (await AsyncStorage.getItem(SPREAD_HINT_KEY)) === '1';
        count = parseShownCount(await AsyncStorage.getItem(SPREAD_HINT_SHOWN_KEY));
      } catch {
        // Unreadable: show the hint.
      }
      // A tap while the read was in flight is newer than what was stored.
      if (done === null) done = stored;
      if (shown === null) shown = count;
      emit();
    })();
  }
  return loading;
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** The hint was tapped, or Goals was saved with the choice on screen: never show it again on this device. */
export function markSpreadHintDone(): void {
  done = true;
  emit();
  try {
    AsyncStorage.setItem(SPREAD_HINT_KEY, '1').catch((e: unknown) => {
      if (typeof __DEV__ !== 'undefined' && __DEV__) console.warn('[spread hint] could not keep the answer', e);
    });
  } catch {
    // Storage is not there (a private window): it shows again next time, which is harmless.
  }
}

/** One more visit showed the hint: counted in memory at once and kept on this device. */
function noteShown(visit: string): void {
  if (countedVisits.has(visit)) return;
  countedVisits = new Set([...countedVisits, visit]);
  shown = (shown ?? 0) + 1;
  emit();
  try {
    AsyncStorage.setItem(SPREAD_HINT_SHOWN_KEY, String(shown)).catch((e: unknown) => {
      if (typeof __DEV__ !== 'undefined' && __DEV__) console.warn('[spread hint] could not keep the count', e);
    });
  } catch {
    // Storage is not there: the count lives for this run only, which is harmless.
  }
}

/**
 * Whether to show the hint now: the profile's current rule is 'day', it was not dealt with on this device, and
 * fewer than three earlier visits showed it. A visit that shows it counts once and keeps it until it is left.
 */
export function useSpreadHint(): boolean {
  const profile = useProfile();
  const isDone = useSyncExternalStore(subscribe, () => done, () => done);
  const count = useSyncExternalStore(subscribe, () => shown, () => shown);
  const visit = useId();
  const counted = useSyncExternalStore(subscribe, () => countedVisits, () => countedVisits);
  const state = { done: isDone, shown: count, sameDay: exerciseRuleOf(profile) === 'day', countedHere: counted.has(visit) };
  const counts = spreadHintCounts(state);
  useEffect(() => {
    void load();
  }, []);
  useEffect(() => {
    if (counts) noteShown(visit);
  }, [counts, visit]);
  return spreadHintVisible(state);
}
