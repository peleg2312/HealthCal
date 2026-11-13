import AsyncStorage from '@react-native-async-storage/async-storage';
import { beforeEach, describe, expect, it } from 'vitest';

import { BUILTIN_FOODS } from '@/data/foods';
import type { FoodEntry } from '@/types';

import { control } from '../../test/stubs/async-storage';
import { useStore } from './index';
import { CHUNK_PREFIX, LEGACY_KEY, META_KEY, bucketOf, chunkKey, createSaver, loadPersisted, purgeTombstones, signature, splitIntoChunks } from './persistence';

const storage = AsyncStorage as unknown as { clear: () => Promise<void>; getAllKeys: () => Promise<string[]>; getItem: (k: string) => Promise<string | null>; setItem: (k: string, v: string) => Promise<void> };

const water = (date: string, ml = 250) => ({ date, ml, beverage: 'water' as const, loggedAt: `${date}T08:00:00.000Z` });
const banana = BUILTIN_FOODS.find((f) => f.id === 'b_banana') ?? BUILTIN_FOODS[0];

beforeEach(async () => {
  control.failWrites = false;
  control.failReads = false;
  await storage.clear();
  useStore.getState().resetAll();
});

describe('buckets', () => {
  it('uses the calendar month of the record, or one shared bucket when it has no date', () => {
    expect(bucketOf({ id: 'a', updatedAt: '', date: '2026-11-13' } as never)).toBe('2026-11');
    expect(bucketOf({ id: 'a', updatedAt: '', start: '2026-10-31T22:00:00.000Z' } as never)).toBe('2026-10');
    expect(bucketOf({ id: 'a', updatedAt: '' })).toBe('all');
    expect(chunkKey('water', '2026-11')).toBe(`${CHUNK_PREFIX}water/2026-11`);
  });

  it('splits a collection by month', () => {
    const chunks = splitIntoChunks('water', {
      a: { id: 'a', updatedAt: 'x', date: '2026-10-31' } as never,
      b: { id: 'b', updatedAt: 'x', date: '2026-11-01' } as never,
      c: { id: 'c', updatedAt: 'x', date: '2026-11-30' } as never,
    });
    expect(Object.keys(chunks).sort()).toEqual([chunkKey('water', '2026-10'), chunkKey('water', '2026-11')]);
    expect(Object.keys(chunks[chunkKey('water', '2026-11')])).toEqual(['b', 'c']);
  });

  it('the fingerprint changes on add, edit and delete, and only then', () => {
    const a = { id: 'a', updatedAt: '2026-01-01T00:00:00.000Z' };
    const base = signature({ a });
    expect(signature({ a: { ...a } })).toBe(base);
    expect(signature({ a, b: { id: 'b', updatedAt: '2026-01-01T00:00:00.000Z' } })).not.toBe(base);
    expect(signature({ a: { ...a, updatedAt: '2026-01-01T00:00:00.001Z' } })).not.toBe(base);
    expect(signature({ a: { ...a, deleted: true } })).not.toBe(base);
  });
});

describe('saving and loading', () => {
  it('round-trips the whole state through the split layout', async () => {
    const s = useStore.getState();
    s.setProfile({ name: 'Alex', weightKg: 80 });
    s.upsert('water', water('2026-10-31'));
    s.upsert('water', water('2026-11-01', 500));
    s.upsert('weights', { date: '2026-11-01', kg: 80 });
    await createSaver(() => useStore.getState()).flush();

    const keys = await storage.getAllKeys();
    expect(keys).toContain(META_KEY);
    expect(keys).toContain(chunkKey('water', '2026-10'));
    expect(keys).toContain(chunkKey('water', '2026-11'));
    expect(keys).toContain(chunkKey('weights', '2026-11'));

    const before = useStore.getState();
    const loaded = await loadPersisted();
    expect(loaded?.profile?.name).toBe('Alex');
    expect(loaded?.water).toEqual(before.water);
    expect(loaded?.weights).toEqual(before.weights);
    expect(loaded?.dirty).toEqual(before.dirty);

    useStore.getState().resetAll();
    useStore.getState().hydrate(loaded!);
    expect(useStore.getState().water).toEqual(before.water);
    expect(useStore.getState().profile?.name).toBe('Alex');
  });

  it('rewrites only the month that changed', async () => {
    const s = useStore.getState();
    s.upsert('water', water('2026-10-31'));
    const nov = s.upsert('water', water('2026-11-01'));
    const saver = createSaver(() => useStore.getState());
    await saver.flush();
    const october = await storage.getItem(chunkKey('water', '2026-10'));

    // Sentinel: if October were rewritten, this marker would be replaced.
    await storage.setItem(chunkKey('water', '2026-10'), 'UNTOUCHED');
    useStore.getState().upsert('water', { ...water('2026-11-01', 750), id: nov.id });
    await saver.flush();
    expect(await storage.getItem(chunkKey('water', '2026-10'))).toBe('UNTOUCHED');
    expect(JSON.parse((await storage.getItem(chunkKey('water', '2026-11')))!)[nov.id].ml).toBe(750);
    expect(october).not.toBeNull();
  });

  it('removes a month value when its last record is gone, and everything on erase', async () => {
    useStore.getState().upsert('water', water('2026-10-31'));
    const saver = createSaver(() => useStore.getState());
    await saver.flush();
    expect(await storage.getAllKeys()).toContain(chunkKey('water', '2026-10'));
    useStore.getState().resetAll();
    await saver.flush();
    expect((await storage.getAllKeys()).filter((k) => k.startsWith(CHUNK_PREFIX))).toEqual([]);
  });

  it('leaves out the definition of a bundled food when saving and puts it back when loading', async () => {
    const entry = (food: FoodEntry['food'], source: FoodEntry['source']) => ({ date: '2026-11-01', meal: 'breakfast' as const, name: food!.name, foodId: food!.id, source, verified: false, servingLabel: '1', quantity: 1, grams: 100, nutrients: { kcal: 89, protein: 1, carbs: 23, fat: 0 }, food, loggedAt: '2026-11-01T08:00:00.000Z' });
    const own = { ...banana, id: 'custom_1', source: 'custom' as const };
    const a = useStore.getState().upsert('foodEntries', entry(banana, 'builtin'));
    const b = useStore.getState().upsert('foodEntries', entry(own, 'custom'));
    await createSaver(() => useStore.getState()).flush();

    const raw = JSON.parse((await storage.getItem(chunkKey('foodEntries', '2026-11')))!);
    expect(raw[a.id].food).toBeUndefined();
    expect(raw[b.id].food.id).toBe('custom_1');

    const loaded = await loadPersisted();
    expect(loaded!.foodEntries![a.id].food).toEqual(banana);
    expect(loaded!.foodEntries![b.id].food!.id).toBe('custom_1');
  });

  it('reads the single value written by an earlier build, then replaces it with the split layout', async () => {
    const legacy = { state: { profile: { name: 'Old', updatedAt: '2026-01-01T00:00:00.000Z' }, water: { w: { id: 'w', date: '2026-01-05', ml: 250, updatedAt: '2026-01-05T08:00:00.000Z' } } }, version: 1 };
    await storage.setItem(LEGACY_KEY, JSON.stringify(legacy));
    const loaded = await loadPersisted();
    expect(loaded?.profile?.name).toBe('Old');
    useStore.getState().hydrate(loaded!);
    await createSaver(() => useStore.getState()).flush();
    const keys = await storage.getAllKeys();
    expect(keys).not.toContain(LEGACY_KEY);
    expect(keys).toContain(META_KEY);
    expect(keys).toContain(chunkKey('water', '2026-01'));
    expect((await loadPersisted())?.water?.w.ml).toBe(250);
  });

  it('returns null when nothing was ever saved', async () => {
    expect(await loadPersisted()).toBeNull();
  });

  it('a failed save reports the failure and the next save writes everything that was missed', async () => {
    useStore.getState().upsert('water', water('2026-11-01'));
    const saver = createSaver(() => useStore.getState());
    control.failWrites = true;
    await expect(saver.flush()).rejects.toThrow();
    expect(await storage.getAllKeys()).toEqual([]);
    control.failWrites = false;
    await saver.flush();
    expect(await storage.getAllKeys()).toContain(chunkKey('water', '2026-11'));
  });

  it('a read failure surfaces as an error instead of an empty app', async () => {
    control.failReads = true;
    await expect(loadPersisted()).rejects.toThrow();
  });

  it('a heavy month of logging stays far below the 2 MB per-value limit', async () => {
    const big = { ...banana, id: 'off_big', source: 'openfoodfacts' as const, name: 'A packaged product with a long descriptive name' };
    const records = [];
    for (let day = 1; day <= 31; day++) {
      for (let i = 0; i < 40; i++) {
        const date = `2026-01-${String(day).padStart(2, '0')}`;
        records.push({ date, meal: 'lunch' as const, name: big.name, foodId: big.id, source: 'openfoodfacts' as const, verified: false, servingLabel: '1 serving', quantity: 1, grams: 100, nutrients: big.per100g, food: big, loggedAt: `${date}T12:00:00.000Z` });
      }
    }
    useStore.getState().upsertMany('foodEntries', records);
    await createSaver(() => useStore.getState()).flush();
    const size = (await storage.getItem(chunkKey('foodEntries', '2026-01')))!.length;
    // 1,240 entries in one month, each carrying a full non-bundled definition: the worst realistic case.
    expect(size).toBeLessThan(1_500_000);
  });
});

describe('purgeTombstones', () => {
  const now = Date.parse('2026-06-01T00:00:00.000Z');
  const rec = (id: string, daysOld: number, deleted: boolean) => ({ id, updatedAt: new Date(now - daysOld * 86_400_000).toISOString(), deleted });
  const empty = { foodEntries: {}, customFoods: {}, savedMeals: {}, activities: {}, water: {}, weights: {}, sleep: {}, fasting: {}, favorites: {} };

  it('without an account, drops deletion markers older than a day and keeps everything else', () => {
    const out = purgeTombstones({ ownerId: null, water: { old: rec('old', 2, true), fresh: rec('fresh', 0.5, true), live: rec('live', 90, false) } as never, dirty: empty as never }, now);
    expect(Object.keys(out.water!).sort()).toEqual(['fresh', 'live']);
  });

  it('with an account, keeps markers for 30 days and never drops one that is still waiting to upload', () => {
    const out = purgeTombstones(
      { ownerId: 'u', water: { old: rec('old', 31, true), recent: rec('recent', 29, true), pending: rec('pending', 200, true) } as never, dirty: { ...empty, water: { pending: true } } as never },
      now,
    );
    expect(Object.keys(out.water!).sort()).toEqual(['pending', 'recent']);
  });

  it('returns the same collection object when there is nothing to drop', () => {
    const water = { live: rec('live', 400, false) };
    const out = purgeTombstones({ ownerId: 'u', water: water as never, dirty: empty as never }, now);
    expect(out.water).toBe(water);
  });
});
