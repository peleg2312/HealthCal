/**
 * Weigh-ins, the day's calories burned and workout heart rate in a sync run, against the
 * in-memory health store: read in the same run as workouts, steps and sleep; weigh-ins planned
 * only after the data sync's pull; one toast with one Undo for everything; a deleted weigh-in
 * never coming back, also from a second phone; a failed or refused read never failing the run;
 * the day's calories kept on this phone only; a workout gaining its heart rate on a later sync.
 */
import { describe, expect, it } from 'vitest';

import type { SleepEntry, WeightEntry } from '@/types';

import { weightHandledKey } from './body';
import { withDeletedDay } from './deletions';
import { MIN_ENERGY_DAYS, watchEstimate } from './dayEnergy';
import { createHealthSync, roundEndedSince, type SleepLog, type SyncDeps, type WeightLog } from './engine';
import { createFakeAdapter, FULL_ACCESS, type FakeHealth } from './fake';
import { zoneClock } from './steps';
import { GARMIN, memoryDiary, memoryState, workout } from './testing';
import { HealthError, type BodySample, type DayEnergyDay, type HealthAccess, type SleepSample } from './types';

const clock = zoneClock('Europe/Amsterdam');
/** Saturday 14 November 2026, 12:00 in Amsterdam. */
const NOON = Date.parse('2026-11-14T12:00:00+01:00');
const WITHINGS = 'com.withings.wiscale2';

/** A reading at a local Amsterdam time on `day` ('06:12'). */
const reading = (kind: BodySample['kind'], day: string, time: string, value: number, origin = GARMIN): BodySample => ({
  store: 'healthConnect',
  origin,
  time: new Date(`${day}T${time}:00+01:00`).toISOString(),
  zoneOffsetSec: 3600,
  kind,
  value,
});
const weight = (day: string, kg: number, time = '06:12', origin = GARMIN) => reading('weight', day, time, kg, origin);
const fat = (day: string, pct: number, time = '06:12', origin = GARMIN) => reading('bodyFat', day, time, pct, origin);

/** The `n` days up to and including the 14th, oldest first. */
const daysUpTo14 = (n: number) => Array.from({ length: n }, (_, i) => new Date(Date.UTC(2026, 10, 14 - (n - 1) + i)).toISOString().slice(0, 10));

/** A synced weights collection: one record per date (upsert derives the id from it), shared by every phone given it. */
function memoryWeights(initial: WeightEntry[] = []): WeightLog & { records: Map<string, WeightEntry>; live(): WeightEntry[] } {
  const records = new Map(initial.map((r) => [r.date, r]));
  let stamp = 0;
  const next = () => new Date(Date.UTC(2026, 10, 14, 13, 0, (stamp += 1))).toISOString();
  return {
    records,
    all: () => [...records.values()],
    live: () => [...records.values()].filter((r) => !r.deleted).sort((a, b) => a.date.localeCompare(b.date)),
    save: (list) => {
      for (const r of list) records.set(r.date, { ...r, id: `weight-${r.date}`, updatedAt: next(), deleted: false } as WeightEntry);
    },
    remove: (id) => {
      for (const [k, r] of records) if (r.id === id) records.set(k, { ...r, deleted: true, updatedAt: next() });
    },
  };
}

function memorySleep(): SleepLog & { live(): SleepEntry[] } {
  const records = new Map<string, SleepEntry>();
  return {
    all: () => [...records.values()],
    live: () => [...records.values()].filter((r) => !r.deleted),
    save: (nights) => {
      for (const n of nights) records.set(n.date, { ...n, id: `sleep-${n.date}`, updatedAt: 'x', deleted: false } as SleepEntry);
    },
    remove: (id) => {
      for (const [k, r] of records) if (r.id === id) records.set(k, { ...r, deleted: true });
    },
  };
}

interface RigOptions {
  health?: Partial<FakeHealth>;
  state?: Parameters<typeof memoryState>[0];
  weights?: ReturnType<typeof memoryWeights>;
  /** What the data sync's pull answers; `bring` runs first, as records another phone wrote arriving. */
  pull?: { ok: boolean; bring?: () => void };
}

function rig({ health = {}, state: initial = {}, weights = memoryWeights(), pull = { ok: true } }: RigOptions = {}) {
  const fake = createFakeAdapter({ access: FULL_ACCESS, ...health });
  const ranges: { from: string; to: string }[] = [];
  const adapter = { ...fake.adapter, store: fake.adapter.store, readWeighIns: (range: { from: string; to: string }, access: typeof FULL_ACCESS) => (ranges.push(range), fake.adapter.readWeighIns(range, access)) };
  const state = memoryState({ enabled: true, ...initial });
  const diary = memoryDiary();
  const sleep = memorySleep();
  const now = { ms: NOON };
  const pulls: number[] = [];
  const toasts: { message: string; undo: () => void; tint?: string }[] = [];
  const deps: SyncDeps = {
    adapter,
    now: () => now.ms,
    state,
    diary,
    sleep,
    weights,
    afterPull: async (since) => {
      pulls.push(since);
      pull.bring?.();
      return pull.ok;
    },
    announce: (message, undo, tint) => void toasts.push({ message, undo, tint }),
    stepClock: clock,
  };
  return { sync: createHealthSync(deps), state, diary, sleep, weights, fake: fake.health, ranges, now, toasts, pulls, pull };
}

const later = (r: { now: { ms: number } }) => void (r.now.ms += 20 * 60_000);

describe('weigh-ins in a sync', () => {
  it('adds one weigh-in a day with its body fat, says so in the weight colour, and keeps weightReadAt once saved', async () => {
    const r = rig({
      health: {
        weighIns: [weight('2026-11-13', 82.4), fat('2026-11-13', 18.2, '06:13'), weight('2026-11-13', 82.0, '19:00'), weight('2026-11-14', 82.1)],
      },
    });
    expect(await r.sync.sync('auto')).toEqual({ status: 'done', added: 0, updated: 0, review: 0, nights: 0, weighIns: 2 });
    // 28 days, from the local midnight of the day before the first (18 Oct).
    expect(r.ranges).toEqual([{ from: new Date('2026-10-17T00:00:00+02:00').toISOString(), to: new Date(NOON).toISOString() }]);
    expect(r.pulls).toEqual([NOON]);
    expect(r.weights.live().map((w) => [w.date, w.kg, w.bodyFatPct, w.source, w.origin, w.syncedKg, w.syncedBodyFatPct])).toEqual([
      ['2026-11-13', 82.4, 18.2, 'health', GARMIN, 82.4, 18.2],
      ['2026-11-14', 82.1, undefined, 'health', GARMIN, 82.1, undefined],
    ]);
    expect(r.toasts.map((t) => [t.message, t.tint])).toEqual([['2 weigh-ins added from Garmin Connect', 'weight']]);
    expect(r.state.get().weightReadAt).toBe(new Date(NOON).toISOString());
    expect(r.state.get().lastResult).toEqual({ at: new Date(NOON).toISOString(), added: 0, updated: 0, weighIns: 2 });
  });

  it('says workouts, nights and weigh-ins in one toast, whose one Undo takes all of them out and keeps them out', async () => {
    const night: SleepSample[] = [
      { store: 'healthConnect', origin: GARMIN, kind: 'watch', start: new Date('2026-11-13T23:00:00+01:00').toISOString(), end: new Date('2026-11-14T06:30:00+01:00').toISOString(), zoneOffsetSec: 3600, stage: 'light' },
    ];
    const r = rig({
      health: { workouts: [workout({ start: '2026-11-13T17:00:00+01:00', minutes: 45 })], sleep: night, weighIns: [weight('2026-11-13', 82.4), weight('2026-11-14', 82.1)] },
    });
    expect(await r.sync.sync('auto')).toMatchObject({ status: 'done', added: 1, nights: 1, weighIns: 2 });
    expect(r.toasts.map((t) => [t.message, t.tint])).toEqual([['1 workout, 1 night of sleep and 2 weigh-ins added from Garmin Connect', 'exercise']]);
    r.toasts[0].undo();
    expect(r.diary.live()).toEqual([]);
    expect(r.sleep.live()).toEqual([]);
    expect(r.weights.live()).toEqual([]);
    // Soft deleted: the markers stay, so no phone adds them again; and this phone remembers each day at once.
    expect(r.weights.all().map((w) => w.deleted)).toEqual([true, true]);
    expect(r.state.get().handled[weightHandledKey('2026-11-13')]).toMatchObject({ how: 'skipped' });
    expect(r.state.get().handled[weightHandledKey('2026-11-14')]).toMatchObject({ how: 'skipped' });
    later(r);
    expect(await r.sync.sync('manual')).toMatchObject({ status: 'done', added: 0, weighIns: 0 });
    expect(r.weights.live()).toEqual([]);
  });

  it('says on the first read of many weigh-ins how far back they go', async () => {
    const many = daysUpTo14(26).map((d, i) => weight(d, 84 - i * 0.1));
    const plain = rig({ health: { weighIns: many } });
    await plain.sync.sync('auto');
    expect(plain.toasts[0].message).toBe('26 weigh-ins added from Garmin Connect. They go back to Oct 20.');
    const both = rig({ health: { workouts: [workout({ start: '2026-11-13T17:00:00+01:00', minutes: 45 })], weighIns: many } });
    await both.sync.sync('auto');
    expect(both.toasts[0].message).toBe('1 workout and 26 weigh-ins added from Garmin Connect. They go back to Oct 20.');
    // A fortnight says a fortnight: the date is the earliest one added, never a fixed span.
    const fortnight = rig({ health: { weighIns: daysUpTo14(13).map((d) => weight(d, 82)) } });
    await fortnight.sync.sync('auto');
    expect(fortnight.toasts[0].message).toBe('13 weigh-ins added from Garmin Connect. They go back to Nov 2.');
    // A later read with as many says only what it added.
    const again = rig({ health: { weighIns: many }, state: { weightReadAt: '2026-10-01T08:00:00.000Z' } });
    await again.sync.sync('auto');
    expect(again.toasts[0].message).toBe('26 weigh-ins added from Garmin Connect');
  });

  it('reads from the day before the last read on a later sync, at least the last three days', async () => {
    const r = rig({ health: { weighIns: [weight('2026-11-14', 82.1)] }, state: { weightReadAt: '2026-11-13T08:00:00.000Z' } });
    await r.sync.sync('manual');
    // First day the 12th (today and the two before): read from midnight on the 11th.
    expect(r.ranges[0].from).toBe(new Date('2026-11-11T00:00:00+01:00').toISOString());
  });

  it('never touches a weigh-in the person entered, or one whose weight they changed', async () => {
    const hand: WeightEntry = { id: 'weight-2026-11-13', updatedAt: 'x', date: '2026-11-13', kg: 83 };
    const changed: WeightEntry = { id: 'weight-2026-11-14', updatedAt: 'x', date: '2026-11-14', kg: 81.5, source: 'health', store: 'healthConnect', origin: GARMIN, measuredAt: new Date('2026-11-14T08:00:00+01:00').toISOString(), syncedKg: 82.1 };
    const r = rig({ health: { weighIns: [weight('2026-11-13', 82.4), weight('2026-11-14', 82.1, '06:00'), fat('2026-11-14', 18, '06:00')] }, weights: memoryWeights([hand, changed]) });
    expect(await r.sync.sync('manual')).toMatchObject({ weighIns: 0 });
    expect(r.weights.live()).toEqual([hand, changed]);
    expect(r.toasts).toEqual([]);
  });

  it('updates a synced weigh-in when its body fat arrives later, and Undo gives the earlier one back as the person\'s own', async () => {
    const r = rig({ health: { weighIns: [weight('2026-11-14', 82.1)] } });
    await r.sync.sync('auto');
    r.fake.weighIns = [weight('2026-11-14', 82.1), fat('2026-11-14', 18.4)];
    later(r);
    expect(await r.sync.sync('auto')).toMatchObject({ weighIns: 1 });
    expect(r.weights.live()[0]).toMatchObject({ kg: 82.1, bodyFatPct: 18.4, syncedBodyFatPct: 18.4 });
    expect(r.toasts[1]).toMatchObject({ message: '1 weigh-in updated from Garmin Connect', tint: 'weight' });
    r.toasts[1].undo();
    const back = r.weights.live()[0];
    expect(back).toMatchObject({ date: '2026-11-14', kg: 82.1 });
    expect(back.bodyFatPct).toBeUndefined();
    expect(back.source).toBeUndefined();
    expect(r.state.get().handled[weightHandledKey('2026-11-14')]).toMatchObject({ how: 'skipped' });
  });

  it('does not bring back a deleted weigh-in, and remembers the day only once the save is confirmed on the device', async () => {
    const deleted: WeightEntry = { id: 'weight-2026-11-14', updatedAt: 'x', date: '2026-11-14', kg: 82.1, source: 'health', store: 'healthConnect', origin: GARMIN, deleted: true };
    const r = rig({ health: { weighIns: [weight('2026-11-14', 82.1)] }, weights: memoryWeights([deleted]) });
    r.diary.flushMode = 'fail';
    await r.sync.sync('manual');
    expect(r.weights.live()).toEqual([]);
    expect(r.state.get().handled[weightHandledKey('2026-11-14')]).toBeUndefined();
    expect(r.state.get().weightReadAt).toBeNull();
    r.diary.flushMode = 'ok';
    later(r);
    await r.sync.sync('manual');
    expect(r.state.get().handled[weightHandledKey('2026-11-14')]).toMatchObject({ how: 'skipped' });
    expect(r.state.get().weightReadAt).toBe(new Date(r.now.ms).toISOString());
    // The deletion marker goes for good; the day stays out.
    r.weights.records.delete('2026-11-14');
    later(r);
    await r.sync.sync('manual');
    expect(r.weights.live()).toEqual([]);
  });

  it('a weigh-in deleted right after a sync stays deleted when the marker is purged before the next run (no account)', async () => {
    const r = rig({ health: { weighIns: [weight('2026-11-14', 82.1)] } });
    expect(await r.sync.sync('auto')).toMatchObject({ weighIns: 1 });
    // The person deletes it at once: the tracker's delete remembers the day (deletions.ts) as it removes the record.
    const deleted = r.weights.live()[0];
    r.weights.remove(deleted.id);
    r.state.set({ handled: withDeletedDay(r.state.get().handled, weightHandledKey(deleted.date), deleted.measuredAt!, r.now.ms) });
    r.now.ms += 5 * 60_000;
    expect(await r.sync.sync('auto')).toMatchObject({ status: 'skipped', why: 'too-soon' });
    // A day later, without an account, the store's start purges the deletion marker before any run.
    r.now.ms += 25 * 3_600_000;
    r.weights.records.delete('2026-11-14');
    expect(await r.sync.sync('auto')).toMatchObject({ status: 'done', weighIns: 0 });
    expect(r.weights.live()).toEqual([]);
    expect(r.state.get().handled[weightHandledKey('2026-11-14')]).toMatchObject({ how: 'skipped' });
  });

  it('moves weightReadAt only once what the read wrote is confirmed on the device', async () => {
    const r = rig({ health: { weighIns: [weight('2026-11-12', 82.6), weight('2026-11-13', 82.4)] } });
    r.diary.flushMode = 'fail';
    expect(await r.sync.sync('auto')).toMatchObject({ weighIns: 2 });
    expect(r.state.get().weightReadAt).toBeNull();
    // The app was closed before they reached the device.
    r.weights.records.clear();
    r.diary.flushMode = 'ok';
    later(r);
    expect(await r.sync.sync('auto')).toMatchObject({ weighIns: 2 });
    expect(r.ranges[1].from).toBe(r.ranges[0].from);
    expect(r.state.get().weightReadAt).toBe(new Date(r.now.ms).toISOString());
  });

  it('leaves weigh-ins to the next run when the pull could not be had, while workouts are still saved', async () => {
    const r = rig({ health: { workouts: [workout({ start: '2026-11-13T17:00:00+01:00', minutes: 45 })], weighIns: [weight('2026-11-14', 82.1)] }, pull: { ok: false } });
    expect(await r.sync.sync('auto')).toMatchObject({ status: 'done', added: 1, weighIns: 0 });
    expect(r.weights.all()).toEqual([]);
    expect(r.state.get().weightReadAt).toBeNull();
    expect(r.toasts.map((t) => t.message)).toEqual(['1 workout added from Garmin Connect']);
    // The Weight row is told why (weightRowText): held since the first run that held them.
    expect(r.state.get().weightWaitingSince).toBe(new Date(NOON).toISOString());
    later(r);
    await r.sync.sync('auto');
    expect(r.state.get().weightWaitingSince).toBe(new Date(NOON).toISOString());
    r.pull.ok = true;
    later(r);
    expect(await r.sync.sync('auto')).toMatchObject({ weighIns: 1 });
    expect(r.ranges[2].from).toBe(r.ranges[0].from);
    expect(r.state.get().weightWaitingSince).toBeNull();
  });

  it('does not wait for the pull when there is nothing to plan', async () => {
    const r = rig({ health: { weighIns: [] }, pull: { ok: false } });
    await r.sync.sync('auto');
    expect(r.pulls).toEqual([]);
    // Nothing was in the store: the read still counts as done.
    expect(r.state.get().weightReadAt).toBe(new Date(NOON).toISOString());
    expect(r.state.get().weightWaitingSince).toBeNull();
  });

  it('a deletion made on another phone that the pull brings stops the add', async () => {
    const weights = memoryWeights();
    const r = rig({
      health: { weighIns: [weight('2026-11-14', 82.1)] },
      weights,
      pull: {
        ok: true,
        bring: () => {
          if (!weights.records.has('2026-11-14')) weights.records.set('2026-11-14', { id: 'weight-2026-11-14', updatedAt: 'y', date: '2026-11-14', kg: 82.1, source: 'health', origin: GARMIN, deleted: true });
        },
      },
    });
    expect(await r.sync.sync('auto')).toMatchObject({ weighIns: 0 });
    expect(weights.live()).toEqual([]);
    expect(r.state.get().handled[weightHandledKey('2026-11-14')]).toMatchObject({ how: 'skipped' });
  });

  it('two phones with different readings of one day settle on the earliest, and a deletion on one is kept by the other', async () => {
    const shared = memoryWeights();
    // Phone A's store has the scale's 06:40 reading only; phone B's also the watch app's 06:05 one, which arrived late.
    const a = rig({ health: { weighIns: [weight('2026-11-14', 82.3, '06:40', WITHINGS)] }, weights: shared });
    const b = rig({ health: { weighIns: [weight('2026-11-14', 82.3, '06:40', WITHINGS), weight('2026-11-14', 82.0, '06:05')] }, weights: shared });
    await a.sync.sync('auto');
    expect(shared.live()[0]).toMatchObject({ kg: 82.3, origin: WITHINGS });
    expect(await b.sync.sync('auto')).toMatchObject({ weighIns: 1 });
    expect(shared.live()[0]).toMatchObject({ kg: 82, origin: GARMIN });
    // A's later reading never moves it back.
    later(a);
    expect(await a.sync.sync('auto')).toMatchObject({ weighIns: 0 });
    expect(shared.live()[0]).toMatchObject({ kg: 82, origin: GARMIN });
    // Deleted on B: A, which never saw the deletion itself, does not bring it back.
    shared.remove('weight-2026-11-14');
    later(a);
    expect(await a.sync.sync('manual')).toMatchObject({ weighIns: 0 });
    expect(shared.live()).toEqual([]);
  });

  it('never fails the run when the weigh-in read fails, and reads the same days again next time', async () => {
    const r = rig({ health: { workouts: [workout({ start: '2026-11-13T17:00:00+01:00', minutes: 45 })], weighIns: [weight('2026-11-14', 82.1)], weighInsFail: new HealthError('permission', 'no') } });
    expect(await r.sync.sync('auto')).toMatchObject({ status: 'done', added: 1, weighIns: 0 });
    expect(r.state.get().lastError).toBeNull();
    expect(r.state.get().weightReadAt).toBeNull();
    r.fake.weighInsFail = null;
    later(r);
    expect(await r.sync.sync('auto')).toMatchObject({ status: 'done', weighIns: 1 });
    expect(r.ranges[1].from).toBe(r.ranges[0].from);
  });

  it('does not ask for weight that may not be read; the Weight row\'s Allow grants only weight and body fat, and a refusal nothing', async () => {
    const before = { ...FULL_ACCESS, weight: false, bodyFat: false, heartRate: false };
    const r = rig({ health: { access: before, weighIns: [weight('2026-11-14', 82.1)] } });
    expect(await r.sync.sync('auto')).toMatchObject({ status: 'done', weighIns: 0 });
    expect(r.fake.calls.weighIns).toBe(0);
    // Refused at the system sheet: nothing changes.
    expect(await createFakeAdapter({ access: before, grant: null }).adapter.requestAccess('weight')).toEqual(before);
    // Allowed from the row: only that row's flags change.
    expect(await createFakeAdapter({ access: before }).adapter.requestAccess('weight')).toEqual({ ...before, weight: true, bodyFat: true });
    // A browser demo written before a flag existed leaves it out: it reads as not allowed (false), so a row's Allow is answered as refused, as on a phone.
    const old = { workouts: true, activeEnergy: true, totalEnergy: true, distance: true, steps: true, sleep: true } as unknown as HealthAccess;
    expect(await createFakeAdapter({ access: old, grant: old }).adapter.requestAccess('weight')).toMatchObject({ weight: false, bodyFat: false });
  });

  it('reads no body fat that may not be read', async () => {
    const r = rig({ health: { access: { ...FULL_ACCESS, bodyFat: false }, weighIns: [weight('2026-11-14', 82.1), fat('2026-11-14', 18)] } });
    await r.sync.sync('auto');
    expect(r.weights.live()[0].bodyFatPct).toBeUndefined();
  });
});

describe('the day\'s calories burned in a sync', () => {
  const day = (d: string, kcal: number, activeKcal: number, origins = [GARMIN]): DayEnergyDay => ({ day: d, kcal, activeKcal, origins });

  it('keeps the last 14 days on this phone, never in the synced store, and shows the estimate from 5 valid days', async () => {
    const days = daysUpTo14(10).map((d) => day(d, 2640, 700));
    const r = rig({ health: { dayEnergy: [...days, day('2026-10-01', 2500, 600)] } });
    await r.sync.sync('auto');
    const kept = r.state.get().dayEnergy;
    expect(Object.keys(kept.days)).toEqual(daysUpTo14(10));
    expect(kept.readAt).toBe(new Date(NOON).toISOString());
    // Nothing goes to the diary, the sleep log or the weigh-ins, and no toast.
    expect(r.diary.all()).toEqual([]);
    expect(r.weights.all()).toEqual([]);
    expect(r.toasts).toEqual([]);
    expect(watchEstimate(kept.days, '2026-11-14', {}, 2400, 1650, 'health-connect')).toMatchObject({ avg: 2640, n: 7, label: 'Garmin Connect', app: 2400 });
  });

  it('keeps a day with nothing recorded out, and refuses days that are not a whole recorded day', async () => {
    const r = rig({
      health: {
        dayEnergy: [
          day('2026-11-08', 0, 0),
          // Resting filled in by Health Connect, nothing recorded.
          day('2026-11-09', 1700, 0, ['com.google.android.apps.healthdata']),
          day('2026-11-10', 900, 200),
          day('2026-11-11', 2600, 600),
          day('2026-11-12', 2650, 650),
          day('2026-11-13', 2700, 700),
        ],
      },
    });
    await r.sync.sync('auto');
    const kept = r.state.get().dayEnergy.days;
    expect(kept['2026-11-08']).toBeUndefined();
    // Three valid days of seven: not enough to show anything.
    expect(MIN_ENERGY_DAYS).toBe(5);
    expect(watchEstimate(kept, '2026-11-14', {}, 2400, 1650, 'health-connect')).toBeNull();
  });

  it('never fails the run when the read fails or is not allowed, keeps what it had, and turning sync off clears it', async () => {
    const r = rig({ health: { dayEnergy: [day('2026-11-13', 2700, 700)] } });
    await r.sync.sync('auto');
    expect(Object.keys(r.state.get().dayEnergy.days)).toEqual(['2026-11-13']);
    r.fake.dayEnergyFail = new HealthError('failed', 'boom');
    later(r);
    expect(await r.sync.sync('auto')).toMatchObject({ status: 'done' });
    expect(r.state.get().lastError).toBeNull();
    expect(Object.keys(r.state.get().dayEnergy.days)).toEqual(['2026-11-13']);
    r.fake.access = { ...FULL_ACCESS, dayEnergy: false };
    later(r);
    await r.sync.sync('auto');
    expect(r.fake.calls.dayEnergy).toBe(2);
    expect(Object.keys(r.state.get().dayEnergy.days)).toEqual(['2026-11-13']);
    r.sync.disable();
    expect(r.state.get().dayEnergy).toEqual({ days: {}, readAt: null });
  });
});

describe('a workout\'s heart rate in a sync', () => {
  it('gains its heart rate on a later sync once heart rate may be read, in one toast with an Undo', async () => {
    const run = workout({ start: '2026-11-13T17:00:00+01:00', minutes: 45, totalKcal: 520, activeKcal: 420, avgHeartRate: 142, maxHeartRate: 171 });
    const r = rig({ health: { access: { ...FULL_ACCESS, heartRate: false }, workouts: [run] } });
    await r.sync.sync('auto');
    expect(r.diary.live()[0].avgHeartRate).toBeUndefined();
    // The row's Allow, then the manual sync it starts (every workout's details are read).
    r.fake.access = { ...r.fake.access, heartRate: true };
    later(r);
    expect(await r.sync.sync('manual')).toMatchObject({ status: 'done', added: 0, updated: 1 });
    expect(r.diary.live()[0]).toMatchObject({ avgHeartRate: 142, maxHeartRate: 171, kcalGross: 520, measured: true });
    expect(r.toasts[1].message).toBe('1 workout updated from Garmin Connect');
    r.toasts[1].undo();
    expect(r.diary.live()[0].avgHeartRate).toBeUndefined();
  });

  it('keeps no heart rate the store did not measure', async () => {
    const r = rig({ health: { workouts: [workout({ start: '2026-11-13T17:00:00+01:00', minutes: 45, totalKcal: 520 })] } });
    await r.sync.sync('auto');
    expect(r.diary.live()[0].avgHeartRate).toBeUndefined();
    expect(r.diary.live()[0].maxHeartRate).toBeUndefined();
  });
});

describe('the pull weigh-ins wait for', () => {
  it('is a whole round, ended after the run began, with nothing in error', () => {
    expect(roundEndedSince('idle', new Date(NOON + 1).toISOString(), NOON)).toBe(true);
    expect(roundEndedSince('idle', new Date(NOON).toISOString(), NOON)).toBe(true);
    expect(roundEndedSince('idle', new Date(NOON - 1).toISOString(), NOON)).toBe(false);
    expect(roundEndedSince('syncing', new Date(NOON + 1).toISOString(), NOON)).toBe(false);
    expect(roundEndedSince('error', new Date(NOON + 1).toISOString(), NOON)).toBe(false);
    expect(roundEndedSince('idle', null, NOON)).toBe(false);
  });

  it('a pull that never answers is the same as one that failed: weigh-ins wait, the run ends', async () => {
    const fake = createFakeAdapter({ access: FULL_ACCESS, weighIns: [weight('2026-11-14', 82.1)] });
    const weights = memoryWeights();
    const sync = createHealthSync({
      adapter: fake.adapter,
      now: () => NOON,
      state: memoryState({ enabled: true }),
      diary: memoryDiary(),
      weights,
      afterPull: () => new Promise<boolean>(() => {}),
      announce: () => {},
      stepClock: clock,
      timeoutMs: 50,
    });
    expect(await sync.sync('auto')).toMatchObject({ status: 'done', weighIns: 0 });
    expect(weights.all()).toEqual([]);
  });
});
