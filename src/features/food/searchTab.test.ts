import { describe, expect, it } from 'vitest';

import { openingTab, parseSearchTab, SEARCH_CHIPS, usualEmpty } from './searchTab';

const both = { usual: true, favorites: true };

describe('the search tab chosen last (on this device)', () => {
  it('reads only a known tab', () => {
    expect(parseSearchTab('favorites')).toBe('favorites');
    expect(parseSearchTab('meals')).toBe('meals');
    expect(parseSearchTab('drinks')).toBeNull();
    expect(parseSearchTab('')).toBeNull();
    expect(parseSearchTab(null)).toBeNull();
  });
  it('a tap on this visit wins; without one, Usual with history and Recent without', () => {
    expect(openingTab(null, null, both)).toBe('usual');
    expect(openingTab(null, null, { usual: false, favorites: true })).toBe('recent');
    expect(openingTab('mine', 'favorites', both)).toBe('mine');
    expect(openingTab('meals', null, both)).toBe('meals');
    // A tap on Favourites opens it even when it is empty (the person asked for it).
    expect(openingTab('favorites', null, { usual: true, favorites: false })).toBe('favorites');
    // A tap on Usual opens it with no history too: its empty state (the chip is always there).
    expect(openingTab('usual', null, { usual: false, favorites: false })).toBe('usual');
  });
  it('only Favourites is opened from memory, and only while it lists a food or a meal', () => {
    expect(openingTab(null, 'favorites', both)).toBe('favorites');
    expect(openingTab(null, 'favorites', { usual: false, favorites: true })).toBe('favorites');
    // Nothing starred (every favourite removed since): the meal's default, never an empty tab.
    expect(openingTab(null, 'favorites', { usual: true, favorites: false })).toBe('usual');
    expect(openingTab(null, 'favorites', { usual: false, favorites: false })).toBe('recent');
    // One look at My foods or Saved meals never hides Usual on every later search.
    expect(openingTab(null, 'mine', both)).toBe('usual');
    expect(openingTab(null, 'meals', both)).toBe('usual');
    expect(openingTab(null, 'meals', { usual: false, favorites: true })).toBe('recent');
    expect(openingTab(null, 'recent', both)).toBe('usual');
    expect(openingTab(null, 'usual', { usual: false, favorites: false })).toBe('recent');
  });
  it("the address's ?tab= opens that tab on this visit, below a tap and above the memory", () => {
    // The + sheet's "See all N": Saved meals, Usual or Favourites, even an empty one (the person asked for it).
    expect(openingTab(null, null, both, 'meals')).toBe('meals');
    expect(openingTab(null, 'favorites', both, 'usual')).toBe('usual');
    expect(openingTab(null, null, { usual: false, favorites: false }, 'favorites')).toBe('favorites');
    // A tap on this visit still wins.
    expect(openingTab('recent', null, both, 'meals')).toBe('recent');
    // Read only when it names a tab; anything else opens as before.
    expect(openingTab(null, null, both, parseSearchTab('drinks'))).toBe('usual');
    expect(openingTab(null, 'favorites', both, parseSearchTab(undefined))).toBe('favorites');
    // Never remembered: the next visit without it opens from what a tap stored, as before.
    expect(openingTab(null, 'favorites', both, null)).toBe('favorites');
    expect(openingTab(null, null, both)).toBe('usual');
  });
  it('shows one fixed set of chips in one fixed order', () => {
    expect(SEARCH_CHIPS).toEqual(['usual', 'recent', 'favorites', 'mine', 'meals']);
  });
  it('says what the Usual chip will hold before there is any history', () => {
    expect(usualEmpty('lunch')).toEqual({ title: 'Your usual foods for lunch', message: 'The foods you log most for lunch show here, each one tap to add.' });
    expect(usualEmpty('snacks').title).toBe('Your usual foods for snacks');
  });
});
