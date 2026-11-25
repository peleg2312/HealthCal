/**
 * The widget's glass: the same plain-water record as Today's glass, one glass per drawing and never
 * within the one-tap guard, and an Undo only for a live plain glass of today under ten minutes old.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ONE_TAP_GUARD_MS } from '@/features/food/oneTap';
import { useStore } from '@/store';
import type { WaterEntry } from '@/types';

import { acceptGlassTap, isUndoableGlass, logWidgetGlass, recentWidgetGlass, resetWidgetGlassForTests, UNDO_WINDOW_MS, undoWidgetGlass } from './glass';

const DAY = '2026-11-25';
const T = Date.parse('2026-11-25T10:00:00.000Z');

beforeEach(() => {
  // The record's loggedAt is read from the clock: hold it at T.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(T);
  useStore.getState().resetAll();
  resetWidgetGlassForTests();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('acceptGlassTap', () => {
  it('takes one glass per drawing: a second tap on the same picture logs nothing', () => {
    expect(acceptGlassTap('a.1', T)).toBe(true);
    expect(acceptGlassTap('a.1', T + 5000)).toBe(false);
    expect(acceptGlassTap('a.2', T + 5000)).toBe(true);
  });

  it('keeps the one-tap guard of every glass in the app', () => {
    expect(acceptGlassTap('a.1', T)).toBe(true);
    expect(acceptGlassTap('a.2', T + ONE_TAP_GUARD_MS - 1)).toBe(false);
    expect(acceptGlassTap('a.2', T + ONE_TAP_GUARD_MS)).toBe(true);
  });

  it('a tap with no drawing token is held by the time guard alone', () => {
    expect(acceptGlassTap(null, T)).toBe(true);
    expect(acceptGlassTap(null, T + 100)).toBe(false);
    expect(acceptGlassTap(null, T + 1000)).toBe(true);
  });
});

describe('the glass and its Undo', () => {
  it('writes the plain glass Today writes, through the store', () => {
    const g = logWidgetGlass(DAY, 250, T);
    const stored = useStore.getState().water[g.id];
    expect(stored).toMatchObject({ date: DAY, ml: 250, beverage: 'water', deleted: false });
    expect(stored.drink).toBeUndefined();
    expect(stored.foodEntryId).toBeUndefined();
    expect(stored.fromEntryId).toBeUndefined();
    expect(useStore.getState().dirty.water[g.id]).toBe(true);
    expect(recentWidgetGlass(useStore.getState().water, DAY, Date.parse(stored.loggedAt))?.id).toBe(g.id);
  });

  it('undoes a fresh glass with a soft delete, once', () => {
    const g = logWidgetGlass(DAY, 250, T);
    const at = Date.parse(g.loggedAt);
    expect(undoWidgetGlass(g.id, DAY, at + 1000)).toBe(true);
    expect(useStore.getState().water[g.id].deleted).toBe(true);
    expect(undoWidgetGlass(g.id, DAY, at + 2000)).toBe(false);
    expect(recentWidgetGlass(useStore.getState().water, DAY, at + 2000)).toBeNull();
  });

  it('never undoes an old glass, another day, or water that is not a plain glass', () => {
    const base: WaterEntry = { id: 'w', updatedAt: '2026-11-25T10:00:00.000Z', deleted: false, date: DAY, ml: 250, beverage: 'water', loggedAt: '2026-11-25T10:00:00.000Z' };
    expect(isUndoableGlass(base, DAY, T + 1000)).toBe(true);
    expect(isUndoableGlass(base, DAY, T + UNDO_WINDOW_MS)).toBe(false);
    expect(isUndoableGlass(base, '2026-11-26', T + 1000)).toBe(false);
    expect(isUndoableGlass({ ...base, deleted: true }, DAY, T + 1000)).toBe(false);
    expect(isUndoableGlass({ ...base, beverage: 'tea' }, DAY, T + 1000)).toBe(false);
    expect(isUndoableGlass({ ...base, drink: 'milk', foodEntryId: 'f' }, DAY, T + 1000)).toBe(false);
    expect(isUndoableGlass({ ...base, fromEntryId: 'f' }, DAY, T + 1000)).toBe(false);
    expect(isUndoableGlass(undefined, DAY, T)).toBe(false);
    expect(undoWidgetGlass('missing', DAY, T)).toBe(false);
  });

  it('stops offering the Undo after ten minutes', () => {
    const g = logWidgetGlass(DAY, 250, T);
    expect(g.loggedAt).toBe('2026-11-25T10:00:00.000Z');
    expect(recentWidgetGlass(useStore.getState().water, DAY, T + UNDO_WINDOW_MS - 1)?.id).toBe(g.id);
    expect(recentWidgetGlass(useStore.getState().water, DAY, T + UNDO_WINDOW_MS)).toBeNull();
  });
});
