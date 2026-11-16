/**
 * Over-the-air updates in the app: started once from the root layout (`startUpdates`), read by
 * About (`useUpdatesStatus`, `checkForUpdatesNow`, `restartToUpdate`). Only a release build on a
 * phone has a port (./platform.native.ts); on web, in a development build and without the native
 * module every function here does nothing and never throws.
 *
 * Where the person lands after an automatic restart: the app's start screen, Today. The restart
 * happens only on a tab, only after five minutes or more away, the same moment Today and the diary
 * go back to today by themselves, so the day shown is today either way; and it is what a cold start
 * shows, which a phone does on its own whenever it closes an app left in the background.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSegments } from 'expo-router';
import { useEffect } from 'react';
import { Appearance, AppState, Platform } from 'react-native';
import { create } from 'zustand';

import { useHealthSync } from '@/features/health-sync/store';
import { today } from '@/lib/dates';
import { useStore } from '@/store';
import { flushPersistence, useHydration } from '@/store/persistence';
import { useSyncState } from '@/services/sync';
import { blossomColors, darkColors, lightColors, resolveThemeName } from '@/theme';
import { sheetOnScreen } from '@/ui';

import { createFakePort, DEMO_PRESETS, type FakeUpdates } from './fake';
import { platformPort } from './platform';
import type { RunningInfo, UpdatesPort } from './port';
import { frontIsTab, phaseAfterRestart, writeMarks, type CheckPhase, type RestartAttempt } from './rules';
import { createUpdater, type Updater } from './updater';

export interface UpdatesStatus {
  /** Updates can run in this build (a release build on a phone, or a demo in a test build). */
  enabled: boolean;
  running: RunningInfo | null;
  /** A downloaded update is waiting for a restart. */
  pending: boolean;
  phase: CheckPhase;
}

export const useUpdatesStatus = create<UpdatesStatus>(() => ({ enabled: false, running: null, pending: false, phase: 'idle' }));

/** The last automatic restart, kept outside the store's own keys. */
const ATTEMPT_KEY = 'healthcal-updates/restart';

let updater: Updater | null = null;
let current: UpdatesPort | null = null;
let stopPort: (() => void) | null = null;
let started = false;

/** The first segment of the screen in front ('(tabs)' on a tab), reported by useReportScreen; null until known. */
let frontSegment: string | null = null;

/**
 * Mounted once in the root layout: tells the updater which screen is in front. A tab counts only
 * when the screen in front is the tab group itself, not merely a stack with one screen (a reset
 * link or a deep link can replace the tabs with a single pushed screen).
 */
export function useReportScreen(): void {
  const first = useSegments()[0] ?? null;
  useEffect(() => {
    frontSegment = first;
  }, [first]);
}

function background(): string {
  const s = useStore.getState();
  const name = resolveThemeName(s.settings.theme, Appearance.getColorScheme(), !s.profile?.onboardedAt);
  return (name === 'dark' ? darkColors : name === 'blossom' ? blossomColors : lightColors).bg;
}

function adopt(port: UpdatesPort): void {
  stopPort?.();
  current = port;
  updater = createUpdater({
    port,
    now: () => Date.now(),
    today,
    // A tab is in front when the screen in front is the tab group and setup is done; unknown is not a tab.
    onTab: () => frontIsTab(frontSegment, !!useStore.getState().profile?.onboardedAt),
    sheetOpen: sheetOnScreen,
    busy: () => useHealthSync.getState().busy || useHealthSync.getState().saving || useSyncState.getState().status === 'syncing',
    revision: () => writeMarks(useStore.getState()),
    flush: async () => {
      await flushPersistence();
      return !useHydration.getState().saveFailed;
    },
    readAttempt: async () => {
      const raw = await AsyncStorage.getItem(ATTEMPT_KEY);
      return raw ? (JSON.parse(raw) as RestartAttempt) : null;
    },
    writeAttempt: (a) => (a ? AsyncStorage.setItem(ATTEMPT_KEY, JSON.stringify(a)) : AsyncStorage.removeItem(ATTEMPT_KEY)),
    background,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    warn: (...args) => console.warn(...args),
  });
  stopPort = port.onChange(sync);
  useUpdatesStatus.setState({ enabled: true, running: port.running, pending: port.pending().pending, phase: 'idle' });
  if (port.running.emergency) {
    console.warn('[updates] an update did not start; running the installed code instead:', port.running.emergencyReason);
  }
}

/** Called once from the root layout when the app is ready. Never throws, never waits. */
export function startUpdates(): void {
  if (started) return;
  started = true;
  try {
    const port = demoPort() ?? platformPort();
    if (!port) return;
    adopt(port);
    if (AppState.currentState !== 'active') updater?.left();
    AppState.addEventListener('change', (s) => {
      if (s !== 'active') {
        updater?.left();
        return;
      }
      void updater?.returned().then((r) => {
        if (r === 'looked') sync();
      });
    });
  } catch (error) {
    console.warn('[updates] could not start', error);
  }
}

const portPending = () => current?.pending().pending ?? false;

/**
 * Brings the store's pending in line with the library: an update that arrives by itself (the
 * launch download, the return to the front) replaces an older check's result, so "Up to date"
 * never shows beside a waiting update.
 */
function sync(): void {
  const pending = portPending();
  useUpdatesStatus.setState((s) => ({ pending, phase: pending && (s.phase === 'current' || s.phase === 'failed') ? 'ready' : s.phase }));
}

/** About's "Check for updates". */
export async function checkForUpdatesNow(): Promise<void> {
  if (!updater) return;
  useUpdatesStatus.setState({ phase: 'checking' });
  const r = await updater.look();
  useUpdatesStatus.setState({ phase: r, pending: r === 'ready' || portPending() });
}

/** About's "Restart to update". */
export async function restartToUpdate(): Promise<void> {
  if (!updater) return;
  const r = await updater.restartNow();
  const pending = portPending();
  useUpdatesStatus.setState({ pending, phase: phaseAfterRestart(r, pending) });
}

/**
 * About opened or closed: a result from an earlier visit is old news, so it is not shown again.
 * A restart that failed stays failed for this run of the app (the updater refuses it again anyway).
 */
export function forgetCheckResult(): void {
  useUpdatesStatus.setState((s) => (s.phase === 'checking' || s.phase === 'restart-failed' ? s : { phase: 'idle' }));
}

/**
 * Browser builds made with the test hooks only: `?updatesDemo=<preset>` in the address (a preset
 * of DEMO_PRESETS in ./fake.ts) shows About as a phone with updates would, and
 * `window.__healthcalUpdates` lets a test swap in its own fake.
 */
function demoPort(): UpdatesPort | null {
  if (!((typeof __DEV__ !== 'undefined' && __DEV__) || process.env.EXPO_PUBLIC_E2E === '1')) return null;
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  (globalThis as { __healthcalUpdates?: unknown }).__healthcalUpdates = {
    state: useUpdatesStatus,
    swapToFake: (o: FakeUpdates) => adopt(createFakePort(o)),
  };
  const preset = /[?&]updatesDemo=([a-z-]+)/.exec(window.location?.search ?? '')?.[1];
  return preset && DEMO_PRESETS[preset] ? createFakePort(DEMO_PRESETS[preset]) : null;
}
