/**
 * `startPersistence` is single flight: a second call while the first load runs waits for that load
 * and never loads and hydrates again. The home-screen widget's task and the root layout can both
 * start it at once (the app opened while the widget logs a glass); a second hydrate would replace a
 * glass written after the first one and not yet saved.
 *
 * Its own file: `startPersistence` keeps module state (started, the saver), so it must not leak
 * into the other persistence tests.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { describe, expect, it, vi } from 'vitest';

import { useStore } from './index';
import { META_KEY, createSaver, flushPersistence, loadPersisted, startPersistence, useHydration } from './persistence';

type MultiGet = (keys: string[]) => Promise<[string, string | null][]>;
const storage = AsyncStorage as unknown as { multiGet: MultiGet; getAllKeys: () => Promise<string[]> };

describe('startPersistence', () => {
  it('loads once when called again during the load, and a glass written in between is kept', async () => {
    // Something saved before this start: a finished set-up.
    useStore.getState().setProfile({ name: 'Alex', weightKg: 80, onboardedAt: '2026-11-01T08:00:00.000Z' });
    await createSaver(() => useStore.getState()).flush();
    useStore.getState().resetAll();
    expect(await storage.getAllKeys()).toContain(META_KEY);

    // Hold the read, so the second call arrives while the first load is still running.
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const real = storage.multiGet.bind(storage);
    const reads = vi.spyOn(storage, 'multiGet').mockImplementation(async (keys: string[]) => {
      await gate;
      return real(keys);
    });

    const widget = startPersistence();
    const app = startPersistence();
    expect(app).toBe(widget);
    expect(useHydration.getState().status).toBe('loading');
    release();
    await widget;
    expect(useHydration.getState().status).toBe('ready');
    expect(useStore.getState().profile?.name).toBe('Alex');

    // The widget logs a glass as soon as its load is done; the app's own call must not hydrate over it.
    const glass = useStore.getState().upsert('water', { date: '2026-11-25', ml: 250, beverage: 'water', loggedAt: '2026-11-25T09:00:00.000Z' });
    await app;
    await startPersistence();
    expect(reads).toHaveBeenCalledTimes(1);
    expect(useStore.getState().water[glass.id]?.ml).toBe(250);

    await flushPersistence();
    reads.mockRestore();
    const saved = await loadPersisted();
    expect(saved?.water?.[glass.id]?.ml).toBe(250);
  });
});
