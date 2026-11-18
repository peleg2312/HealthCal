/**
 * The one-line hint that tells someone on "Same day" that workouts can raise the budget over 7 days
 * instead (Goals > How the budget works). It shows where workouts arrive: the activity log, the
 * import's done view and the Workout sync screen, only while the profile's current rule is 'day'.
 *
 * Whether it was dealt with is kept on this device under its own key (a per-device convenience,
 * never synced, never a store write): a tap on the hint, or one Goals save with the spread control
 * on screen. Unreadable or missing storage means "show".
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useSyncExternalStore } from 'react';

import { exerciseRuleOf } from '@/lib/exerciseBudget';
import { useProfile } from '@/store/selectors';

export const SPREAD_HINT_KEY = 'healthcal.spreadHintDone';

export const SPREAD_HINT_TEXT = 'Workouts can raise your budget over 7 days instead. Choose in Goals.';

/** null until read: nothing is drawn before the stored answer is known, so the hint never flashes. */
let done: boolean | null = null;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function load(): Promise<void> {
  if (!loading) {
    loading = (async () => {
      let stored = false;
      try {
        stored = (await AsyncStorage.getItem(SPREAD_HINT_KEY)) === '1';
      } catch {
        // Unreadable: show the hint.
      }
      // A tap while the read was in flight is newer than what was stored.
      if (done === null) done = stored;
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

/** Whether to show the hint now: the profile's current rule is 'day' and it was not dealt with on this device. */
export function useSpreadHint(): boolean {
  const profile = useProfile();
  const isDone = useSyncExternalStore(subscribe, () => done, () => done);
  useEffect(() => {
    void load();
  }, []);
  return isDone === false && exerciseRuleOf(profile) === 'day';
}
