import { describe, expect, it } from 'vitest';

import {
  approxKcal,
  approxKcalSpoken,
  favoriteActionLabel,
  favoriteLabel,
  favoriteToast,
  FAVOURITE_ACTION,
  FAVOURITE_GROUPS,
  FAVOURITES_EMPTY,
  favoriteFoodTile,
  hasEstimate,
  isEstimateFood,
  logMealLabel,
  saveRowDay,
  savedRowCaption,
  savedTileCaption,
} from './favoriteWords';

const BANNED = ['bad', 'failed', 'missed your', 'should', 'cheat', 'great', 'upgrade', 'unlock', 'premium'];

describe('favourite words', () => {
  it('toasts: the verb first (a name with commas never reads as a list), foods plain, meals quoted', () => {
    expect(favoriteToast('Banana, raw', true, 'food')).toBe('Added to favourites: Banana, raw');
    expect(favoriteToast('Banana, raw', false, 'food')).toBe('Removed from favourites: Banana, raw');
    expect(favoriteToast('Usual breakfast', true, 'meal')).toBe('Added to favourites: "Usual breakfast"');
    expect(favoriteToast('Usual breakfast', false, 'meal')).toBe('Removed from favourites: "Usual breakfast"');
  });
  it('labels: the star keeps one name whatever its state; the long press says what it does', () => {
    expect(favoriteLabel('Usual breakfast')).toBe('Favourite Usual breakfast');
    expect(favoriteActionLabel(false)).toBe('Add to favourites');
    expect(favoriteActionLabel(true)).toBe('Remove from favourites');
    // A saved-meal row's "+" names the meal it logs.
    expect(logMealLabel('Usual breakfast')).toBe('Log Usual breakfast');
  });
  it("the + sheet's favourite food tile: an AI food, or one last logged with a range, reads \"~\", its label as drawn", () => {
    expect(isEstimateFood({ source: 'ai' }, null)).toBe(true);
    expect(isEstimateFood({ source: 'builtin' }, { kcalRange: [200, 295] })).toBe(true);
    expect(isEstimateFood({ source: 'builtin' }, {})).toBe(false);
    expect(isEstimateFood({ source: 'custom' }, undefined)).toBe(false);
    expect(favoriteFoodTile({ name: 'Grilled chicken breast', portion: '150 g', kcal: 247.6, estimate: true, meal: 'lunch' })).toEqual({
      caption: '150 g, ~248 kcal',
      label: 'Add favourite Grilled chicken breast, 150 g, ~248 kcal, to lunch',
    });
    expect(favoriteFoodTile({ name: 'Banana, raw', portion: '1 medium', kcal: 105, estimate: false, meal: 'breakfast' })).toEqual({
      caption: '1 medium, 105 kcal',
      label: 'Add favourite Banana, raw, 1 medium, 105 kcal, to breakfast',
    });
  });
  it('the save row names its day from the day the screen holds, never the clock', () => {
    expect(saveRowDay('2026-11-24', '2026-11-24')).toBe('today');
    expect(saveRowDay('2026-11-23', '2026-11-24')).toBe('yesterday');
    expect(saveRowDay('2026-11-25', '2026-11-24')).toBe('tomorrow');
    expect(saveRowDay('2026-11-14', '2026-11-24')).toBe('Sat, Nov 14');
    // The same date a day later: the word follows the day held, not the moment the row was drawn.
    expect(saveRowDay('2026-11-24', '2026-11-25')).toBe('yesterday');
  });
  it('an estimate never shows an exact number', () => {
    expect(approxKcal(473.4, true)).toBe('~473');
    expect(approxKcal(1473, false)).toBe('1,473');
    expect(approxKcalSpoken(473.4, true)).toBe('about 473 kilocalories');
    expect(approxKcalSpoken(473, false)).toBe('473 kilocalories');
    expect(hasEstimate([{ kcalRange: [400, 550] }, {}])).toBe(true);
    expect(hasEstimate([{}, { kcalRange: undefined }])).toBe(false);
    expect(savedTileCaption({ items: 3, servings: 1, servingsText: '1', kcal: 640, estimate: true })).toBe('3 items, ~640 kcal');
    expect(savedTileCaption({ items: 1, servings: 1, servingsText: '1', kcal: 640, estimate: false })).toBe('1 item, 640 kcal');
    expect(savedTileCaption({ items: 5, servings: 4, servingsText: '4', kcal: 520, estimate: false })).toBe('1 of 4 servings, 520 kcal');
    expect(savedRowCaption({ items: 2, servings: 1, servingsText: '1', kcal: 332, estimate: true })).toBe('2 items · ~332 kcal');
    expect(savedRowCaption({ items: 5, servings: 4, servingsText: '4', kcal: 410, estimate: false })).toBe('410 kcal per serving · makes 4');
  });
  it('every fixed string: sentence case, no exclamation mark, no banned word', () => {
    const fixed = [
      FAVOURITES_EMPTY.title,
      FAVOURITES_EMPTY.message,
      FAVOURITE_ACTION.add,
      FAVOURITE_ACTION.remove,
      FAVOURITE_GROUPS.meals,
      FAVOURITE_GROUPS.foods,
      favoriteToast('X', true, 'meal'),
      favoriteToast('X', false, 'food'),
      favoriteFoodTile({ name: 'X', portion: '1 g', kcal: 1, estimate: true, meal: 'lunch' }).caption,
    ];
    for (const s of fixed) {
      expect(s).not.toContain('!');
      expect(s[0]).toBe(s[0].toUpperCase());
      for (const w of BANNED) expect(s.toLowerCase()).not.toMatch(new RegExp(`\\b${w}\\b`));
    }
    expect(FAVOURITES_EMPTY.message).toBe('Tap the star on a food or a saved meal, or press and hold it in search or the diary.');
  });
});

describe("the coach's ideas answer (R3)", () => {
  it('an idea whose items carry a range says "~" before its calories; an exact one does not', async () => {
    const { ideaAnswerLine } = await import('@/features/coach/local');
    const base = { key: 'saved:x', kind: 'saved' as const, share: 1 as const, name: 'Chicken and rice bowl', kcal: 592, protein: 52, foods: ['Grilled chicken', 'White rice'] };
    const it0 = { name: 'Grilled chicken', servingLabel: '1 portion', quantity: 1, grams: 160, nutrients: { kcal: 264, protein: 46, carbs: 0, fat: 8 }, source: 'ai' as const, verified: false };
    expect(ideaAnswerLine({ ...base, items: [{ ...it0, kcalRange: [220, 320] as [number, number] }] })).toBe('Chicken and rice bowl: ~592 kcal, 52 g protein (Grilled chicken, White rice)');
    expect(ideaAnswerLine({ ...base, items: [it0] })).toBe('Chicken and rice bowl: 592 kcal, 52 g protein (Grilled chicken, White rice)');
  });
});
