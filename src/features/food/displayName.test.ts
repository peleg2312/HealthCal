import { describe, expect, it } from 'vitest';

import { BUILTIN_FOODS } from '@/data/foods';

import { displayFoodName, KEEP_CAPS } from './displayName';

const CAPS = /\b[A-Z]{2,}\b/g;

describe('displayFoodName', () => {
  it('writes the database capitals of a bundled name in lower case', () => {
    expect(displayFoodName({ name: 'Oats, rolled, DRY (uncooked)', source: 'builtin' })).toBe('Oats, rolled, dry (uncooked)');
    expect(displayFoodName({ name: 'Chicken breast, skinless, RAW', source: 'builtin' })).toBe('Chicken breast, skinless, raw');
    expect(displayFoodName({ name: 'Chicken thigh, skinless, COOKED (roasted)', source: 'usda' })).toBe('Chicken thigh, skinless, cooked (roasted)');
  });

  it('keeps real acronyms and every capital that starts a word', () => {
    expect(displayFoodName({ name: 'Beer, regular (about 5% ABV)', source: 'builtin' })).toBe('Beer, regular (about 5% ABV)');
    expect(displayFoodName({ name: 'Salmon, Atlantic farmed, RAW', source: 'builtin' })).toBe('Salmon, Atlantic farmed, raw');
  });

  it('leaves every name that is not from the bundled list as written', () => {
    for (const source of ['openfoodfacts', 'custom', 'ai', 'quick'] as const) {
      expect(displayFoodName({ name: 'NUTELLA hazelnut spread, RAW', source })).toBe('NUTELLA hazelnut spread, RAW');
    }
    expect(displayFoodName({ name: 'חומוס, RAW', source: 'custom' })).toBe('חומוס, RAW');
  });

  it('changes only the case of the all-capital words of the 467 bundled names, and keeps the acronyms', () => {
    expect(BUILTIN_FOODS).toHaveLength(467);
    const changed = BUILTIN_FOODS.filter((f) => displayFoodName(f) !== f.name);
    // The before and after of every name that changes, read by hand: only the state words lose their capitals.
    const lowered = new Set(changed.flatMap((f) => f.name.match(CAPS) ?? []).filter((w) => !KEEP_CAPS.has(w)));
    expect([...lowered].sort()).toEqual(['COOKED', 'DRY', 'RAW']);
    expect(changed.length).toBe(58);
    for (const f of BUILTIN_FOODS) {
      const shown = displayFoodName(f);
      // The same letters, only their case.
      expect(shown.toLowerCase()).toBe(f.name.toLowerCase());
      // No capital word is left but an acronym.
      expect((shown.match(CAPS) ?? []).every((w) => KEEP_CAPS.has(w))).toBe(true);
      // A word's first capital ("Atlantic", "Greek") is never touched.
      expect(shown[0]).toBe(f.name[0]);
    }
    expect(BUILTIN_FOODS.filter((f) => /ABV/.test(displayFoodName(f)))).toHaveLength(2);
  });

  it('is display only: the stored name of a food and an entry is never changed', () => {
    const food = BUILTIN_FOODS.find((f) => /DRY/.test(f.name))!;
    const before = food.name;
    displayFoodName(food);
    expect(food.name).toBe(before);
  });
});
