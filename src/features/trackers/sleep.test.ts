import { beforeEach, describe, expect, it, vi } from 'vitest';

const toasts = vi.hoisted(() => [] as { message: string; onPress?: () => void }[]);
vi.mock('@/ui', () => ({
  toast: (message: string, options?: { onPress?: () => void }) => toasts.push({ message, onPress: options?.onPress }),
  haptic: { success: () => {}, tap: () => {}, press: () => {}, select: () => {}, warn: () => {} },
}));

import { live } from '@/store/selectors';
import { useStore } from '@/store';
import type { SleepEntry } from '@/types';

import { deleteSleep, saveSleep } from './actions';
import { nightAfterEdit } from './helpers';
import { sleepFrom, sleepFromLine, stagesLine } from './sleepSource';

const DATE = '2026-11-16';

const synced: Omit<SleepEntry, 'id' | 'updatedAt'> = {
  date: DATE,
  hours: 7.23,
  source: 'health',
  store: 'healthConnect',
  origin: 'com.garmin.android.apps.connectmobile',
  startedAt: '2026-11-15T22:41:00.000Z',
  endedAt: '2026-11-16T06:12:00.000Z',
  stages: { light: 230, deep: 75, rem: 129, awake: 17 },
};

const night = () => live(useStore.getState().sleep).find((e) => e.date === DATE);
const strip = (e: SleepEntry | undefined) => {
  if (!e) return e;
  const { updatedAt: _u, deleted: _d, ...rest } = e;
  return rest;
};

beforeEach(() => {
  useStore.getState().resetAll();
  toasts.length = 0;
});

describe('nightAfterEdit', () => {
  const existing = { ...synced, id: 'x', updatedAt: '2026-11-16T07:00:00.000Z' } as SleepEntry;

  it('keeps where a synced night came from when only its quality changes', () => {
    expect(nightAfterEdit(existing, DATE, 7.23, 4)).toEqual({ ...synced, id: 'x', quality: 4 });
  });

  it('makes a synced night the person\'s own when its hours change', () => {
    expect(nightAfterEdit(existing, DATE, 7.5, 4)).toEqual({ id: 'x', date: DATE, hours: 7.5, quality: 4 });
    expect(nightAfterEdit(existing, DATE, 7.5, null)).toEqual({ id: 'x', date: DATE, hours: 7.5 });
  });

  it('writes a new night, and leaves the rating out when there is none', () => {
    expect(nightAfterEdit(undefined, DATE, 8, 3)).toEqual({ id: undefined, date: DATE, hours: 8, quality: 3 });
    expect(nightAfterEdit({ id: 'h', updatedAt: '', date: DATE, hours: 8, quality: 3 }, DATE, 8, null)).toEqual({ id: 'h', date: DATE, hours: 8 });
  });
});

describe('saveSleep', () => {
  it('rates a synced night and keeps it synced', () => {
    useStore.getState().upsert('sleep', synced);
    saveSleep(DATE, 7.23, 5);
    expect(strip(night())).toEqual({ ...synced, id: night()!.id, quality: 5 });
  });

  it('turns a synced night into the person\'s own on an hours change, and Undo restores the whole night', () => {
    const before = useStore.getState().upsert('sleep', synced);
    saveSleep(DATE, 8, 3);
    expect(strip(night())).toEqual({ id: before.id, date: DATE, hours: 8, quality: 3 });
    expect(toasts.at(-1)!.message).toBe('Sleep updated');
    toasts.at(-1)!.onPress!();
    expect(strip(night())).toEqual(strip(before));
  });

  it('removes a new night on Undo', () => {
    saveSleep(DATE, 7, 3);
    expect(night()?.hours).toBe(7);
    toasts.at(-1)!.onPress!();
    expect(night()).toBeUndefined();
  });

  it('deletes a synced night with Undo', () => {
    const before = useStore.getState().upsert('sleep', synced);
    deleteSleep(before);
    expect(night()).toBeUndefined();
    toasts.at(-1)!.onPress!();
    expect(strip(night())).toEqual(strip(before));
  });
});

describe('sleep source words', () => {
  it('names the app, the Apple device kind or the export file, never a device', () => {
    expect(sleepFromLine(synced)).toBe('From Garmin Connect');
    expect(sleepFrom({ source: 'health', store: 'healthKit', origin: 'com.garmin.connect.mobile' })).toBe('Garmin Connect');
    expect(sleepFromLine({ source: 'health', store: 'healthKit', origin: 'com.apple.health.watch' })).toBe('From Apple Watch');
    expect(sleepFromLine({ source: 'health', store: 'file', origin: 'com.apple.health.watch' })).toBe('From your Health export');
    expect(sleepFromLine({ source: 'health', store: 'healthConnect' })).toBe('From your health app');
    expect(sleepFromLine({})).toBeNull();
  });

  it('writes the stages, awake only when there was some', () => {
    // The no-break spaces are what keep a stage with its time and a "·" off the start of a line.
    const plain = (t: string | null) => t?.replace(/\u00A0/g, ' ');
    expect(plain(stagesLine(synced.stages))).toBe('Light 3 h 50 min · Deep 1 h 15 min · REM 2 h 9 min · Awake 17 min');
    expect(plain(stagesLine({ light: 200, deep: 60, rem: 90, awake: 0 }))).toBe('Light 3 h 20 min · Deep 1 h · REM 1 h 30 min');
    const line = stagesLine({ light: 225, deep: 95, rem: 95, awake: 10 })!;
    // The only ordinary spaces left are after each separator and inside a time ("1 h 35 min", which Text keeps together).
    expect(line.split('\u00A0· ')).toEqual(['Light\u00A03 h 45 min', 'Deep\u00A01 h 35 min', 'REM\u00A01 h 35 min', 'Awake\u00A010 min']);
    expect(stagesLine(null)).toBeNull();
    expect(stagesLine(undefined)).toBeNull();
  });
});
