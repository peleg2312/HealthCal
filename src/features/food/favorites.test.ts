/**
 * Favourite saved meals (the pure rules of ./favorites.ts) and the two star actions (./favoriteActions.ts)
 * with the real store: the toast, its Undo, and the guard against a missing or deleted record.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Toast = { message: string; opts?: { label?: string; onPress?: () => void } };
const toasts: Toast[] = [];
const haptics: string[] = [];
vi.mock('@/ui', () => ({
  toast: (message: string, opts?: Toast['opts']) => toasts.push({ message, opts }),
  haptic: { success: () => haptics.push('success'), tap: () => haptics.push('tap'), press: () => {}, select: () => {}, warn: () => {} },
}));

import { BUILTIN_FOODS } from '@/data/foods';
import { favoriteRecordId, useStore } from '@/store';
import type { FoodEntry, SavedMeal, SavedMealItem } from '@/types';

import { isFavoriteFood, toggleFoodFavorite, toggleMealFavorite } from './favoriteActions';
import { favoriteFoodsInVisit, favoriteMeals, inVisitOrder, isFavoriteMeal, mealToSave, orderSavedMeals, quickLogMeal, sameFoodsAsSaved, withFavorite } from './favorites';

const S = () => useStore.getState();
const lastToast = () => toasts[toasts.length - 1];
const item = (name: string, extra: Partial<SavedMealItem> = {}): SavedMealItem => ({
  name,
  servingLabel: '1 serving',
  quantity: 1,
  grams: 100,
  nutrients: { kcal: 200, protein: 10, carbs: 20, fat: 5 },
  source: 'custom',
  verified: false,
  ...extra,
});
const meal = (id: string, updatedAt: string, extra: Partial<SavedMeal> = {}): SavedMeal => ({ id, name: id, items: [item('Rice')], updatedAt, ...extra });

describe('isFavoriteMeal', () => {
  it('is true only for a time Date.parse reads', () => {
    expect(isFavoriteMeal({ favoriteAt: '2026-11-24T08:00:00.000Z' })).toBe(true);
    expect(isFavoriteMeal({})).toBe(false);
    expect(isFavoriteMeal({ favoriteAt: '' })).toBe(false);
    expect(isFavoriteMeal({ favoriteAt: 'soon' })).toBe(false);
    expect(isFavoriteMeal({ favoriteAt: 1700000000000 as unknown as string })).toBe(false);
    expect(isFavoriteMeal({ favoriteAt: null as unknown as string })).toBe(false);
  });
});

describe('withFavorite', () => {
  const m = { ...meal('a', '2026-11-20T00:00:00.000Z'), servings: 2, futureField: { keep: true } } as SavedMeal & { futureField: unknown };
  it('adds favoriteAt and keeps every other field, the unknown one included', () => {
    const on = withFavorite(m, true, '2026-11-24T08:00:00.000Z') as typeof m;
    expect(on.favoriteAt).toBe('2026-11-24T08:00:00.000Z');
    expect(on.futureField).toEqual({ keep: true });
    expect(on.items).toBe(m.items);
    expect(on.servings).toBe(2);
    expect(on.name).toBe('a');
  });
  it('removes only favoriteAt', () => {
    const off = withFavorite({ ...m, favoriteAt: '2026-11-24T08:00:00.000Z' }, false, '') as typeof m;
    expect('favoriteAt' in off).toBe(false);
    expect(off.futureField).toEqual({ keep: true });
    expect(off.servings).toBe(2);
  });
});

describe('order', () => {
  const plain1 = meal('plain-old', '2026-11-01T00:00:00.000Z');
  const plain2 = meal('plain-new', '2026-11-20T00:00:00.000Z');
  const favOld = meal('fav-old', '2026-11-21T00:00:00.000Z', { favoriteAt: '2026-11-02T00:00:00.000Z' });
  const favNew = meal('fav-new', '2026-11-03T00:00:00.000Z', { favoriteAt: '2026-11-22T00:00:00.000Z' });
  const junkNum = meal('junk-num', '2026-11-23T00:00:00.000Z', { favoriteAt: 12 as unknown as string });
  const junkStr = meal('junk-str', '2026-11-19T00:00:00.000Z', { favoriteAt: 'not a time' });

  it('orderSavedMeals: favourites by star time, newest first, then the rest by their last change', () => {
    expect(orderSavedMeals([plain1, favOld, plain2, favNew]).map((m) => m.id)).toEqual(['fav-new', 'fav-old', 'plain-new', 'plain-old']);
  });
  it('a favoriteAt that is a number or unreadable is not a favourite and never throws', () => {
    expect(() => orderSavedMeals([junkNum, junkStr, favNew])).not.toThrow();
    expect(orderSavedMeals([junkNum, junkStr, favNew, plain1]).map((m) => m.id)).toEqual(['fav-new', 'junk-num', 'junk-str', 'plain-old']);
    expect(favoriteMeals([junkNum, junkStr, favNew]).map((m) => m.id)).toEqual(['fav-new']);
    expect(() => quickLogMeal([junkNum, junkStr])).not.toThrow();
    expect(() => orderSavedMeals([{ ...plain1, updatedAt: undefined as unknown as string }, plain2])).not.toThrow();
  });
  it('favoriteMeals: favourites only, newest star first', () => {
    expect(favoriteMeals([plain1, favOld, favNew]).map((m) => m.id)).toEqual(['fav-new', 'fav-old']);
  });
  it("quickLogMeal: the meal changed last, leaving out the row's favourite tiles; null for none", () => {
    expect(quickLogMeal([plain1, favOld, plain2])?.id).toBe('fav-old');
    expect(quickLogMeal([plain1, favOld, plain2], ['fav-old'])?.id).toBe('plain-new');
    expect(quickLogMeal([favOld], ['fav-old'])).toBeNull();
    expect(quickLogMeal([])).toBeNull();
  });
  it('inVisitOrder: the order fixed at the visit holds; a new meal leads; a deleted one is left out', () => {
    const order = orderSavedMeals([plain1, favOld, plain2]).map((m) => m.id);
    expect(order).toEqual(['fav-old', 'plain-new', 'plain-old']);
    // plain-old is starred during the visit: it keeps its place.
    const starred = { ...plain1, favoriteAt: '2026-11-24T08:00:00.000Z', updatedAt: '2026-11-24T08:00:00.000Z' };
    expect(inVisitOrder([starred, favOld, plain2], order).map((m) => m.id)).toEqual(['fav-old', 'plain-new', 'plain-old']);
    // A meal saved during the visit leads; plain-new was deleted.
    const fresh = meal('fresh', '2026-11-24T09:00:00.000Z');
    expect(inVisitOrder([fresh, favOld, plain1], order).map((m) => m.id)).toEqual(['fresh', 'fav-old', 'plain-old']);
    expect(inVisitOrder([plain1, favOld], null).map((m) => m.id)).toEqual(['fav-old', 'plain-old']);
  });
  it('favoriteFoodsInVisit: a food unstarred on this visit stays listed in its place; one starred since leads', () => {
    expect(favoriteFoodsInVisit(['b', 'a'], null)).toEqual(['b', 'a']);
    // 'a' unstarred during the visit: still listed, in its place.
    expect(favoriteFoodsInVisit(['b', 'c'], ['b', 'a', 'c'])).toEqual(['b', 'a', 'c']);
    // 'a' starred again (it is newest now): it keeps its place rather than jumping to the top.
    expect(favoriteFoodsInVisit(['a', 'b', 'c'], ['b', 'a', 'c'])).toEqual(['b', 'a', 'c']);
    // 'd' starred since the visit began (from a food's detail): it leads.
    expect(favoriteFoodsInVisit(['d', 'b'], ['b'])).toEqual(['d', 'b']);
  });
});

describe('sameFoodsAsSaved and mealToSave', () => {
  const rice = BUILTIN_FOODS[0];
  const entry = (id: string, name: string, extra: Partial<FoodEntry> = {}): FoodEntry => ({
    id,
    date: '2026-11-24',
    meal: 'lunch',
    name,
    servingLabel: '1 serving',
    quantity: 1,
    grams: 100,
    nutrients: { kcal: 200, protein: 10, carbs: 20, fat: 5 },
    source: 'ai',
    verified: false,
    loggedAt: `2026-11-24T12:0${id.length}:00.000Z`,
    updatedAt: '2026-11-24T12:00:00.000Z',
    ...extra,
  });
  const lunch = [entry('e1', 'Chicken'), entry('e2', 'Rice', { foodId: rice.id, food: rice })];
  const saved = meal('s', '2026-11-24T12:00:00.000Z', { items: [item('chicken '), item('x', { food: rice })] });

  it('the same set of foods as a live saved meal (name for a line without a food, the food id otherwise)', () => {
    expect(sameFoodsAsSaved(lunch, [saved])).toBe(true);
    expect(sameFoodsAsSaved(lunch, [{ ...saved, deleted: true }])).toBe(false);
    expect(sameFoodsAsSaved([...lunch, entry('e3', 'Salad')], [saved])).toBe(false);
    // A drink logged on Water is left out, as a save leaves it out.
    expect(sameFoodsAsSaved([...lunch, entry('e4', 'Juice', { via: 'water' })], [saved])).toBe(true);
    expect(sameFoodsAsSaved([], [saved])).toBe(false);
  });
  it('mealToSave: two foods or more on that meal and day, not yet a saved meal', () => {
    expect(mealToSave(lunch, 'lunch', '2026-11-24', [])?.map((e) => e.id)).toEqual(['e1', 'e2']);
    expect(mealToSave(lunch, 'dinner', '2026-11-24', [])).toBeNull();
    expect(mealToSave(lunch, 'lunch', '2026-11-23', [])).toBeNull();
    expect(mealToSave(lunch, 'lunch', '2026-11-24', [saved])).toBeNull();
    expect(mealToSave([lunch[0], entry('e4', 'Juice', { via: 'water' })], 'lunch', '2026-11-24', [])).toBeNull();
    // The drink stays among the entries handed to the save sheet (which leaves it out).
    expect(mealToSave([...lunch, entry('e5', 'Juice', { via: 'water' })], 'lunch', '2026-11-24', [])?.length).toBe(3);
  });
});

describe('the star actions', () => {
  let clock = Date.parse('2026-11-24T08:00:00.000Z');
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    clock = Date.parse('2026-11-24T08:00:00.000Z');
    vi.setSystemTime(clock);
    S().resetAll();
    toasts.length = 0;
    haptics.length = 0;
  });
  afterEach(() => vi.useRealTimers());
  const tick = () => {
    clock += 1000;
    vi.setSystemTime(clock);
  };

  it('toggleMealFavorite stars with a quoted toast; Undo restores the absence of the field', () => {
    const m = S().upsert('savedMeals', { name: 'Usual breakfast', items: [item('Oats')] });
    tick();
    expect(toggleMealFavorite(m)).toBe(true);
    const on = S().savedMeals[m.id];
    expect(isFavoriteMeal(on)).toBe(true);
    expect(on.items).toEqual(m.items);
    expect(lastToast().message).toBe('Added to favourites: "Usual breakfast"');
    expect(lastToast().opts?.label).toBe('Undo');
    expect(haptics).toEqual(['success']);
    tick();
    lastToast().opts!.onPress!();
    expect('favoriteAt' in S().savedMeals[m.id]).toBe(false);
    expect(S().savedMeals[m.id].deleted).toBe(false);
  });

  it('Undo of an unstar puts back the exact earlier time', () => {
    const at = '2026-11-01T07:15:00.000Z';
    const m = S().upsert('savedMeals', { name: 'Dinner', items: [item('Rice')], favoriteAt: at });
    tick();
    expect(toggleMealFavorite(m)).toBe(false);
    expect('favoriteAt' in S().savedMeals[m.id]).toBe(false);
    expect(lastToast().message).toBe('Removed from favourites: "Dinner"');
    expect(haptics).toEqual(['tap']);
    tick();
    lastToast().opts!.onPress!();
    expect(S().savedMeals[m.id].favoriteAt).toBe(at);
  });

  it('reads the store at the tap: a stale copy does not undo a newer change', () => {
    const m = S().upsert('savedMeals', { name: 'Lunch', items: [item('Rice')] });
    tick();
    S().upsert('savedMeals', { ...S().savedMeals[m.id], name: 'Lunch renamed' });
    tick();
    toggleMealFavorite(m);
    expect(S().savedMeals[m.id].name).toBe('Lunch renamed');
  });

  it('does nothing to a missing or deleted meal, and its Undo never revives a meal deleted meanwhile', () => {
    expect(toggleMealFavorite({ id: 'nope' })).toBeNull();
    expect(S().savedMeals.nope).toBeUndefined();
    const m = S().upsert('savedMeals', { name: 'Gone', items: [item('Rice')] });
    tick();
    S().remove('savedMeals', m.id);
    tick();
    expect(toggleMealFavorite(m)).toBeNull();
    expect(S().savedMeals[m.id].deleted).toBe(true);
    expect(toasts).toHaveLength(0);

    const k = S().upsert('savedMeals', { name: 'Kept', items: [item('Rice')] });
    tick();
    toggleMealFavorite(k);
    tick();
    S().remove('savedMeals', k.id);
    tick();
    lastToast().opts!.onPress!();
    expect(S().savedMeals[k.id].deleted).toBe(true);
  });

  it('toggleFoodFavorite adds with Undo; the Undo of a removal restores the same record', () => {
    const f = BUILTIN_FOODS[3];
    const id = favoriteRecordId(f.id);
    expect(toggleFoodFavorite(f)).toBe(true);
    expect(isFavoriteFood(f.id)).toBe(true);
    expect(S().favoriteFoodIds).toContain(f.id);
    expect(lastToast().message).toBe(`Added to favourites: ${f.name}`);
    tick();
    lastToast().opts!.onPress!();
    expect(isFavoriteFood(f.id)).toBe(false);
    expect(S().favoriteFoodIds).not.toContain(f.id);

    tick();
    toggleFoodFavorite(f);
    const record = S().favorites[id];
    tick();
    expect(toggleFoodFavorite(f)).toBe(false);
    expect(lastToast().message).toBe(`Removed from favourites: ${f.name}`);
    expect(S().favorites[id].deleted).toBe(true);
    tick();
    lastToast().opts!.onPress!();
    expect(S().favorites[id].deleted).toBe(false);
    // The same record (its food copy), restored, not a fresh star.
    expect(S().favorites[id].food).toBe(record.food);
  });
});
