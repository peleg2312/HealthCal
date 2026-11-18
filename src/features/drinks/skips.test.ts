/**
 * Drinks from the water screen (`via: 'water'`) count for calories and nothing else: they stay out of
 * usual foods, the streak, the logging calendar and the morning page's "food logged". Plus the
 * backup's checks, the remembered choice and the words.
 */
import { describe, expect, it } from 'vitest';

import { usualFoods } from '@/features/food/usuals';
import { recapDayCups } from '@/features/progress/recapDays';
import { recapLine } from '@/features/today/recapLine';
import { dayFacts } from '@/features/morning/facts';
import { isValidRecord } from '@/features/settings/exportFormat';
import { addDays } from '@/lib/dates';
import { computeConsistency, foodLoggedDates } from '@/store/selectors';
import type { FoodEntry } from '@/types';

import { DRINK_CHOICES, PICK_CHIP } from './choices';
import { hasFoodLogged } from './via';
import { DRINK_CHOICE_KEY, loadDrinkMemory, parseDrinkMemory, rememberDrinkChoice, resetDrinkMemoryForTests, useDrinkMemory } from './memory';
import {
  ALSO_IN_WATER,
  DRINKS_NOT_COPIED,
  DRINKS_NOT_SAVED,
  builtinFood,
  detailDrinkNote,
  enteredKcalError,
  noticeLine,
  pairEditProblem,
  pickedToast,
  planDrink,
  removedEntryToast,
  removedWaterToast,
  selectChoice,
  waterRowCaption,
} from './rules';

const TODAY = '2026-11-18';
let n = 0;
const entry = (date: string, over: Partial<FoodEntry> = {}): FoodEntry => ({
  id: `e${++n}`,
  updatedAt: 'x',
  date,
  meal: 'breakfast',
  name: 'Milk, reduced fat (2%)',
  foodId: 'b_milk_2pct',
  source: 'builtin',
  verified: true,
  servingLabel: '250 ml',
  quantity: 1,
  grams: 257.8,
  nutrients: { kcal: 128.9, protein: 8.5, carbs: 12.4, fat: 5.1 },
  food: builtinFood('b_milk_2pct')!,
  loggedAt: `${date}T08:00:00.000Z`,
  ...over,
});
const drink = (date: string) => entry(date, { via: 'water' });

describe('usual foods', () => {
  it('a daily glass from Water is never "usual"; the same milk logged in the diary is', () => {
    const days = [1, 2, 3, 4, 5].map((d) => addDays(TODAY, -d));
    expect(usualFoods(days.map(drink), 'breakfast', TODAY)).toEqual([]);
    expect(usualFoods(days.map((d) => entry(d)), 'breakfast', TODAY).map((u) => u.key)).toEqual(['b_milk_2pct']);
  });
});

describe('the streak and the logging calendar', () => {
  it('a day with only drinks from Water is not a food-logged day', () => {
    const list = [entry(addDays(TODAY, -3)), drink(addDays(TODAY, -2)), drink(addDays(TODAY, -1)), entry(TODAY, { deleted: true })];
    expect([...foodLoggedDates(list)]).toEqual([addDays(TODAY, -3)]);
    // As for a water-only person before drinks had calories: two days without food end the run.
    expect(computeConsistency(foodLoggedDates(list), TODAY).streak).toBe(0);
    expect(computeConsistency(foodLoggedDates([...list, entry(addDays(TODAY, -1))]), TODAY).streak).toBe(2);
  });
});

describe('one meaning of "logged"', () => {
  const summary = (date: string, entries: FoodEntry[]) =>
    ({ date, entries, eaten: { kcal: entries.reduce((n, e) => n + e.nutrients.kcal, 0), protein: 0, carbs: 0, fat: 0 }, budget: 2000, activities: [], waterEntries: [] }) as never;
  it('hasFoodLogged: a drink from Water never makes a day or a meal logged', () => {
    expect(hasFoodLogged([])).toBe(false);
    expect(hasFoodLogged([drink(TODAY)])).toBe(false);
    expect(hasFoodLogged([drink(TODAY), entry(TODAY)])).toBe(true);
  });
  it("the recap's cups and line: a day of drinks only reads as not logged", () => {
    const monday = '2026-11-16';
    const cups = recapDayCups(monday, [summary(monday, [drink(monday)]), summary('2026-11-17', [entry('2026-11-17')])], TODAY);
    expect(cups[0]).toMatchObject({ logged: false, ratio: 0 });
    expect(cups[0].detail).toMatch(/not logged$/);
    expect(cups[1].logged).toBe(true);
    expect(recapLine([summary(monday, [drink(monday)]), summary('2026-11-17', [entry('2026-11-17')])] as never)).toBe('Logged 1 of 2 days');
  });
});

describe('the morning page', () => {
  const day = (entries: FoodEntry[]) => ({
    date: TODAY,
    entries,
    eaten: { kcal: entries.reduce((s, e) => s + e.nutrients.kcal, 0), protein: 8.5 },
    budget: 2190,
    macros: { proteinG: 150 },
    waterMl: 225,
    waterGoalMl: 2500,
    waterEntries: [{}],
    activities: [],
  });
  it('drinks only: not food logged (the water-only path), the calories still in the day', () => {
    const f = dayFacts(day([drink(TODAY)]));
    expect(f.foodLogged).toBe(false);
    expect(f.hasWater).toBe(true);
    expect(f.kcal).toBeCloseTo(128.9, 1);
  });
  it('a drink beside food: food logged', () => {
    expect(dayFacts(day([drink(TODAY), entry(TODAY)])).foodLogged).toBe(true);
  });
});

describe('the backup checks', () => {
  const water = { id: '00000000-0000-4000-8000-00000000d101', updatedAt: '2026-11-18T08:05:00.000Z', date: TODAY, ml: 250, beverage: 'milk', loggedAt: '2026-11-18T08:05:00.000Z' };
  it('water with what it was and its entry is valid; a non-UUID link or a long drink id is not', () => {
    expect(isValidRecord('water', water)).toBe(true);
    expect(isValidRecord('water', { ...water, drink: 'milk_semi', foodEntryId: '00000000-0000-4000-8000-00000000d001' })).toBe(true);
    expect(isValidRecord('water', { ...water, foodEntryId: 'e1' })).toBe(false);
    expect(isValidRecord('water', { ...water, drink: 'x'.repeat(65) })).toBe(false);
    expect(isValidRecord('water', { ...water, drink: 3 })).toBe(false);
  });
  it("an entry's via is 'water' or absent", () => {
    const e = { ...entry(TODAY), id: '00000000-0000-4000-8000-00000000d001', updatedAt: '2026-11-18T08:05:00.000Z' };
    expect(isValidRecord('foodEntries', e)).toBe(true);
    expect(isValidRecord('foodEntries', { ...e, via: 'water' })).toBe(true);
    expect(isValidRecord('foodEntries', { ...e, via: 'x' })).toBe(false);
  });
});

describe('the remembered choice', () => {
  it('parses only what has the right shape', () => {
    expect(parseDrinkMemory(null)).toEqual({});
    expect(parseDrinkMemory('not json')).toEqual({});
    expect(parseDrinkMemory('[1]')).toEqual({});
    const food = builtinFood('b_grape_juice')!;
    const raw = JSON.stringify({ milk: { id: 'milk_whole' }, juice: { id: 'food', food }, other: { id: 'kcal' }, water: { id: 'x' }, tea: { id: 5 }, coffee: { id: 'food', food: { id: 'bad' } } });
    expect(parseDrinkMemory(raw)).toEqual({ milk: { id: 'milk_whole' }, juice: { id: 'food', food } });
  });

  it('is kept on the device under its own key and read back once', async () => {
    resetDrinkMemoryForTests();
    rememberDrinkChoice('milk', selectChoice(DRINK_CHOICES.find((c) => c.id === 'milk_oat')!));
    rememberDrinkChoice('water', { id: 'x', food: null });
    await new Promise((r) => setTimeout(r, 0));
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    expect(JSON.parse((await AsyncStorage.getItem(DRINK_CHOICE_KEY))!)).toEqual({ milk: { id: 'milk_oat' } });
    resetDrinkMemoryForTests();
    expect(useDrinkMemory.getState().loaded).toBe(false);
    await loadDrinkMemory();
    expect(useDrinkMemory.getState()).toEqual({ memory: { milk: { id: 'milk_oat' } }, loaded: true });
  });
});

describe('words', () => {
  it('no exclamation marks, no "should", sentence case', () => {
    const p = (o: Partial<Parameters<typeof planDrink>[0]>) =>
      planDrink({ kind: 'milk', drink: selectChoice(DRINK_CHOICES.find((c) => c.id === 'milk_semi')!), ml: 250, date: TODAY, now: new Date(2026, 10, 18, 13), today: TODAY, units: 'metric', ...o });
    const plans = [
      p({}),
      p({ amount: 'custom', ml: 330 }),
      p({ waterOnly: true }),
      p({ kind: 'coffee', drink: selectChoice(DRINK_CHOICES.find((c) => c.id === 'coffee_black')!) }),
      p({ kind: 'other', drink: { id: 'kcal', food: null }, kcal: 120 }),
      p({ kind: 'water', drink: null }),
    ];
    const e = entry(TODAY);
    const words = [
      ...plans.flatMap((x) => [x.toast, x.line, x.tile, x.label]),
      ...DRINK_CHOICES.map((c) => c.label),
      ...Object.values(PICK_CHIP).map((c) => c!.label),
      noticeLine(e),
      waterRowCaption(e, TODAY),
      removedWaterToast({ ml: 250, beverage: 'milk' }, e, 'metric'),
      removedEntryToast(e.name, { ml: 250 }, 'metric'),
      detailDrinkNote({ ml: 250 }, 'metric'),
      detailDrinkNote({ ml: 250 }, 'metric', false),
      enteredKcalError(15000),
      enteredKcalError(0),
      pickedToast(e),
      pairEditProblem({ ml: 250 }, { grams: 258, date: TODAY }, { grams: 258, date: addDays(TODAY, 1) }, TODAY, 'metric')?.text,
      pairEditProblem({ ml: 250 }, { grams: 258, date: TODAY }, { grams: 258 * 50, date: TODAY }, TODAY, 'metric')?.text,
      DRINKS_NOT_SAVED,
      DRINKS_NOT_COPIED,
    ].filter((w): w is string => !!w);
    for (const w of words) {
      expect(w, w).not.toMatch(/!/);
      expect(w, w).not.toMatch(/\bshould\b|\bfailed\b|\bbad\b|\bcheat/i);
      if (/^\d/.test(w)) continue;
      expect(w[0], w).toBe(w[0].toUpperCase());
    }
    expect(ALSO_IN_WATER).toBe('also in Water');
  });
});
