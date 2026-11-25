import { describe, expect, it } from 'vitest';

import { AI_TAG, likelyRows, QUICK_ROWS, QUICK_WAYS, quickRowTitle, quickSheetLine, quickSheetTitle, seeAllLabel, seeAllSpoken, seeAllTab, wideWaySpoken } from './quickSheet';

const BANNED = ['bad', 'failed', 'missed your', 'should', 'cheat', 'great', 'over', 'upgrade', 'unlock', 'premium'];
const today = '2026-11-25';

describe('the + sheet in one view', () => {
  it('the title names the meal, and the day only when it is not today', () => {
    expect(quickSheetTitle('dinner', today, today)).toBe('Add to dinner');
    expect(quickSheetTitle('dinner', '2026-11-24', today)).toBe('Add to dinner, yesterday');
    expect(quickSheetTitle('lunch', '2026-11-26', today)).toBe('Add to lunch, tomorrow');
    expect(quickSheetTitle('lunch', '2026-11-14', today)).toBe('Add to lunch, Sat, Nov 14');
  });
  it('the line under it: the day (today only, else the title says it) and what is left, in search header words', () => {
    expect(quickSheetLine(today, today, 941.4)).toBe('Today · 941 kcal left');
    expect(quickSheetLine(today, today, 0)).toBe('Today · 0 kcal left');
    expect(quickSheetLine(today, today, -1234)).toBe('Today · 1,234 kcal above budget');
    expect(quickSheetLine('2026-11-24', today, 230)).toBe('230 kcal left');
  });
  it('three likely rows, and "See all N" only when there are more', () => {
    expect(QUICK_ROWS).toBe(3);
    expect(likelyRows(['a', 'b'])).toEqual({ shown: ['a', 'b'], hidden: [], total: 2, more: false });
    expect(likelyRows(['a', 'b', 'c'])).toEqual({ shown: ['a', 'b', 'c'], hidden: [], total: 3, more: false });
    expect(likelyRows(['a', 'b', 'c', 'd', 'e', 'f', 'g'])).toEqual({ shown: ['a', 'b', 'c'], hidden: ['d', 'e', 'f', 'g'], total: 7, more: true });
    expect(likelyRows([])).toEqual({ shown: [], hidden: [], total: 0, more: false });
    expect(seeAllLabel(7)).toBe('See all 7');
  });
  it('the saved meal changed last takes the third row when it would be left out, so it is two taps from +', () => {
    const saved = (s: string) => s === 'saved';
    // Usual and favourites lead: the meal changed last (always last in the order) takes the third row, the third
    // likely row goes under "See all", and N still counts all of them.
    expect(likelyRows(['usual', 'fav-food', 'fav-food-2', 'usual-2', 'saved'], { keep: saved })).toEqual({
      shown: ['usual', 'fav-food', 'saved'],
      hidden: ['fav-food-2', 'usual-2'],
      total: 5,
      more: true,
    });
    // Already among the first three: nothing moves.
    expect(likelyRows(['usual', 'fav-meal', 'saved'], { keep: saved })).toEqual({ shown: ['usual', 'fav-meal', 'saved'], hidden: [], total: 3, more: false });
    expect(likelyRows(['usual', 'saved'], { keep: saved })).toEqual({ shown: ['usual', 'saved'], hidden: [], total: 2, more: false });
    // No meal changed last (every saved meal is a favourite, or none is saved): the first three, as before.
    expect(likelyRows(['a', 'b', 'c', 'd'], { keep: saved })).toEqual({ shown: ['a', 'b', 'c'], hidden: ['d'], total: 4, more: true });
    // Always QUICK_ROWS rows, never four.
    expect(likelyRows(['a', 'b', 'c', 'd', 'saved'], { keep: saved }).shown).toHaveLength(QUICK_ROWS);
  });
  it('"See all N" opens food search on the tab that holds the rest, and says where', () => {
    expect(seeAllTab(['favourite-food', 'usual', 'usual'])).toBe('usual');
    expect(seeAllTab(['usual'])).toBe('usual');
    expect(seeAllTab(['favourite-meal'])).toBe('meals');
    expect(seeAllTab(['favourite-meal', 'saved-meal'])).toBe('meals');
    expect(seeAllTab(['favourite-meal', 'favourite-food'])).toBe('favorites');
    expect(seeAllTab(['favourite-food'])).toBe('favorites');
    expect(seeAllTab([])).toBe('usual');
    expect(seeAllSpoken(7, 'dinner', 'usual')).toBe('See all 7, your usual foods for dinner in food search');
    expect(seeAllSpoken(4, 'lunch', 'meals')).toBe('See all 4, your saved meals in food search');
    expect(seeAllSpoken(5, 'lunch', 'favorites')).toBe('See all 5, your favourites in food search');
    // The drawn words lead its spoken name (WCAG 2.5.3).
    for (const tab of ['usual', 'meals', 'favorites'] as const) expect(seeAllSpoken(7, 'dinner', tab).startsWith(seeAllLabel(7))).toBe(true);
  });
  it("the overline names the groups among the rows shown, and the meal only when it fits beside 'See all'", () => {
    expect(quickRowTitle({ meal: 'lunch', favourites: false, usual: true, saved: true })).toBe('Usual for lunch');
    expect(quickRowTitle({ meal: 'lunch', favourites: false, usual: false, saved: true })).toBe('Saved meal');
    expect(quickRowTitle({ meal: 'lunch', favourites: true, usual: true, saved: false })).toBe('Usual and favourites');
    expect(quickRowTitle({ meal: 'lunch', favourites: true, usual: true, saved: true })).toBe('Usual and favourites');
    expect(quickRowTitle({ meal: 'lunch', favourites: true, usual: false, saved: true })).toBe('Favourites and saved meals');
    expect(quickRowTitle({ meal: 'lunch', favourites: true, usual: false, saved: false })).toBe('Favourites');
  });
  it('every way in: one drawn word that its spoken name starts with; the AI ways say so', () => {
    for (const [id, w] of Object.entries(QUICK_WAYS)) {
      expect(w.spoken.startsWith(w.label)).toBe(true);
      expect(wideWaySpoken(id as keyof typeof QUICK_WAYS).startsWith(w.wide)).toBe(true);
    }
    expect(QUICK_WAYS.photo.spoken).toContain('AI estimate');
    expect(QUICK_WAYS.describe.spoken).toContain('AI estimate');
    expect(QUICK_WAYS.scan.spoken).toBe('Scan barcode, packaged products');
    expect(AI_TAG).toBe('AI');
    // The AI tiles' text reads "<word> AI" (the tag follows the word in the page): the name holds both in that order.
    const words = (s: string) => ` ${s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()} `;
    for (const id of ['photo', 'describe'] as const) expect(words(QUICK_WAYS[id].spoken)).toContain(words(`${QUICK_WAYS[id].label} ${AI_TAG}`));
  });
  it('every fixed string: sentence case, no exclamation mark, no banned word', () => {
    const fixed = [
      quickSheetTitle('dinner', today, today),
      quickSheetLine(today, today, -5),
      seeAllLabel(4),
      seeAllSpoken(4, 'lunch', 'usual'),
      seeAllSpoken(4, 'lunch', 'meals'),
      seeAllSpoken(4, 'lunch', 'favorites'),
      ...Object.values(QUICK_WAYS).flatMap((w) => [w.label, w.wide, w.hint, w.spoken]),
      quickRowTitle({ meal: 'lunch', favourites: true, usual: true, saved: true }),
    ];
    for (const s of fixed) {
      expect(s).not.toContain('!');
      expect(s[0]).toBe(s[0].toUpperCase());
      for (const w of BANNED) expect(s.toLowerCase()).not.toMatch(new RegExp(`\\b${w}\\b`));
    }
  });
});
