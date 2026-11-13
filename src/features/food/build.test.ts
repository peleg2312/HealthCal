import { describe, expect, it } from 'vitest';

import { aiFoodDefinition, itemRange } from '@/features/ai/estimate';
import type { Food, SavedMeal, SavedMealItem } from '@/types';

import { UNKNOWN_AI_CONFIDENCE, buildEntry, estimateRange, formatPortion, planSavedMeal, savedItemFromFood, scaleRange, servingsPhrase, setItemAmount } from './build';

const rice: Food = {
  id: 'rice',
  name: 'Rice, cooked',
  per100g: { kcal: 130, protein: 2.7, carbs: 28, fat: 0.3 },
  servings: [{ label: '1 cup', grams: 160 }],
  source: 'builtin',
  verified: true,
};

const aiItem = { name: 'Lasagne', grams: 300, kcal: 430, protein: 22, carbs: 40, fat: 20, fiber: 3, confidence: 0.7 };
const aiFood = aiFoodDefinition(aiItem, 'ai_x');

describe('buildEntry', () => {
  it('gives a re-logged AI food a range, the same band the AI flow uses', () => {
    const e = buildEntry({ food: aiFood, serving: aiFood.servings[0], quantity: 1, meal: 'dinner', date: '2026-11-13', confidence: 0.7 });
    expect(e.kcalRange).toEqual(itemRange({ ...aiItem, kcal: Math.round(e.nutrients.kcal) }));
    expect(e.confidence).toBe(0.7);
  });
  it('falls back to a cautious confidence when none is known', () => {
    const e = buildEntry({ food: aiFood, serving: aiFood.servings[0], quantity: 2, meal: 'dinner', date: '2026-11-13' });
    expect(e.confidence).toBe(UNKNOWN_AI_CONFIDENCE);
    expect(e.kcalRange).toEqual(estimateRange(e.nutrients.kcal, UNKNOWN_AI_CONFIDENCE));
    expect(e.kcalRange![0]).toBeLessThan(e.nutrients.kcal);
    expect(e.kcalRange![1]).toBeGreaterThan(e.nutrients.kcal);
  });
  it('gives reference foods no range', () => {
    const e = buildEntry({ food: rice, serving: rice.servings[0], quantity: 1, meal: 'lunch', date: '2026-11-13' });
    expect(e.kcalRange).toBeUndefined();
    expect(e.confidence).toBeUndefined();
    expect(e.nutrients.kcal).toBeCloseTo(208);
  });
});

describe('scaleRange', () => {
  it('scales both ends with the amount, as the editor shows it', () => {
    expect(scaleRange([340, 520], 0.5)).toEqual([170, 260]);
    expect(scaleRange([340, 520], 2)).toEqual([680, 1040]);
    expect(scaleRange([340, 520], NaN)).toEqual([0, 0]);
  });
});

describe('setItemAmount', () => {
  it('recomputes from the food and scales an estimate range', () => {
    const it0 = { ...savedItemFromFood(aiFood, aiFood.servings[0], 1, 0.7) };
    const doubled = setItemAmount(it0, aiFood.servings[0], 2);
    expect(doubled.grams).toBe(600);
    expect(doubled.nutrients.kcal).toBeCloseTo(it0.nutrients.kcal * 2);
    expect(doubled.kcalRange).toEqual(scaleRange(it0.kcalRange!, 2));
  });
  it('scales a line without a food by its quantity', () => {
    const quick: SavedMealItem = { name: 'Cake', servingLabel: '1 serving', quantity: 1, grams: 0, nutrients: { kcal: 300, protein: 4, carbs: 40, fat: 14 }, source: 'quick', verified: false };
    const half = setItemAmount(quick, { label: '1 serving', grams: 0 }, 0.5);
    expect(half.nutrients).toEqual({ kcal: 150, protein: 2, carbs: 20, fat: 7 });
    expect(half.quantity).toBe(0.5);
  });
});

describe('planSavedMeal', () => {
  const items: SavedMealItem[] = [
    savedItemFromFood(rice, { label: '1 g', grams: 1 }, 400),
    { ...savedItemFromFood(aiFood, aiFood.servings[0], 1, 0.7) },
  ];
  const plain: SavedMeal = { id: 'm1', updatedAt: '', name: 'Lunch box', items };
  const chili: SavedMeal = { ...plain, id: 'm2', name: 'Chili', servings: 4 };

  it('logs a plain meal item by item, ticked ones only', () => {
    expect(planSavedMeal(plain).items).toHaveLength(2);
    const p = planSavedMeal(plain, { include: [false, true] });
    expect(p.items).toEqual([items[1]]);
    expect(p.kcal).toBeCloseTo(items[1].nutrients.kcal);
    expect(p.range).toEqual(items[1].kcalRange);
  });
  it('logs one serving of a recipe as a single line', () => {
    const p = planSavedMeal(chili);
    expect(p.items).toHaveLength(1);
    const line = p.items[0];
    const total = items[0].nutrients.kcal + items[1].nutrients.kcal;
    expect(line.name).toBe('Chili');
    expect(line.servingLabel).toBe('1 of 4 servings');
    expect(line.nutrients.kcal).toBeCloseTo(total / 4);
    expect(line.grams).toBeCloseTo(175);
    // The estimate inside keeps the line an estimate.
    expect(line.source).toBe('ai');
    expect(line.kcalRange![0]).toBeLessThan(line.nutrients.kcal);
    expect(line.kcalRange![1]).toBeGreaterThan(line.nutrients.kcal);
    // Its definition re-portions to the same numbers.
    expect(line.food!.per100g.kcal * 1.75).toBeCloseTo(line.nutrients.kcal);
    expect(line.food!.servings[0]).toEqual({ label: '1 serving', grams: 175 });
  });
  it('scales a recipe to the portion and ticked items', () => {
    const half = planSavedMeal(chili, { portion: 0.5, include: [true, false] });
    expect(half.items[0].servingLabel).toBe('½ of 4 servings');
    expect(half.items[0].nutrients.kcal).toBeCloseTo(items[0].nutrients.kcal / 8);
    expect(half.range).toBeNull();
    expect(half.items[0].source).toBe('custom');
    expect(planSavedMeal(chili, { include: [false, false] }).items).toEqual([]);
  });
  it('treats servings of 1 or less as a plain meal', () => {
    expect(planSavedMeal({ ...plain, servings: 1 }).items).toHaveLength(2);
    expect(planSavedMeal({ ...plain, servings: 0 }).items).toHaveLength(2);
  });
});

describe('formatPortion', () => {
  it('writes common fractions', () => {
    expect(formatPortion(0.5)).toBe('½');
    expect(formatPortion(1.5)).toBe('1½');
    expect(formatPortion(2)).toBe('2');
    expect(formatPortion(0.3)).toBe('0.3');
    expect(servingsPhrase(2, 6)).toBe('2 of 6 servings');
  });
});
