/**
 * Automatic workout sync, wired to the real app: the platform's adapter, the
 * store, the toast and the phone's own memory. The rules are in plan.ts, the
 * run itself in engine.ts (with the nights of sleep, sleep.ts, the weigh-ins,
 * body.ts, and the day's calories, dayEnergy.ts); this file only connects them and decides when a
 * sync starts: when the app comes to the foreground and when Train opens
 * (engine.ts keeps that to once every 15 minutes), and on "Sync now".
 */
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { bmr, formulaTdee } from '@/lib/energy';
import { syncNow, useSyncState } from '@/services/sync';
import { useStore } from '@/store';
import { flushPersistence, useHydration } from '@/store/persistence';
import { toast } from '@/ui';

import { adapter as platformAdapter } from './adapter';
import { createHealthSync, PULL_WAIT_MS, roundEndedSince, type SyncOutcome } from './engine';
import { createFakeAdapter, type FakeHealth } from './fake';
import { remembered, resetHealthSync, useHealthSync, whenLoaded } from './store';
import { HealthError, type HealthAccess, type HealthAdapter, type HealthAvailability } from './types';

let active: HealthAdapter = platformAdapter;

/** The adapter in use. Always the platform's own, except in a development or test build that asked for the in-memory one. */
const liveAdapter: HealthAdapter = {
  get store() {
    return active.store;
  },
  availability: () => active.availability(),
  access: () => active.access(),
  requestAccess: (what) => active.requestAccess(what),
  readWorkouts: (range, access, options) => active.readWorkouts(range, access, options),
  readStepDays: (range, access) => active.readStepDays(range, access),
  readSleep: (range, access) => active.readSleep(range, access),
  readWeighIns: (range, access) => active.readWeighIns(range, access),
  readDayEnergy: (range, access) => active.readDayEnergy(range, access),
  openSettings: () => active.openSettings(),
  openInstall: () => active.openInstall(),
};

export const healthAdapter = liveAdapter;

/**
 * Before weigh-ins are planned: nothing to wait for without an account; with one, run a data-sync round and
 * wait for it (at most PULL_WAIT_MS), so a weigh-in deleted on another phone is here before it is planned.
 */
async function afterPull(since: number): Promise<boolean> {
  if (useStore.getState().ownerId === null) return true;
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    const finished = await Promise.race([
      syncNow().then(
        () => true,
        () => false,
      ),
      new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(false), PULL_WAIT_MS);
      }),
    ]);
    const st = useSyncState.getState();
    return finished && roundEndedSince(st.status, st.lastRunAt, since);
  } catch {
    return false;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export const healthSync = createHealthSync({
  adapter: liveAdapter,
  now: () => Date.now(),
  state: {
    get: () => remembered(useHealthSync.getState()),
    set: (patch) => useHealthSync.setState(patch),
  },
  diary: {
    all: () => Object.values(useStore.getState().activities),
    // The same weight and baseline a hand-logged session is priced with (saveActivity), and the
    // resting rate a device's active figure is measured above (energy.ts).
    context: () => {
      const profile = useStore.getState().profile;
      return profile?.onboardedAt ? { weightKg: profile.weightKg, baselineKcalPerDay: formulaTdee(profile), bmrKcalPerDay: bmr(profile).kcal } : null;
    },
    save: (entries) => {
      useStore.getState().upsertMany('activities', entries);
    },
    remove: (id) => useStore.getState().remove('activities', id),
    // The same check the updater makes before a restart: saved now, and the save did not fail.
    // Before the saved data is loaded there is nothing to save to, so nothing is confirmed.
    flush: async () => {
      if (useHydration.getState().status !== 'ready') return false;
      await flushPersistence();
      return !useHydration.getState().saveFailed;
    },
  },
  // Nights of sleep (sleep.ts): ordinary 'sleep' records, one per wake day (upsert derives the id from the date).
  sleep: {
    all: () => Object.values(useStore.getState().sleep),
    save: (nights) => {
      useStore.getState().upsertMany('sleep', nights);
    },
    remove: (id) => useStore.getState().remove('sleep', id),
  },
  // Weigh-ins (body.ts): ordinary synced 'weights' records, one per date. Only the records: never the profile,
  // so a synced weigh-in reaches the targets only by the person's own tap on /weight.
  weights: {
    all: () => Object.values(useStore.getState().weights),
    save: (records) => {
      useStore.getState().upsertMany('weights', records);
    },
    remove: (id) => useStore.getState().remove('weights', id),
  },
  afterPull,
  // The level line of the toast takes the exercise colour for workouts, the sleep colour for nights, the weight colour for weigh-ins alone.
  announce: (message, undo, tint = 'exercise') => toast(message, { label: 'Undo', onPress: undo, tint }),
  onBusy: (busy) => useHealthSync.setState({ busy }),
  // Waiting for what a sync saved to be confirmed on the device: the updater waits for it as for a run (updates.ts).
  onSaving: (saving) => useHealthSync.setState({ saving }),
});

/** A sync that may be skipped: the switch is off, or the last one was under 15 minutes ago. */
export async function autoSync(): Promise<SyncOutcome> {
  await whenLoaded();
  return healthSync.sync('auto');
}

let started = false;

/**
 * Call once at startup. Syncs now and every time the app comes back to the
 * foreground, and forgets everything when the phone's data is erased (sign
 * out, "erase everything"): the memory belongs to the data that was here.
 */
export function startHealthSync(): void {
  if (started) return;
  started = true;
  void autoSync();
  AppState.addEventListener('change', (state) => {
    if (state === 'active') void autoSync();
  });
  useStore.subscribe((state, before) => {
    if (before.profile && !state.profile) resetHealthSync();
  });
}

/** For Train: sync when the tab is opened. */
export function useSyncOnFocus(): void {
  useFocusEffect(
    useCallback(() => {
      void autoSync();
    }, []),
  );
}

export interface HealthStatus {
  /** 'checking' until the health store has answered. */
  availability: HealthAvailability | 'checking';
  /** What may be read now; null until known or where there is no health store. */
  access: HealthAccess | null;
  /** Ask again (after the person comes back from Health Connect or the store). */
  refresh: () => void;
}

/** Whether this phone has a health store and what the app may read, kept fresh when the app returns to the foreground. */
export function useHealthStatus(): HealthStatus {
  const [status, setStatus] = useState<Pick<HealthStatus, 'availability' | 'access'>>({ availability: 'checking', access: null });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let current = true;
    void (async () => {
      let availability: HealthAvailability = 'unsupported';
      let access: HealthAccess | null = null;
      try {
        availability = await liveAdapter.availability();
        if (availability === 'available') access = await liveAdapter.access();
      } catch (e) {
        // The health store did not answer: for now Health Connect counts as not there, and Apple Health
        // (part of iOS) as there, so turning sync on says what went wrong. The next look asks again.
        if (e instanceof HealthError && e.code === 'not-entitled') availability = 'not-entitled';
        else availability = liveAdapter.store === 'apple-health' ? 'available' : liveAdapter.store ? 'not-installed' : 'unsupported';
      }
      if (current) setStatus({ availability, access });
    })();
    return () => {
      current = false;
    };
  }, [tick]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') setTick((t) => t + 1);
    });
    return () => sub.remove();
  }, []);
  return { ...status, refresh: () => setTick((t) => t + 1) };
}

/**
 * Development and browser tests only: swap in the in-memory health store so
 * the sync screen's states can be seen and driven without a phone (`store:
 * 'apple-health'` shows the iPhone's screen, with Apple Health's words).
 * `window.__healthcalHealthDemo = { ...options }` before the app loads does the
 * same from a test's init script. A release build never sets the handle, so
 * nothing can swap the adapter there.
 */
if ((typeof __DEV__ !== 'undefined' && __DEV__) || process.env.EXPO_PUBLIC_E2E === '1') {
  const swapToFake = (options: Partial<Omit<FakeHealth, 'calls'>> = {}): FakeHealth => {
    const fake = createFakeAdapter(options);
    active = fake.adapter;
    return fake.health;
  };
  const g = globalThis as { __healthcalHealthSync?: unknown; __healthcalHealthDemo?: Partial<Omit<FakeHealth, 'calls'>> };
  g.__healthcalHealthSync = { swapToFake, backToPlatform: () => void (active = platformAdapter), state: useHealthSync, sync: healthSync };
  if (g.__healthcalHealthDemo) swapToFake(g.__healthcalHealthDemo);
}
