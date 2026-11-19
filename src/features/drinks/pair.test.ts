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
import type { Beverage, Collection, FoodEntry, MealType, SyncedRecord, WaterEntry } from '@/types';

import { choiceById } from './choices';
import { diaryDrink, diaryDrinkMl } from './diary';
import { undoEdit } from './pair';
import { builtinFood, planDrink, selectChoice, waterFromEntry, type PlanDrinkInput, type SelectedDrink } from './rules';
import { buildEntry } from '@/features/food/build';

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
    expect(last().message).toMatch(/^Added 250 ml of milk, 129 kcal to (breakfast|lunch|dinner|snacks)$/);
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
    expect(last().message).toBe('Removed 250 ml of milk and its 129 kcal');
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
    // A future day is refused, with the reason, and neither record moves.
    logFood({ food, serving: { label: e().servingLabel, grams: e().grams }, quantity: 1, meal: e().meal, date: addDays(TODAY, 1), entryId: entry!.id });
    expect(last().message).toBe('A drink also counted in Water stays on today or an earlier day.');
    expect(e().date).toBe(yesterday);
    expect(S().water[water.id].date).toBe(yesterday);
    const stamp = S().water[water.id].updatedAt;
    logFood({ food, serving: { label: e().servingLabel, grams: e().grams }, quantity: 1, meal: 'snack', date: e().date, entryId: entry!.id });
    expect(S().water[water.id].ml).toBe(250);
    expect(S().water[water.id].updatedAt >= stamp).toBe(true);
  });

  it('a paired entry never goes to a future day nor past 10,000 ml of the drink, from any edit; the reason is said', () => {
    const { water, entry } = logDrink(plan());
    const e = () => S().foodEntries[entry!.id];
    const before = e();
    // The stepper and the detail's amount: 40 glasses (10,000 ml) is the most, 41 is refused.
    setEntryAmount(e(), 40);
    expect(S().water[water.id].ml).toBe(10000);
    setEntryAmount(e(), 41);
    expect(last().message).toBe('A drink also counted in Water is at most 10 L.');
    expect(e().quantity).toBe(40);
    expect(S().water[water.id].ml).toBe(10000);
    // The manual editor's day.
    updateEntryDirect(e(), { name: e().name, nutrients: e().nutrients, meal: e().meal, date: addDays(TODAY, 1) });
    expect(last().message).toBe('A drink also counted in Water stays on today or an earlier day.');
    expect(e().date).toBe(TODAY);
    expect(S().water[water.id].date).toBe(TODAY);
    expect(before.via).toBe('water');
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

  it('A deletes on Water while B deletes in the diary and taps Undo: the entry is left without its water, visible, counted and deletable', async () => {
    // Accepted (rules.ts header): restore('foodEntries') never touches water, so B's Undo stamps the
    // entry after A's delete. After sync the entry is live with via 'water' and no live water.
    const { a, b, waterId, entryId } = await pairOnBoth();
    a.log.removeDrink(a.store.getState().water[waterId]);
    await sleep();
    b.log.deleteEntry(b.store.getState().foodEntries[entryId]);
    toasts[toasts.length - 1].opts!.onPress!();
    sync(a, b);
    for (const p of [a, b]) {
      const s = p.store.getState();
      expect(s.water[waterId].deleted).toBe(true);
      const e = s.foodEntries[entryId];
      expect(e.deleted).toBe(false);
      expect(e.via).toBe('water');
      // Visible in the diary and counted: an ordinary live entry for that day.
      expect(Object.values(s.foodEntries).filter((x) => !x.deleted && x.date === TODAY).map((x) => x.id)).toEqual([entryId]);
      expect(Math.round(e.nutrients.kcal)).toBe(129);
      // Deletable, with the plain toast (no water says it stays).
      toasts.length = 0;
      p.log.deleteEntry(e);
      expect(p.store.getState().foodEntries[entryId].deleted).toBe(true);
      expect(toasts[0].message).toBe(`Removed ${e.name}`);
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

// ---------------------------------------------------------------- a drink logged in the diary

/**
 * Log a drink in the diary as logFood and logItems do (specification section 5): `diaryDrink` decides
 * before the entry exists, the store writes the entry and its water in one act.
 */
function logInDiary(store: typeof useStore, label = '1 can (500 ml)', quantity = 1, meal: MealType = 'lunch', date = TODAY, foodId = 'b_energy_drink') {
  const food = builtinFood(foodId)!;
  const serving = food.servings.find((x) => x.label === label)!;
  const built = buildEntry({ food, serving, quantity, meal, date });
  const drink = diaryDrink(built, store.getState().profile);
  const [{ entry, water }] = store.getState().upsertEntriesWithWater([{ entry: built, water: drink }]);
  return { entry, water: water! };
}

describe('a drink logged in the diary: edits, deletes and Undo through the real food log', () => {
  const energy = () => builtinFood('b_energy_drink')!;
  const W = (id: string) => S().water[id];
  const E = (id: string) => S().foodEntries[id];

  it('logging writes the water with the deterministic id; the switch off writes none', () => {
    const { entry, water } = logInDiary(useStore);
    expect(water).toMatchObject({ ml: 500, beverage: 'other', fromEntryId: entry.id, date: TODAY });
    expect(waterFromEntry(S().water, entry.id)?.id).toBe(water.id);
    S().setProfile({ diaryDrinksInWater: false });
    const off = logInDiary(useStore);
    expect(off.water).toBeNull();
    expect(liveWater()).toHaveLength(1);
  });

  it('the stepper: the water is recomputed (never scaled), one stamp, down to 1 ml, and 0 deletes both with Undo', () => {
    const { entry, water } = logInDiary(useStore);
    setEntryAmount(E(entry.id), 2);
    expect(W(water.id).ml).toBe(1000);
    expect(W(water.id).updatedAt).toBe(E(entry.id).updatedAt);
    setEntryAmount(E(entry.id), 0.01);
    expect(W(water.id).ml).toBe(5);
    setEntryAmount(E(entry.id), 3);
    expect(W(water.id).ml).toBe(1500);
    toasts.length = 0;
    setEntryAmount(E(entry.id), 0);
    expect(E(entry.id).deleted).toBe(true);
    expect(W(water.id).deleted).toBe(true);
    undo();
    expect(E(entry.id).deleted).toBe(false);
    expect(W(water.id)).toMatchObject({ deleted: false, ml: 1500 });
  });

  it('never refused: past 10,000 ml the entry holds it and the water holds 10,000 ml', () => {
    const { entry, water } = logInDiary(useStore);
    setEntryAmount(E(entry.id), 25);
    expect(E(entry.id).quantity).toBe(25);
    expect(W(water.id).ml).toBe(10000);
  });

  it('the day follows, future days included; Undo restores both exactly', () => {
    const { entry, water } = logInDiary(useStore);
    const e0 = E(entry.id);
    const w0 = W(water.id);
    const tomorrow = addDays(TODAY, 1);
    logFood({ food: energy(), serving: { label: e0.servingLabel, grams: e0.grams }, quantity: 1, meal: 'lunch', date: tomorrow, entryId: entry.id });
    expect(last().message).toBe('Entry updated');
    expect(E(entry.id).date).toBe(tomorrow);
    expect(W(water.id)).toMatchObject({ date: tomorrow, ml: 500, deleted: false });
    undo();
    expect(E(entry.id).date).toBe(TODAY);
    expect(W(water.id).date).toBe(w0.date);
    expect(W(water.id).ml).toBe(w0.ml);
  });

  // M2: the water is written again only when the amount, the serving or the day changed.
  it('a meal-only change leaves the water record untouched, stamp and content; its Undo too', () => {
    const { entry, water } = logInDiary(useStore);
    const e0 = E(entry.id);
    const w0 = W(water.id);
    logFood({ food: energy(), serving: { label: e0.servingLabel, grams: e0.grams / e0.quantity }, quantity: e0.quantity, meal: 'dinner', date: TODAY, entryId: entry.id });
    expect(E(entry.id).meal).toBe('dinner');
    expect(W(water.id)).toEqual(w0);
    updateEntryDirect(E(entry.id), { name: 'Monster', nutrients: { kcal: 250, protein: 0, carbs: 60, fat: 0 }, meal: 'snack', date: TODAY });
    expect(E(entry.id)).toMatchObject({ meal: 'snack', name: 'Monster' });
    expect(W(water.id)).toEqual(w0);
    undo();
    expect(E(entry.id).meal).toBe('dinner');
    expect(W(water.id)).toEqual(w0);
    // A meal-only edit, then the entry deleted (both go): the edit's Undo brings back neither.
    logFood({ food: energy(), serving: { label: e0.servingLabel, grams: e0.grams / e0.quantity }, quantity: e0.quantity, meal: 'lunch', date: TODAY, entryId: entry.id });
    const editUndo = last().opts!.onPress!;
    S().remove('foodEntries', entry.id);
    editUndo();
    expect(E(entry.id).deleted).toBe(true);
    expect(W(water.id).deleted).toBe(true);
  });

  it('an amount, a serving or a day change writes the water again with the entry\'s stamp', () => {
    const { entry, water } = logInDiary(useStore);
    const stampMoves = (before: string) => {
      expect(W(water.id).updatedAt > before).toBe(true);
      expect(W(water.id).updatedAt).toBe(E(entry.id).updatedAt);
    };
    let stamp = W(water.id).updatedAt;
    setEntryAmount(E(entry.id), 2);
    expect(W(water.id).ml).toBe(1000);
    stampMoves(stamp);
    stamp = W(water.id).updatedAt;
    const can16 = energy().servings.find((x) => x.label === '1 can (16 fl oz)')!;
    logFood({ food: energy(), serving: can16, quantity: 2, meal: 'lunch', date: TODAY, entryId: entry.id });
    expect(W(water.id).ml).toBe(946);
    stampMoves(stamp);
    stamp = W(water.id).updatedAt;
    logFood({ food: energy(), serving: can16, quantity: 2, meal: 'lunch', date: addDays(TODAY, -1), entryId: entry.id });
    expect(W(water.id)).toMatchObject({ date: addDays(TODAY, -1), ml: 946 });
    stampMoves(stamp);
  });

  it("the checker's case 25 through the food log: a live record under another id is the one the stepper writes", () => {
    const { entry, water } = logInDiary(useStore);
    const OTHER = '11111111-1111-4111-8111-111111111111';
    useStore.setState((s) => {
      const next = { ...s.water };
      delete next[water.id];
      next[OTHER] = { ...water, id: OTHER };
      return { water: next };
    });
    setEntryAmount(E(entry.id), 2);
    expect(liveWater().filter((w) => w.fromEntryId === entry.id).map((w) => [w.id, w.ml])).toEqual([[OTHER, 1000]]);
  });

  it('the manual editor moves the day; the calories alone never change the water', () => {
    const { entry, water } = logInDiary(useStore);
    updateEntryDirect(E(entry.id), { name: 'Monster', nutrients: { kcal: 250, protein: 0, carbs: 60, fat: 0 }, meal: 'lunch', date: addDays(TODAY, -1) });
    expect(W(water.id)).toMatchObject({ date: addDays(TODAY, -1), ml: 500 });
  });

  it('a serving change recomputes from the label: 1 can (16 fl oz) is 473 ml', () => {
    const { entry, water } = logInDiary(useStore);
    const can16 = energy().servings.find((x) => x.label === '1 can (16 fl oz)')!;
    logFood({ food: energy(), serving: can16, quantity: 1, meal: 'lunch', date: TODAY, entryId: entry.id });
    expect(W(water.id).ml).toBe(473);
    expect(diaryDrinkMl(E(entry.id))).toBe(473);
  });

  it("an edit never brings back water deleted on Water; the edit's Undo leaves it deleted", () => {
    const { entry, water } = logInDiary(useStore);
    const e0 = E(entry.id);
    setEntryAmount(E(entry.id), 2);
    // A full edit with its toast, then the water deleted on Water, then the edit's Undo.
    logFood({ food: energy(), serving: { label: '1 can (500 ml)', grams: 503 }, quantity: 3, meal: 'lunch', date: TODAY, entryId: entry.id });
    const undoTheEdit = last().opts!.onPress!;
    removeDrink(W(water.id));
    expect(E(entry.id).deleted).toBe(false);
    setEntryAmount(E(entry.id), 4);
    expect(W(water.id).deleted).toBe(true);
    undoTheEdit();
    expect(E(entry.id).quantity).toBe(2);
    expect(W(water.id).deleted).toBe(true);
    expect(e0.quantity).toBe(1);
  });

  it("an older app's edit (entry only) heals on the next edit here of the amount, the serving or the day", () => {
    const { entry, water } = logInDiary(useStore);
    // The older app doubles the amount and does not move the water.
    S().upsert('foodEntries', { ...E(entry.id), quantity: 2, grams: 1006 });
    expect(W(water.id).ml).toBe(500);
    // A meal-only edit here leaves the water as it is (M2), lag included.
    logFood({ food: energy(), serving: { label: '1 can (500 ml)', grams: 503 }, quantity: 2, meal: 'snack', date: TODAY, entryId: entry.id });
    expect(W(water.id).ml).toBe(500);
    // The next amount edit recomputes it from the entry, never scaled from the old volume.
    logFood({ food: energy(), serving: { label: '1 can (500 ml)', grams: 503 }, quantity: 3, meal: 'snack', date: TODAY, entryId: entry.id });
    expect(W(water.id).ml).toBe(1500);
  });

  it('the Undo of a log, a clear and a copy reach the water through the store', () => {
    const one = logInDiary(useStore);
    const two = logInDiary(useStore, '1 can (8.4 fl oz)');
    // "Cleared lunch" and its Undo remove and restore entries one by one.
    for (const id of [one.entry.id, two.entry.id]) S().remove('foodEntries', id);
    expect(liveWater()).toHaveLength(0);
    for (const id of [one.entry.id, two.entry.id]) S().restore('foodEntries', id);
    expect(liveWater().map((w) => w.ml).sort()).toEqual([248, 500]);
  });

  it('undoEdit on its own: both back with one stamp while the water is live', () => {
    const { entry, water } = logInDiary(useStore);
    const before = E(entry.id);
    const waterBefore = W(water.id);
    setEntryAmount(E(entry.id), 2);
    undoEdit(before, waterBefore);
    expect(E(entry.id).quantity).toBe(1);
    expect(W(water.id).ml).toBe(500);
    expect(W(water.id).updatedAt).toBe(E(entry.id).updatedAt);
    // Deleted as a pair since (in the diary): the edit's Undo brings back neither.
    setEntryAmount(E(entry.id), 2);
    S().remove('foodEntries', entry.id);
    undoEdit(before, waterBefore);
    expect(E(entry.id).deleted).toBe(true);
    expect(W(water.id).deleted).toBe(true);
  });

  it('a Water-origin pair keeps its rules: refused moves, and a pair deleted on Water is not half revived by an edit Undo', () => {
    const { water, entry } = logDrink(plan());
    const before = S().foodEntries[entry!.id];
    setEntryAmount(before, 1.5);
    const waterAfterEdit = S().water[water.id];
    expect(waterAfterEdit.ml).toBe(375);
    removeDrink(S().water[water.id]);
    undoEdit(before, S().water[water.id].deleted ? { ...waterAfterEdit, ml: 250 } : null);
    expect(S().foodEntries[entry!.id].deleted).toBe(true);
    expect(S().water[water.id].deleted).toBe(true);
  });

  it('the export and an import carry the link; the restored pair cascades again', () => {
    const { entry, water } = logInDiary(useStore);
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
    expect((parsed.backup.collections.water[0] as WaterEntry).fromEntryId).toBe(entry.id);
    S().resetAll();
    const merged = mergeCollections(Object.fromEntries(COLLECTIONS.map((c) => [c, {}])) as never, parsed.backup.collections);
    S().hydrate(merged.collections as never);
    deleteEntry(S().foodEntries[entry.id]);
    expect(S().water[water.id].deleted).toBe(true);
    undo();
    expect(S().water[water.id].deleted).toBe(false);
  });
});

describe('two phones, a drink logged in the diary', () => {
  type Phone = { store: typeof useStore; log: typeof import('@/features/food/log') };
  async function phone(): Promise<Phone> {
    vi.resetModules();
    return { store: (await import('@/store')).useStore, log: await import('@/features/food/log') };
  }
  function sync(a: Phone, b: Phone) {
    const records = (p: Phone) =>
      COLLECTIONS.flatMap((collection) => Object.values(p.store.getState()[collection] as Record<string, SyncedRecord>).map((record) => ({ collection, record })));
    const fromA = records(a);
    const fromB = records(b);
    const pulledAt = new Date().toISOString();
    a.store.getState().mergeRemote({ records: fromB, pulledAt });
    b.store.getState().mergeRemote({ records: fromA, pulledAt });
  }
  const sleep = () => new Promise((r) => setTimeout(r, 3));
  /** Never counted twice: at most one live water record per entry, and none for an entry that is not a drink. */
  function once(p: Phone) {
    const s = p.store.getState();
    const linked = Object.values(s.water).filter((w) => !w.deleted && w.fromEntryId).map((w) => w.fromEntryId);
    expect(new Set(linked).size).toBe(linked.length);
  }
  async function pairOnBoth() {
    const a = await phone();
    const b = await phone();
    const { entry, water } = logInDiary(a.store);
    sync(a, b);
    await sleep();
    return { a, b, entryId: entry.id, waterId: water.id };
  }
  const st = (p: Phone) => p.store.getState();

  it('logged on one phone counts once on both', async () => {
    const { a, b, waterId } = await pairOnBoth();
    sync(a, b);
    for (const p of [a, b]) {
      expect(Object.values(st(p).water).filter((w) => !w.deleted).map((w) => w.id)).toEqual([waterId]);
      once(p);
    }
  });

  it('an older app deletes the entry (no cascade there): the water stays as a plain row on both', async () => {
    const { a, b, entryId, waterId } = await pairOnBoth();
    // The older app's remove: the entry alone, as its store does.
    b.store.setState((s) => ({ foodEntries: { ...s.foodEntries, [entryId]: { ...s.foodEntries[entryId], deleted: true, updatedAt: new Date().toISOString() } } }));
    sync(a, b);
    for (const p of [a, b]) {
      expect(st(p).foodEntries[entryId].deleted).toBe(true);
      expect(st(p).water[waterId].deleted).toBe(false);
      once(p);
    }
  });

  it('an older app deletes the water: the entry stays on both', async () => {
    const { a, b, entryId, waterId } = await pairOnBoth();
    b.store.getState().remove('water', waterId);
    sync(a, b);
    for (const p of [a, b]) {
      expect(st(p).water[waterId].deleted).toBe(true);
      expect(st(p).foodEntries[entryId].deleted).toBe(false);
    }
  });

  it('A deletes on Water, B edits the amount later: both live with B amount (the edit wins, as for the Water pair)', async () => {
    const { a, b, entryId, waterId } = await pairOnBoth();
    a.log.removeDrink(st(a).water[waterId]);
    await sleep();
    b.log.setEntryAmount(st(b).foodEntries[entryId], 2);
    sync(a, b);
    for (const p of [a, b]) {
      expect(st(p).water[waterId]).toMatchObject({ deleted: false, ml: 1000 });
      expect(st(p).foodEntries[entryId]).toMatchObject({ deleted: false, quantity: 2 });
      once(p);
    }
  });

  it('A deletes on Water after B edits: the water stays deleted, the entry keeps B amount', async () => {
    const { a, b, entryId, waterId } = await pairOnBoth();
    b.log.setEntryAmount(st(b).foodEntries[entryId], 2);
    await sleep();
    a.log.removeDrink(st(a).water[waterId]);
    sync(a, b);
    for (const p of [a, b]) {
      expect(st(p).water[waterId].deleted).toBe(true);
      expect(st(p).foodEntries[entryId]).toMatchObject({ deleted: false, quantity: 2 });
    }
  });

  it("A deletes in the diary, B deletes on Water, B taps Undo: the water comes back alone, a plain row counted once", async () => {
    const { a, b, entryId, waterId } = await pairOnBoth();
    a.log.deleteEntry(st(a).foodEntries[entryId]);
    await sleep();
    b.log.removeDrink(st(b).water[waterId]);
    const bUndo = toasts[toasts.length - 1].opts!.onPress!;
    await sleep();
    sync(a, b);
    bUndo();
    sync(a, b);
    for (const p of [a, b]) {
      expect(st(p).foodEntries[entryId].deleted).toBe(true);
      expect(st(p).water[waterId].deleted).toBe(false);
      once(p);
    }
  });

  it("B deletes on Water, A deletes in the diary and taps Undo: A's Undo brings back only what A's act removed", async () => {
    const { a, b, entryId, waterId } = await pairOnBoth();
    b.log.removeDrink(st(b).water[waterId]);
    sync(a, b);
    await sleep();
    a.log.deleteEntry(st(a).foodEntries[entryId]);
    toasts[toasts.length - 1].opts!.onPress!();
    sync(a, b);
    for (const p of [a, b]) {
      expect(st(p).foodEntries[entryId].deleted).toBe(false);
      expect(st(p).water[waterId].deleted).toBe(true);
    }
  });

  it('both phones write the same entry again (an edit on each): still one water record', async () => {
    const { a, b, entryId } = await pairOnBoth();
    a.log.setEntryAmount(st(a).foodEntries[entryId], 2);
    await sleep();
    b.log.setEntryAmount(st(b).foodEntries[entryId], 3);
    sync(a, b);
    for (const p of [a, b]) {
      expect(Object.values(st(p).water).filter((w) => !w.deleted)).toHaveLength(1);
      expect(Object.values(st(p).water).find((w) => !w.deleted)!.ml).toBe(1500);
      once(p);
    }
  });
});
