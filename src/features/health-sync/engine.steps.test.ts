/**
 * Steps in a sync run: read with the workouts as the store's own day totals, kept per day on the phone for
 * 35 days, never a reason for the sync to fail, and cleared with the switch.
 */
import { describe, expect, it } from 'vitest';

import { createHealthSync, type SyncDeps } from './engine';
import { createFakeAdapter, FULL_ACCESS, type FakeHealth } from './fake';
import { restoreState } from './state';
import { zoneClock } from './steps';
import { memoryDiary, memoryState, workout } from './testing';
import { HealthError, type StepsRange } from './types';

const clock = zoneClock('Europe/Amsterdam');
const NOON = Date.parse('2026-11-14T11:00:00Z');
/** One day as the store totals it (already one count where the phone and the watch overlap). */
const day = (date: string, count: number) => ({ day: date, count });

function rig(health: Partial<FakeHealth> = {}, initial: Parameters<typeof memoryState>[0] = {}) {
  const fake = createFakeAdapter({ access: FULL_ACCESS, ...health });
  const ranges: StepsRange[] = [];
  const adapter = { ...fake.adapter, store: fake.adapter.store, readStepDays: (range: StepsRange, access: typeof FULL_ACCESS) => (ranges.push(range), fake.adapter.readStepDays(range, access)) };
  const state = memoryState({ enabled: true, ...initial });
  const diary = memoryDiary();
  const now = { ms: NOON };
  const deps: SyncDeps = { adapter, now: () => now.ms, state, diary, announce: () => {}, stepClock: clock };
  return { sync: createHealthSync(deps), state, diary, fake: fake.health, ranges, now };
}

describe('steps in a sync', () => {
  it('reads the 35 days the first time and keeps the store\'s count for each day', async () => {
    const r = rig({
      store: 'apple-health',
      workouts: [workout({ start: '2026-11-13T06:00:00Z', minutes: 40, store: 'apple-health', exerciseType: 37, origin: 'com.apple.health.watch' })],
      steps: [day('2026-11-13', 3100), day('2026-11-14', 4200)],
    });
    expect(await r.sync.sync('auto')).toMatchObject({ status: 'done', added: 1 });
    expect(r.ranges).toEqual([{ from: '2026-10-10T22:00:00.000Z', to: new Date(NOON).toISOString(), fromDay: '2026-10-11', toDay: '2026-11-14' }]);
    expect(r.state.get().steps).toEqual({ days: { '2026-11-13': 3100, '2026-11-14': 4200 }, readAt: new Date(NOON).toISOString() });
    // Steps never become a diary record or calories.
    expect(r.diary.live()).toHaveLength(1);
    expect(r.diary.live()[0].activityId).toBe('running');
  });

  it('next time re-reads only the last three days and keeps the older ones', async () => {
    const r = rig({ steps: [day('2026-11-14', 2000)] }, { steps: { days: { '2026-11-01': 9000, '2026-11-12': 100 }, readAt: '2026-11-14T10:00:00Z' } });
    await r.sync.sync('manual');
    expect(r.ranges[0].from).toBe(new Date(clock.midnightOf('2026-11-12')).toISOString());
    expect(r.ranges[0].fromDay).toBe('2026-11-12');
    // The 12th was re-read and has no steps now; the 1st is kept as it was.
    expect(r.state.get().steps.days).toEqual({ '2026-11-01': 9000, '2026-11-14': 2000 });
  });

  it('does not read steps that may not be read, and drops days older than 35', async () => {
    const r = rig({ access: { ...FULL_ACCESS, steps: false }, steps: [day('2026-11-14', 2000)] }, { steps: { days: { '2026-09-01': 5000, '2026-11-10': 7000 }, readAt: '2026-11-10T10:00:00Z' } });
    expect(await r.sync.sync('manual')).toMatchObject({ status: 'done' });
    expect(r.ranges).toEqual([]);
    expect(r.state.get().steps).toEqual({ days: { '2026-11-10': 7000 }, readAt: '2026-11-10T10:00:00Z' });
  });

  it('still syncs the workouts when the steps cannot be read', async () => {
    const r = rig({ workouts: [workout({ start: '2026-11-13T06:00:00Z', minutes: 40 })], stepsFail: new HealthError('permission', 'Reading Steps is not allowed.') }, { steps: { days: { '2026-11-13': 6400 }, readAt: '2026-11-13T20:00:00Z' } });
    expect(await r.sync.sync('manual')).toMatchObject({ status: 'done', added: 1 });
    expect(r.state.get().lastError).toBeNull();
    expect(r.state.get().steps.days).toEqual({ '2026-11-13': 6400 });
  });

  it('forgets the steps when sync is switched off', async () => {
    const r = rig({ steps: [day('2026-11-14', 2000)] });
    await r.sync.sync('manual');
    expect(r.state.get().steps.days).toEqual({ '2026-11-14': 2000 });
    r.sync.disable();
    expect(r.state.get().steps).toEqual({ days: {}, readAt: null });
  });

  it('restores kept steps safely, and an older build\'s saved access as "steps not asked for"', () => {
    const back = restoreState({
      enabled: true,
      access: { workouts: true, activeEnergy: true, totalEnergy: true, distance: true },
      steps: { days: { '2026-11-13': 6400.4, '2026-11-12': -3, 'yesterday': 900, '2026-11-11': 'many' }, readAt: '2026-11-13T20:00:00Z' },
    });
    expect(back.steps).toEqual({ days: { '2026-11-13': 6400 }, readAt: '2026-11-13T20:00:00Z' });
    expect(back.access?.steps).toBe(false);
    expect(restoreState({ enabled: true }).steps).toEqual({ days: {}, readAt: null });
  });
});
