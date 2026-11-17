import AsyncStorage from '@react-native-async-storage/async-storage';
import { beforeEach, describe, expect, it } from 'vitest';

import { useStore } from '@/store';
import type { Settings } from '@/types';

import { loadSeenDay, markSeenDay, MORNING_SEEN_KEY, readSeenDay } from './seen';

describe('readSeenDay', () => {
  it('a day key, else nothing', () => {
    expect(readSeenDay('2026-11-17')).toBe('2026-11-17');
    expect(readSeenDay(null)).toBeUndefined();
    expect(readSeenDay('')).toBeUndefined();
    expect(readSeenDay('yesterday')).toBeUndefined();
    expect(readSeenDay('2026-11-17T08:00:00Z')).toBeUndefined();
  });
});

describe('the seen day on this device', () => {
  beforeEach(() => useStore.getState().resetAll());

  it('is kept under its own key and is not a store write', async () => {
    await AsyncStorage.setItem(MORNING_SEEN_KEY, '2026-11-16');
    expect(await loadSeenDay()).toBe('2026-11-16');
    const before = useStore.getState();
    markSeenDay('2026-11-17');
    expect(await loadSeenDay()).toBe('2026-11-17');
    await Promise.resolve();
    expect(await AsyncStorage.getItem(MORNING_SEEN_KEY)).toBe('2026-11-17');
    // Nothing in the synced settings changed and nothing waits to be sent.
    expect(useStore.getState().settings).toBe(before.settings);
    expect(useStore.getState().settingsDirty).toBe(false);
  });
});

/**
 * Why the synced day is written only after this morning's pull (./useMorningPage): settings sync as
 * one object and the newer stamp wins, so a write before the pull would put this device's stale
 * copy over a change another device made overnight.
 */
describe('settings written after the pull keep a change made on another device', () => {
  const yesterday8 = '2026-11-16T08:00:00.000Z';
  const remote = (): Settings => ({ ...useStore.getState().settings, theme: 'light', updatedAt: new Date(Date.now() - 9 * 3_600_000).toISOString() });

  beforeEach(() => {
    useStore.getState().resetAll();
    useStore.setState({ settings: { ...useStore.getState().settings, theme: 'dark', updatedAt: yesterday8 }, settingsDirty: false });
  });

  it("pull first, then the morning write: the other device's change survives", () => {
    useStore.getState().mergeRemote({ records: [], settings: remote(), pulledAt: new Date().toISOString() });
    useStore.getState().setSettings({ morningSeenDay: '2026-11-17' });
    expect(useStore.getState().settings.theme).toBe('light');
    expect(useStore.getState().settings.morningSeenDay).toBe('2026-11-17');
  });

  it('the write before the pull (what the hook no longer does) loses it', () => {
    useStore.getState().setSettings({ morningSeenDay: '2026-11-17' });
    useStore.getState().mergeRemote({ records: [], settings: remote(), pulledAt: new Date().toISOString() });
    expect(useStore.getState().settings.theme).toBe('dark');
  });
});
