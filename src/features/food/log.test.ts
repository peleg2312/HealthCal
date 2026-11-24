/**
 * A drink logged as food in the diary also adds its volume to Water: the write paths of the food log
 * and the diary actions, with real store calls and the toasts they raise. Water is created only by
 * logFood (a new entry) and logItems (and through it copies, saved meals and the reminder's Repeat);
 * every Undo is carried by the store's cascade; edits recompute the water and never create or remove it.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Toast = { message: string; opts?: { label?: string; onPress?: () => void } };
const toasts: Toast[] = [];
vi.mock('@/ui', () => ({
  toast: (message: string, opts?: Toast['opts']) => toasts.push({ message, opts }),
  haptic: { success: () => {}, tap: () => {}, press: () => {}, select: () => {}, warn: () => {} },
}));

import { BUILTIN_FOODS } from '@/data/foods';
import { waterIdFromEntry } from '@/features/drinks/via';
import { useStore } from '@/store';
import type { Food, FoodEntry, Profile, SavedMeal, SavedMealItem, WaterEntry } from '@/types';

import { clearEntries, copyEntries, copyPreviousMeal, updateEntryDirect } from './actions';
import { deleteEntry, logAndSaveMeal, logDrink, logFood, logItems, logQuickAdd, logSavedMeal, removeDrink, setEntryAmount, toSavedMealItem } from './log';
import { planDrink, selectFood } from '@/features/drinks/rules';

const S = () => useStore.getState();
const food = (id: string): Food => BUILTIN_FOODS.find((f) => f.id === id)!;
const serving = (f: Food, label: string) => f.servings.find((s) => s.label === label)!;
const TODAY = '2026-11-19';
const YESTERDAY = '2026-11-18';
let clock = Date.parse(`${TODAY}T12:40:00.000Z`);

const lastToast = () => toasts[toasts.length - 1];
const undo = () => lastToast().opts!.onPress!();
const liveWater = (): WaterEntry[] => Object.values(S().water).filter((w) => !w.deleted);
const stored = (e: FoodEntry): FoodEntry => S().foodEntries[e.id];
const liveEntries = (): FoodEntry[] => Object.values(S().foodEntries).filter((e) => !e.deleted);
const tick = (ms = 1000) => {
  clock += ms;
  vi.setSystemTime(clock);
};

function setProfile(patch: Partial<Profile> = {}) {
  S().setProfile({ units: 'metric', name: 'Test', ...patch } as Partial<Profile>);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  clock = Date.parse(`${TODAY}T12:40:00.000Z`);
  vi.setSystemTime(clock);
  S().resetAll();
  setProfile();
  toasts.length = 0;
});
afterEach(() => vi.useRealTimers());

const energy = food('b_energy_drink');
const can = serving(energy, '1 can (500 ml)');
const logCan = (over: Partial<{ quantity: number; date: string; meal: FoodEntry['meal'] }> = {}) =>
  logFood({ food: energy, serving: can, quantity: over.quantity ?? 1, meal: over.meal ?? 'lunch', date: over.date ?? TODAY });

describe('logFood, a new entry', () => {
  it('a drink: the entry and its water in one act, one toast that names the drink and says both', () => {
    const entry = logCan();
    const water = S().water[waterIdFromEntry(entry.id)];
    expect(water).toMatchObject({ fromEntryId: entry.id, ml: 500, date: TODAY, beverage: 'other', loggedAt: entry.loggedAt, deleted: false });
    expect(water.updatedAt).toBe(entry.updatedAt);
    expect(lastToast().message).toBe('Energy drink added to lunch, 500 ml to Water');
  });

  it('Undo of the log takes both back', () => {
    const entry = logCan();
    undo();
    expect(S().foodEntries[entry.id].deleted).toBe(true);
    expect(S().water[waterIdFromEntry(entry.id)].deleted).toBe(true);
  });

  it('a food that is not a drink writes no water, and the toast names the food first', () => {
    const banana = food('b_banana');
    logFood({ food: banana, serving: banana.servings[0], quantity: 1, meal: 'breakfast', date: TODAY });
    expect(liveWater()).toHaveLength(0);
    expect(lastToast().message).toBe('Banana added to breakfast');
  });

  it('the switch off: no water, the toast as before', () => {
    setProfile({ diaryDrinksInWater: false });
    logCan();
    expect(liveWater()).toHaveLength(0);
    expect(lastToast().message).toBe('Energy drink added to lunch');
  });

  it('imperial units, another day: ", 17 fl oz to Water"', () => {
    setProfile({ units: 'imperial' });
    logCan({ date: YESTERDAY, meal: 'breakfast' });
    expect(lastToast().message).toBe("Energy drink added to yesterday's breakfast, 17 fl oz to Water");
  });

  it('a bundled name is said as drawn and short: "Oats added to breakfast", never its capitals', () => {
    const oats = BUILTIN_FOODS.find((f) => /DRY/.test(f.name))!;
    logFood({ food: oats, serving: oats.servings[0], quantity: 1, meal: 'breakfast', date: TODAY });
    expect(lastToast().message).toBe(`${oats.name.split(',')[0]} added to breakfast`);
    expect(lastToast().message).not.toMatch(/\b[A-Z]{2,}\b/);
  });

  it('a quick add names itself, or its calories when it has no name', () => {
    logQuickAdd({ name: 'Birthday cake', nutrients: { kcal: 420, protein: 5, carbs: 50, fat: 20 }, meal: 'snack', date: TODAY });
    expect(lastToast().message).toBe('Birthday cake added to snacks');
    logQuickAdd({ name: '  ', nutrients: { kcal: 1320, protein: 0, carbs: 0, fat: 0 }, meal: 'lunch', date: YESTERDAY });
    expect(lastToast().message).toBe("1,320 kcal added to yesterday's lunch");
  });

  it('a future day: the water sits on that day', () => {
    const entry = logCan({ date: '2026-11-21' });
    expect(S().water[waterIdFromEntry(entry.id)].date).toBe('2026-11-21');
  });
});

describe('edits follow the entry (rewriteEntry, setEntryAmount, updateEntryDirect)', () => {
  it('the stepper recomputes the water from the entry and stays silent; at zero the water goes, and Undo brings both', () => {
    const entry = logCan();
    const id = waterIdFromEntry(entry.id);
    tick();
    const n = toasts.length;
    const two = setEntryAmount(S().foodEntries[entry.id], 2)!;
    expect(toasts.length).toBe(n);
    expect(S().water[id].ml).toBe(1000);
    expect(S().water[id].updatedAt).toBe(S().foodEntries[two.id].updatedAt);
    tick();
    expect(setEntryAmount(S().foodEntries[entry.id], 0)).toBeNull();
    expect(S().foodEntries[entry.id].deleted).toBe(true);
    expect(S().water[id].deleted).toBe(true);
    expect(lastToast().message).toBe('Energy drink removed from lunch and its 1 L from Water');
    undo();
    expect(S().foodEntries[entry.id].deleted).toBe(false);
    expect(S().water[id]).toMatchObject({ deleted: false, ml: 1000 });
  });

  it('the stepper never removes the water, even under the creation minimum', () => {
    const entry = logCan();
    tick();
    setEntryAmount(S().foodEntries[entry.id], 0.05);
    expect(S().water[waterIdFromEntry(entry.id)]).toMatchObject({ deleted: false, ml: 25 });
  });

  it('an edit in food detail moves the water to the new day and amount; its Undo puts both back', () => {
    const entry = logCan();
    const id = waterIdFromEntry(entry.id);
    tick();
    logFood({ food: energy, serving: serving(energy, '1 can (16 fl oz)'), quantity: 1, meal: 'dinner', date: YESTERDAY, entryId: entry.id });
    expect(lastToast().message).toMatch(/ moved to yesterday's dinner$/);
    expect(S().water[id]).toMatchObject({ ml: 473, date: YESTERDAY, deleted: false });
    tick();
    undo();
    expect(S().foodEntries[entry.id]).toMatchObject({ meal: 'lunch', date: TODAY, servingLabel: '1 can (500 ml)' });
    expect(S().water[id]).toMatchObject({ ml: 500, date: TODAY, deleted: false });
  });

  it('an edit never creates water: an entry logged with the switch off stays without it', () => {
    setProfile({ diaryDrinksInWater: false });
    const entry = logCan();
    setProfile({ diaryDrinksInWater: true });
    tick();
    setEntryAmount(S().foodEntries[entry.id], 2);
    expect(liveWater()).toHaveLength(0);
  });

  it("the edit's Undo keeps water the person deleted on Water in between deleted", () => {
    const entry = logCan();
    const id = waterIdFromEntry(entry.id);
    tick();
    logFood({ food: energy, serving: can, quantity: 2, meal: 'lunch', date: TODAY, entryId: entry.id });
    const editUndo = lastToast().opts!.onPress!;
    tick();
    removeDrink(S().water[id]);
    tick();
    editUndo();
    expect(S().foodEntries[entry.id]).toMatchObject({ quantity: 1, deleted: false });
    expect(S().water[id].deleted).toBe(true);
  });

  it('updateEntryDirect (a typed change) moves the water with the day, and Undo', () => {
    const entry = logCan();
    const id = waterIdFromEntry(entry.id);
    tick();
    updateEntryDirect(S().foodEntries[entry.id], { name: 'Monster', nutrients: { kcal: 230, protein: 0, carbs: 56, fat: 0 }, meal: 'lunch', date: YESTERDAY });
    expect(S().water[id]).toMatchObject({ date: YESTERDAY, ml: 500, deleted: false });
    tick();
    undo();
    expect(S().water[id]).toMatchObject({ date: TODAY, deleted: false });
  });
});

describe('deletes', () => {
  it('in the diary: the water goes with the entry, the toast says so, Undo restores both', () => {
    const entry = logCan();
    tick();
    deleteEntry(S().foodEntries[entry.id]);
    expect(lastToast().message).toBe('Energy drink removed from lunch and its 500 ml from Water');
    expect(liveWater()).toHaveLength(0);
    undo();
    expect(liveWater()).toHaveLength(1);
    expect(S().foodEntries[entry.id].deleted).toBe(false);
  });

  it('on Water: only the water goes, the entry stays; Undo restores the water with its link', () => {
    const entry = logCan();
    const id = waterIdFromEntry(entry.id);
    tick();
    removeDrink(S().water[id]);
    expect(lastToast().message).toBe('Removed 500 ml. The drink stays in lunch.');
    expect(S().foodEntries[entry.id].deleted).toBe(false);
    expect(S().water[id].deleted).toBe(true);
    undo();
    expect(S().water[id]).toMatchObject({ deleted: false, fromEntryId: entry.id });
  });

  it('deleted on Water, then the entry deleted in the diary: its Undo brings back the entry only', () => {
    const entry = logCan();
    const id = waterIdFromEntry(entry.id);
    tick();
    removeDrink(S().water[id]);
    tick();
    deleteEntry(S().foodEntries[entry.id]);
    expect(lastToast().message).toBe('Energy drink removed from lunch');
    undo();
    expect(S().foodEntries[entry.id].deleted).toBe(false);
    expect(S().water[id].deleted).toBe(true);
  });

  it('clearing a meal takes the drinks\' water; its Undo brings it back', () => {
    const a = logCan();
    const banana = food('b_banana');
    logFood({ food: banana, serving: banana.servings[0], quantity: 1, meal: 'lunch', date: TODAY });
    tick();
    clearEntries(liveEntries(), 'lunch');
    expect(liveEntries()).toHaveLength(0);
    expect(liveWater()).toHaveLength(0);
    undo();
    expect(liveEntries()).toHaveLength(2);
    expect(S().water[waterIdFromEntry(a.id)].deleted).toBe(false);
  });

  it('a drink logged on Water keeps its old rules (the entry deleted in the diary leaves the water)', () => {
    const milk = food('b_milk_2pct');
    const { entry, water } = logDrink(planDrink({ kind: 'milk', drink: selectFood(milk), ml: 250, date: TODAY, now: new Date(clock), today: TODAY, units: 'metric', waterOnly: false, amount: 'glass' }));
    expect(entry).not.toBeNull();
    expect(S().water[waterIdFromEntry(entry!.id)]).toBeUndefined();
    tick();
    deleteEntry(S().foodEntries[entry!.id]);
    expect(lastToast().message).toBe('Milk removed from lunch. The 250 ml stays in Water.');
    expect(S().water[water.id].deleted).toBe(false);
  });
});

describe('logItems and what goes through it', () => {
  it('several items: each drink adds its water, one summed clause, one Undo for all', () => {
    const banana = food('b_banana');
    const items = [
      { ...toSavedMealItem(stored(logCan())) },
      { ...toSavedMealItem(stored(logFood({ food: banana, serving: banana.servings[0], quantity: 1, meal: 'lunch', date: TODAY }))) },
      { ...toSavedMealItem(stored(logCan({ quantity: 0.5 }))) },
    ];
    S().resetAll();
    setProfile();
    const out = logItems(items, 'lunch', TODAY);
    expect(out).toHaveLength(3);
    expect(liveWater().map((w) => w.ml).sort()).toEqual([250, 500]);
    expect(lastToast().message).toBe('3 items added to lunch, 750 ml to Water');
    undo();
    expect(liveWater()).toHaveLength(0);
    expect(liveEntries()).toHaveLength(0);
  });

  it("the reminder's Repeat label: \"Yesterday's lunch added, 500 ml to Water\"", () => {
    const item = toSavedMealItem(stored(logCan({ date: YESTERDAY })));
    logItems([item], 'lunch', TODAY, "Yesterday's lunch added");
    expect(lastToast().message).toBe("Yesterday's lunch added, 500 ml to Water");
  });

  it('a saved meal: each drink line counts; a recipe logged as one line never does', () => {
    const item = toSavedMealItem(stored(logCan()));
    const meal = S().upsert('savedMeals', { name: 'Gym lunch', items: [item] }) as SavedMeal;
    logSavedMeal(meal, 'dinner', TODAY);
    expect(lastToast().message).toBe('Gym lunch added to dinner, 500 ml to Water');
    const recipe = S().upsert('savedMeals', { name: 'Shake recipe', items: [item, item], servings: 2 }) as SavedMeal;
    const before = liveWater().length;
    logSavedMeal(recipe, 'dinner', TODAY);
    expect(liveWater().length).toBe(before);
  });

  it('an AI row: unswapped never counts, swapped for a bundled drink counts by its grams', () => {
    const ai: Food = { ...energy, id: 'ai_x', source: 'ai', servings: [{ label: '500 g', grams: 500 }] };
    const latte = food('b_latte');
    logItems(
      [
        { name: 'Energy drink', servingLabel: '500 g', quantity: 1, grams: 500, nutrients: { kcal: 215, protein: 0, carbs: 51, fat: 0 }, food: ai, source: 'ai', verified: false },
        { name: latte.name, servingLabel: '1 g', quantity: 240, grams: 240, nutrients: { kcal: 130, protein: 8, carbs: 12, fat: 5 }, food: latte, source: 'builtin', verified: true },
      ],
      'breakfast',
      TODAY,
    );
    expect(liveWater()).toHaveLength(1);
    expect(liveWater()[0]).toMatchObject({ beverage: 'coffee' });
  });

  it('a copy: one toast with the summed clause; its Undo takes the entries and their water', () => {
    logCan({ date: YESTERDAY });
    logCan({ date: YESTERDAY, quantity: 0.5 });
    tick();
    toasts.length = 0;
    expect(copyPreviousMeal(TODAY, 'lunch')).toBe(true);
    expect(toasts).toHaveLength(1);
    expect(lastToast().message).toBe('Copied lunch from yesterday, 750 ml to Water');
    expect(liveWater().filter((w) => w.date === TODAY).map((w) => w.ml).sort()).toEqual([250, 500]);
    undo();
    expect(liveWater().filter((w) => w.date === TODAY)).toHaveLength(0);
    expect(liveWater().filter((w) => w.date === YESTERDAY)).toHaveLength(2);
  });

  it("a copy of food only keeps the caller's message as it was", () => {
    const banana = food('b_banana');
    const e = logFood({ food: banana, serving: banana.servings[0], quantity: 1, meal: 'lunch', date: YESTERDAY });
    copyEntries([S().foodEntries[e.id]], TODAY, 'lunch', 'Copied 1 to today');
    expect(lastToast().message).toBe('Copied 1 to today');
  });

  it('a drink logged on Water is not copied, and adds nothing', () => {
    const milk = food('b_milk_2pct');
    const { entry } = logDrink(planDrink({ kind: 'milk', drink: selectFood(milk), ml: 250, date: YESTERDAY, now: new Date(clock), today: TODAY, units: 'metric', waterOnly: false, amount: 'glass' }));
    const before = liveWater().length;
    copyEntries([S().foodEntries[entry!.id]], TODAY);
    expect(liveWater().length).toBe(before);
  });
});

describe('logAndSaveMeal (the AI review with "Also save as a meal" on)', () => {
  const aiItem = (name: string, kcal: number, extra: Partial<SavedMealItem> = {}): SavedMealItem => ({
    name,
    emoji: '🍗',
    servingLabel: '1 portion (150 g)',
    quantity: 1,
    grams: 150,
    nutrients: { kcal, protein: 20, carbs: 10, fat: 5 },
    food: { id: `ai_${name}`, name, source: 'ai', verified: false, per100g: { kcal, protein: 20, carbs: 10, fat: 5 }, servings: [{ label: '1 portion (150 g)', grams: 150 }] } as Food,
    source: 'ai',
    verified: false,
    ...extra,
  });
  const items = (): SavedMealItem[] => [
    aiItem('Grilled chicken', 248, { kcalRange: [200, 300], confidence: 0.7 }),
    aiItem('Rice', 205, { kcalRange: [170, 240], confidence: 0.8 }),
    // The fat answer's row (1 tsp oil), as rowsToLogItems writes it.
    aiItem('Added fat', 40, { kcalRange: [30, 50], confidence: 0.5 }),
  ];
  const liveMeals = () => Object.values(S().savedMeals).filter((m) => !m.deleted);

  it('writes the entries and one saved meal whose items are exactly what was logged', () => {
    const { entries, saved } = logAndSaveMeal(items(), 'lunch', TODAY, '  Chicken   and rice ');
    expect(entries).toHaveLength(3);
    expect(liveEntries()).toHaveLength(3);
    expect(liveMeals()).toHaveLength(1);
    expect(saved).not.toBeNull();
    expect(saved!.name).toBe('Chicken and rice');
    expect(saved!.items).toEqual(entries.map((e) => toSavedMealItem(stored(e))));
    expect(saved!.items[0]).toMatchObject({ source: 'ai', kcalRange: [200, 300], confidence: 0.7 });
    expect(saved!.items.every((it) => it.kcalRange)).toBe(true);
  });

  it('one toast that names the meal; its Undo takes back the entries and the meal', () => {
    toasts.length = 0;
    const { saved } = logAndSaveMeal(items(), 'lunch', TODAY, 'Chicken and rice');
    expect(toasts).toHaveLength(1);
    expect(lastToast().message).toBe('3 items added to lunch, saved as "Chicken and rice"');
    expect(lastToast().opts?.label).toBe('Undo');
    undo();
    expect(liveEntries()).toHaveLength(0);
    expect(S().savedMeals[saved!.id].deleted).toBe(true);
  });

  it('another day says which; an empty name becomes "Saved meal"; nothing logged saves nothing', () => {
    logAndSaveMeal(items().slice(0, 2), 'dinner', YESTERDAY, '   ');
    expect(lastToast().message).toBe('2 items added to yesterday\'s dinner, saved as "Saved meal"');
    const n = toasts.length;
    expect(logAndSaveMeal([], 'lunch', TODAY, 'X')).toEqual({ entries: [], saved: null });
    expect(toasts.length).toBe(n);
    expect(liveMeals()).toHaveLength(1);
  });

  it('a row swapped for a bundled drink adds its water, said once; Undo takes the water too', () => {
    const latte = food('b_latte');
    const drink: SavedMealItem = { name: latte.name, servingLabel: '1 g', quantity: 240, grams: 240, nutrients: { kcal: 130, protein: 8, carbs: 12, fat: 5 }, food: latte, source: 'builtin', verified: true, kcalRange: [110, 150], confidence: 0.6 };
    logAndSaveMeal([items()[0], drink], 'breakfast', TODAY, 'Chicken and latte');
    expect(lastToast().message).toBe('2 items added to breakfast, meal saved, 240 ml to Water');
    expect(liveWater()).toHaveLength(1);
    undo();
    expect(liveWater()).toHaveLength(0);
  });

  it('logging the saved estimate again keeps it an estimate (its range on every entry)', () => {
    const { saved } = logAndSaveMeal(items(), 'lunch', YESTERDAY, 'Chicken and rice');
    const again = logSavedMeal(S().savedMeals[saved!.id], 'lunch', TODAY);
    expect(again).toHaveLength(3);
    expect(again.every((e) => Array.isArray(e.kcalRange))).toBe(true);
    expect(lastToast().message).toBe('Chicken and rice added to lunch');
  });

  it('this file reaches no AI service, directly or through its imports: saving and logging a saved estimate use no allowance', () => {
    const map = new Map<string, string[]>();
    for (const line of readFileSync(resolve(__dirname, '../../../docs/code-map/imports.tsv'), 'utf8').split('\n')) {
      const [file, ...deps] = line.split('\t');
      if (file) map.set(file, deps.filter(Boolean));
    }
    expect(map.get('src/features/food/log.ts')?.length).toBeGreaterThan(0);
    const seen = new Set<string>();
    const todo = ['src/features/food/log.ts'];
    while (todo.length) {
      const f = todo.pop()!;
      if (seen.has(f)) continue;
      seen.add(f);
      todo.push(...(map.get(f) ?? []));
    }
    expect(seen.has('src/services/aiFood.ts')).toBe(false);
    expect(seen.has('src/features/ai/api.ts')).toBe(false);
  });
});
