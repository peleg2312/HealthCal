import { describe, expect, it } from 'vitest';

import { BEVERAGE_LABELS } from '@/lib/hydration';
import type { Beverage } from '@/types';

import { CHOICE_KCAL_LINE, DRINK_CHOICES, PICK_CHIP, choiceById, choicesFor, defaultChoiceId } from './choices';
import { builtinFood, choiceFood, drinkKcal, isAlcohol } from './rules';

const KINDS = Object.keys(BEVERAGE_LABELS) as Beverage[];

/** kcal for 250 ml, from the specification's table. */
const KCAL_250: Record<string, number> = {
  tea_milk: 18,
  tea_milk_sugar: 34,
  tea_sugar: 19,
  coffee_milk: 18,
  coffee_milk_sugar: 34,
  coffee_sugar: 19,
  latte: 139,
  cappuccino: 104,
  juice_orange: 128,
  juice_apple: 121,
  milk_semi: 129,
  milk_whole: 157,
  milk_skim: 88,
  milk_oat: 114,
  milk_soy: 85,
  milk_almond: 38,
  sports_regular: 68,
  sports_low: 20,
  soft_regular: 109,
};

describe('DRINK_CHOICES', () => {
  it('ids are unique', () => {
    const ids = DRINK_CHOICES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).not.toContain('food');
    expect(ids).not.toContain('kcal');
  });

  it('every food and reference id is a bundled food, and none is alcohol', () => {
    for (const c of DRINK_CHOICES) {
      for (const id of [c.foodId, c.refId]) {
        if (!id) continue;
        const f = builtinFood(id);
        expect(f, `${c.id}: ${id}`).not.toBeNull();
        expect(isAlcohol(f!), c.id).toBe(false);
      }
    }
  });

  it('Water has no choices; every other kind has exactly one default', () => {
    expect(choicesFor('water')).toEqual([]);
    expect(defaultChoiceId('water')).toBeNull();
    for (const kind of KINDS.filter((k) => k !== 'water')) {
      expect(choicesFor(kind).filter((c) => c.isDefault).length, kind).toBe(1);
    }
  });

  it('Tea, Coffee, Sports drink and Other start on no calories (as before); Milk and Juice on calories', () => {
    for (const kind of ['tea', 'coffee', 'sports', 'other'] as Beverage[]) expect(choiceById(defaultChoiceId(kind))!.foodId, kind).toBeNull();
    for (const kind of ['milk', 'juice'] as Beverage[]) expect(choiceById(defaultChoiceId(kind))!.foodId, kind).not.toBeNull();
    expect(defaultChoiceId('milk')).toBe('milk_semi');
    expect(defaultChoiceId('juice')).toBe('juice_orange');
  });

  it('a no-calorie choice has none to speak of; every food choice has calories', () => {
    for (const c of DRINK_CHOICES) {
      if (c.foodId === null) {
        if (c.refId) expect(builtinFood(c.refId)!.per100g.kcal, c.id).toBeLessThanOrEqual(CHOICE_KCAL_LINE);
      } else expect(builtinFood(c.foodId)!.per100g.kcal, c.id).toBeGreaterThan(CHOICE_KCAL_LINE);
    }
  });

  it('chip labels are short (18 characters at most) and sentence case', () => {
    for (const c of DRINK_CHOICES) {
      expect(c.label.length, c.id).toBeLessThanOrEqual(18);
      expect(c.label[0], c.id).toBe(c.label[0].toUpperCase());
      expect(c.name, c.id).toBe(c.name.toLowerCase());
    }
    for (const p of Object.values(PICK_CHIP)) expect(p!.label.length).toBeLessThanOrEqual(18);
  });

  it('kcal for a 250 ml glass are the table values', () => {
    const got: Record<string, number> = {};
    for (const c of DRINK_CHOICES) {
      const f = choiceFood(c);
      if (f) got[c.id] = drinkKcal(f, 250);
    }
    expect(got).toEqual(KCAL_250);
  });

  it('the sheet chip is on Juice and Other only', () => {
    expect(Object.keys(PICK_CHIP).sort()).toEqual(['juice', 'other']);
  });
});
