import { describe, expect, it } from 'vitest';

import { BUILTIN_FOODS } from '@/data/foods';

import { QUICK_KCAL_LIMIT, quickKcalError } from './helpers';
import {
  ENTRY_KCAL_CHECK,
  editedKcalAsks,
  kcalAsk,
  kcalSaveTitle,
  PORTION_CHECK_FLOOR,
  portionAsk,
  portionAsks,
  portionCheckGrams,
  portionTitle,
  pressFor,
  quickAddTitle,
  quickKcalAsks,
  waitsFor,
} from './softCheck';

const BANNED = /\b(bad|fail|failed|should|cheat|great|missed your|too much|only|sorry)\b/i;
const food = (id: string) => BUILTIN_FOODS.find((f) => f.id === `b_${id}`)!;

describe('the second press', () => {
  it('stores a usual amount on the first press, a large one only on a second press of the same amount', () => {
    expect(pressFor(false, 350, null)).toBe('add');
    expect(pressFor(true, 5000, null)).toBe('ask');
    expect(pressFor(true, 5000, 5000)).toBe('add');
    // Changed after the question (a typo fixed, or another large amount): asked again, or stored when usual.
    expect(pressFor(true, 4000, 5000)).toBe('ask');
    expect(pressFor(false, 500, 5000)).toBe('add');
  });

  it('waits only while the amount on screen is the one asked about', () => {
    expect(waitsFor(true, 5000, null)).toBe(false);
    expect(waitsFor(true, 5000, 5000)).toBe(true);
    expect(waitsFor(true, 4000, 5000)).toBe(false);
    expect(waitsFor(false, 500, 500)).toBe(false);
    expect(waitsFor(true, null, 5000)).toBe(false);
  });
});

describe("quick add's calories", () => {
  it('ask only above a plausible single entry and under the hard limit, which stays the field error', () => {
    expect(ENTRY_KCAL_CHECK).toBe(3000);
    expect(quickKcalAsks(null)).toBe(false);
    expect(quickKcalAsks(350)).toBe(false);
    expect(quickKcalAsks(3000)).toBe(false);
    expect(quickKcalAsks(3001)).toBe(true);
    expect(quickKcalAsks(5000)).toBe(true);
    expect(quickKcalAsks(QUICK_KCAL_LIMIT - 1)).toBe(true);
    expect(quickKcalAsks(QUICK_KCAL_LIMIT)).toBe(false);
    expect(quickKcalError(String(QUICK_KCAL_LIMIT))).toBe('Enter 1 to 9,999 kcal.');
    expect(quickKcalError('5000')).toBeNull();
  });

  it('name the amount on the button while they wait, and say why in one neutral sentence', () => {
    expect(quickAddTitle('lunch', null)).toBe('Add to lunch');
    expect(quickAddTitle('breakfast', 5000)).toBe('Add 5,000 kcal to breakfast');
    // Water's shape, for one voice: "Is 2.5 L right for one drink? Tap Add again to add it."
    expect(kcalAsk(5000, false)).toBe('Is 5,000 kcal right for one entry? Tap Add again to add it.');
    expect(kcalAsk(5000, false)).not.toMatch(BANNED);
  });
});

describe("food detail's portion", () => {
  it('asks above five times the largest household measure, never at or under 500 g', () => {
    // Banana: 1 large is 136 g, so 680 g; the review's 1,500 g asks, three bananas do not.
    expect(portionCheckGrams(food('banana'))).toBe(680);
    expect(portionAsks(food('banana'), 1500, 1335)).toBe(true);
    expect(portionAsks(food('banana'), 354, 315)).toBe(false);
    // A food measured in spoonfuls or crackers is held to the floor, not to 5 crackers.
    expect(portionCheckGrams({ servings: [{ label: '1 tbsp', grams: 14 }] })).toBe(PORTION_CHECK_FLOOR);
    expect(portionAsks({ servings: [{ label: '1 tbsp', grams: 14 }] }, 120, 860)).toBe(false);
    // A food weighed only in grams counts 100 g.
    expect(portionCheckGrams({ servings: [] })).toBe(500);
    // A watermelon wedge is 286 g: 1,430 g does not ask.
    expect(portionAsks(food('watermelon'), 1430, 429)).toBe(false);
  });

  it('asks above 3,000 kcal whatever the grams', () => {
    expect(portionAsks({ servings: [{ label: '1 cup', grams: 143 }] }, 600, 3470)).toBe(true);
    expect(portionAsks({ servings: [{ label: '1 cup', grams: 143 }] }, 500, 2890)).toBe(false);
  });

  it('never asks about the amount an entry already holds, nor about no amount', () => {
    expect(portionAsks(food('banana'), 1500, 1335, 1500)).toBe(false);
    expect(portionAsks(food('banana'), 1600, 1424, 1500)).toBe(true);
    expect(portionAsks(food('banana'), 0, 0)).toBe(false);
  });

  it('names the action it waits for and the amount it will store', () => {
    expect(portionAsk(1500, false)).toBe('Is 1,500 g right for one entry? Tap Add again to add it.');
    expect(portionAsk(1499.6, true)).toBe('Is 1,500 g right for one entry? Tap Save again to save it.');
    expect(portionTitle(false, 'snack', 1500)).toBe('Add 1,500 g to snacks');
    expect(portionTitle(true, 'lunch', 1499.6)).toBe('Save 1,500 g');
    for (const line of [portionAsk(1500, false), portionAsk(1500, true)]) {
      expect(line).toMatch(/^Is [^!]*\? Tap [^!]*\.$/);
      expect(line).not.toMatch(BANNED);
    }
  });
});

describe("an entry's own calories, edited", () => {
  it('ask above 3,000 kcal only when changed, with Save named', () => {
    expect(editedKcalAsks(5000, 500)).toBe(true);
    expect(editedKcalAsks(5000, 5000)).toBe(false);
    expect(editedKcalAsks(2900, 500)).toBe(false);
    expect(editedKcalAsks(null, 500)).toBe(false);
    expect(kcalAsk(5000, true)).toBe('Is 5,000 kcal right for one entry? Tap Save again to save it.');
    expect(kcalSaveTitle(5000)).toBe('Save 5,000 kcal');
  });
});
