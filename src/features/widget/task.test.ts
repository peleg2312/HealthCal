/**
 * The widget's task with a fake drawing: it loads the store with the app's loader, writes the glass
 * through the store and saves it before it ends, holds the double tap, undoes only the glass it
 * offered, and says honestly when the data cannot be read or the glass not saved. The order of the
 * tests matters: the first one runs before anything was loaded.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useStore } from '@/store';
import { flushPersistence, loadPersisted, useHydration } from '@/store/persistence';
import type { Profile } from '@/types';

import { control } from '../../../test/stubs/async-storage';
import { resetWidgetGlassForTests } from './glass';
import { ADD_GLASS, UNDO_GLASS } from './name';
import { glassMl, handleWidgetTask, type WidgetDrawing } from './task';

const NOW = Date.parse('2026-11-25T10:00:00');
const DAY = '2026-11-25';

const profile: Profile = {
  name: 'Dana',
  sex: 'female',
  birthDate: '1990-01-01',
  heightCm: 168,
  weightKg: 64,
  activityLevel: 'moderate',
  goal: 'maintain',
  weeklyRateKg: 0,
  units: 'metric',
  eatBackExercise: true,
  useAdaptiveTdee: false,
  calorieTargetOverride: 2160,
  waterGoalMlOverride: 3300,
  onboardedAt: '2026-11-01T08:00:00Z',
  updatedAt: '2026-11-01T08:00:00Z',
};

// Kept across the tests, which follow one widget through a day.
const drawn: WidgetDrawing[] = [];
const draw = (d: WidgetDrawing) => void drawn.push(d);
const last = () => drawn[drawn.length - 1];
let clock = NOW;
const run = (action: Parameters<typeof handleWidgetTask>[0]) => handleWidgetTask(action, draw, () => clock);
const tap = (data: Record<string, unknown>) => run({ action: 'WIDGET_CLICK', clickAction: ADD_GLASS, clickActionData: data });
const liveGlasses = () => Object.values(useStore.getState().water).filter((w) => !w.deleted);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  clock = NOW;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('the widget task', () => {
  it('data that cannot be read: "Open HealthCal", no number, nothing written', async () => {
    control.failReads = true;
    expect(await run({ action: 'WIDGET_UPDATE' })).toBe('unreadable');
    control.failReads = false;
    expect(last().figures).toMatchObject({ kind: 'message', title: 'Open HealthCal' });
    expect(useStore.getState().water).toEqual({});
  });

  it('before set-up: the set-up message, and a glass tap logs nothing', async () => {
    expect(await run({ action: 'WIDGET_ADDED' })).toBe('drawn');
    expect(useHydration.getState().status).toBe('ready');
    expect(last().figures).toMatchObject({ kind: 'message', title: 'Set up HealthCal' });
    expect(await tap({ ml: 250, drawing: last().token })).toBe('glass-ignored');
    expect(liveGlasses()).toHaveLength(0);
  });

  it('draws the day the app saved', async () => {
    useStore.getState().setProfile(profile);
    await flushPersistence();
    expect(await run({ action: 'WIDGET_UPDATE' })).toBe('drawn');
    expect(last().figures).toMatchObject({ kind: 'day', dateLine: 'Wed, Nov 25', water: { line: '0 ml of 3.3 L' }, glass: { ml: 250 } });
  });

  it('a glass: written through the store, saved before the task ends, drawn with its Undo', async () => {
    resetWidgetGlassForTests();
    const token = last().token;
    expect(await tap({ ml: 250, drawing: token })).toBe('glass');
    const [glass] = liveGlasses();
    expect(glass).toMatchObject({ date: DAY, ml: 250, beverage: 'water' });
    expect(useStore.getState().dirty.water[glass.id]).toBe(true);
    // Saved on the phone already: a process killed now keeps it.
    expect((await loadPersisted())?.water?.[glass.id]?.ml).toBe(250);
    const f = last().figures;
    expect(f.kind === 'day' && f.water.line).toBe('250 ml of 3.3 L');
    expect(f.kind === 'day' && f.added).toMatchObject({ id: glass.id, caption: '250 ml added' });
    expect(last().token).not.toBe(token);
  });

  it('a double tap logs one glass: the second tap is on the same picture', async () => {
    resetWidgetGlassForTests();
    const before = liveGlasses().length;
    const token = last().token;
    clock = NOW + 2000;
    expect(await tap({ ml: 250, drawing: token })).toBe('glass');
    clock = NOW + 3500;
    expect(await tap({ ml: 250, drawing: token })).toBe('glass-ignored');
    expect(liveGlasses()).toHaveLength(before + 1);
    // A tap on the new picture is a new glass, once the one-tap guard has passed.
    clock = NOW + 3600;
    expect(await tap({ ml: 250, drawing: last().token })).toBe('glass');
    expect(liveGlasses()).toHaveLength(before + 2);
  });

  it('a glass size from the drawing: whole ml from 1 to 2,000, else no glass', async () => {
    expect(glassMl({ ml: 330 })).toBe(330);
    expect(glassMl({ ml: '250' })).toBe(250);
    expect(glassMl({ ml: 0 })).toBeNull();
    expect(glassMl({ ml: 5000 })).toBeNull();
    expect(glassMl({})).toBeNull();
    clock = NOW + 60_000;
    expect(await tap({ ml: 'lots', drawing: 'other' })).toBe('glass-ignored');
  });

  it('Undo removes the glass it offered, saved; an old or unknown glass is left alone', async () => {
    const f = last().figures;
    if (f.kind !== 'day' || !f.added) throw new Error('expected an Undo');
    const id = f.added.id;
    clock = NOW + 120_000;
    expect(await run({ action: 'WIDGET_CLICK', clickAction: UNDO_GLASS, clickActionData: { id } })).toBe('undone');
    expect(useStore.getState().water[id].deleted).toBe(true);
    expect((await loadPersisted())?.water?.[id]?.deleted).toBe(true);
    const after = last().figures;
    expect(after.kind === 'day' && after.added).toBeNull();
    expect(await run({ action: 'WIDGET_CLICK', clickAction: UNDO_GLASS, clickActionData: { id } })).toBe('undo-refused');
    expect(await run({ action: 'WIDGET_CLICK', clickAction: UNDO_GLASS, clickActionData: {} })).toBe('undo-refused');
    // Eleven minutes after a glass the Undo does nothing.
    const [old] = liveGlasses();
    vi.setSystemTime(NOW + 11 * 60_000);
    clock = NOW + 11 * 60_000;
    expect(await run({ action: 'WIDGET_CLICK', clickAction: UNDO_GLASS, clickActionData: { id: old.id } })).toBe('undo-refused');
    expect(useStore.getState().water[old.id].deleted).toBe(false);
  });

  it('a glass that could not be saved: "Not saved", no number', async () => {
    clock = NOW + 20 * 60_000;
    control.failWrites = true;
    expect(await tap({ ml: 250, drawing: 'fresh' })).toBe('not-saved');
    expect(last().figures).toMatchObject({ kind: 'message', title: 'Not saved' });
    control.failWrites = false;
    await flushPersistence();
    expect(useHydration.getState().saveFailed).toBe(false);
  });

  it('a removed widget draws nothing', async () => {
    const n = drawn.length;
    expect(await run({ action: 'WIDGET_DELETED' })).toBe('deleted');
    expect(drawn).toHaveLength(n);
  });
});
