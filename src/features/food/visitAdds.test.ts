import { describe, expect, it } from 'vitest';

import type { FoodEntry } from '@/types';

import { FIELD_BLUR_WINDOW_MS, refocusAfterAdd, undoAddLabel, visitAddCaption, visitAdds } from './visitAdds';

const at = (h: number, m = 0) => new Date(2026, 10, 24, h, m).toISOString();
const entry = (id: string, over: Partial<FoodEntry> = {}): FoodEntry =>
  ({ id, date: '2026-11-24', meal: 'lunch', name: id, emoji: '', source: 'builtin', verified: true, servingLabel: '1 large', quantity: 1, grams: 50, nutrients: { kcal: 90, protein: 6, carbs: 1, fat: 7 }, loggedAt: at(12), updatedAt: at(12), ...over }) as FoodEntry;

describe('visitAdds', () => {
  it('lists what this visit added to the day shown, newest first, removed ones kept in their place', () => {
    const map: Record<string, FoodEntry> = {};
    for (const e of [
      entry('old', { loggedAt: at(8) }),
      entry('first', { loggedAt: at(12, 1) }),
      entry('second', { loggedAt: at(12, 2), deleted: true }),
      entry('third', { loggedAt: at(12, 3) }),
      entry('other-day', { loggedAt: at(12, 4), date: '2026-11-23' }),
      entry('drink', { loggedAt: at(12, 5), via: 'water' }),
    ])
      map[e.id] = e;
    const adds = visitAdds(map, new Set(['old']), '2026-11-24');
    expect(adds.map((a) => [a.entry.id, a.removed])).toEqual([
      ['third', false],
      ['second', true],
      ['first', false],
    ]);
  });

  it('orders two adds of the same moment the same way every time', () => {
    const map = { a: entry('a'), b: entry('b') };
    expect(visitAdds(map, new Set(), '2026-11-24').map((a) => a.entry.id)).toEqual(['b', 'a']);
  });
});

describe('the sheet words', () => {
  it('names the portion and calories, and the meal only when it is not the one search adds to', () => {
    expect(visitAddCaption(entry('egg'), 'lunch')).toBe('1 large · 90 kcal');
    expect(visitAddCaption(entry('egg', { meal: 'dinner' }), 'lunch')).toBe('1 large · 90 kcal · Dinner');
  });

  it("starts the Undo's name with its visible word and says what it takes back", () => {
    expect(undoAddLabel(entry('x', { name: 'Egg, fried' }))).toBe('Undo, Egg, fried, 1 large, 90 kcal, lunch');
  });
});

describe('refocusAfterAdd', () => {
  const base = { typed: true, fieldFocused: false, blurredMsAgo: Infinity, byKeyboard: false };
  it('goes back to the field while typing: the field has the focus, or lost it to this very tap', () => {
    expect(refocusAfterAdd({ ...base, fieldFocused: true })).toBe(true);
    expect(refocusAfterAdd({ ...base, blurredMsAgo: 120 })).toBe(true);
    expect(refocusAfterAdd({ ...base, blurredMsAgo: FIELD_BLUR_WINDOW_MS })).toBe(true);
  });
  it('leaves the focus alone after the keyboard was put away, and with nothing typed', () => {
    expect(refocusAfterAdd({ ...base, blurredMsAgo: FIELD_BLUR_WINDOW_MS + 1 })).toBe(false);
    expect(refocusAfterAdd({ ...base, typed: false, fieldFocused: true })).toBe(false);
  });
  it('always goes back from a key press, so the focus is never lost with the "+" it was on', () => {
    expect(refocusAfterAdd({ ...base, typed: false, byKeyboard: true })).toBe(true);
  });
});
