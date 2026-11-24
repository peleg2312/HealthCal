import { describe, expect, it } from 'vitest';

import type { FoodEntry } from '@/types';

import { RESTORE_MAX, removedToday } from './restore';

const at = (h: number, m = 0) => new Date(2026, 10, 24, h, m).toISOString();
const entry = (id: string, over: Partial<FoodEntry>): FoodEntry =>
  ({ id, date: '2026-11-24', meal: 'lunch', name: id, emoji: '', source: 'builtin', verified: true, servingLabel: '1', quantity: 1, grams: 100, nutrients: { kcal: 100, protein: 1, carbs: 1, fat: 1 }, loggedAt: at(9), updatedAt: at(9), ...over }) as FoodEntry;

describe('removedToday', () => {
  it('lists the entries of this meal and day deleted today, newest first, at most RESTORE_MAX', () => {
    const map: Record<string, FoodEntry> = {};
    for (const [id, over] of [
      ['live', {}],
      ['a', { deleted: true, updatedAt: at(10) }],
      ['b', { deleted: true, updatedAt: at(12) }],
      ['c', { deleted: true, updatedAt: at(11) }],
      ['d', { deleted: true, updatedAt: at(8) }],
      ['other-meal', { deleted: true, meal: 'dinner', updatedAt: at(12) }],
      ['other-day', { deleted: true, date: '2026-11-23', updatedAt: at(12) }],
      ['yesterday', { deleted: true, updatedAt: new Date(2026, 10, 23, 20).toISOString() }],
      ['drink', { deleted: true, via: 'water', updatedAt: at(12) }],
    ] as [string, Partial<FoodEntry>][])
      map[id] = entry(id, over);
    const ids = removedToday(map, '2026-11-24', 'lunch', '2026-11-24').map((e) => e.id);
    expect(ids).toEqual(['b', 'c', 'a']);
    expect(ids.length).toBe(RESTORE_MAX);
  });
});
