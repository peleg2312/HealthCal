/**
 * This phone's own memory of automatic sync (state.ts): the switch, when it
 * last ran, what waits in "Needs a look" and which workouts were already dealt
 * with. Kept in on-device storage under its own key, outside the synced store:
 * a second phone has its own permission, its own switch and its own memory.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { INITIAL_STATE, restoreState, type HealthSyncState } from './state';

/** Not under 'healthcal/': those keys are the synced store's own (persistence.ts). */
export const STORAGE_KEY = 'healthcal-health-sync';

interface Live {
  /** A sync is running now. Never saved. */
  busy: boolean;
}

const KEYS = Object.keys(INITIAL_STATE) as (keyof HealthSyncState)[];

/** Only the remembered part, without `busy`. */
export function remembered(s: HealthSyncState & Partial<Live>): HealthSyncState {
  return Object.fromEntries(KEYS.map((k) => [k, s[k]])) as unknown as HealthSyncState;
}

export const useHealthSync = create<HealthSyncState & Live>()(
  persist((): HealthSyncState & Live => ({ ...INITIAL_STATE, busy: false }), {
    name: STORAGE_KEY,
    version: 1,
    storage: createJSONStorage(() => AsyncStorage),
    partialize: (s) => remembered(s),
    merge: (saved, current) => ({ ...current, ...restoreState(saved) }),
  }),
);

/** Resolves once the saved state has been read from the device (at once if it already was). */
export function whenLoaded(): Promise<void> {
  if (useHealthSync.persist.hasHydrated()) return Promise.resolve();
  return new Promise((resolve) => {
    const stop = useHealthSync.persist.onFinishHydration(() => {
      stop();
      resolve();
    });
  });
}

/** Forget everything, switch included (the phone's data was erased). */
export function resetHealthSync(): void {
  useHealthSync.setState({ ...INITIAL_STATE, busy: false });
}
