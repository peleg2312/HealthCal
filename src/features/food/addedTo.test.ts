import { describe, expect, it } from 'vitest';

import { TOAST_NAME_MAX, foodAddedToast, mealOnDay, quickAddedToast, toastFoodName, waterAddedToast } from './addedTo';

describe('mealOnDay', () => {
  const today = '2026-11-16';
  it('is just the meal on today', () => {
    expect(mealOnDay('lunch', today, today)).toBe('lunch');
  });
  it('names yesterday and tomorrow', () => {
    expect(mealOnDay('lunch', '2026-11-15', today)).toBe("yesterday's lunch");
    expect(mealOnDay('dinner', '2026-11-17', today)).toBe("tomorrow's dinner");
  });
  it('gives the date for any other day', () => {
    expect(mealOnDay('lunch', '2026-11-14', today)).toBe('lunch, Sat Nov 14');
    expect(mealOnDay('breakfast', '2026-11-20', today)).toBe('breakfast, Fri Nov 20');
  });
  it('crosses a month on the local calendar', () => {
    expect(mealOnDay('dinner', '2026-10-31', '2026-11-01')).toBe("yesterday's dinner");
  });
});

describe('the log toast names what was added first', () => {
  const today = '2026-11-16';
  it('a food: the part of its name before the first comma, then where', () => {
    expect(foodAddedToast('Banana, raw', mealOnDay('breakfast', today, today))).toBe('Banana added to breakfast');
    expect(foodAddedToast('Banana, raw', mealOnDay('lunch', '2026-11-15', today))).toBe("Banana added to yesterday's lunch");
    expect(foodAddedToast('Greek yogurt, plain, 2%', 'breakfast, Sat Nov 14')).toBe('Greek yogurt added to breakfast, Sat Nov 14');
    expect(foodAddedToast('Beef and vegetable stir fry', 'lunch')).toBe('Beef and vegetable stir fry added to lunch');
  });
  it('a long name is shortened at a word with an ellipsis, never mid-word', () => {
    const long = 'Slow-roasted Mediterranean vegetable and chickpea grain bowl with tahini';
    const said = toastFoodName(long);
    expect(said.endsWith('…')).toBe(true);
    expect(said.length).toBeLessThanOrEqual(TOAST_NAME_MAX + 1);
    expect(long.startsWith(said.slice(0, -1))).toBe(true);
    expect(long[said.length - 1]).toBe(' ');
  });
  it('a name that starts with a comma or is only spaces falls back to the whole name', () => {
    expect(toastFoodName(', odd')).toBe(', odd');
    expect(toastFoodName('  Apple  ')).toBe('Apple');
  });
  it('a Hebrew name is isolated, so the sentence keeps its order', () => {
    expect(toastFoodName('בורקס גבינה')).not.toBe('בורקס גבינה');
    expect(toastFoodName('בורקס גבינה')).toContain('בורקס גבינה');
  });
  it('a quick add: its name, or its calories when it has none', () => {
    expect(quickAddedToast('Birthday cake', 420, 'snacks')).toBe('Birthday cake added to snacks');
    expect(quickAddedToast('', 1320.4, 'lunch')).toBe('1,320 kcal added to lunch');
  });
  it('a glass: "250 ml added to Water", the day when it is not today, and the goal when it is reached', () => {
    expect(waterAddedToast('250 ml', today, today)).toBe('250 ml added to Water');
    expect(waterAddedToast('8.5 fl oz', '2026-11-15', today)).toBe('8.5 fl oz added to Water for yesterday');
    expect(waterAddedToast('250 ml', '2026-11-14', today, true)).toBe('250 ml added to Water for Sat Nov 14. Goal reached');
    expect(waterAddedToast('250 ml', today, today, true)).toBe('250 ml added to Water. Goal reached');
    // With the day's new total, as Today's glass says it (the toast rests over Today's water row), held on one line.
    const plain = (s: string) => s.replace(/\u00A0/g, ' ');
    expect(plain(waterAddedToast('250 ml', today, today, false, '1.48 of 3.3 L'))).toBe('250 ml added to Water · 1.48 of 3.3 L');
    expect(waterAddedToast('250 ml', today, today, false, '1.48 of 3.3 L')).toContain('1.48\u00A0of\u00A03.3\u00A0L');
    expect(plain(waterAddedToast('250 ml', today, today, true, '3.3 of 3.3 L'))).toBe('250 ml added to Water · 3.3 of 3.3 L, goal reached');
    expect(plain(waterAddedToast('8.5 fl oz', '2026-11-15', today, false, '41 of 112 fl oz'))).toBe('8.5 fl oz added to Water for yesterday · 41 of 112 fl oz');
  });
});
