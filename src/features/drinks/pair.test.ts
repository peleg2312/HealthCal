/**
 * A drink and its calories through the real store and the real food log: one act writes both, Undo,
 * deletes and edits from either side keep the pair consistent, plain water is what it always was,
 * a backup carries the pair, an old app's record behaves as before, and two phones that sync never
 * end with calories without their drink or with them twice.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

type ToastOpts = { label?: string; onPress?: () => void; tint?: string };
const toasts: { message: string; opts?: ToastOpts }[] = [];

vi.mock('@/ui', () => ({
  toast: (message: string, opts?: ToastOpts) => void toasts.push({ message, opts }),
  haptic: { success: () => {}, tap: () => {}, press: () => {}, select: () => {}, warn: () => {} },
}));

import { findPreviousDay, findPreviousMeal, copyEntries, saveMeal, updateEntryDirect } from '@/features/food/actions';
import { deleteEntry, logDrink, logFood, removeDrink, setEntryAmount } from '@/features/food/log';
import { lastPortions } from '@/features/food/helpers';
import { backupJson, mergeCollections, parseBackup } from '@/features/settings/exportFormat';
import { addDays, today } from '@/lib/dates';
import { nowISO } from '@/lib/id';
import { COLLECTIONS, recentsFromEntries, useStore } from '@/store';
import type { Beverage, Collection, FoodEntry, SyncedRecord, WaterEntry } from '@/types';

import { choiceById } from './choices';
import { builtinFood, planDrink, selectChoice, type PlanDrinkInput, type SelectedDrink } from './rules';

const TODAY = today();
const sel = (id: string): SelectedDrink => selectChoice(choiceById(id)!);
const plan = (over: Partial<PlanDrinkInput> = {}) =>
  planDrink({ kind: 'milk', drink: sel('milk_semi'), ml: 250, date: TODAY, now: new Date(), today: TODAY, units: 'metric', ...over });
const last = () => toasts[toasts.length - 1];
const undo = () => last().opts!.onPress!();
const S = () => useStore.getState();
const liveEntries = () => Object.values(S().foodEntries).filter((e) => !e.deleted);
const liveWater = () => Object.values(S().water).filter((w) => !w.deleted);
const kcalOn = (date: string) => Math.round(liveEntries().filter((e) => e.date === date).reduce((n, e) => n + e.nutrients.kcal, 0));

beforeEach(() => {
  S().resetAll();
  toasts.length = 0;
});

describe('logging a drink', () => {
  it('a drink with calories writes one water record and one entry that belong together, and adds its calories once', () => {
    const { water, entry } = logDrink(plan());
    expect(entry).not.toBeNull();
    expect(water.foodEntryId).toBe(entry!.id);
    expect(water.drink).toBe('milk_semi');
    expect(entry!.via).toBe('water');
    expect(liveWater()).toHaveLength(1);
    expect(liveEntries()).toHaveLength(1);
    expect(kcalOn(TODAY)).toBe(129);
    expect(last().message).toMatch(/^Added 250 ml milk, 129 kcal to (breakfast|lunch|dinner|snacks)$/);
    expect(last().opts?.tint).toBe('water');
  });

  it('Undo removes both, with one stamp', () => {
    const { water, entry } = logDrink(plan());
    undo();
    const w = S().water[water.id];
    const e = S().foodEntries[entry!.id];
    expect(w.deleted).toBe(true);
    expect(e.deleted).toBe(true);
    expect(w.updatedAt).toBe(e.updatedAt);
    expect(kcalOn(TODAY)).toBe(0);
  });

  it('a drink without calories writes no diary entry', () => {
    for (const [kind, id] of [['coffee', 'coffee_black'], ['tea', 'tea_plain'], ['sports', 'sports_zero'], ['other', 'other_none']] as [Beverage, string][]) {
      logDrink(plan({ kind, drink: sel(id) }));
    }
    expect(liveWater()).toHaveLength(4);
    expect(liveWater().every((w) => w.foodEntryId === undefined)).toBe(true);
    expect(Object.keys(S().foodEntries)).toHaveLength(0);
  });

  it('Water only writes the water record alone', () => {
    logDrink(plan({ kind: 'juice', drink: sel('juice_orange'), waterOnly: true }));
    expect(liveWater()[0]).toMatchObject({ drink: 'juice_orange' });
    expect(liveWater()[0].foodEntryId).toBeUndefined();
    expect(Object.keys(S().foodEntries)).toHaveLength(0);
  });

  it('plain water writes exactly the record, toast and tint the old screen wrote', () => {
    const now = new Date();
    const { water, entry } = logDrink(plan({ kind: 'water', drink: null, ml: 250, now }));
    expect(entry).toBeNull();
    // The old water screen's add(): upsert('water', { date, ml: Math.round(ml), beverage, loggedAt: nowISO() }).
    const old = S().upsert('water', { date: TODAY, ml: Math.round(250), beverage: 'water', loggedAt: now.toISOString() });
    const strip = ({ id: _i, updatedAt: _u, ...rest }: WaterEntry) => rest;
    expect(strip(water)).toEqual(strip(old));
    expect(Object.keys(water).sort()).toEqual(Object.keys(old).sort());
    expect(toasts[0]).toMatchObject({ message: 'Added 250 ml', opts: { label: 'Undo', tint: 'water' } });
    expect(Object.keys(S().foodEntries)).toHaveLength(0);
    expect(typeof nowISO()).toBe('string');
  });

  it('recents are not flooded: drinks never enter recents, usual foods or last portions', () => {
    for (let i = 0; i < 5; i++) logDrink(plan({ drink: sel(['milk_whole', 'milk_oat', 'milk_soy', 'milk_skim', 'milk_semi'][i]) }));
    expect(S().recentFoods).toEqual([]);
    expect(recentsFromEntries(S().foodEntries)).toEqual([]);
    S().rebuildRecents();
    expect(S().recentFoods).toEqual([]);
    expect(lastPortions(liveEntries()).size).toBe(0);
    // A food logged in the diary still enters recents.
    logFood({ food: builtinFood('b_milk_2pct')!, serving: { label: '1 cup', grams: 244 }, quantity: 1, meal: 'breakfast', date: TODAY });
    expect(S().recentFoods.map((f) => f.id)).toEqual(['b_milk_2pct']);
    expect(lastPortions(liveEntries()).get('b_milk_2pct')?.servingLabel).toBe('1 cup');
  });
});

describe('deleting from either side', () => {
  it('on Water: both go in one act, the toast names the calories, Undo brings both back', () => {
    const { water, entry } = logDrink(plan());
    removeDrink(S().water[water.id]);
    expect(last().message).toBe('Removed 250 ml milk and its 129 kcal');
    expect(S().water[water.id].deleted).toBe(true);
    expect(S().foodEntries[entry!.id].deleted).toBe(true);
    expect(S().water[water.id].updatedAt).toBe(S().foodEntries[entry!.id].updatedAt);
    expect(S().dirty.water[water.id]).toBe(true);
    expect(S().dirty.foodEntries[entry!.id]).toBe(true);
    undo();
    expect(S().water[water.id].deleted).toBe(false);
    expect(S().foodEntries[entry!.id].deleted).toBe(false);
    expect(kcalOn(TODAY)).toBe(129);
  });

  it('in the diary: the calories go, the water stays, and Undo puts the entry back with its link', () => {
    const { water, entry } = logDrink(plan());
    deleteEntry(S().foodEntries[entry!.id]);
    expect(last().message).toBe('Removed Milk, reduced fat (2%). The 250 ml stays in Water.');
    expect(S().foodEntries[entry!.id].deleted).toBe(true);
    expect(S().water[water.id].deleted).toBe(false);
    expect(kcalOn(TODAY)).toBe(0);
    undo();
    expect(S().foodEntries[entry!.id].deleted).toBe(false);
    expect(S().water[water.id].foodEntryId).toBe(entry!.id);
  });

  it('an entry deleted earlier in the diary is not revived by an Undo on Water', () => {
    const { water, entry } = logDrink(plan());
    S().remove('foodEntries', entry!.id);
    const entryStamp = S().foodEntries[entry!.id].updatedAt;
    removeDrink(S().water[water.id]);
    expect(last().message).toBe('Removed 250 ml');
    // The partner was already deleted: it is not stamped again.
    expect(S().foodEntries[entry!.id].updatedAt).toBe(entryStamp);
    expect(S().water[water.id].updatedAt > entryStamp).toBe(true);
    undo();
    expect(S().water[water.id].deleted).toBe(false);
    expect(S().foodEntries[entry!.id].deleted).toBe(true);
  });

  it('removing or restoring an entry never touches water', () => {
    const { water, entry } = logDrink(plan());
    const before = S().water[water.id];
    S().remove('foodEntries', entry!.id);
    S().restore('foodEntries', entry!.id);
    expect(S().water[water.id]).toBe(before);
  });

  it('a record from an old app (no new fields) is removed and restored as before', () => {
    const w = S().upsert('water', { date: TODAY, ml: 300, beverage: 'juice', loggedAt: nowISO() });
    removeDrink(w);
    expect(last().message).toBe('Removed 300 ml');
    expect(S().water[w.id].deleted).toBe(true);
    expect(Object.keys(S().foodEntries)).toHaveLength(0);
    undo();
    expect(S().water[w.id].deleted).toBe(false);
  });

  it('a link to an entry this phone does not have deletes the water alone', () => {
    const w = S().upsert('water', { date: TODAY, ml: 250, beverage: 'milk', drink: 'milk_semi', foodEntryId: '00000000-0000-4000-8000-0000000000aa', loggedAt: nowISO() });
    removeDrink(w);
    expect(S().water[w.id].deleted).toBe(true);
    expect(Object.keys(S().foodEntries)).toHaveLength(0);
  });
});

describe('changing the amount or day in the diary', () => {
  it('a new amount moves the water, and Undo restores both exactly', () => {
    const { water, entry } = logDrink(plan());
    const e0 = S().foodEntries[entry!.id];
    const w0 = S().water[water.id];
    logFood({ food: e0.food ?? builtinFood('b_milk_2pct')!, serving: { label: e0.servingLabel, grams: e0.grams }, quantity: 1.5, meal: e0.meal, date: e0.date, entryId: e0.id });
    expect(S().water[water.id].ml).toBe(375);
    expect(S().foodEntries[entry!.id].via).toBe('water');
    expect(last().message).toBe('Entry updated');
    undo();
    const { updatedAt: _a, ...e1 } = S().foodEntries[entry!.id];
    const { updatedAt: _b, ...e0rest } = e0;
    expect(e1).toEqual(e0rest);
    expect(S().water[water.id].ml).toBe(w0.ml);
    expect(S().water[water.id].date).toBe(w0.date);
  });

  it('the stepper moves the water as well', () => {
    const { water, entry } = logDrink(plan());
    setEntryAmount(S().foodEntries[entry!.id], 2);
    expect(S().water[water.id].ml).toBe(500);
    expect(Math.round(S().foodEntries[entry!.id].nutrients.kcal)).toBe(258);
  });

  it('the day follows into the past, never into the future; a meal change only stamps the water again', () => {
    const { water, entry } = logDrink(plan());
    const e = () => S().foodEntries[entry!.id];
    const food = builtinFood('b_milk_2pct')!;
    const yesterday = addDays(TODAY, -1);
    logFood({ food, serving: { label: e().servingLabel, grams: e().grams }, quantity: 1, meal: e().meal, date: yesterday, entryId: entry!.id });
    expect(S().water[water.id].date).toBe(yesterday);
    logFood({ food, serving: { label: e().servingLabel, grams: e().grams }, quantity: 1, meal: e().meal, date: addDays(TODAY, 1), entryId: entry!.id });
    expect(S().water[water.id].date).toBe(yesterday);
    const stamp = S().water[water.id].updatedAt;
    logFood({ food, serving: { label: e().servingLabel, grams: e().grams }, quantity: 1, meal: 'snack', date: e().date, entryId: entry!.id });
    expect(S().water[water.id].ml).toBe(250);
    expect(S().water[water.id].updatedAt >= stamp).toBe(true);
  });

  it('an entered drink (no grams) follows its new day; Undo restores both', () => {
    const { water, entry } = logDrink(plan({ kind: 'other', drink: { id: 'kcal', food: null }, ml: 330, kcal: 140 }));
    const e0 = S().foodEntries[entry!.id];
    const yesterday = addDays(TODAY, -1);
    updateEntryDirect(e0, { name: 'Other drink', nutrients: { kcal: 150, protein: 0, carbs: 0, fat: 0 }, meal: e0.meal, date: yesterday });
    expect(S().water[water.id]).toMatchObject({ date: yesterday, ml: 330 });
    expect(S().foodEntries[entry!.id].via).toBe('water');
    undo();
    expect(S().water[water.id].date).toBe(TODAY);
    expect(S().foodEntries[entry!.id].date).toBe(TODAY);
    expect(S().foodEntries[entry!.id].nutrients.kcal).toBe(140);
  });
});

describe('copies and saved meals skip drinks from Water', () => {
  const food = () => builtinFood('b_oatmeal_cooked') ?? builtinFood('b_banana')!;
  it('a meal holding only a drink from Water is not an earlier meal to copy; a day of drinks only is not an earlier day', () => {
    const y = addDays(TODAY, -1);
    logDrink(plan({ date: y, now: new Date(2026, 0, 1, 8, 0) }));
    expect(findPreviousMeal(liveEntries(), TODAY, 'breakfast')).toBeNull();
    expect(findPreviousDay(liveEntries(), TODAY)).toBeNull();
    logFood({ food: food(), serving: food().servings[0], quantity: 1, meal: 'breakfast', date: y });
    const prev = findPreviousMeal(liveEntries(), TODAY, 'breakfast')!;
    expect(prev.entries.map((e) => e.via)).toEqual([undefined]);
    expect(findPreviousDay(liveEntries(), TODAY)!.entries).toHaveLength(1);
  });

  it('copyEntries leaves the drink behind, and the toast counts what was copied', () => {
    const { entry } = logDrink(plan());
    const f = logFood({ food: food(), serving: food().servings[0], quantity: 1, meal: 'breakfast', date: TODAY });
    const created = copyEntries([S().foodEntries[entry!.id], f], addDays(TODAY, -2));
    expect(created).toHaveLength(1);
    expect(last().message).toMatch(/^Copied 1 item to /);
    toasts.length = 0;
    expect(copyEntries([S().foodEntries[entry!.id]], addDays(TODAY, -2))).toEqual([]);
    expect(last().message).toBe('Drinks from Water are not copied');
  });

  it('saveMeal leaves the drink out, and with nothing else saves nothing', () => {
    const { entry } = logDrink(plan());
    const drink = S().foodEntries[entry!.id];
    expect(saveMeal('Milk', [drink])).toBeNull();
    expect(last().message).toBe('Drinks from Water are not saved in meals');
    expect(Object.keys(S().savedMeals)).toHaveLength(0);
    const f = logFood({ food: food(), serving: food().servings[0], quantity: 1, meal: 'breakfast', date: TODAY });
    const meal = saveMeal('Breakfast', [drink, f])!;
    expect(meal.items).toHaveLength(1);
  });
});

describe('backup', () => {
  it('a pair survives an export and an import, and a dangling link reads as a plain drink', () => {
    const { water, entry } = logDrink(plan());
    const s = S();
    const text = backupJson({
      profile: null,
      settings: s.settings,
      collections: Object.fromEntries(COLLECTIONS.map((c) => [c, s[c]])) as unknown as { [K in Collection]: Record<string, SyncedRecord> },
      favoriteFoodIds: [],
      recentFoods: [],
      recentActivityIds: [],
    });
    const parsed = parseBackup(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.skipped).toBe(0);
    const w = parsed.backup.collections.water[0] as WaterEntry;
    const e = parsed.backup.collections.foodEntries[0] as FoodEntry;
    expect(w.foodEntryId).toBe(entry!.id);
    expect(w.drink).toBe('milk_semi');
    expect(e.via).toBe('water');
    // Into an empty phone: the pair is whole again.
    S().resetAll();
    const merged = mergeCollections(Object.fromEntries(COLLECTIONS.map((c) => [c, {}])) as never, parsed.backup.collections);
    S().hydrate(merged.collections as never);
    removeDrink(S().water[water.id]);
    expect(S().foodEntries[entry!.id].deleted).toBe(true);
    // Only the water, without its entry: deleting it touches nothing else.
    S().resetAll();
    S().hydrate({ water: { [water.id]: w } } as never);
    removeDrink(S().water[water.id]);
    expect(last().message).toBe('Removed 250 ml');
  });
});

describe('two phones', () => {
  type Phone = { store: typeof useStore; log: typeof import('@/features/food/log') };

  async function phone(): Promise<Phone> {
    vi.resetModules();
    const store = (await import('@/store')).useStore;
    const log = await import('@/features/food/log');
    return { store, log };
  }

  /** Both phones push everything and pull everything: per record, the newer stamp wins (mergeRemote). */
  function sync(a: Phone, b: Phone) {
    const records = (p: Phone) =>
      COLLECTIONS.flatMap((collection) => Object.values(p.store.getState()[collection] as Record<string, SyncedRecord>).map((record) => ({ collection, record })));
    const fromA = records(a);
    const fromB = records(b);
    const pulledAt = new Date().toISOString();
    a.store.getState().mergeRemote({ records: fromB, pulledAt });
    b.store.getState().mergeRemote({ records: fromA, pulledAt });
  }

  /** The invariant: every live entry from Water has its live water, and no live water points at two live entries' worth of calories. */
  function consistent(p: Phone) {
    const s = p.store.getState();
    const water = Object.values(s.water);
    for (const e of Object.values(s.foodEntries)) {
      if (e.deleted || e.via !== 'water') continue;
      expect(water.some((w) => !w.deleted && w.foodEntryId === e.id), `entry ${e.id} has its water`).toBe(true);
    }
    const linked = water.filter((w) => !w.deleted && w.foodEntryId).map((w) => w.foodEntryId);
    expect(new Set(linked).size).toBe(linked.length);
  }

  const sleep = () => new Promise((r) => setTimeout(r, 3));

  async function pairOnBoth() {
    const a = await phone();
    const b = await phone();
    expect(a.store).not.toBe(b.store);
    const { water, entry } = a.log.logDrink(plan());
    sync(a, b);
    await sleep();
    return { a, b, waterId: water.id, entryId: entry!.id };
  }

  it('A deletes on Water, B changes the amount earlier: both end deleted', async () => {
    const { a, b, waterId, entryId } = await pairOnBoth();
    const e = b.store.getState().foodEntries[entryId];
    b.log.setEntryAmount(e, 1.5);
    await sleep();
    a.log.removeDrink(a.store.getState().water[waterId]);
    sync(a, b);
    for (const p of [a, b]) {
      expect(p.store.getState().water[waterId].deleted).toBe(true);
      expect(p.store.getState().foodEntries[entryId].deleted).toBe(true);
      consistent(p);
    }
  });

  it('A deletes on Water, B changes the amount later: both live with B amount', async () => {
    const { a, b, waterId, entryId } = await pairOnBoth();
    a.log.removeDrink(a.store.getState().water[waterId]);
    await sleep();
    b.log.setEntryAmount(b.store.getState().foodEntries[entryId], 1.5);
    sync(a, b);
    for (const p of [a, b]) {
      expect(p.store.getState().water[waterId]).toMatchObject({ deleted: false, ml: 375 });
      expect(p.store.getState().foodEntries[entryId].deleted).toBe(false);
      consistent(p);
    }
  });

  it('A deletes on Water, B changes only the meal later: never the calories without their drink', async () => {
    const { a, b, waterId, entryId } = await pairOnBoth();
    a.log.removeDrink(a.store.getState().water[waterId]);
    await sleep();
    const e = b.store.getState().foodEntries[entryId];
    b.log.logFood({ food: e.food!, serving: { label: e.servingLabel, grams: e.grams }, quantity: 1, meal: 'snack', date: e.date, entryId });
    sync(a, b);
    for (const p of [a, b]) consistent(p);
  });

  it('A deletes in the diary, B deletes on Water: nothing left; or B does nothing: the water stays alone', async () => {
    const one = await pairOnBoth();
    one.a.log.deleteEntry(one.a.store.getState().foodEntries[one.entryId]);
    await sleep();
    one.b.log.removeDrink(one.b.store.getState().water[one.waterId]);
    sync(one.a, one.b);
    for (const p of [one.a, one.b]) {
      expect(p.store.getState().water[one.waterId].deleted).toBe(true);
      expect(p.store.getState().foodEntries[one.entryId].deleted).toBe(true);
    }
    const two = await pairOnBoth();
    two.a.log.deleteEntry(two.a.store.getState().foodEntries[two.entryId]);
    sync(two.a, two.b);
    for (const p of [two.a, two.b]) {
      expect(p.store.getState().water[two.waterId].deleted).toBe(false);
      expect(p.store.getState().foodEntries[two.entryId].deleted).toBe(true);
      consistent(p);
    }
  });

  it('a drink logged on one phone counts once on both', async () => {
    const { a, b } = await pairOnBoth();
    sync(a, b);
    sync(a, b);
    for (const p of [a, b]) {
      const s = p.store.getState();
      expect(Object.values(s.foodEntries).filter((e) => !e.deleted)).toHaveLength(1);
      expect(Object.values(s.water).filter((w) => !w.deleted)).toHaveLength(1);
    }
  });
});
