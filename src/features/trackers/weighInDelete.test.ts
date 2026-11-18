/**
 * Deleting a weigh-in or a night from the tracker screens, against the real store and
 * the health-sync memory: the profile moves only when its figures came from the deleted
 * weigh-in, and the day is remembered at once, so a sync never adds it again even after
 * the deletion marker is gone (24 hours without an account).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const toasts = vi.hoisted(() => [] as { message: string; onPress?: () => void }[]);
vi.mock('@/ui', () => ({
  toast: (message: string, options?: { onPress?: () => void }) => toasts.push({ message, onPress: options?.onPress }),
  haptic: { success: () => {}, tap: () => {}, press: () => {}, select: () => {}, warn: () => {} },
}));

import { planWeights, weightHandledKey } from '@/features/health-sync/body';
import { withDeletedDay } from '@/features/health-sync/deletions';
import { planSleep, sleepHandledKey, type SleepNight } from '@/features/health-sync/sleep';
import { useHealthSync, whenLoaded } from '@/features/health-sync/store';
import { useStore } from '@/store';
import type { Profile, SleepEntry, WeightEntry } from '@/types';

import { deleteSleep, deleteWeightRecord, saveWeightRecord } from './actions';

const GARMIN = 'com.garmin.android.apps.connectmobile';
const flush = () => new Promise((r) => setTimeout(r, 0));
const syncedOn = (date: string, kg: number): Omit<WeightEntry, 'id' | 'updatedAt'> => ({
  date,
  kg,
  source: 'health',
  store: 'healthConnect',
  origin: GARMIN,
  measuredAt: `${date}T05:12:00.000Z`,
  syncedKg: kg,
});

beforeEach(async () => {
  useStore.getState().resetAll();
  await whenLoaded();
  useHealthSync.setState({ handled: {} });
  toasts.length = 0;
});

describe('deleting a weigh-in', () => {
  it('deleting an old hand weigh-in leaves the targets alone, with newer synced ones there', () => {
    const s = useStore.getState();
    s.setProfile({ weightKg: 84 } as Partial<Profile>);
    const oct = s.upsert('weights', { date: '2026-10-03', kg: 90 });
    s.upsert('weights', { date: '2026-11-10', kg: 84 });
    s.upsert('weights', syncedOn('2026-11-17', 82.4));
    s.upsert('weights', syncedOn('2026-11-18', 82.0));
    deleteWeightRecord(oct);
    expect(useStore.getState().profile?.weightKg).toBe(84);
  });

  it('clearing body fat on the newest weigh-in never falls back to a synced reading', () => {
    const s = useStore.getState();
    s.setProfile({ weightKg: 81, bodyFatPct: 19 } as Partial<Profile>);
    s.upsert('weights', { ...syncedOn('2026-11-17', 82.4), bodyFatPct: 18.2, syncedBodyFatPct: 18.2 });
    s.upsert('weights', { date: '2026-11-18', kg: 81, bodyFatPct: 19 });
    saveWeightRecord('2026-11-18', { kg: 81, bodyFatPct: undefined });
    expect(useStore.getState().profile?.bodyFatPct).toBeUndefined();
  });

  it('remembers a synced day at once, so a sync after the marker is gone does not add it again; Undo forgets it', async () => {
    const saved = useStore.getState().upsert('weights', syncedOn('2026-11-14', 82.4));
    deleteWeightRecord(saved);
    await flush();
    const key = weightHandledKey('2026-11-14');
    expect(useHealthSync.getState().handled[key]).toEqual({ how: 'skipped', at: '2026-11-14T05:12:00.000Z' });
    expect(toasts.at(-1)!.message).toBe('Weigh-in deleted. Sync will not add it again');
    // A day later without an account the deletion marker is purged: only the memory is left.
    const reading = { date: '2026-11-14', store: 'healthConnect' as const, origin: GARMIN, measuredAt: '2026-11-14T05:12:00.000Z', kg: 82.4, bodyFatPct: null };
    expect(planWeights({ weighIns: [reading], existing: [], handled: useHealthSync.getState().handled }).add).toEqual([]);
    // Without the memory it would have come back.
    expect(planWeights({ weighIns: [reading], existing: [], handled: {} }).add).toHaveLength(1);
    toasts.at(-1)!.onPress!();
    await flush();
    expect(useHealthSync.getState().handled[key]).toBeUndefined();
  });

  it('Undo keeps a mark that was there before the delete', async () => {
    const key = weightHandledKey('2026-11-14');
    useHealthSync.setState({ handled: { [key]: { how: 'skipped', at: '2026-11-14T05:00:00.000Z' } } });
    const saved = useStore.getState().upsert('weights', { date: '2026-11-14', kg: 80 });
    deleteWeightRecord(saved);
    await flush();
    toasts.at(-1)!.onPress!();
    await flush();
    expect(useHealthSync.getState().handled[key]).toEqual({ how: 'skipped', at: '2026-11-14T05:00:00.000Z' });
  });
});

describe('deleting a night', () => {
  it('remembers the day at once, so a sync after the marker is gone does not add it again', async () => {
    const night: Omit<SleepEntry, 'id' | 'updatedAt'> = {
      date: '2026-11-16',
      hours: 7.2,
      source: 'health',
      store: 'healthConnect',
      origin: GARMIN,
      startedAt: '2026-11-15T22:41:00.000Z',
      endedAt: '2026-11-16T06:12:00.000Z',
    };
    const saved = useStore.getState().upsert('sleep', night);
    deleteSleep(saved);
    await flush();
    const handled = useHealthSync.getState().handled;
    expect(handled[sleepHandledKey('2026-11-16')]).toEqual({ how: 'skipped', at: '2026-11-15T22:41:00.000Z' });
    const synced: SleepNight = {
      date: '2026-11-16',
      store: 'healthConnect',
      origin: GARMIN,
      kind: 'watch',
      startedAt: night.startedAt!,
      endedAt: night.endedAt!,
      asleepMin: 432,
      hours: 7.2,
      stages: null,
      zoneOffsetSec: 3600,
    };
    expect(planSleep({ nights: [synced], existing: [], handled }).add).toEqual([]);
    expect(planSleep({ nights: [synced], existing: [], handled: {} }).add).toHaveLength(1);
  });
});

describe('the mark itself', () => {
  it('adds a skipped mark, keeps one already there, and prunes as a sync does', () => {
    const now = Date.parse('2026-11-18T12:00:00Z');
    expect(withDeletedDay({}, 'weight:2026-11-14', '2026-11-14T05:00:00.000Z', now)).toEqual({ 'weight:2026-11-14': { how: 'skipped', at: '2026-11-14T05:00:00.000Z' } });
    const old = { 'weight:2026-09-01': { how: 'skipped' as const, at: '2026-09-01T12:00:00.000Z' } };
    expect(withDeletedDay(old, 'weight:2026-11-14', '2026-11-14T05:00:00.000Z', now)).not.toHaveProperty('weight:2026-09-01');
    const there = { 'weight:2026-11-14': { how: 'skipped' as const, at: 'x' } };
    expect(withDeletedDay(there, 'weight:2026-11-14', '2026-11-14T05:00:00.000Z', now)['weight:2026-11-14'].at).toBe('x');
  });
});
