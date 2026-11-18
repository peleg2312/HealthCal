/**
 * Copies at today's values (L1, L2): an entry or saved-meal line of a bundled food is priced at today's values
 * for its own grams whenever it is copied, repeated or logged again, and the row that offers it shows that
 * total. Everything else (a person's own food, an online product, a quick add, an AI estimate, a drink from
 * Water) is copied as stored, and past entries are never rewritten. The shape is the stored one: after a
 * restart an entry of a bundled food holds today's food (src/store/persistence.ts attaches it on load) while
 * its label, grams and calories are those it was logged with.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/ui', () => ({ toast: () => {}, haptic: { success: () => {}, tap: () => {}, press: () => {}, select: () => {}, warn: () => {} } }));

import { BUILTIN_FOODS } from '@/data/foods';
import { mealRepeat } from '@/features/settings/reminderPlanner';
import { scaleNutrients } from '@/lib/nutrition';
import { useStore } from '@/store';
import type { Food, FoodEntry, SavedMeal, SavedMealItem } from '@/types';

import { copyEntries, findPreviousDay, findPreviousMeal, saveMeal } from './actions';
import { planSavedMeal } from './build';
import { lastPortions } from './helpers';
import { closeMealDraft, openMealDraft, useMealDraft } from './mealDraft';
import { logItems, logSavedMeal, toSavedMealItem } from './log';
import { currentKcal, currentValues, resolveUsuals, usualFoods, usualLabel } from './usuals';

const S = () => useStore.getState();
const liveOn = (date: string) => Object.values(S().foodEntries).filter((e) => !e.deleted && e.date === date);
const live = (id: string): Food => BUILTIN_FOODS.find((x) => x.id === id)!;

// The rows of 3fa7914, as they were logged.
const OLD: Record<string, { per100: Food['per100g']; label: string; gramsPerUnit: number; quantity: number }> = {
  b_bourekas_cheese: { per100: { kcal: 335, protein: 9, carbs: 28, fat: 21 }, label: '1 piece', gramsPerUnit: 80, quantity: 1 },
  b_halloumi: { per100: { kcal: 321, protein: 21, carbs: 2.2, fat: 25 }, label: '1 slice', gramsPerUnit: 30, quantity: 2 },
  b_schnitzel_chicken: { per100: { kcal: 255, protein: 20, carbs: 12, fat: 14 }, label: '1 piece', gramsPerUnit: 130, quantity: 1 },
};

const TODAY = '2026-11-18';
const YESTERDAY = '2026-11-17';
let k = 0;
const stamp = (date: string, min: number) => `${date}T12:${String(min).padStart(2, '0')}:00.000Z`;

/** What persistence.ts gives back for an entry of a bundled food logged at 3fa7914: JSON without the food, today's food attached. */
function reloadedBundled(id: string, date: string): FoodEntry {
  const o = OLD[id];
  const grams = o.gramsPerUnit * o.quantity;
  const saved = JSON.parse(
    JSON.stringify({
      id: `r-${k++}`, updatedAt: stamp(date, k), date, meal: 'lunch', name: live(id).name, foodId: id, source: 'builtin', verified: true,
      servingLabel: o.label, quantity: o.quantity, grams, nutrients: scaleNutrients(o.per100, grams), loggedAt: stamp(date, k),
    }),
  ) as FoodEntry;
  return { ...saved, food: live(id) };
}

const OWN: Food = { id: 'c_own', name: 'My granola', per100g: { kcal: 450, protein: 10, carbs: 60, fat: 18 }, servings: [{ label: '1 bowl', grams: 60 }], source: 'custom', verified: false };
const ONLINE: Food = { id: 'off_7290000000001', name: 'Hummus spread', brand: 'Store brand', per100g: { kcal: 250, protein: 7, carbs: 12, fat: 19 }, servings: [{ label: '1 tbsp', grams: 15 }], source: 'openfoodfacts', verified: false };

function entryOf(food: Food, label: string, grams: number, quantity: number, date: string, over: Partial<FoodEntry> = {}): FoodEntry {
  k++;
  return {
    id: `e-${k}`, updatedAt: stamp(date, k), date, meal: 'lunch', name: food.name, brand: food.brand, foodId: food.id, source: food.source, verified: food.verified,
    servingLabel: label, quantity, grams, nutrients: scaleNutrients(food.per100g, grams), food, loggedAt: stamp(date, k), ...over,
  };
}

/** Yesterday's lunch as a restart leaves it: three corrected bundled foods, an own food since edited, an online product, a quick add, an estimate and a drink from Water. */
function yesterdaysLunch(): FoodEntry[] {
  const own = entryOf(OWN, '1 bowl', 60, 1, YESTERDAY); // 270 kcal as logged
  const online = entryOf(ONLINE, '1 tbsp', 30, 2, YESTERDAY); // 75 kcal
  const quick = { ...entryOf(OWN, '1 serving', 0, 1, YESTERDAY), name: 'Coffee and cake', foodId: undefined, food: undefined, source: 'quick' as const, nutrients: { kcal: 320, protein: 5, carbs: 40, fat: 15 } };
  // An AI estimate matched to a bundled food keeps the person's reviewed numbers and its range.
  const ai = entryOf(live('b_bourekas_cheese'), '1 g', 100, 100, YESTERDAY, { nutrients: { kcal: 310, protein: 9, carbs: 26, fat: 20 }, kcalRange: [250, 370], confidence: 0.7 });
  const drink = entryOf(live('b_bourekas_cheese'), '1 piece', 80, 1, YESTERDAY, { via: 'water', nutrients: { kcal: 111, protein: 1, carbs: 1, fat: 1 } });
  return [reloadedBundled('b_bourekas_cheese', YESTERDAY), reloadedBundled('b_halloumi', YESTERDAY), reloadedBundled('b_schnitzel_chicken', YESTERDAY), own, online, quick, ai, drink];
}

function seed(entries: FoodEntry[], customFoods: Food[] = []) {
  useStore.setState({
    foodEntries: Object.fromEntries(entries.map((e) => [e.id, e])),
    customFoods: Object.fromEntries(customFoods.map((f) => [f.id, { ...f, updatedAt: stamp(YESTERDAY, 0) }])) as never,
  });
}

// The own food was edited since: its live record says 500 kcal per 100 g; the copy keeps what was logged.
const OWN_EDITED: Food = { ...OWN, per100g: { ...OWN.per100g, kcal: 500 } };

beforeEach(() => {
  S().resetAll();
});

describe('the rule (currentValues)', () => {
  it('prices a bundled food at today\'s values for its own grams, with its label through matchServing', () => {
    const [bourekas, halloumi, schnitzel] = yesterdaysLunch();
    const b = currentValues(bourekas);
    expect(b.grams).toBe(80);
    expect(b.quantity).toBe(1);
    expect(b.servingLabel).toBe('80 g');
    expect(Math.round(b.nutrients.kcal)).toBe(298);
    const h = currentValues(halloumi);
    expect([h.servingLabel, h.quantity, h.grams, Math.round(h.nutrients.kcal)]).toEqual(['30 g', 2, 60, 175]);
    expect(Math.round(currentValues(schnitzel).nutrients.kcal)).toBe(351);
    // The entry itself is untouched.
    expect(Math.round(bourekas.nutrients.kcal)).toBe(268);
    expect(bourekas.servingLabel).toBe('1 piece');
  });

  it('gives the same portion and calories as the usual tile beside it', () => {
    for (const id of Object.keys(OLD)) {
      const es = ['2026-11-15', '2026-11-16', YESTERDAY].map((d) => reloadedBundled(id, d));
      const [u] = resolveUsuals(usualFoods(es, 'lunch', TODAY), new Map());
      const c = currentValues(es[2]);
      expect(Math.round(c.nutrients.kcal)).toBe(Math.round(u.last.nutrients.kcal));
      expect(c.servingLabel).toBe(u.last.servingLabel);
      expect(usualLabel(u)).toContain(`${Math.round(c.nutrients.kcal)} kcal`);
    }
  });

  it('keeps an own food, an online product, a quick add, an estimate and a drink from Water as stored', () => {
    const [, , , own, online, quick, ai, drink] = yesterdaysLunch();
    for (const e of [own, online, quick, ai, drink]) expect(currentValues(e)).toBe(e);
  });

  it('leaves an entry already at today\'s values as it is (same numbers, same label)', () => {
    const now = live('b_bourekas_cheese');
    const fresh = entryOf(now, now.servings[0].label, now.servings[0].grams, 1, YESTERDAY);
    const c = currentValues(fresh);
    expect(c.servingLabel).toBe(fresh.servingLabel);
    expect(c.nutrients.kcal).toBeCloseTo(fresh.nutrients.kcal, 6);
  });
});

describe('copying stores today\'s values for bundled foods (Repeat, copy a meal, copy a day, copy to, the reminder)', () => {
  const STORED_BEFORE = 268 + 192.6 + 331.5;

  it('the Repeat row shows the total a tap stores, and the tap stores it', () => {
    const lunch = yesterdaysLunch();
    seed(lunch, [OWN_EDITED]);
    const prev = findPreviousMeal(Object.values(S().foodEntries), TODAY, 'lunch', 7)!;
    expect(prev.date).toBe(YESTERDAY);
    // The drink from Water is never offered; the rest: 298 + 175 + 351 + 270 (own, as logged) + 75 + 320 + 310 (estimate).
    const shown = currentKcal(prev.entries);
    expect(Math.round(shown)).toBe(Math.round(298.4 + 175.2 + 351 + 270 + 75 + 320 + 310));
    const created = copyEntries(prev.entries, TODAY, 'lunch');
    const stored = liveOn(TODAY);
    expect(stored).toHaveLength(7);
    expect(created.map((e) => e.id).sort()).toEqual(stored.map((e) => e.id).sort());
    expect(stored.reduce((n, e) => n + e.nutrients.kcal, 0)).toBeCloseTo(shown, 6);
    const by = (name: string) => stored.find((e) => e.name === name && !e.kcalRange)!;
    const b = by(live('b_bourekas_cheese').name);
    expect([b.servingLabel, b.quantity, b.grams, Math.round(b.nutrients.kcal)]).toEqual(['80 g', 1, 80, 298]);
    const h = by(live('b_halloumi').name);
    expect([h.servingLabel, h.quantity, h.grams, Math.round(h.nutrients.kcal)]).toEqual(['30 g', 2, 60, 175]);
    expect(Math.round(by(live('b_schnitzel_chicken').name).nutrients.kcal)).toBe(351);
    // As stored: the own food at 270 (not the edited 300), the online product, the quick add, the estimate with its range.
    expect(Math.round(by('My granola').nutrients.kcal)).toBe(270);
    expect(by('My granola').servingLabel).toBe('1 bowl');
    expect(Math.round(by('Hummus spread').nutrients.kcal)).toBe(75);
    expect(by('Coffee and cake').nutrients.kcal).toBe(320);
    const est = stored.find((e) => e.kcalRange)!;
    expect([est.nutrients.kcal, est.kcalRange, est.confidence]).toEqual([310, [250, 370], 0.7]);
    // Yesterday is never rewritten.
    const y = liveOn(YESTERDAY).filter((e) => e.source === 'builtin' && !e.kcalRange && !e.via);
    expect(Math.round(y.reduce((n, e) => n + e.nutrients.kcal, 0) * 10) / 10).toBe(STORED_BEFORE);
    expect(y.map((e) => e.servingLabel).sort()).toEqual(['1 piece', '1 piece', '1 slice']);
  });

  it('a copy of a copy keeps today\'s values (the old number does not live on)', () => {
    seed(yesterdaysLunch(), [OWN_EDITED]);
    copyEntries(findPreviousMeal(Object.values(S().foodEntries), TODAY, 'lunch', 7)!.entries, TODAY, 'lunch');
    copyEntries(liveOn(TODAY), '2026-11-19', 'dinner');
    const next = liveOn('2026-11-19');
    expect(Math.round(next.find((e) => e.foodId === 'b_bourekas_cheese' && !e.kcalRange)!.nutrients.kcal)).toBe(298);
  });

  it('the diary\'s "Copy yesterday" (a whole day) and the reminder\'s "Repeat yesterday\'s lunch" store the same', () => {
    seed(yesterdaysLunch(), [OWN_EDITED]);
    const day = findPreviousDay(Object.values(S().foodEntries), TODAY)!;
    const shown = currentKcal(day.entries);
    copyEntries(day.entries, TODAY);
    expect(liveOn(TODAY).reduce((n, e) => n + e.nutrients.kcal, 0)).toBeCloseTo(shown, 6);

    S().resetAll();
    seed(yesterdaysLunch(), [OWN_EDITED]);
    const { items } = mealRepeat(Object.values(S().foodEntries), TODAY, 'lunch');
    logItems(items, 'lunch', TODAY);
    expect(liveOn(TODAY).reduce((n, e) => n + e.nutrients.kcal, 0)).toBeCloseTo(shown, 6);
  });

  it('a copy counts as the food being logged: last portions follow the copy', () => {
    seed(yesterdaysLunch(), [OWN_EDITED]);
    copyEntries(findPreviousMeal(Object.values(S().foodEntries), TODAY, 'lunch', 7)!.entries, TODAY, 'lunch');
    const last = lastPortions(Object.values(S().foodEntries).filter((e) => !e.deleted)).get('b_bourekas_cheese')!;
    expect(last.date).toBe(TODAY);
  });
});

describe('saved meals: logged and shown at today\'s values, the record left as it is', () => {
  /** A saved meal stores each line with its food copy as it was (a synced record, not slimmed). */
  function oldItem(id: string): SavedMealItem {
    const o = OLD[id];
    const grams = o.gramsPerUnit * o.quantity;
    const oldFood: Food = { ...live(id), per100g: o.per100 };
    return { name: oldFood.name, emoji: oldFood.emoji, servingLabel: o.label, quantity: o.quantity, grams, nutrients: scaleNutrients(o.per100, grams), food: oldFood, source: 'builtin', verified: true };
  }
  const own = (): SavedMealItem => toSavedMealItem(entryOf(OWN, '1 bowl', 60, 1, YESTERDAY));
  const meal = (servings = 1): SavedMeal => ({ id: 'm1', updatedAt: stamp(YESTERDAY, 0), name: 'Lunch plate', items: [oldItem('b_bourekas_cheese'), oldItem('b_halloumi'), own()], servings });

  it('a plain meal: the total shown is what logging stores, bundled lines at today\'s values, the own food as saved', () => {
    const m = meal();
    const plan = planSavedMeal(m);
    expect(Math.round(plan.kcal)).toBe(Math.round(298.4 + 175.2 + 270));
    useStore.setState({ savedMeals: { m1: m } });
    logSavedMeal(m, 'lunch', TODAY);
    const stored = liveOn(TODAY);
    expect(stored.reduce((n, e) => n + e.nutrients.kcal, 0)).toBeCloseTo(plan.kcal, 6);
    expect(stored.find((e) => e.foodId === 'b_bourekas_cheese')!.servingLabel).toBe('80 g');
    // The saved record is not rewritten.
    expect(S().savedMeals.m1.items[0].nutrients.kcal).toBeCloseTo(268, 6);
    expect(S().savedMeals.m1.items[0].food!.per100g.kcal).toBe(335);
  });

  it('a recipe: one serving is today\'s whole recipe over its servings', () => {
    const m = meal(2);
    const plan = planSavedMeal(m);
    expect(plan.items).toHaveLength(1);
    expect(Math.round(plan.kcal)).toBe(Math.round((298.4 + 175.2 + 270) / 2));
    // Ticking some lines: each line at today's values, scaled to the portion.
    const part = planSavedMeal(m, { include: [true, false, false] });
    expect(Math.round(part.kcal)).toBe(Math.round(298.4 / 2));
  });

  it('the builder opens with the lines at today\'s values (its totals and amount editor agree), and stores nothing until saved', () => {
    const m = meal();
    useStore.setState({ savedMeals: { m1: m } });
    openMealDraft(m, true);
    const rows = useMealDraft.getState().rows.map((r) => r.item);
    expect(Math.round(rows.reduce((n, it) => n + it.nutrients.kcal, 0))).toBe(Math.round(planSavedMeal(m).kcal));
    expect(rows[0].food!.per100g.kcal).toBe(live('b_bourekas_cheese').per100g.kcal);
    expect(rows[2]).toBe(m.items[2]);
    expect(S().savedMeals.m1).toBe(m);
    closeMealDraft();
  });

  it('saving a meal from the diary stores the entries as they are (a person\'s save), and logging it prices them today', () => {
    seed(yesterdaysLunch(), [OWN_EDITED]);
    const saved = saveMeal('Yesterday', liveOn(YESTERDAY))!;
    expect(saved.items.some((it) => Math.round(it.nutrients.kcal) === 268)).toBe(true);
    expect(Math.round(planSavedMeal(saved).kcal)).toBe(Math.round(currentKcal(liveOn(YESTERDAY).filter((e) => !e.via))));
  });
});
