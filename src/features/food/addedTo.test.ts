import { readdirSync, readFileSync, statSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

import { BUILTIN_FOODS } from '@/data/foods';

import { TOAST_NAME_MAX, foodAddedToast, foodNameHead, mealOnDay, quickAddedToast, toastFoodName, waterAddedToast, withWaterTotal } from './addedTo';
import { displayFoodName } from './displayName';

/** A comma between an open bracket and its close: "Israeli salad (tomato, cucumber, ...)". */
function commaInBrackets(name: string): boolean {
  let depth = 0;
  for (const c of name) {
    if (c === '(') depth++;
    else if (c === ')') depth--;
    else if (c === ',' && depth > 0) return true;
  }
  return false;
}

/** Every bracket the toast opens it also closes. */
function balanced(text: string): boolean {
  let depth = 0;
  for (const c of text) {
    if (c === '(') depth++;
    else if (c === ')') depth--;
    if (depth < 0) return false;
  }
  return depth === 0;
}

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
  it('never cuts inside brackets: before the bracket, or at the first comma outside them', () => {
    expect(foodAddedToast('Israeli salad (tomato, cucumber, onion, oil, lemon)', 'lunch')).toBe('Israeli salad added to lunch');
    expect(toastFoodName('Spirits (vodka, whiskey, rum, gin; 80 proof)')).toBe('Spirits');
    expect(toastFoodName('Sushi roll, California (crab, avocado, cucumber)')).toBe('Sushi roll');
    expect(toastFoodName('Chicken schnitzel (breaded, pan-fried)')).toBe('Chicken schnitzel');
    expect(toastFoodName('Bourekas, spinach filling (phyllo, frozen)')).toBe('Bourekas');
    // A bracket that fits is kept whole: it says which one.
    expect(toastFoodName('Chicken curry (sauce, no rice)')).toBe('Chicken curry (sauce, no rice)');
    expect(toastFoodName('Pomegranate seeds (arils), raw')).toBe('Pomegranate seeds (arils)');
    expect(foodNameHead('Israeli salad (tomato, cucumber, onion, oil, lemon)')).toBe('Israeli salad (tomato, cucumber, onion, oil, lemon)');
    // A long name with no comma outside brackets and a long run before the bracket: shortened at a word, the bracket left out.
    const said = toastFoodName('Slow-roasted Mediterranean vegetable grain bowl (tahini, lemon, herbs)');
    expect(said).toBe('Slow-roasted Mediterranean…');
    // A bracket someone left open is never closed by a cut in the middle of it.
    expect(balanced(toastFoodName('Lunch box (rice, chicken, a long list of things'))).toBe(true);
  });
  it('every bundled name with a comma inside brackets is said before the bracket or whole, with every bracket closed', () => {
    const names = BUILTIN_FOODS.map(displayFoodName).filter(commaInBrackets);
    expect(names.length).toBeGreaterThanOrEqual(16);
    for (const name of names) {
      const said = toastFoodName(name);
      expect(balanced(said), `${name} -> ${said}`).toBe(true);
      expect(said.endsWith('…'), `${name} -> ${said}`).toBe(false);
      expect(name.startsWith(said), `${name} -> ${said}`).toBe(true);
      expect(said.length, `${name} -> ${said}`).toBeLessThanOrEqual(TOAST_NAME_MAX);
      // Never a word cut short: the toast ends where a word of the name ends.
      expect(/[\s,(]/.test(name[said.length] ?? ' '), `${name} -> ${said}`).toBe(true);
    }
  });
  it('no bundled name is said with a bracket left open', () => {
    const open = BUILTIN_FOODS.map(displayFoodName)
      .map((name) => [name, toastFoodName(name)] as const)
      .filter(([, said]) => !balanced(said));
    expect(open).toEqual([]);
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
  it('one ending for every toast that adds water: the total when it is known, the goal when it is reached', () => {
    const plain = (s: string) => s.replace(/\u00A0/g, ' ');
    const drink = 'Milk, 129 kcal, added to lunch and 250 ml to Water';
    expect(plain(withWaterTotal(drink, false, '1.48 of 3.3 L'))).toBe(`${drink} · 1.48 of 3.3 L`);
    expect(plain(withWaterTotal(drink, true, '3.3 of 3.3 L'))).toBe(`${drink} · 3.3 of 3.3 L, goal reached`);
    expect(withWaterTotal(drink, true)).toBe(`${drink}. Goal reached`);
    expect(withWaterTotal(drink, false)).toBe(drink);
  });
});

describe('one name cutter', () => {
  /** Every source file under src/, tests left out. */
  function sources(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const file = path.join(dir, name);
      if (statSync(file).isDirectory()) return sources(file);
      return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [file] : [];
    });
  }

  it("no file cuts a food's name at its first comma itself: foodNameHead does, so a name is never cut inside brackets", () => {
    const src = path.join(__dirname, '..', '..');
    // `name.split(',')[0]` or `displayFoodName(e).split(',')[0]` would say "Israeli salad (tomato".
    const cut = /(name|displayFoodName\([^)]*\))\s*\.split\(\s*['"],\s*['"]\s*\)\s*\[0\]/i;
    const found = sources(src)
      .filter((file) => cut.test(readFileSync(file, 'utf8')))
      .map((file) => path.relative(src, file));
    expect(found).toEqual([]);
  });
});
