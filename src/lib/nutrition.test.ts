import { describe, expect, it } from 'vitest';

import type { Food, Nutrients } from '@/types';

import {
  atwaterKcal,
  defaultServing,
  entriesTotal,
  formatMacro,
  macroPercents,
  mealForTime,
  scaleNutrients,
  servingsFor,
  sumNutrients,
} from './nutrition';

const n100: Nutrients = { kcal: 200, protein: 10, carbs: 20, fat: 5, fiber: 2, sodium: 400 };

describe('scaleNutrients', () => {
  it('scales linearly: 150 g of (200 kcal, 10/20/5 per 100 g) = 300 kcal, 15/30/7.5', () => {
    const s = scaleNutrients(n100, 150);
    expect(s).toMatchObject({ kcal: 300, protein: 15, carbs: 30, fat: 7.5, fiber: 3, sodium: 600 });
  });
  it('optional fields that were absent stay absent (not 0 or NaN)', () => {
    const s = scaleNutrients(n100, 50);
    expect('sugar' in s).toBe(false);
    expect('satFat' in s).toBe(false);
  });
  it('zero grams -> zeros', () => {
    expect(scaleNutrients(n100, 0).kcal).toBe(0);
  });
});

describe('sumNutrients / entriesTotal', () => {
  it('adds every field and treats missing optional fields as 0', () => {
    const t = sumNutrients([n100, { kcal: 100, protein: 1, carbs: 2, fat: 3, sugar: 4 }]);
    expect(t).toMatchObject({ kcal: 300, protein: 11, carbs: 22, fat: 8, fiber: 2, sugar: 4, satFat: 0, sodium: 400 });
  });
  it('empty list is all zeros and does not mutate EMPTY_NUTRIENTS', () => {
    const a = sumNutrients([]);
    a.kcal = 5;
    expect(sumNutrients([]).kcal).toBe(0);
  });
  it('entriesTotal sums the nutrients of entries', () => {
    const e = [{ nutrients: n100 }, { nutrients: n100 }] as never;
    expect(entriesTotal(e).kcal).toBe(400);
  });
});

describe('atwater and macro shares', () => {
  it('10 g protein, 20 g carbs, 5 g fat = 40 + 80 + 45 = 165 kcal', () => {
    expect(atwaterKcal({ protein: 10, carbs: 20, fat: 5 })).toBe(165);
  });
  it('macroPercents sums to 1 and matches 40/80/45 of 165', () => {
    const p = macroPercents(n100);
    expect(p.protein).toBeCloseTo(40 / 165, 9);
    expect(p.carbs).toBeCloseTo(80 / 165, 9);
    expect(p.fat).toBeCloseTo(45 / 165, 9);
    expect(p.protein + p.carbs + p.fat).toBeCloseTo(1, 9);
  });
  it('no macros -> all zero rather than NaN', () => {
    expect(macroPercents({ kcal: 0, protein: 0, carbs: 0, fat: 0 })).toEqual({ protein: 0, carbs: 0, fat: 0 });
  });
});

describe('mealForTime boundaries', () => {
  const at = (h: number, m = 0) => mealForTime(new Date(2026, 5, 15, h, m));
  it.each([
    [4, 29, 'snack'],
    [4, 30, 'breakfast'],
    [10, 29, 'breakfast'],
    [10, 30, 'snack'],
    [11, 29, 'snack'],
    [11, 30, 'lunch'],
    [14, 59, 'lunch'],
    [15, 0, 'snack'],
    [17, 29, 'snack'],
    [17, 30, 'dinner'],
    [21, 29, 'dinner'],
    [21, 30, 'snack'],
    [0, 0, 'snack'],
  ])('%i:%i -> %s', (h, m, meal) => expect(at(h, m)).toBe(meal));
});

describe('servings', () => {
  const food = (servings: { label: string; grams: number }[]): Food => ({
    id: 'x',
    name: 'X',
    per100g: n100,
    servings,
    source: 'custom',
    verified: false,
  });
  it('adds 100 g and 1 g when the food has no 100 g serving', () => {
    expect(servingsFor(food([{ label: '1 cup', grams: 240 }])).map((s) => s.label)).toEqual(['1 cup', '100 g', '1 g']);
  });
  it('does not duplicate 100 g', () => {
    expect(servingsFor(food([{ label: '100 g', grams: 100 }])).map((s) => s.label)).toEqual(['100 g', '1 g']);
  });
  it('drops zero or negative gram servings', () => {
    expect(servingsFor(food([{ label: 'bad', grams: 0 }, { label: 'neg', grams: -5 }])).map((s) => s.label)).toEqual(['100 g', '1 g']);
  });
  it('defaultServing is the first positive one, else 100 g', () => {
    expect(defaultServing(food([{ label: 'bad', grams: 0 }, { label: 'ok', grams: 30 }])).label).toBe('ok');
    expect(defaultServing(food([])).label).toBe('100 g');
  });
});

describe('formatMacro', () => {
  it('whole numbers from 100 g, one decimal below', () => {
    expect(formatMacro(150.4)).toBe('150');
    expect(formatMacro(12.34)).toBe('12.3');
    expect(formatMacro(12)).toBe('12');
    expect(formatMacro(0)).toBe('0');
  });
});
