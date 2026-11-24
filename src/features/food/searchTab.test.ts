import { describe, expect, it } from 'vitest';

import { openingTab, parseSearchTab } from './searchTab';

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
    // Usual needs history for this meal, remembered or tapped.
    expect(openingTab('usual', null, { usual: false, favorites: false })).toBe('recent');
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
});
