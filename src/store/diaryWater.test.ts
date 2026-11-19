/**
 * A drink logged in the diary and its water (`fromEntryId`) in the store, with a mocked clock: one
 * write with one stamp and a deterministic id; deleting the entry takes its live water in the same act
 * and the entry's Undo brings back only water that act removed; deleting the water leaves the entry;
 * merges, restores from elsewhere and a reset never cascade. Every order of delete and Undo.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { diaryWaterOf, waterIdFromEntry } from '@/features/drinks/via';
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

describe('a live record for the entry under another id (a hand-made or damaged backup, a later format)', () => {
  const OTHER = '11111111-1111-4111-8111-111111111111';
  const OTHER2 = '22222222-2222-4222-8222-222222222222';
  /** Puts a copy of the entry's water under `id`; `keepOwn` false removes the deterministic one. */
  const copyWater = (water: WaterEntry, id: string, keepOwn: boolean, over: Partial<WaterEntry> = {}) =>
    useStore.setState((s) => {
      const next = { ...s.water };
      if (!keepOwn) delete next[water.id];
      next[id] = { ...water, id, ...over };
      return { water: next };
    });
  const liveFor = (entryId: string) => Object.values(S().water).filter((x) => !x.deleted && x.fromEntryId === entryId);
  /** An edit as followEntry writes it: the entry and its water again, with the volume recomputed. */
  const edit = (entry: FoodEntry, water: WaterEntry, quantity: number) =>
    S().upsertEntriesWithWater([{ entry: { ...e(entry.id), quantity, grams: 503 * quantity }, water: { ...water, ml: 500 * quantity } }]);

  it('the checker\'s case 25: an edit writes to that record and never makes a second', () => {
    const { entry, water } = logDiaryDrink();
    copyWater(water, OTHER, false);
    tick();
    edit(entry, w(OTHER), 2);
    expect(liveFor(entry.id).map((x) => [x.id, x.ml])).toEqual([[OTHER, 1000]]);
    expect(w(waterIdFromEntry(entry.id))).toBeUndefined();
    expect(w(OTHER).updatedAt).toBe(e(entry.id).updatedAt);
    expect(S().dirty.water[OTHER]).toBe(true);
  });

  it('the deterministic record deleted on Water and another live: the live one is written, the deleted one stays deleted', () => {
    const { entry, water } = logDiaryDrink();
    copyWater(water, OTHER, true);
    S().remove('water', water.id);
    tick();
    edit(entry, w(OTHER), 2);
    expect(liveFor(entry.id).map((x) => [x.id, x.ml])).toEqual([[OTHER, 1000]]);
    expect(w(water.id).deleted).toBe(true);
  });

  it('two already live: the edit makes no third; it writes the deterministic one and leaves the other as it was (an edit never removes water)', () => {
    const { entry, water } = logDiaryDrink();
    copyWater(water, OTHER, true);
    const other = w(OTHER);
    tick();
    edit(entry, w(water.id), 2);
    expect(liveFor(entry.id)).toHaveLength(2);
    expect(w(water.id)).toMatchObject({ ml: 1000, updatedAt: e(entry.id).updatedAt });
    expect(w(OTHER)).toEqual(other);
    // Deleting the entry still takes every live water it added.
    S().remove('foodEntries', entry.id);
    expect(liveFor(entry.id)).toHaveLength(0);
  });

  it('two live, neither under the deterministic id: the record handed in is written, the other left as it was', () => {
    const { entry, water } = logDiaryDrink();
    copyWater(water, OTHER, false, { loggedAt: '2026-11-19T08:00:00.000Z' });
    copyWater(water, OTHER2, false, { loggedAt: '2026-11-19T09:00:00.000Z' });
    const older = w(OTHER);
    tick();
    edit(entry, w(OTHER2), 2);
    expect(liveFor(entry.id).map((x) => [x.id, x.ml]).sort()).toEqual([[OTHER, 500], [OTHER2, 1000]]);
    expect(w(OTHER)).toEqual(older);
    expect(Object.keys(S().water)).toHaveLength(2);
  });

  it('one chooser: the deterministic record if live, else the newest stamp, then the smallest id; never water from Water or a deleted one', () => {
    const { entry, water } = logDiaryDrink();
    const at = (iso: string) => ({ updatedAt: iso });
    copyWater(water, OTHER, true, at('2026-11-19T13:00:00.000Z'));
    expect(diaryWaterOf(S().water, entry.id)?.id).toBe(water.id);
    S().remove('water', water.id);
    copyWater(water, OTHER2, true, at('2026-11-19T12:00:00.000Z'));
    expect(diaryWaterOf(S().water, entry.id)?.id).toBe(OTHER);
    copyWater(water, OTHER2, true, at('2026-11-19T13:00:00.000Z'));
    expect(diaryWaterOf(Object.values(S().water), entry.id)?.id).toBe(OTHER);
    copyWater(water, OTHER, true, { deleted: true });
    copyWater(water, OTHER2, true, { foodEntryId: entry.id });
    expect(diaryWaterOf(S().water, entry.id)).toBeNull();
  });

  it("the checker's c2 in the store: the record handed in is written, the other keeps its content and stamp", () => {
    const { entry, water } = logDiaryDrink();
    copyWater(water, OTHER, true, { ml: 300, updatedAt: '2026-11-19T12:41:00.000Z' });
    const other = w(OTHER);
    tick(120_000);
    const before = w(water.id);
    edit(entry, before, 2);
    expect(w(water.id).ml).toBe(1000);
    tick();
    S().upsertEntriesWithWater([{ entry: { ...e(entry.id), quantity: 1, grams: 503 }, water: before }]);
    expect(w(water.id).ml).toBe(500);
    expect(w(OTHER)).toEqual(other);
  });

  it("the checker's c3 and c12 in the store: the newest is chosen, written, stamped after every other, and chosen again", () => {
    const { entry, water } = logDiaryDrink();
    S().remove('water', water.id);
    // X carries a stamp from a clock ahead (a backup from elsewhere): the record written still lands after it.
    copyWater(water, OTHER, true, { ml: 200, deleted: false, updatedAt: '2026-11-19T15:00:00.000Z' });
    copyWater(water, OTHER2, true, { ml: 400, deleted: false, updatedAt: '2026-11-19T12:39:00.000Z' });
    const x = w(OTHER);
    tick();
    edit(entry, w(OTHER2), 2);
    expect(w(OTHER2).ml).toBe(1000);
    expect(w(OTHER2).updatedAt > x.updatedAt).toBe(true);
    expect(diaryWaterOf(S().water, entry.id)?.id).toBe(OTHER2);
    tick();
    edit(entry, diaryWaterOf(S().water, entry.id)!, 3);
    expect(w(OTHER2).ml).toBe(1500);
    expect(w(OTHER)).toEqual(x);
  });

  it('a record handed in that is deleted, from Water or for another entry is not written; the chooser decides', () => {
    const { entry, water } = logDiaryDrink();
    copyWater(water, OTHER, true, { deleted: true, ml: 1 });
    const other = w(OTHER);
    tick();
    edit(entry, other, 2);
    expect(w(water.id).ml).toBe(1000);
    expect(w(OTHER)).toEqual(other);
  });

  it('a new entry still gets the deterministic id', () => {
    const { entry, water } = logDiaryDrink();
    expect(water.id).toBe(waterIdFromEntry(entry.id));
  });
});
