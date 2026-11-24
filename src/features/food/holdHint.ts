/**
 * The one-line hint in search's empty Favourites tab that teaches the long press once: "Press and hold a
 * food to star it", with "Got it". It shows only while Favourites lists nothing and until it is dealt with
 * on this device: "Got it", or a long press that stars a food or a saved meal in search (the person has
 * found it). Kept on the device under its own key (a per-device convenience, like the spread hint: never
 * synced, never a store write, never in the backup); unreadable or missing storage means "show", and
 * nothing is drawn until the stored answer is read, so the hint never flashes.
 *
 * While the hint shows, the empty state under it names the star only (`FAVOURITES_EMPTY_WITH_HINT`), so the
 * long press is said once; once it is dealt with, the empty state says both again (`FAVOURITES_EMPTY`).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useSyncExternalStore } from 'react';

export const HOLD_HINT_KEY = 'healthcal.favHoldHintDone';

export const HOLD_HINT = {
  text: 'Press and hold a food to star it',
  /** Under 360 px, so the tip stays on one line beside "Got it". */
  short: 'Hold a food to star it',
  done: 'Got it',
  doneA11y: 'Got it, hide this tip',
} as const;

/** The empty Favourites tab's message while the hint above it names the long press. */
export const FAVOURITES_EMPTY_WITH_HINT = 'Tap the star on a food or a saved meal to keep it here.';

/** Whether to draw the hint: the stored answer is read (`done` is not null), it is not dealt with, and Favourites lists nothing. */
export function showHoldHint(done: boolean | null, favouritesEmpty: boolean): boolean {
  return done === false && favouritesEmpty;
}

/** null until read. */
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
        stored = (await AsyncStorage.getItem(HOLD_HINT_KEY)) === '1';
      } catch {
        // Unreadable: show the hint.
      }
      // A "Got it" while the read was in flight is newer than what was stored.
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

/** "Got it", or a long press that starred something in search: never show the hint again on this device. */
export function markHoldHintDone(): void {
  if (done === true) return;
  done = true;
  emit();
  try {
    AsyncStorage.setItem(HOLD_HINT_KEY, '1').catch((e: unknown) => {
      if (typeof __DEV__ !== 'undefined' && __DEV__) console.warn('[hold hint] could not keep the answer', e);
    });
  } catch {
    // Storage is not there (a private window): it shows again next time, which is harmless.
  }
}

/** Whether search's empty Favourites tab shows the hint now. */
export function useHoldHint(favouritesEmpty: boolean): boolean {
  const isDone = useSyncExternalStore(subscribe, () => done, () => done);
  useEffect(() => {
    void load();
  }, []);
  return showHoldHint(isDone, favouritesEmpty);
}

/** For tests: forget what was read. */
export function resetHoldHintForTests(): void {
  done = null;
  loading = null;
}
