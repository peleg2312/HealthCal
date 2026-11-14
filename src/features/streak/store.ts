/**
 * Which streak milestones this device has already shown, kept on the device
 * only (not a synced collection): a moment seen on the phone may still show
 * once on the tablet.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

interface StreakMoments {
  /** `milestoneKey`s already shown. */
  shown: string[];
  /** False until the saved list has been read, so nothing is shown twice on a slow start. */
  hydrated: boolean;
  markShown: (key: string) => void;
}

export const useStreakMoments = create<StreakMoments>()(
  persist(
    (set) => ({
      shown: [],
      hydrated: false,
      markShown: (key) => set((s) => (s.shown.includes(key) ? s : { shown: [...s.shown, key].slice(-50) })),
    }),
    {
      name: 'healthcal-streak-moments',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ shown: s.shown }),
      onRehydrateStorage: () => () => useStreakMoments.setState({ hydrated: true }),
    },
  ),
);
