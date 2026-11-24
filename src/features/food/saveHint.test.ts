/**
 * The diary's one-time "Save lunch as a meal" hint (./saveHint.ts): which card shows it, and that it
 * never shows for a meal that already is a saved meal (one just saved from the AI review, or logged
 * from a saved meal).
 */
import { describe, expect, it } from 'vitest';

import type { FoodEntry, MealType, SavedMeal } from '@/types';

import { distinctFoodCount, mealToSave } from './favorites';
import { canOfferSave, saveHintMeal } from './saveHint';

let n = 0;
function entry(meal: MealType, name: string, over: Partial<FoodEntry> = {}): FoodEntry {
  n += 1;
  return {
    id: `e${n}`,
    updatedAt: '2026-11-24T10:00:00.000Z',
    date: '2026-11-24',
    meal,
    name,
    foodId: `f_${name.toLowerCase().replace(/\W+/g, '_')}`,
    source: 'builtin',
    verified: true,
    servingLabel: '1 serving',
    quantity: 1,
    grams: 100,
    nutrients: { kcal: 100, protein: 1, carbs: 1, fat: 1 },
    loggedAt: '2026-11-24T10:00:00.000Z',
    ...over,
  } as FoodEntry;
}

const day = (byMeal: Partial<Record<MealType, FoodEntry[]>>) =>
  (['breakfast', 'lunch', 'dinner', 'snack'] as MealType[]).map((meal) => ({ meal, entries: byMeal[meal] ?? [] }));

const open = { done: false, allowed: true, saved: [] as SavedMeal[] };

describe('saveHintMeal', () => {
  it('the first meal in the day\'s order with two or more foods', () => {
    const d = day({ breakfast: [entry('breakfast', 'Banana')], lunch: [entry('lunch', 'Rice'), entry('lunch', 'Chicken')], dinner: [entry('dinner', 'Soup'), entry('dinner', 'Bread')] });
    expect(saveHintMeal(d, open)).toBe('lunch');
  });

  it('the meal the diary was opened for comes first when it qualifies, else the first', () => {
    const d = day({ lunch: [entry('lunch', 'Rice'), entry('lunch', 'Chicken')], dinner: [entry('dinner', 'Soup'), entry('dinner', 'Bread')] });
    expect(saveHintMeal(d, { ...open, prefer: 'dinner' })).toBe('dinner');
    expect(saveHintMeal(d, { ...open, prefer: 'breakfast' })).toBe('lunch');
  });

  it('drinks logged on Water do not count: one food and one such drink is not a meal to save', () => {
    const d = day({ breakfast: [entry('breakfast', 'Toast'), entry('breakfast', 'Milk', { via: 'water' })] });
    expect(saveHintMeal(d, open)).toBeNull();
  });

  it('nothing while the device answer is unread, once dealt with, or where it is not allowed', () => {
    const d = day({ lunch: [entry('lunch', 'Rice'), entry('lunch', 'Chicken')] });
    expect(saveHintMeal(d, { ...open, done: null })).toBeNull();
    expect(saveHintMeal(d, { ...open, done: true })).toBeNull();
    expect(saveHintMeal(d, { ...open, allowed: false })).toBeNull();
  });

  it('never for a meal whose foods already are a live saved meal (just saved from the AI review, or logged from one)', () => {
    const lunch = [entry('lunch', 'Rice'), entry('lunch', 'Chicken')];
    const saved = {
      id: 's1',
      updatedAt: '2026-11-24T10:00:00.000Z',
      name: 'Chicken and rice',
      items: [...lunch].reverse().map((e) => ({ name: e.name, servingLabel: e.servingLabel, quantity: 1, grams: 100, nutrients: e.nutrients, food: { id: e.foodId } as never, source: 'builtin', verified: true })),
    } as SavedMeal;
    const d = day({ lunch, dinner: [entry('dinner', 'Soup'), entry('dinner', 'Bread')] });
    expect(saveHintMeal(d, { ...open, saved: [saved] })).toBe('dinner');
    // A deleted saved meal does not count.
    expect(saveHintMeal(d, { ...open, saved: [{ ...saved, deleted: true }] })).toBe('lunch');
  });

  it('only one meal is ever returned', () => {
    const d = day({ breakfast: [entry('breakfast', 'A'), entry('breakfast', 'B')], lunch: [entry('lunch', 'C'), entry('lunch', 'D')] });
    expect(typeof saveHintMeal(d, open)).toBe('string');
  });
});

describe('canOfferSave', () => {
  it('two foods, not already saved', () => {
    expect(canOfferSave([entry('lunch', 'Rice')], [])).toBe(false);
    expect(canOfferSave([entry('lunch', 'Rice'), entry('lunch', 'Beans')], [])).toBe(true);
  });

  it('counts different foods, not entries: one food logged twice is never offered ("Banana, Banana")', () => {
    const twice = [entry('dinner', 'Banana'), entry('dinner', 'Banana')];
    expect(canOfferSave(twice, [])).toBe(false);
    expect(saveHintMeal(day({ dinner: twice }), open)).toBeNull();
    // An own food with no id counts by its name and brand, the same key.
    const named = [entry('dinner', 'Toast', { foodId: undefined }), entry('dinner', 'toast ', { foodId: undefined })];
    expect(canOfferSave(named, [])).toBe(false);
    // A second, different food makes it two.
    expect(canOfferSave([...twice, entry('dinner', 'Almonds')], [])).toBe(true);
    // A drink logged on Water is never one of the two.
    expect(canOfferSave([entry('dinner', 'Banana'), entry('dinner', 'Milk', { via: 'water' })], [])).toBe(false);
  });

  it("Saved meals' row counts the same way (mealToSave)", () => {
    const twice = [entry('dinner', 'Banana'), entry('dinner', 'Banana')];
    expect(mealToSave(twice, 'dinner', '2026-11-24', [])).toBeNull();
    expect(mealToSave([...twice, entry('dinner', 'Almonds')], 'dinner', '2026-11-24', [])?.length).toBe(3);
    expect(distinctFoodCount(twice)).toBe(1);
    expect(distinctFoodCount([...twice, entry('dinner', 'Soup', { deleted: true })])).toBe(1);
  });
});
