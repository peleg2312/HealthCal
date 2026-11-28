import { describe, expect, it } from 'vitest';

import { showShortcutMeal } from './showNow';
import { showShortcutTitle } from './words';

const base = { mealsAllowed: true, pickable: 2, meal: 'lunch' as const, hasFood: true, shownNow: false };

describe('the "Show today’s lunch" shortcut on Friends', () => {
  it('offers the meal of the hour while it has food and is not shown', () => {
    expect(showShortcutMeal(base)).toBe('lunch');
    expect(showShortcutTitle('lunch')).toBe('Show today’s lunch to friends');
    expect(showShortcutTitle('snack')).toBe('Show today’s snacks to friends');
  });

  it('is left out under 18 or without meals, with nobody to pick, an empty meal, or a meal already shown', () => {
    expect(showShortcutMeal({ ...base, mealsAllowed: false })).toBeNull();
    expect(showShortcutMeal({ ...base, pickable: 0 })).toBeNull();
    expect(showShortcutMeal({ ...base, hasFood: false })).toBeNull();
    expect(showShortcutMeal({ ...base, shownNow: true })).toBeNull();
  });
});
