import { describe, expect, it } from 'vitest';

import { itemLine, itemStepText } from './itemLine';

const n = (kcal: number) => ({ kcal, protein: 0, carbs: 0, fat: 0 });

describe('a saved meal line', () => {
  it('a serving that is a volume: its total, no weight beside it', () => {
    expect(itemLine({ servingLabel: '500 ml', quantity: 1, grams: 500, nutrients: n(235) })).toBe('500 ml · 235 kcal');
    expect(itemLine({ servingLabel: '500 ml', quantity: 2, grams: 1000, nutrients: n(470) })).toBe('1000 ml · 470 kcal');
  });

  it('weights and household measures as before', () => {
    expect(itemLine({ servingLabel: '50 g', quantity: 2, grams: 100, nutrients: n(160) })).toBe('100 g · 160 kcal');
    expect(itemLine({ servingLabel: '1 cup', quantity: 1.5, grams: 240, nutrients: n(205) })).toBe('1.5 cup · 240 g · 205 kcal');
    expect(itemLine({ servingLabel: '1 can (500 ml)', quantity: 1, grams: 503, nutrients: n(226) })).toBe('1 can (500 ml) · 503 g · 226 kcal');
    expect(itemLine({ servingLabel: '1 g', quantity: 80, grams: 80, nutrients: n(100), kcalRange: [80, 120] })).toBe('80 g · ~100 kcal');
  });

  it('the stepper: "1000 ml", never "2 × 500 ml"', () => {
    expect(itemStepText('500 ml', 2)).toBe('1000 ml');
    expect(itemStepText('50 g', 3)).toBe('150 g');
    expect(itemStepText('1 cup', 1.5)).toBe('1.5 × 1 cup');
  });
});
