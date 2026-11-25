import { describe, expect, it } from 'vitest';

import { MEAL_PICK_CHOOSES, MEAL_PICK_MOVES, mealPickAdvice, pickMovesAtOnce } from './mealMove';

const entry = { date: '2026-11-24', quantity: 1.5, servingLabel: '1 cup' };
const asStored = { date: '2026-11-24', quantity: 1.5, servingLabel: '1 cup', savable: true };

describe("Edit entry's one-tap move", () => {
  it('moves at once only while the amount, serving and day are as stored and can be saved', () => {
    expect(pickMovesAtOnce(entry, asStored)).toBe(true);
    expect(pickMovesAtOnce(entry, { ...asStored, quantity: 2 })).toBe(false);
    expect(pickMovesAtOnce(entry, { ...asStored, servingLabel: '100 g' })).toBe(false);
    expect(pickMovesAtOnce(entry, { ...asStored, date: '2026-11-23' })).toBe(false);
    expect(pickMovesAtOnce(entry, { ...asStored, savable: false })).toBe(false);
  });

  it('never moves a food that is being added (no entry yet)', () => {
    expect(pickMovesAtOnce(undefined, asStored)).toBe(false);
  });

  it('says beforehand what a pick does now, in one neutral sentence each (WCAG 3.2.2)', () => {
    expect(mealPickAdvice(true)).toBe('Picking another meal moves this entry and returns to the diary.');
    expect(mealPickAdvice(false)).toBe('The meal you pick is saved with your other changes.');
    for (const line of [MEAL_PICK_MOVES, MEAL_PICK_CHOOSES]) {
      expect(line).toMatch(/^[A-Z][^.!]*\.$/);
      expect(line).not.toMatch(/\b(bad|failed|should|cheat|great|missed your)\b/i);
    }
  });
});
