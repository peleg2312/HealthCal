/**
 * A drink logged in the diary and its water (`fromEntryId`) in the store, with a mocked clock: one
 * write with one stamp and a deterministic id; deleting the entry takes its live water in the same act
 * and the entry's Undo brings back only water that act removed; deleting the water leaves the entry;
 * merges, restores from elsewhere and a reset never cascade. Every order of delete and Undo.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { waterIdFromEntry } from '@/features/drinks/via';
import type { FoodEntry, WaterEntry } from '@/types';

import { useStore } from './index';

const S = () => useStore.getState();
let clock = Date.parse('2026-11-19T12:40:00.000Z');
const tick = (ms = 1000) => {
  clock += ms;
  vi.setSystemTime(clock);
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  clock = Date.parse('2026-11-19T12:40:00.000Z');
  vi.setSystemTime(clock);
  S().resetAll();
});
afterEach(() => vi.useRealTimers());

const entryInput = (over: Partial<FoodEntry> = {}): Omit<FoodEntry, 'id' | 'updatedAt'> => ({
  date: '2026-11-19',
  meal: 'lunch',
  name: 'Energy drink, sugared',
  foodId: 'b_energy_drink',
  source: 'builtin',
  verified: true,
  servingLabel: '1 can (500 ml)',
  quantity: 1,
  grams: 503,
  nutrients: { kcal: 216, protein: 0, carbs: 55, fat: 0 },
  loggedAt: new Date(clock).toISOString(),
  ...over,
});

/** Log a drink in the diary the way logFood and logItems do: the entry and its water, one act. */
function logDiaryDrink(over: Partial<FoodEntry> = {}, ml = 500): { entry: FoodEntry; water: WaterEntry } {
  const [{ entry, water }] = S().upsertEntriesWithWater([{ entry: entryInput(over), water: { ml, beverage: 'other', drink: 'food' } }]);
  return { entry, water: water! };
}
const e = (id: string) => S().foodEntries[id];
const w = (id: string) => S().water[id];

describe('writing the pair', () => {
  it('one act, one stamp, the deterministic id, and the link, day and moment from the entry', () => {
    const { entry, water } = logDiaryDrink({ date: '2026-11-21' });
    expect(water.id).toBe(waterIdFromEntry(entry.id));
    expect(water).toMatchObject({ fromEntryId: entry.id, date: '2026-11-21', loggedAt: entry.loggedAt, ml: 500, beverage: 'other', drink: 'food', deleted: false });
    expect(water.foodEntryId).toBeUndefined();
    expect(water.updatedAt).toBe(entry.updatedAt);
    expect(S().dirty.water[water.id]).toBe(true);
    expect(S().dirty.foodEntries[entry.id]).toBe(true);
  });

  it('an entry without water is written alone; ml is kept within 1..10,000', () => {
    const [plain, big] = S().upsertEntriesWithWater([
      { entry: entryInput({ name: 'Banana' }), water: null },
      { entry: entryInput(), water: { ml: 25000, beverage: 'other', drink: 'food' } },
    ]);
    expect(plain.water).toBeNull();
    expect(Object.values(S().water)).toHaveLength(1);
    expect(big.water!.ml).toBe(10000);
  });

  it('writing the same entry again keeps one water record and moves its stamp past both', () => {
    const { entry, water } = logDiaryDrink();
    S().upsertEntriesWithWater([{ entry: { ...entry, quantity: 2, grams: 1006 }, water: { ...water, ml: 1000 } }]);
    expect(Object.values(S().water)).toHaveLength(1);
    expect(w(water.id).ml).toBe(1000);
    expect(w(water.id).updatedAt > water.updatedAt).toBe(true);
    expect(w(water.id).updatedAt).toBe(e(entry.id).updatedAt);
  });
});

describe('deleting and Undo, in every order', () => {
  it('delete the entry: both go in one act; Undo brings both back in one act', () => {
    const { entry, water } = logDiaryDrink();
    tick();
    S().remove('foodEntries', entry.id);
    expect(e(entry.id).deleted).toBe(true);
    expect(w(water.id).deleted).toBe(true);
    expect(w(water.id).updatedAt).toBe(e(entry.id).updatedAt);
    expect(S().dirty.water[water.id]).toBe(true);
    tick();
    S().restore('foodEntries', entry.id);
    expect(e(entry.id).deleted).toBe(false);
    expect(w(water.id)).toMatchObject({ deleted: false, fromEntryId: entry.id, ml: 500 });
    expect(w(water.id).updatedAt).toBe(e(entry.id).updatedAt);
  });

  it('delete, Undo, delete, Undo: the same each time', () => {
    const { entry, water } = logDiaryDrink();
    for (let i = 0; i < 3; i++) {
      tick();
      S().remove('foodEntries', entry.id);
      expect(w(water.id).deleted).toBe(true);
      tick();
      S().restore('foodEntries', entry.id);
      expect(w(water.id).deleted).toBe(false);
    }
  });

  it('delete the water on Water: the entry stays and is an ordinary entry; Undo restores the water with its link', () => {
    const { entry, water } = logDiaryDrink();
    const entryStamp = e(entry.id).updatedAt;
    tick();
    S().remove('water', water.id);
    expect(w(water.id).deleted).toBe(true);
    expect(e(entry.id).deleted).toBe(false);
    expect(e(entry.id).updatedAt).toBe(entryStamp);
    tick();
    S().restore('water', water.id);
    expect(w(water.id)).toMatchObject({ deleted: false, fromEntryId: entry.id });
    expect(e(entry.id).updatedAt).toBe(entryStamp);
  });

  it('water deleted on Water, then the entry deleted: the entry goes alone, after the water; its Undo leaves the water deleted', () => {
    const { entry, water } = logDiaryDrink();
    tick();
    S().remove('water', water.id);
    const waterStamp = w(water.id).updatedAt;
    tick();
    S().remove('foodEntries', entry.id);
    expect(w(water.id).updatedAt).toBe(waterStamp);
    expect(e(entry.id).updatedAt > waterStamp).toBe(true);
    tick();
    S().restore('foodEntries', entry.id);
    expect(e(entry.id).deleted).toBe(false);
    expect(w(water.id).deleted).toBe(true);
  });

  it('the same in one millisecond: the entry stamp still lands after the water and Undo cannot take them for one act', () => {
    const { entry, water } = logDiaryDrink();
    S().remove('water', water.id);
    S().remove('foodEntries', entry.id);
    expect(e(entry.id).updatedAt > w(water.id).updatedAt).toBe(true);
    S().restore('foodEntries', entry.id);
    expect(w(water.id).deleted).toBe(true);
  });

  it('the entry deleted (both go), then the water deleted again and restored on Water: the entry stays deleted', () => {
    const { entry, water } = logDiaryDrink();
    tick();
    S().remove('foodEntries', entry.id);
    tick();
    // An Undo of an older Water delete, after the entry's delete: the water comes back alone, a plain row.
    S().restore('water', water.id);
    expect(w(water.id).deleted).toBe(false);
    expect(e(entry.id).deleted).toBe(true);
    tick();
    // The entry's own Undo now: its water is live already; the entry comes back, nothing doubles.
    S().restore('foodEntries', entry.id);
    expect(e(entry.id).deleted).toBe(false);
    expect(Object.values(S().water).filter((x) => !x.deleted)).toHaveLength(1);
  });

  it('the entry deleted, then the water deleted again (already deleted): the entry\'s Undo leaves the water deleted', () => {
    const { entry, water } = logDiaryDrink();
    tick();
    S().remove('foodEntries', entry.id);
    tick();
    S().remove('water', water.id);
    tick();
    S().restore('foodEntries', entry.id);
    expect(e(entry.id).deleted).toBe(false);
    expect(w(water.id).deleted).toBe(true);
  });

  it('a water record from another phone ahead in time: the delete stamp lands after it and Undo still finds the act', () => {
    const { entry, water } = logDiaryDrink();
    const ahead = new Date(clock + 5 * 60_000).toISOString();
    S().mergeRemote({ records: [{ collection: 'water', record: { ...water, updatedAt: ahead } }], pulledAt: ahead });
    S().remove('foodEntries', entry.id);
    expect(Date.parse(w(water.id).updatedAt)).toBe(Date.parse(ahead) + 1);
    expect(e(entry.id).updatedAt).toBe(w(water.id).updatedAt);
    S().restore('foodEntries', entry.id);
    expect(w(water.id).deleted).toBe(false);
  });

  it('restoring a live entry or removing a deleted one touches no water', () => {
    const { entry, water } = logDiaryDrink();
    const before = w(water.id);
    S().restore('foodEntries', entry.id);
    expect(w(water.id)).toBe(before);
    S().remove('foodEntries', entry.id);
    const deleted = w(water.id);
    tick();
    S().remove('foodEntries', entry.id);
    expect(w(water.id)).toBe(deleted);
  });

  it('a water record from Water (foodEntryId) is never taken by the entry it points at', () => {
    const entry = S().upsert('foodEntries', { ...entryInput(), via: 'water' });
    const water = S().upsert('water', { date: '2026-11-19', ml: 250, beverage: 'milk', drink: 'milk_semi', foodEntryId: entry.id, loggedAt: entry.loggedAt });
    tick();
    S().remove('foodEntries', entry.id);
    expect(w(water.id).deleted).toBe(false);
  });
});

describe('merges, restores from elsewhere and a reset never cascade', () => {
  it('a deleted entry arriving from the server (an older app\'s delete) leaves the water as a plain live row', () => {
    const { entry, water } = logDiaryDrink();
    tick();
    S().mergeRemote({ records: [{ collection: 'foodEntries', record: { ...entry, deleted: true, updatedAt: new Date(clock).toISOString() } }], pulledAt: new Date(clock).toISOString() });
    expect(e(entry.id).deleted).toBe(true);
    expect(w(water.id).deleted).toBe(false);
  });

  it('a deleted water arriving from the server leaves the entry', () => {
    const { entry, water } = logDiaryDrink();
    tick();
    S().mergeRemote({ records: [{ collection: 'water', record: { ...water, deleted: true, updatedAt: new Date(clock).toISOString() } }], pulledAt: new Date(clock).toISOString() });
    expect(w(water.id).deleted).toBe(true);
    expect(e(entry.id).deleted).toBe(false);
  });

  it('another tab\'s copy (mergeLocal) and a reset do nothing to the other record', () => {
    const { entry, water } = logDiaryDrink();
    tick();
    S().mergeLocal({ foodEntries: { [entry.id]: { ...entry, deleted: true, updatedAt: new Date(clock).toISOString() } } });
    expect(e(entry.id).deleted).toBe(true);
    expect(w(water.id).deleted).toBe(false);
    S().resetAll();
    expect(S().water).toEqual({});
  });
});
