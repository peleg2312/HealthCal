/**
 * Sleep in a sync run: read in the same run as workouts and steps, saved through planSleep, one toast
 * with one Undo for workouts and nights, a deleted night remembered only once the save is confirmed,
 * and a sleep read that fails or is refused never failing the run.
 */
import { describe, expect, it } from 'vitest';

import type { SleepEntry } from '@/types';

import { createHealthSync, type SleepLog, type SyncDeps } from './engine';
import { createFakeAdapter, FULL_ACCESS, type FakeHealth } from './fake';
import { sleepHandledKey } from './sleep';
import { restoreState } from './state';
import { zoneClock } from './steps';
import { GARMIN, memoryDiary, memoryState, workout } from './testing';
import { HealthError, type SleepSample, type SleepStage } from './types';

const clock = zoneClock('Europe/Amsterdam');
/** Saturday 14 November 2026, 12:00 in Amsterdam. */
const NOON = Date.parse('2026-11-14T12:00:00+01:00');

/** One Garmin sample, local times with their offset. */
const sample = (stage: SleepStage, start: string, end: string, origin = GARMIN): SleepSample => ({
  store: 'healthConnect',
  origin,
  kind: 'watch',
  start: new Date(start).toISOString(),
  end: new Date(end).toISOString(),
  zoneOffsetSec: 3600,
  stage,
});

/** A Garmin night ending on the morning of `day`: light 23:00-03:00, deep 03:00-04:00, rem 04:00-06:30. */
const night = (day: string, prev: string): SleepSample[] => [
  sample('light', `${prev}T23:00:00+01:00`, `${day}T03:00:00+01:00`),
  sample('deep', `${day}T03:00:00+01:00`, `${day}T04:00:00+01:00`),
  sample('rem', `${day}T04:00:00+01:00`, `${day}T06:30:00+01:00`),
];

function memorySleep(initial: SleepEntry[] = []): SleepLog & { records: Map<string, SleepEntry>; live(): SleepEntry[] } {
  const records = new Map(initial.map((r) => [r.date, r]));
  let stamp = 0;
  const next = () => new Date(Date.UTC(2026, 10, 14, 13, 0, (stamp += 1))).toISOString();
  return {
    records,
    all: () => [...records.values()],
    live: () => [...records.values()].filter((r) => !r.deleted),
    // As upsert does for 'sleep': the id from the date, the whole record replaced.
    save: (nights) => {
      for (const n of nights) records.set(n.date, { ...n, id: `sleep-${n.date}`, updatedAt: next(), deleted: false } as SleepEntry);
    },
    remove: (id) => {
      for (const [k, r] of records) if (r.id === id) records.set(k, { ...r, deleted: true, updatedAt: next() });
    },
  };
}

function rig(health: Partial<FakeHealth> = {}, initial: Parameters<typeof memoryState>[0] = {}, nights: SleepEntry[] = []) {
  const fake = createFakeAdapter({ access: FULL_ACCESS, ...health });
  const ranges: { from: string; to: string }[] = [];
  const adapter = { ...fake.adapter, store: fake.adapter.store, readSleep: (range: { from: string; to: string }, access: typeof FULL_ACCESS) => (ranges.push(range), fake.adapter.readSleep(range, access)) };
  const state = memoryState({ enabled: true, ...initial });
  const diary = memoryDiary();
  const sleep = memorySleep(nights);
  const now = { ms: NOON };
  const toasts: { message: string; undo: () => void; tint?: string }[] = [];
  const deps: SyncDeps = { adapter, now: () => now.ms, state, diary, sleep, announce: (message, undo, tint) => void toasts.push({ message, undo, tint }), stepClock: clock };
  return { sync: createHealthSync(deps), state, diary, sleep, fake: fake.health, ranges, now, toasts };
}

describe('sleep in a sync', () => {
  it('reads 28 days the first time from noon two days before, saves one night per wake day and says so with the sleep colour', async () => {
    const r = rig({ sleep: [...night('2026-11-13', '2026-11-12'), ...night('2026-11-14', '2026-11-13')] });
    expect(await r.sync.sync('auto')).toEqual({ status: 'done', added: 0, updated: 0, review: 0, nights: 2 });
    expect(r.ranges).toEqual([{ from: '2026-10-16T10:00:00.000Z' /* noon, summer time */, to: new Date(NOON).toISOString() }]);
    expect(r.sleep.live().map((n) => [n.date, n.hours, n.source, n.store, n.origin])).toEqual([
      ['2026-11-13', 7.5, 'health', 'healthConnect', GARMIN],
      ['2026-11-14', 7.5, 'health', 'healthConnect', GARMIN],
    ]);
    expect(r.sleep.live()[0].quality).toBeUndefined();
    expect(r.toasts.map((t) => [t.message, t.tint])).toEqual([['2 nights of sleep added from Garmin Connect', 'sleep']]);
    expect(r.state.get().sleepReadAt).toBe(new Date(NOON).toISOString());
    expect(r.state.get().lastResult).toEqual({ at: new Date(NOON).toISOString(), added: 0, updated: 0, nights: 2 });
  });

  it('says workouts and nights in one toast, whose one Undo takes both out and keeps them out', async () => {
    const r = rig({
      workouts: [workout({ start: '2026-11-13T17:00:00+01:00', minutes: 45 })],
      sleep: night('2026-11-14', '2026-11-13'),
    });
    expect(await r.sync.sync('auto')).toMatchObject({ status: 'done', added: 1, nights: 1 });
    expect(r.toasts.map((t) => [t.message, t.tint])).toEqual([['1 workout and 1 night of sleep added from Garmin Connect', 'exercise']]);
    r.toasts[0].undo();
    expect(r.diary.live()).toEqual([]);
    expect(r.sleep.live()).toEqual([]);
    expect(r.state.get().handled[sleepHandledKey('2026-11-14')]).toMatchObject({ how: 'skipped' });
    r.now.ms += 20 * 60_000;
    expect(await r.sync.sync('auto')).toMatchObject({ status: 'done', added: 0, nights: 0 });
    expect(r.sleep.live()).toEqual([]);
  });

  it('keeps the person\'s quality when a corrected reading updates a synced night, and Undo puts the earlier figures back', async () => {
    const before: SleepEntry = {
      id: 'sleep-2026-11-14',
      updatedAt: '2026-11-14T08:00:00.000Z',
      date: '2026-11-14',
      hours: 6,
      quality: 4,
      source: 'health',
      store: 'healthConnect',
      origin: GARMIN,
      startedAt: '2026-11-14T00:00:00.000Z',
      endedAt: '2026-11-14T06:00:00.000Z',
      stages: { light: 300, deep: 30, rem: 30, awake: 0 },
    };
    const r = rig({ sleep: night('2026-11-14', '2026-11-13') }, {}, [before]);
    expect(await r.sync.sync('manual')).toMatchObject({ nights: 1 });
    expect(r.sleep.live()[0]).toMatchObject({ hours: 7.5, quality: 4 });
    expect(r.toasts[0].message).toBe('1 night of sleep updated from Garmin Connect');
    r.toasts[0].undo();
    expect(r.sleep.live()[0]).toMatchObject({ hours: 6, quality: 4 });
  });

  it('never touches a night entered by hand', async () => {
    const hand: SleepEntry = { id: 'sleep-2026-11-14', updatedAt: '2026-11-14T08:00:00.000Z', date: '2026-11-14', hours: 5, quality: 2 };
    const r = rig({ sleep: night('2026-11-14', '2026-11-13') }, {}, [hand]);
    expect(await r.sync.sync('manual')).toMatchObject({ nights: 0 });
    expect(r.sleep.live()).toEqual([hand]);
    expect(r.toasts).toEqual([]);
  });

  it('does not bring back a deleted night, and remembers the day only once the diary is confirmed on the device', async () => {
    const deleted: SleepEntry = { id: 'sleep-2026-11-14', updatedAt: '2026-11-14T08:00:00.000Z', date: '2026-11-14', hours: 7.5, source: 'health', store: 'healthConnect', origin: GARMIN, deleted: true };
    const r = rig({ sleep: night('2026-11-14', '2026-11-13') }, {}, [deleted]);
    r.diary.flushMode = 'fail';
    await r.sync.sync('manual');
    expect(r.sleep.live()).toEqual([]);
    expect(r.state.get().handled[sleepHandledKey('2026-11-14')]).toBeUndefined();
    r.diary.flushMode = 'ok';
    r.now.ms += 20 * 60_000;
    await r.sync.sync('auto');
    expect(r.state.get().handled[sleepHandledKey('2026-11-14')]).toMatchObject({ how: 'skipped' });
    // The deletion marker goes for good; the day stays out.
    r.sleep.records.delete('2026-11-14');
    r.now.ms += 20 * 60_000;
    await r.sync.sync('auto');
    expect(r.sleep.live()).toEqual([]);
  });

  it('never fails the run when the sleep read fails, and reads the same days again next time', async () => {
    const r = rig({ workouts: [workout({ start: '2026-11-13T17:00:00+01:00', minutes: 45 })], sleep: night('2026-11-14', '2026-11-13'), sleepFail: new HealthError('permission', 'no') });
    expect(await r.sync.sync('auto')).toMatchObject({ status: 'done', added: 1, nights: 0 });
    expect(r.state.get().lastError).toBeNull();
    expect(r.state.get().sleepReadAt).toBeNull();
    r.fake.sleepFail = null;
    r.now.ms += 20 * 60_000;
    expect(await r.sync.sync('auto')).toMatchObject({ status: 'done', nights: 1 });
    expect(r.ranges[1].from).toBe(r.ranges[0].from);
  });

  it('does not ask for sleep that may not be read', async () => {
    const r = rig({ access: { ...FULL_ACCESS, sleep: false }, sleep: night('2026-11-14', '2026-11-13') });
    expect(await r.sync.sync('auto')).toMatchObject({ status: 'done', nights: 0 });
    expect(r.ranges).toEqual([]);
    expect(r.fake.calls.sleep).toBe(0);
  });

  it('after a read, starts the next one the day before it, at least three wake days back', async () => {
    const r = rig({ sleep: night('2026-11-14', '2026-11-13') }, { sleepReadAt: '2026-11-14T08:00:00.000Z' });
    await r.sync.sync('manual');
    // Wake days from the 12th: read from noon on the 10th.
    expect(r.ranges[0].from).toBe(new Date('2026-11-10T12:00:00+01:00').toISOString());
  });

  it('moves sleepReadAt only once the nights it wrote are confirmed on the device', async () => {
    const days = ['2026-11-08', '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14'];
    const r = rig({ sleep: days.flatMap((d, i) => night(d, i ? days[i - 1] : '2026-11-07')) });
    r.diary.flushMode = 'fail';
    expect(await r.sync.sync('auto')).toMatchObject({ nights: 7 });
    // Not confirmed: the read is not kept as done.
    expect(r.state.get().sleepReadAt).toBeNull();
    // The app was closed before the nights reached the device: they are gone, the phone's memory is not.
    r.sleep.records.clear();
    r.diary.flushMode = 'ok';
    r.now.ms += 20 * 60_000;
    expect(await r.sync.sync('auto')).toMatchObject({ nights: 7 });
    expect(r.ranges[1].from).toBe(r.ranges[0].from);
    expect(r.sleep.live().map((n) => n.date)).toEqual(days);
    expect(r.state.get().sleepReadAt).toBe(new Date(r.now.ms).toISOString());
  });

  it('keeps the earlier sleepReadAt while a save waits, and never moves it back', async () => {
    const r = rig({ sleep: night('2026-11-14', '2026-11-13') }, { sleepReadAt: '2026-11-13T08:00:00.000Z' });
    r.diary.flushMode = 'hold';
    const first = r.sync.sync('manual');
    await new Promise((done) => setTimeout(done, 0));
    expect(r.state.get().sleepReadAt).toBe('2026-11-13T08:00:00.000Z');
    r.diary.release(true);
    await first;
    expect(r.state.get().sleepReadAt).toBe(new Date(NOON).toISOString());
  });

  it('never reads a night older than a deletion marker lives, so a deleted one cannot come back once the marker is gone', async () => {
    // A night of 13 Oct, deleted on another phone; its marker left this device 30 days later. Nothing here remembers it.
    const r = rig({ sleep: [...night('2026-10-13', '2026-10-12'), ...night('2026-10-18', '2026-10-17'), ...night('2026-10-19', '2026-10-18')] });
    await r.sync.sync('auto');
    // 28 wake days, 18 Oct to 14 Nov: the 13th is never read again, the 18th is the first day.
    expect(r.sleep.all().map((n) => n.date)).toEqual(['2026-10-18', '2026-10-19']);
  });

  it('keeps sleepReadAt across a restart', () => {
    expect(restoreState({ enabled: true, sleepReadAt: '2026-11-14T08:00:00.000Z' }).sleepReadAt).toBe('2026-11-14T08:00:00.000Z');
    expect(restoreState({ enabled: true }).sleepReadAt).toBeNull();
  });
});
