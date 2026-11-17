import { describe, expect, it } from 'vitest';

import type { SleepEntry, SleepStore } from '@/types';

import { createFakeAdapter, FULL_ACCESS } from './fake';
import {
  compareNights,
  nightsFrom,
  outranks,
  planSleep,
  readSleepSafely,
  sleepHandledKey,
  sleepKindOf,
  sleepReadRange,
  sleepRecordFrom,
  undoSleep,
  type SleepNight,
} from './sleep';
import { zoneClock } from './steps';
import { GARMIN, SAMSUNG } from './testing';
import { HealthError, NO_ACCESS, type SleepSample, type SleepSourceKind, type SleepStage } from './types';

const AMS = zoneClock('Europe/Amsterdam');
/** Wednesday 18 November 2026, 12:00 in Amsterdam. */
const NOW = Date.parse('2026-11-18T12:00:00+01:00');
const GARMIN_IOS = 'com.garmin.connect.mobile';
const WATCH = 'com.apple.health.watch';
const IPHONE = 'com.apple.health.iphone';

interface SampleInput {
  origin?: string;
  store?: SleepStore;
  kind?: SleepSourceKind;
  offset?: number | null;
}

/** One sample, times local with their offset ('2026-11-17T23:00+01:00'). */
function s(stage: SleepStage, start: string, end: string, over: SampleInput = {}): SleepSample {
  const origin = over.origin ?? GARMIN;
  return {
    store: over.store ?? 'healthConnect',
    origin,
    kind: over.kind ?? sleepKindOf(origin),
    start: new Date(start).toISOString(),
    end: new Date(end).toISOString(),
    zoneOffsetSec: over.offset === undefined ? 3600 : over.offset,
    stage,
  };
}

/** A staged watch night: light, deep, rem, light. 23:00 to 06:30, 7.5 h. */
function stagedNight(day: string, next: string, over: SampleInput = {}): SleepSample[] {
  return [
    s('light', `${day}T23:00+01:00`, `${next}T02:00+01:00`, over),
    s('deep', `${next}T02:00+01:00`, `${next}T03:00+01:00`, over),
    s('rem', `${next}T03:00+01:00`, `${next}T04:00+01:00`, over),
    s('light', `${next}T04:00+01:00`, `${next}T06:30+01:00`, over),
  ];
}

const nights = (samples: SleepSample[], now = NOW) => nightsFrom(samples, { now, clock: AMS });

describe('sleep: samples to nights', () => {
  it('counts overlapping samples from one app once', () => {
    const out = nights([s('asleep', '2026-11-16T23:00+01:00', '2026-11-17T03:00+01:00'), s('asleep', '2026-11-17T01:00+01:00', '2026-11-17T07:00+01:00')]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ date: '2026-11-17', hours: 8, asleepMin: 480, stages: null, origin: GARMIN, store: 'healthConnect' });
    expect(out[0].startedAt).toBe('2026-11-16T22:00:00.000Z');
    expect(out[0].endedAt).toBe('2026-11-17T06:00:00.000Z');
  });

  it('keeps the stages of a watch night, in minutes', () => {
    const [night] = nights(stagedNight('2026-11-16', '2026-11-17'));
    expect(night).toMatchObject({ date: '2026-11-17', hours: 7.5, kind: 'watch', stages: { light: 330, deep: 60, rem: 60, awake: 0 } });
  });

  it("takes the watch's stages over a phone's in-bed block and never adds them together", () => {
    const phone = { origin: IPHONE, store: 'healthKit' as const };
    const watch = { origin: WATCH, store: 'healthKit' as const };
    const out = nights([
      s('inBed', '2026-11-16T22:30+01:00', '2026-11-17T07:00+01:00', phone),
      s('asleep', '2026-11-16T22:45+01:00', '2026-11-17T06:50+01:00', phone),
      ...stagedNight('2026-11-16', '2026-11-17', watch),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ origin: WATCH, hours: 7.5, stages: { light: 330, deep: 60, rem: 60, awake: 0 } });
  });

  it('makes no night from an app that wrote only in bed', () => {
    expect(nights([s('inBed', '2026-11-16T22:30+01:00', '2026-11-17T07:00+01:00', { origin: IPHONE, store: 'healthKit' })])).toEqual([]);
  });

  it('counts no awake, in-bed or unknown time as sleep', () => {
    const out = nights([
      s('inBed', '2026-11-16T22:00+01:00', '2026-11-17T08:00+01:00'),
      s('light', '2026-11-16T23:00+01:00', '2026-11-17T03:00+01:00'),
      s('awake', '2026-11-17T03:00+01:00', '2026-11-17T03:30+01:00'),
      s('unknown', '2026-11-17T03:30+01:00', '2026-11-17T04:00+01:00'),
      s('deep', '2026-11-17T04:00+01:00', '2026-11-17T07:00+01:00'),
    ]);
    expect(out[0]).toMatchObject({ hours: 7, stages: { light: 240, deep: 180, rem: 0, awake: 30 } });
  });

  it("subtracts wakings written inside one long unstaged block of the same app", () => {
    const out = nights([s('asleep', '2026-11-16T23:00+01:00', '2026-11-17T07:00+01:00'), s('awake', '2026-11-17T03:00+01:00', '2026-11-17T03:30+01:00')]);
    expect(out[0]).toMatchObject({ hours: 7.5, stages: null });
  });

  it('saves an unstaged Garmin night with stages null', () => {
    const [night] = nights([s('asleep', '2026-11-16T23:15+01:00', '2026-11-17T06:45+01:00')]);
    expect(night).toMatchObject({ hours: 7.5, stages: null, kind: 'watch' });
  });

  it('takes the night and leaves out a nap on the same wake day', () => {
    const out = nights([s('asleep', '2026-11-16T23:00+01:00', '2026-11-17T07:00+01:00'), s('light', '2026-11-17T14:00+01:00', '2026-11-17T15:00+01:00')]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ date: '2026-11-17', hours: 8, stages: null });
  });

  it('takes the longer of a night and a long afternoon sleep', () => {
    const out = nights([s('asleep', '2026-11-17T01:00+01:00', '2026-11-17T04:00+01:00'), s('asleep', '2026-11-17T13:00+01:00', '2026-11-17T17:00+01:00')]);
    expect(out[0]).toMatchObject({ hours: 4, startedAt: '2026-11-17T12:00:00.000Z' });
  });

  it('makes no night from a lone nap, or from a short evening sleep', () => {
    expect(nights([s('light', '2026-11-17T14:00+01:00', '2026-11-17T15:30+01:00')])).toEqual([]);
    expect(nights([s('asleep', '2026-11-16T19:00+01:00', '2026-11-16T21:00+01:00')])).toEqual([]);
  });

  it('counts a short sleep in the small hours as the night', () => {
    expect(nights([s('asleep', '2026-11-17T01:00+01:00', '2026-11-17T03:00+01:00')])).toMatchObject([{ date: '2026-11-17', hours: 2 }]);
  });

  it("makes a night shift's daytime sleep that day's night", () => {
    expect(nights([s('asleep', '2026-11-17T10:00+01:00', '2026-11-17T18:30+01:00')])).toMatchObject([{ date: '2026-11-17', hours: 8.5 }]);
  });

  it('takes another app\'s whole night over a Garmin nap with stages', () => {
    const out = nights([
      s('light', '2026-11-17T13:00+01:00', '2026-11-17T13:40+01:00'),
      s('deep', '2026-11-17T13:40+01:00', '2026-11-17T14:30+01:00'),
      s('asleep', '2026-11-16T23:00+01:00', '2026-11-17T07:00+01:00', { origin: SAMSUNG }),
    ]);
    expect(out).toMatchObject([{ origin: SAMSUNG, hours: 8, stages: null }]);
  });

  it('takes one app per night between two overlapping ones, whatever order they come in', () => {
    const a = [s('asleep', '2026-11-16T23:00+01:00', '2026-11-17T07:00+01:00', { origin: SAMSUNG })];
    const b = [s('asleep', '2026-11-16T23:30+01:00', '2026-11-17T06:30+01:00', { origin: 'com.fitbit.FitbitMobile' })];
    expect(nights([...a, ...b])).toMatchObject([{ origin: SAMSUNG, hours: 8 }]);
    expect(nights([...b, ...a])).toMatchObject([{ origin: SAMSUNG, hours: 8 }]);
    const c = [s('asleep', '2026-11-16T23:30+01:00', '2026-11-17T07:30+01:00', { origin: 'com.fitbit.FitbitMobile' })];
    expect(nights([...a, ...c])[0].origin).toBe(nights([...c, ...a])[0].origin);
  });

  it('ranks stages first, then a watch, then more sleep', () => {
    const base = { hours: 7, origin: 'a', kind: 'other' as const, stages: null };
    const stages = { light: 1, deep: 1, rem: 1, awake: 0 };
    expect(compareNights({ ...base, stages, hours: 5 }, { ...base, kind: 'watch', hours: 9 })).toBeGreaterThan(0);
    expect(compareNights({ ...base, kind: 'watch', hours: 5 }, { ...base, kind: 'phone', hours: 9 })).toBeGreaterThan(0);
    expect(compareNights({ ...base, hours: 8 }, { ...base, hours: 7 })).toBeGreaterThan(0);
    expect(compareNights(base, { ...base, origin: 'b' })).toBeGreaterThan(0);
    expect(compareNights(base, base)).toBe(0);
  });

  it('joins pieces less than 2 h apart and splits longer gaps', () => {
    expect(nights([s('asleep', '2026-11-16T23:00+01:00', '2026-11-17T03:00+01:00'), s('asleep', '2026-11-17T04:30+01:00', '2026-11-17T07:00+01:00')])).toMatchObject([
      { hours: 6.5, startedAt: '2026-11-16T22:00:00.000Z', endedAt: '2026-11-17T06:00:00.000Z' },
    ]);
    // 2.5 h apart: two periods, the longer one is the night.
    expect(nights([s('asleep', '2026-11-16T23:00+01:00', '2026-11-17T03:00+01:00'), s('asleep', '2026-11-17T05:30+01:00', '2026-11-17T07:00+01:00')])).toMatchObject([{ hours: 4 }]);
  });

  it('dates a night across midnight by the day it ended', () => {
    expect(nights([s('asleep', '2026-11-16T22:00+01:00', '2026-11-17T06:00+01:00')])[0].date).toBe('2026-11-17');
  });

  it("reads the wake day in the night's own zone (a night in Tokyo, the phone set to Amsterdam)", () => {
    const tokyo = { offset: 9 * 3600 };
    // 23:00 to 07:00 in Tokyo is 15:00 to 23:00 in Amsterdam: still the 16th there, the 17th where the person woke.
    const out = nights([s('asleep', '2026-11-16T23:00+09:00', '2026-11-17T07:00+09:00', tokyo)]);
    expect(out).toMatchObject([{ date: '2026-11-17', hours: 8, zoneOffsetSec: 32400 }]);
    // Without an offset the phone's calendar decides.
    expect(nights([s('asleep', '2026-11-16T23:00+09:00', '2026-11-17T07:00+09:00', { offset: null })])[0].date).toBe('2026-11-16');
  });

  it('counts a night across the clock change by the instants (an hour longer in October)', () => {
    const out = nights([s('asleep', '2026-10-24T23:00+02:00', '2026-10-25T07:00+01:00', { offset: null })]);
    expect(out).toMatchObject([{ date: '2026-10-25', hours: 9 }]);
  });

  it('leaves a night that may still be going on for a later sync', () => {
    const night = [s('asleep', '2026-11-17T23:00+01:00', '2026-11-18T07:00+01:00')];
    expect(nights(night, Date.parse('2026-11-18T07:10+01:00'))).toEqual([]);
    expect(nights(night, Date.parse('2026-11-18T07:20+01:00'))).toMatchObject([{ date: '2026-11-18' }]);
  });

  it('returns only wake days from the first day of the read up to today', () => {
    const samples = [
      s('asleep', '2026-11-13T23:00+01:00', '2026-11-14T07:00+01:00'),
      s('asleep', '2026-11-15T23:00+01:00', '2026-11-16T07:00+01:00'),
      s('asleep', '2026-11-18T23:00+09:00', '2026-11-19T07:00+09:00', { offset: 9 * 3600 }),
    ];
    const out = nightsFrom(samples, { now: Date.parse('2026-11-18T23:30+01:00'), clock: AMS, firstDay: '2026-11-15' });
    expect(out.map((n) => n.date)).toEqual(['2026-11-16']);
  });

  it('ignores samples that make no sense', () => {
    const bad = [{ ...s('asleep', '2026-11-16T23:00+01:00', '2026-11-17T07:00+01:00'), end: 'soon' }, s('asleep', '2026-11-17T07:00+01:00', '2026-11-16T23:00+01:00')];
    expect(nights(bad)).toEqual([]);
  });
});

describe('sleep: what a sync reads', () => {
  it('reads 28 days the first time, from noon two days before the first wake day', () => {
    const r = sleepReadRange(null, NOW, AMS);
    expect(r).toMatchObject({ firstDay: '2026-10-22', today: '2026-11-18', to: new Date(NOW).toISOString() });
    expect(r.from).toBe(new Date('2026-10-20T12:00+02:00').toISOString());
  });

  it('reads the last three wake days, or from the day before the last read after a pause', () => {
    expect(sleepReadRange(new Date(NOW - 3600_000).toISOString(), NOW, AMS).firstDay).toBe('2026-11-16');
    expect(sleepReadRange('2026-11-10T08:00:00.000Z', NOW, AMS).firstDay).toBe('2026-11-09');
    expect(sleepReadRange('2026-01-01T08:00:00.000Z', NOW, AMS).firstDay).toBe('2026-10-22');
    expect(sleepReadRange(new Date(NOW - 3600_000).toISOString(), NOW, AMS).from).toBe(new Date('2026-11-14T12:00+01:00').toISOString());
  });

  it('lists the samples that overlap the range in the in-memory store, and none without access', async () => {
    const samples = [s('asleep', '2026-11-16T23:00+01:00', '2026-11-17T07:00+01:00'), s('asleep', '2026-11-10T23:00+01:00', '2026-11-11T07:00+01:00')];
    const { adapter, health } = createFakeAdapter({ access: FULL_ACCESS, sleep: samples });
    const range = { from: '2026-11-17T00:00:00.000Z', to: '2026-11-18T00:00:00.000Z' };
    expect(await adapter.readSleep(range, FULL_ACCESS)).toHaveLength(1);
    expect(await adapter.readSleep(range, { ...FULL_ACCESS, sleep: false })).toEqual([]);
    expect(health.calls.sleep).toBe(2);
  });

  it('never fails the sync over a sleep read', async () => {
    const { adapter } = createFakeAdapter({ access: FULL_ACCESS, sleepFail: new HealthError('permission', 'no') });
    const range = { from: '2026-11-17T00:00:00.000Z', to: '2026-11-18T00:00:00.000Z' };
    expect(await readSleepSafely(adapter, range, FULL_ACCESS)).toEqual({ ok: false, code: 'permission', detail: 'no' });
    expect(await readSleepSafely({ readSleep: () => Promise.reject(new Error('boom')) }, range, FULL_ACCESS)).toEqual({ ok: false, code: 'failed', detail: 'boom' });
    expect(await readSleepSafely(adapter, range, NO_ACCESS)).toEqual({ ok: true, samples: [] });
  });
});

// ---------------------------------------------------------------- the plan

let stamp = 0;
/** A saved record, as the store holds it (id from the date). */
function record(over: Partial<SleepEntry> & { date: string; hours: number }): SleepEntry {
  stamp += 1;
  return { id: `sleep-${over.date}`, updatedAt: new Date(Date.UTC(2026, 10, 1, 0, 0, stamp)).toISOString(), ...over };
}
const saved = (night: SleepNight, over: Partial<SleepEntry> = {}): SleepEntry => record({ ...sleepRecordFrom(night), ...over });

function night(over: Partial<SleepNight> = {}): SleepNight {
  return {
    date: '2026-11-17',
    store: 'healthConnect',
    origin: GARMIN,
    kind: 'watch',
    startedAt: '2026-11-16T22:00:00.000Z',
    endedAt: '2026-11-17T05:30:00.000Z',
    asleepMin: 450,
    hours: 7.5,
    stages: { light: 330, deep: 60, rem: 60, awake: 0 },
    zoneOffsetSec: 3600,
    ...over,
  };
}

describe('sleep: what a sync writes', () => {
  it('adds a night for a day with none, with no quality and where it came from', () => {
    const plan = planSleep({ nights: [night()], existing: [], handled: {} });
    expect(plan.update).toEqual([]);
    expect(plan.add).toEqual([
      { date: '2026-11-17', hours: 7.5, source: 'health', store: 'healthConnect', origin: GARMIN, startedAt: '2026-11-16T22:00:00.000Z', endedAt: '2026-11-17T05:30:00.000Z', stages: { light: 330, deep: 60, rem: 60, awake: 0 } },
    ]);
    expect('quality' in plan.add[0]).toBe(false);
  });

  it('never touches a night entered by hand', () => {
    const hand = record({ date: '2026-11-17', hours: 6, quality: 3 });
    expect(planSleep({ nights: [night()], existing: [hand], handled: {} })).toEqual({ add: [], update: [], remember: {} });
  });

  it('never brings back a night the person deleted, and remembers it before the marker goes', () => {
    const gone = saved(night(), { deleted: true });
    const plan = planSleep({ nights: [night({ hours: 8 })], existing: [gone], handled: {} });
    expect(plan.add).toEqual([]);
    expect(plan.update).toEqual([]);
    expect(plan.remember).toEqual({ [sleepHandledKey('2026-11-17')]: { how: 'skipped', at: '2026-11-16T22:00:00.000Z' } });
    // The marker purged for good: the memory still says no.
    expect(planSleep({ nights: [night()], existing: [], handled: plan.remember })).toEqual({ add: [], update: [], remember: {} });
  });

  it('updates a synced night the watch corrected, keeping the quality the person gave', () => {
    const before = saved(night(), { quality: 4 });
    // A waking found inside the night: shorter, the same end.
    const corrected = night({ hours: 7.25, asleepMin: 435, stages: { light: 315, deep: 60, rem: 60, awake: 15 } });
    const plan = planSleep({ nights: [corrected], existing: [before], handled: {} });
    expect(plan.add).toEqual([]);
    expect(plan.update).toHaveLength(1);
    expect(plan.update[0].before).toBe(before);
    expect(plan.update[0].after).toMatchObject({ id: before.id, quality: 4, hours: 7.25, endedAt: '2026-11-17T05:30:00.000Z', stages: { awake: 15 } });
    // Even when the correction is much shorter (it still comes from the same app and ends no earlier).
    expect(planSleep({ nights: [night({ hours: 5 })], existing: [before], handled: {} }).update).toHaveLength(1);
    // And when it ends later (the watch found the rest of the morning).
    expect(planSleep({ nights: [night({ hours: 8, endedAt: '2026-11-17T06:00:00.000Z' })], existing: [before], handled: {} }).update).toHaveLength(1);
  });

  it('never lets a reading of the same app that ends earlier cut a night short (a device that has not seen all of it yet)', () => {
    const full = saved(night(), { quality: 4 });
    const partial = night({ hours: 5, asleepMin: 300, endedAt: '2026-11-17T03:00:00.000Z', stages: { light: 200, deep: 60, rem: 40, awake: 0 } });
    expect(planSleep({ nights: [partial], existing: [full], handled: {} })).toEqual({ add: [], update: [], remember: {} });
    // The other way round it is the rest of the night: written.
    expect(planSleep({ nights: [night()], existing: [saved(partial)], handled: {} }).update).toHaveLength(1);
  });

  it('settles two devices on one store that read the same app at different times in one write, never back and forth', () => {
    // An iPhone and an iPad on one Apple Health, or two phones with Garmin Connect: B has seen only part of the night.
    const a = night();
    const b = night({ hours: 5, asleepMin: 300, endedAt: '2026-11-17T03:00:00.000Z', stages: { light: 200, deep: 60, rem: 40, awake: 0 } });
    for (const [first, second] of [
      [a, b],
      [b, a],
    ]) {
      let records: SleepEntry[] = [];
      let writes = 0;
      for (let round = 0; round < 6; round += 1) {
        const reading = round % 2 === 0 ? first : second;
        const plan = planSleep({ nights: [reading], existing: records, handled: {} });
        for (const r of plan.add) {
          records = [record({ ...r })];
          writes += 1;
        }
        for (const u of plan.update) {
          records = [u.after];
          writes += 1;
        }
      }
      // The full night is what stays, whichever device read first.
      expect(records[0]).toMatchObject({ hours: 7.5, endedAt: '2026-11-17T05:30:00.000Z' });
      expect(writes).toBeLessThanOrEqual(2);
    }
  });

  it('writes nothing for the same figures', () => {
    expect(planSleep({ nights: [night()], existing: [saved(night(), { quality: 2 })], handled: {} })).toEqual({ add: [], update: [], remember: {} });
  });

  it('lets a reading from another store replace a synced night only when it ranks strictly higher', () => {
    const android = saved(night({ stages: null }));
    const iphone = night({ store: 'healthKit', origin: GARMIN_IOS, stages: { light: 300, deep: 60, rem: 90, awake: 10 } });
    expect(planSleep({ nights: [iphone], existing: [android], handled: {} }).update).toHaveLength(1);
    const lower = night({ store: 'healthKit', origin: IPHONE, kind: 'phone', stages: null, hours: 9 });
    expect(planSleep({ nights: [lower], existing: [android], handled: {} }).update).toEqual([]);
  });

  it('settles a tie between two phones in one write, never back and forth', () => {
    const a = night();
    const b = night({ store: 'healthKit', origin: GARMIN_IOS });
    for (const [first, second] of [
      [a, b],
      [b, a],
    ]) {
      let records: SleepEntry[] = [];
      let writes = 0;
      for (let round = 0; round < 6; round += 1) {
        const plan = planSleep({ nights: [round % 2 ? second : first], existing: records, handled: {} });
        writes += plan.add.length + plan.update.length;
        if (plan.add.length) records = [record({ ...plan.add[0] })];
        if (plan.update.length) records = [plan.update[0].after];
      }
      expect(writes).toBeLessThanOrEqual(2);
      expect(records[0].origin).toBe(GARMIN);
    }
  });

  it('ranks saved nights the same way on every phone, whatever device type one store reported', () => {
    // Health Connect called the Samsung night a watch's; the record keeps only its origin, so both phones judge by that.
    const samsung = saved(night({ origin: SAMSUNG, kind: 'watch', stages: null, hours: 7 }));
    const apple = saved(night({ store: 'healthKit', origin: WATCH, stages: null, hours: 6.5 }));
    expect(outranks(samsung, apple) && outranks(apple, samsung)).toBe(false);
    expect(outranks(apple, samsung)).toBe(true);
  });

  it('never lets the export file replace a reading from a health store', () => {
    const store = saved(night({ store: 'healthKit', origin: IPHONE, kind: 'phone', stages: null, hours: 5 }));
    const file = night({ store: 'file', origin: WATCH });
    expect(planSleep({ nights: [file], existing: [store], handled: {} }).update).toEqual([]);
  });

  it('lets a store reading replace a file reading only when it ranks strictly higher, and a newer file correct an older one', () => {
    const fromFile = saved(night({ store: 'file', origin: WATCH, stages: null }));
    expect(planSleep({ nights: [night({ store: 'healthKit', origin: WATCH })], existing: [fromFile], handled: {} }).update).toHaveLength(1);
    expect(planSleep({ nights: [night({ store: 'healthKit', origin: IPHONE, kind: 'phone', stages: null })], existing: [fromFile], handled: {} }).update).toEqual([]);
    expect(planSleep({ nights: [night({ store: 'file', origin: WATCH, stages: null, hours: 7.75 })], existing: [fromFile], handled: {} }).update).toHaveLength(1);
  });

  it('skips a day whose sync the person undid', () => {
    expect(planSleep({ nights: [night()], existing: [], handled: { [sleepHandledKey('2026-11-17')]: { how: 'skipped', at: '2026-11-16T22:00:00.000Z' } } }).add).toEqual([]);
  });

  it('undoes one sync: removes what it added, puts back what it changed, and remembers the days', () => {
    const before = saved(night({ date: '2026-11-16', origin: SAMSUNG, kind: 'other', stages: null, startedAt: '2026-11-15T22:00:00.000Z' }), { quality: 3 });
    const better = night({ date: '2026-11-16', startedAt: '2026-11-15T22:00:00.000Z', endedAt: '2026-11-16T05:30:00.000Z' });
    const plan = planSleep({ nights: [better, night()], existing: [before], handled: {} });
    expect(plan.add).toHaveLength(1);
    expect(plan.update).toHaveLength(1);
    // What the store holds after the sync wrote the plan.
    const added = record({ ...plan.add[0] });
    const current = [added, plan.update[0].after];
    const undo = undoSleep(plan, current);
    expect(undo.remove).toEqual([added]);
    expect(undo.restore).toEqual([{ ...before, deleted: false }]);
    expect(Object.keys(undo.marks).sort()).toEqual(['sleep:2026-11-16', 'sleep:2026-11-17']);
    // The next sync, after Undo, writes neither day again.
    const afterUndo = [{ ...added, deleted: true }, before];
    expect(planSleep({ nights: [better, night()], existing: afterUndo, handled: undo.marks })).toEqual({ add: [], update: [], remember: {} });
  });

  it('leaves a night the person changed since the sync when it is undone', () => {
    const plan = planSleep({ nights: [night()], existing: [], handled: {} });
    const edited = record({ date: '2026-11-17', hours: 6 });
    expect(undoSleep(plan, [edited]).remove).toEqual([]);
    const rated = record({ ...plan.add[0], quality: 5 });
    expect(undoSleep(plan, [rated]).remove).toEqual([rated]);
  });

  it('tells a watch from a phone by the app id', () => {
    expect([GARMIN, GARMIN_IOS, WATCH, IPHONE, SAMSUNG, 'file:other'].map(sleepKindOf)).toEqual(['watch', 'watch', 'watch', 'phone', 'other', 'other']);
  });
});
