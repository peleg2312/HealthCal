/**
 * The words for saving meals (./saveWords.ts): the review's button, the toast after logging and saving,
 * the offered names and the diary hint. Sentence case, no "!", none of the morning page's banned words.
 */
import { describe, expect, it } from 'vitest';

import { withoutMarks } from '@/lib/bidi';
import type { MealType } from '@/types';

import {
  addedAndSavedToast,
  aiAddTitle,
  aiMealName,
  defaultMealName,
  itemCount,
  SAVE_FIXED_WORDS,
  SAVED_TOAST_BUDGET,
  saveHintA11y,
  saveHintLabel,
  saveSheetFoods,
  saveSheetLine,
  saveSheetTitle,
  savedToastBudget,
  shortName,
  showSaveSheetFoods,
} from './saveWords';

const BANNED = /\b(bad|fail|failed|cheat|should|great|missed your|upgrade|unlock|premium)\b/i;

describe('aiAddTitle', () => {
  it("today's titles while the switch is off, one more word while it is on", () => {
    expect(aiAddTitle({ sample: false, save: false, meal: 'Lunch' })).toBe('Add to lunch');
    expect(aiAddTitle({ sample: true, save: false, meal: 'Lunch' })).toBe('Add sample to lunch');
    expect(aiAddTitle({ sample: false, save: true, meal: 'Breakfast' })).toBe('Add to breakfast and save');
    // The sample never saves (it has no switch): its title stays the sample's.
    expect(aiAddTitle({ sample: true, save: true, meal: 'Lunch' })).toBe('Add sample to lunch');
  });
});

describe('addedAndSavedToast', () => {
  it('names the meal, singular and plural', () => {
    expect(addedAndSavedToast({ count: 4, where: 'lunch', name: 'Chicken and rice' })).toBe('4 items added to lunch, saved as "Chicken and rice"');
    expect(addedAndSavedToast({ count: 1, where: 'dinner', name: 'Soup' })).toBe('1 item added to dinner, saved as "Soup"');
  });

  it('another day, and the water a swapped drink added, said once at the end', () => {
    expect(addedAndSavedToast({ count: 2, where: 'lunch, Sat Nov 14', name: 'Toast' })).toBe('2 items added to lunch, Sat Nov 14, saved as "Toast"');
    expect(addedAndSavedToast({ count: 2, where: 'lunch, Sat Nov 14', name: 'Toast', ml: 250 })).toBe('2 items added to lunch, Sat Nov 14, meal saved, 250 ml to Water');
    expect(addedAndSavedToast({ count: 2, where: 'lunch, Sat Nov 14', name: 'Toast', ml: 250, width: 360 })).toBe('2 items added to lunch, Sat Nov 14, saved as "Toast", 250 ml to Water');
  });

  it('keeps to the two-line budget at 320 px by shortening the name, never the rest', () => {
    const long = 'Grilled chicken breast with brown rice, roasted vegetables and tahini';
    const plain = addedAndSavedToast({ count: 4, where: 'lunch', name: long });
    expect(plain.length).toBeLessThanOrEqual(SAVED_TOAST_BUDGET);
    expect(plain).toMatch(/^4 items added to lunch, saved as "Grilled chicken.*…"$/);
    // With the water clause the name gives way first, down to 4 of its letters; with fewer, "meal saved".
    expect(addedAndSavedToast({ count: 2, where: 'snacks', name: 'Tea', ml: 250 })).toBe('2 items added to snacks, saved as "Tea", 250 ml to Water');
    expect(addedAndSavedToast({ count: 2, where: 'snacks', name: 'Chicken and latte', ml: 250 })).toBe('2 items added to snacks, saved as "Chic…", 250 ml to Water');
    expect(addedAndSavedToast({ count: 2, where: 'lunch', name: 'Shake', ml: 500, units: 'imperial' })).toBe('2 items added to lunch, meal saved, 17 fl oz to Water');
    expect(addedAndSavedToast({ count: 4, where: 'breakfast', name: long, ml: 250 })).toBe('4 items added to breakfast, meal saved, 250 ml to Water');
  });

  it('the budget follows the window: 58 at 320 px, 69 at 360, 78 at 390, capped with the content', () => {
    expect(savedToastBudget(320)).toBe(SAVED_TOAST_BUDGET);
    expect(savedToastBudget(undefined)).toBe(SAVED_TOAST_BUDGET);
    expect(savedToastBudget(Number.NaN)).toBe(SAVED_TOAST_BUDGET);
    expect(savedToastBudget(360)).toBe(69);
    expect(savedToastBudget(390)).toBe(78);
    expect(savedToastBudget(1280)).toBe(savedToastBudget(560));
    const long = 'Grilled chicken breast with brown rice, roasted vegetables and tahini';
    for (const width of [320, 360, 390, 430]) {
      expect(addedAndSavedToast({ count: 4, where: "yesterday's breakfast", name: long, width }).length).toBeLessThanOrEqual(savedToastBudget(width));
    }
    // A wider phone keeps more of the same name.
    expect(addedAndSavedToast({ count: 4, where: 'lunch', name: long, width: 360 })).toBe('4 items added to lunch, saved as "Grilled chicken breast with brown…"');
    expect(addedAndSavedToast({ count: 4, where: 'lunch', name: long, width: 320 })).toBe('4 items added to lunch, saved as "Grilled chicken breast…"');
  });

  it("yesterday's breakfast with a 27-letter Hebrew name and no water: the name is kept, shortened at 320, longer at 360", () => {
    const name = 'שקשוקה של שבת בבוקר עם לחם וטחינה';
    expect(name.replace(/[^\p{L}]/gu, '')).toHaveLength(27);
    const at320 = addedAndSavedToast({ count: 4, where: "yesterday's breakfast", name, width: 320 });
    const at360 = addedAndSavedToast({ count: 4, where: "yesterday's breakfast", name, width: 360 });
    expect(withoutMarks(at320)).toBe(`4 items added to yesterday's breakfast, saved as "שקשוקה…"`);
    expect(withoutMarks(at360)).toBe(`4 items added to yesterday's breakfast, saved as "שקשוקה של שבת…"`);
    expect(withoutMarks(at320).length).toBeLessThanOrEqual(savedToastBudget(320));
    expect(withoutMarks(at360).length).toBeLessThanOrEqual(savedToastBudget(360));
    // The shortened name is still isolated, so its ellipsis stays with it.
    expect(at320).not.toBe(withoutMarks(at320));
  });

  it('drops the name only when fewer than 4 of its letters would show', () => {
    // 4 items to lunch with 250 ml: the prefix leaves 6 characters at 320 px (5 letters and the ellipsis).
    expect(addedAndSavedToast({ count: 4, where: 'lunch', name: 'Shakshuka', ml: 250 })).toBe('4 items added to lunch, saved as "Shaks…", 250 ml to Water');
    // 4 items to snacks with 250 ml leaves 5: four letters still show.
    expect(addedAndSavedToast({ count: 4, where: 'snacks', name: 'Shakshuka', ml: 250 })).toBe('4 items added to snacks, saved as "Shak…", 250 ml to Water');
    // A name that fits whole stays whole, however short.
    expect(addedAndSavedToast({ count: 4, where: 'snacks', name: 'Tea', ml: 250 })).toBe('4 items added to snacks, saved as "Tea", 250 ml to Water');
    // 12 items to snacks with 250 ml leaves 4: three letters would show, so "meal saved".
    expect(addedAndSavedToast({ count: 12, where: 'snacks', name: 'Shakshuka', ml: 250 })).toBe('12 items added to snacks, meal saved, 250 ml to Water');
  });

  it('a Hebrew name is isolated in the line, the raw name stays readable', () => {
    const msg = addedAndSavedToast({ count: 3, where: 'lunch', name: 'שניצל עם אורז' });
    expect(withoutMarks(msg)).toBe('3 items added to lunch, saved as "שניצל עם אורז"');
    expect(msg).not.toBe(withoutMarks(msg));
  });
});

describe('shortName', () => {
  it('whole when it fits, else cut at a word with an ellipsis', () => {
    expect(shortName('Chicken and rice', 30)).toBe('Chicken and rice');
    expect(shortName('Chicken and rice with salad', 20)).toBe('Chicken and rice…');
    expect(shortName('Chicken, rice', 10)).toBe('Chicken…');
    expect(shortName('Supercalifragilistic', 8)).toBe('Superca…');
    // A room that ends where a word ends keeps the word.
    expect(shortName('Chicken and rice with salad', 17)).toBe('Chicken and rice…');
  });
});

describe('aiMealName', () => {
  it("the dish, tidied", () => {
    expect(aiMealName('  Chicken,   rice and  salad ', [])).toBe('Chicken, rice and salad');
  });

  it('over 60 characters: cut at a word, no dangling "and", "with" or comma, no ellipsis', () => {
    const dish = 'Grilled chicken breast with brown rice, steamed broccoli and a light lemon dressing';
    const name = aiMealName(dish, []);
    expect(name.length).toBeLessThanOrEqual(60);
    expect(name).toBe('Grilled chicken breast with brown rice, steamed broccoli');
    expect(aiMealName('Rice with chicken and vegetables cooked slowly in a pot with and', [])).not.toMatch(/(and|with|,)$/);
    expect(aiMealName(`${'a'.repeat(70)}`, [])).toHaveLength(60);
  });

  it('no dish: the first item, then "Saved meal"', () => {
    expect(aiMealName('', [{ name: ' ' }, { name: 'Greek yogurt, plain' }])).toBe('Greek yogurt, plain');
    expect(aiMealName(undefined, [])).toBe('Saved meal');
  });
});

describe('defaultMealName', () => {
  const e = (name: string, via?: 'water') => ({ name, via });
  it('the first three foods by their first words', () => {
    expect(defaultMealName([e('Banana, raw'), e('Almonds'), e('Greek yogurt, plain'), e('Honey')], 'breakfast')).toBe('Banana, Almonds, Greek yogurt');
  });

  it('a long list: "My lunch", never "Lunch favourite"', () => {
    const name = defaultMealName([e('Beef and vegetable stir fry'), e('White rice, cooked'), e('Chocolate chip cookie')], 'lunch');
    expect(name).toBe('My lunch');
    expect(name).not.toMatch(/favourite/i);
    expect(defaultMealName([], 'snack')).toBe('My snacks');
  });

  it('a drink logged on Water is left out, as the save leaves it out', () => {
    expect(defaultMealName([e('Milk', 'water'), e('Toast')], 'breakfast')).toBe('Toast');
  });

  it('never cuts a name inside its brackets (foodNameHead)', () => {
    // The commas inside the brackets are not the name's first comma: the whole name or nothing.
    expect(saveSheetFoods([e('Israeli salad (tomato, cucumber, onion, oil, lemon)'), e('Pita bread, white')])).toEqual([
      'Israeli salad (tomato, cucumber, onion, oil, lemon)',
      'Pita bread',
    ]);
    expect(saveSheetFoods([e('Sushi roll, California (crab, avocado, cucumber)')])).toEqual(['Sushi roll']);
    expect(defaultMealName([e('Chicken curry (sauce, no rice)'), e('Rice, cooked')], 'dinner')).toBe('Chicken curry (sauce, no rice), Rice');
    // Too long whole: "My lunch", never "Israeli salad (tomato".
    const salad = defaultMealName([e('Israeli salad (tomato, cucumber, onion, oil, lemon)'), e('Hummus')], 'lunch');
    expect(salad).toBe('My lunch');
    for (const name of [salad, ...saveSheetFoods([e('Israeli salad (tomato, cucumber, onion, oil, lemon)')])]) {
      expect((name.match(/\(/g) ?? []).length).toBe((name.match(/\)/g) ?? []).length);
    }
  });
});

describe('the hint and the sheet', () => {
  it('names the meal in lower case', () => {
    expect(saveHintLabel('lunch')).toBe('Save lunch as a meal');
    expect(saveSheetTitle('breakfast')).toBe('Save breakfast as a meal');
    expect(saveHintA11y('dinner')).toBe('Save dinner as a meal, to log the same foods again later');
  });

  it('an estimate is never an exact number, and the line promises only what Saved meals does', () => {
    expect(saveSheetLine(3, '446', false)).toBe('3 items · 446 kcal. Find it any time in Saved meals.');
    expect(saveSheetLine(2, '507', true)).toBe('2 items · ~507 kcal. Find it any time in Saved meals.');
    expect(saveSheetLine(3, '446', false)).not.toMatch(/one tap/);
    expect(saveHintA11y('lunch')).not.toMatch(/one tap/);
    expect(itemCount(1)).toBe('1 item');
  });

  it('the bold foods line only when the name offered says something else', () => {
    const e = (name: string, via?: 'water') => ({ name, via });
    const three = [e('Almonds'), e('Greek yogurt, plain, 2%'), e('Banana, raw')];
    expect(saveSheetFoods(three)).toEqual(['Almonds', 'Greek yogurt', 'Banana']);
    // The name offered is these three foods: the field already says them, so no line in bold.
    expect(showSaveSheetFoods(three, 'breakfast')).toBe(false);
    // A fourth food: the name offered is the first three, so the line lists all four.
    expect(showSaveSheetFoods([...three, e('Honey')], 'breakfast')).toBe(true);
    // Over 40 characters: "My lunch" is offered, so the foods show.
    const long = [e('Beef and vegetable stir fry'), e('White rice, cooked'), e('Chocolate chip cookie')];
    expect(defaultMealName(long, 'lunch')).toBe('My lunch');
    expect(showSaveSheetFoods(long, 'lunch')).toBe(true);
    // A drink logged on Water is left out of both, as the save leaves it out.
    expect(saveSheetFoods([e('Milk', 'water'), e('Toast'), e('Jam')])).toEqual(['Toast', 'Jam']);
    expect(showSaveSheetFoods([e('Milk', 'water'), e('Toast'), e('Jam')], 'breakfast')).toBe(false);
    expect(showSaveSheetFoods([], 'breakfast')).toBe(false);
  });
});

describe('closing the save sheet', () => {
  it('asks only when a name was typed over the one offered', () => {
    expect(saveNameTyped('Almonds, Greek yogurt, Banana', 'Almonds, Greek yogurt, Banana')).toBe(false);
    expect(saveNameTyped(' Almonds, Greek yogurt, Banana ', 'Almonds, Greek yogurt, Banana')).toBe(false);
    expect(saveNameTyped('', 'My lunch')).toBe(false);
    expect(saveNameTyped('My work breakfast', 'Almonds, Greek yogurt, Banana')).toBe(true);
    expect(SAVE_NAME_DISCARD).toBe('Discard this meal name?');
  });
});

describe('house rules', () => {
  it('no "!", no banned word, sentence case, in every string', () => {
    const meals: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];
    const all = [
      ...SAVE_FIXED_WORDS,
      ...meals.flatMap((m) => [saveHintLabel(m), saveHintA11y(m), saveSheetTitle(m)]),
      ...[true, false].flatMap((sample) => [true, false].map((save) => aiAddTitle({ sample, save, meal: 'Lunch' }))),
      addedAndSavedToast({ count: 3, where: 'lunch', name: 'Chicken', ml: 250 }),
      saveSheetLine(3, '640', true),
    ];
    for (const s of all) {
      expect(s).not.toMatch(BANNED);
      expect(s).not.toContain('!');
      expect(s[0]).toBe(s[0].toUpperCase());
    }
  });
});
