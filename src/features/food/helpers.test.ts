import { describe, expect, it } from 'vitest';

import { amountLabel, stepAmount, toPer100, portionLabel } from './helpers';

describe('stepAmount', () => {
  it('steps servings by a half', () => {
    expect(stepAmount(1, '1 cup', 1)).toBe(1.5);
    expect(stepAmount(1.5, '1 cup', -1)).toBe(1);
  });
  it('steps grams by 10 g', () => {
    expect(stepAmount(150, '1 g', 1)).toBe(160);
    expect(stepAmount(150, '1 g', -1)).toBe(140);
  });
  it('steps a 100 g serving by 10 g', () => {
    expect(stepAmount(1.5, '100 g', 1)).toBe(1.6);
  });
  it('snaps an off-grid amount to the grid instead of carrying the odd part', () => {
    expect(stepAmount(1.2, '1 cup', 1)).toBe(1.5);
    expect(stepAmount(1.2, '1 cup', -1)).toBe(1);
    expect(stepAmount(15, '1 g', -1)).toBe(10);
    expect(stepAmount(0.25, '1 cup', 1)).toBe(0.5);
  });
  it('reaches 0 (remove) from the smallest step and never goes negative', () => {
    expect(stepAmount(0.5, '1 cup', -1)).toBe(0);
    expect(stepAmount(0.25, '1 cup', -1)).toBe(0);
    expect(stepAmount(5, '1 g', -1)).toBe(0);
    expect(stepAmount(0, '1 cup', -1)).toBe(0);
  });
});

describe('amountLabel', () => {
  it('shows grams in gram mode and a multiplier otherwise', () => {
    expect(amountLabel('1 g', 150)).toBe('150 g');
    expect(amountLabel('100 g', 1.5)).toBe('150 g');
    expect(amountLabel('1 cup', 1.5)).toBe('1.5 ×');
  });
});

describe('toPer100', () => {
  it('keeps the precision a low-calorie drink needs (2 kcal per 500 ml is 0.4 per 100 g, not 0)', () => {
    expect(Math.round(toPer100(2, 500) * 100) / 100).toBe(0.4);
  });
});

describe('portionLabel', () => {
  it('reads a multiplied serving the way a person would say it', () => {
    expect(portionLabel('1 pita', 1.5)).toBe('1.5 pita');
    expect(portionLabel('2 tbsp', 3)).toBe('6 tbsp');
    expect(portionLabel('1 cup', 1)).toBe('1 cup');
    expect(portionLabel('1 g', 150)).toBe('150 g');
    expect(portionLabel('100 g', 1.5)).toBe('150 g');
  });
  it('keeps the multiplier where the label does not start with a count', () => {
    expect(portionLabel('1/2 cup', 1.5)).toBe('1.5 × 1/2 cup');
    expect(portionLabel('slice', 2)).toBe('2 × slice');
  });
});
