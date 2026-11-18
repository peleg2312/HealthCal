import { describe, expect, it } from 'vitest';

import { isSyncedWeighIn } from '@/features/trackers/weighInSource';
import type { WeightEntry } from '@/types';

import {
  planWeights,
  plausibleSample,
  readingDay,
  readWeighInsSafely,
  undoWeighIns,
  weighInsFrom,
  weightHandledKey,
  weightReadRange,
  type BodySample,
  type WeighIn,
} from './body';
import { NO_ACCESS, HealthError } from './types';
import { zoneClock } from './steps';

const GARMIN = 'com.garmin.android.apps.connectmobile';
const WITHINGS = 'com.withings.wiscale2';
const ams = zoneClock('Europe/Amsterdam');

const w = (time: string, value: number, over: Partial<BodySample> = {}): BodySample => ({ store: 'healthConnect', origin: GARMIN, time, zoneOffsetSec: 3600, kind: 'weight', value, ...over });
const fat = (time: string, value: number, over: Partial<BodySample> = {}): BodySample => w(time, value, { kind: 'bodyFat', ...over });

const record = (over: Partial<WeightEntry> = {}): WeightEntry => ({ id: `w-${over.date ?? '2026-11-14'}`, updatedAt: '2026-11-14T08:00:00.000Z', date: '2026-11-14', kg: 82.4, ...over });
const synced = (over: Partial<WeightEntry> = {}): WeightEntry =>
  record({
    source: 'health',
    store: 'healthConnect',
    origin: GARMIN,
    measuredAt: '2026-11-14T06:12:00.000Z',
    syncedKg: over.kg ?? 82.4,
    ...(over.bodyFatPct !== undefined ? { syncedBodyFatPct: over.bodyFatPct } : {}),
    ...over,
  });
const reading = (over: Partial<WeighIn> = {}): WeighIn => ({ date: '2026-11-14', store: 'healthConnect', origin: GARMIN, measuredAt: '2026-11-14T06:12:00.000Z', kg: 82.4, bodyFatPct: null, ...over });

describe('values (rule a)', () => {
  it('keeps a weight from 20 to 400 kg, rounded to 2 decimals', () => {
    expect(plausibleSample(w('2026-11-14T06:12:00Z', 19.99))).toBeNull();
    expect(plausibleSample(w('2026-11-14T06:12:00Z', 400.01))).toBeNull();
    expect(plausibleSample(w('2026-11-14T06:12:00Z', 20))?.value).toBe(20);
    expect(plausibleSample(w('2026-11-14T06:12:00Z', 400))?.value).toBe(400);
    expect(plausibleSample(w('2026-11-14T06:12:00Z', 82.4567))?.value).toBe(82.46);
  });

  it('reads a body fat at or below 1 as a fraction, keeps 3 to 60 %, rounded to 1 decimal', () => {
    expect(plausibleSample(fat('2026-11-14T06:12:00Z', 0.182))?.value).toBe(18.2);
    expect(plausibleSample(fat('2026-11-14T06:12:00Z', 18.24))?.value).toBe(18.2);
    expect(plausibleSample(fat('2026-11-14T06:12:00Z', 0.02))).toBeNull();
    expect(plausibleSample(fat('2026-11-14T06:12:00Z', 61))).toBeNull();
    expect(plausibleSample(fat('2026-11-14T06:12:00Z', 0))).toBeNull();
  });

  it('drops a sample without an origin or with a time that cannot be read, and writes the time in one form', () => {
    expect(plausibleSample(w('2026-11-14T06:12:00Z', 80, { origin: '' }))).toBeNull();
    expect(plausibleSample(w('this morning', 80))).toBeNull();
    expect(plausibleSample(w('2026-11-14T06:12:00Z', Number.NaN))).toBeNull();
    expect(plausibleSample(w('2026-11-14T06:12:00Z', 80))?.time).toBe('2026-11-14T06:12:00.000Z');
  });
});

describe('the day a reading belongs to (rule b)', () => {
  it('uses the record\'s own offset: 23:30 is that evening, 00:10 the next day', () => {
    // 22:30Z at +01:00 is 23:30 local on the 14th; 23:10Z is 00:10 on the 15th.
    expect(readingDay({ time: '2026-11-14T22:30:00.000Z', zoneOffsetSec: 3600 }, ams)).toBe('2026-11-14');
    expect(readingDay({ time: '2026-11-14T23:10:00.000Z', zoneOffsetSec: 3600 }, ams)).toBe('2026-11-15');
    // Measured in New York (-05:00) while the phone is in Amsterdam: the day where it was measured.
    expect(readingDay({ time: '2026-11-15T02:00:00.000Z', zoneOffsetSec: -5 * 3600 }, ams)).toBe('2026-11-14');
  });

  it('uses the phone\'s calendar without one', () => {
    expect(readingDay({ time: '2026-11-14T23:10:00.000Z', zoneOffsetSec: null }, ams)).toBe('2026-11-15');
    expect(readingDay({ time: '2026-11-14T22:30:00.000Z', zoneOffsetSec: null }, zoneClock('America/New_York'))).toBe('2026-11-14');
  });
});

describe('one weigh-in a day (rules c, d, e)', () => {
  it('takes the earliest reading of the day, from any app, and drops days before the first', () => {
    const out = weighInsFrom(
      [
        w('2026-11-14T18:00:00Z', 83.1),
        w('2026-11-14T06:12:00Z', 82.4),
        w('2026-11-14T06:30:00Z', 82.0, { origin: WITHINGS }),
        w('2026-11-13T06:00:00Z', 82.9),
        w('2026-11-10T06:00:00Z', 83.5),
      ],
      ams,
      '2026-11-11',
    );
    expect(out.map((x) => [x.date, x.kg, x.origin])).toEqual([
      ['2026-11-13', 82.9, GARMIN],
      ['2026-11-14', 82.4, GARMIN],
    ]);
    expect(out[1].measuredAt).toBe('2026-11-14T06:12:00.000Z');
  });

  it('a scale app\'s earlier reading wins over the watch app\'s later one: no app outranks another', () => {
    const out = weighInsFrom([w('2026-11-14T06:12:00Z', 82.4), w('2026-11-14T06:05:00Z', 82.1, { origin: WITHINGS })], ams, '2026-11-01');
    expect(out[0]).toMatchObject({ origin: WITHINGS, kg: 82.1 });
  });

  it('breaks a tie at the same instant by the origin id that sorts first, whatever the order read', () => {
    const a = w('2026-11-14T06:12:00Z', 82.4, { origin: 'com.b.scale' });
    const b = w('2026-11-14T06:12:00.000Z', 82.6, { origin: 'com.a.scale' });
    expect(weighInsFrom([a, b], ams, '2026-11-01')[0].origin).toBe('com.a.scale');
    expect(weighInsFrom([b, a], ams, '2026-11-01')[0].origin).toBe('com.a.scale');
  });

  it('pairs body fat from the same app within 10 minutes, the nearest, a tie to the earlier', () => {
    const base = w('2026-11-14T06:12:00Z', 82.4);
    expect(weighInsFrom([base, fat('2026-11-14T06:12:00Z', 18.2)], ams, '2026-11-01')[0].bodyFatPct).toBe(18.2);
    expect(weighInsFrom([base, fat('2026-11-14T06:20:00Z', 18.5), fat('2026-11-14T06:13:00Z', 18.3)], ams, '2026-11-01')[0].bodyFatPct).toBe(18.3);
    expect(weighInsFrom([base, fat('2026-11-14T06:15:00Z', 18.6), fat('2026-11-14T06:09:00Z', 18.4)], ams, '2026-11-01')[0].bodyFatPct).toBe(18.4);
    // Too far, or another app: not paired.
    expect(weighInsFrom([base, fat('2026-11-14T06:22:01Z', 18.2)], ams, '2026-11-01')[0].bodyFatPct).toBeNull();
    expect(weighInsFrom([base, fat('2026-11-14T06:12:00Z', 18.2, { origin: WITHINGS })], ams, '2026-11-01')[0].bodyFatPct).toBeNull();
  });

  it('makes nothing from a body-fat reading alone', () => {
    expect(weighInsFrom([fat('2026-11-14T06:12:00Z', 18.2)], ams, '2026-11-01')).toEqual([]);
  });
});

describe('planWeights (rule f)', () => {
  const plan = (weighIns: WeighIn[], existing: WeightEntry[], handled = {}) => planWeights({ weighIns, existing, handled });

  it('adds a day with nothing, with what the sync wrote', () => {
    const p = plan([reading({ bodyFatPct: 18.2 })], []);
    expect(p.add).toEqual([
      { date: '2026-11-14', kg: 82.4, bodyFatPct: 18.2, source: 'health', store: 'healthConnect', origin: GARMIN, measuredAt: '2026-11-14T06:12:00.000Z', syncedKg: 82.4, syncedBodyFatPct: 18.2 },
    ]);
    expect(isSyncedWeighIn(p.add[0])).toBe(true);
    expect(plan([reading()], []).add[0]).not.toHaveProperty('bodyFatPct');
  });

  it('never touches a weigh-in entered by hand', () => {
    expect(plan([reading({ measuredAt: '2026-11-14T05:00:00.000Z' })], [record({ kg: 83 })])).toEqual({ add: [], update: [], remember: {} });
  });

  it('never touches a synced weigh-in whose weight or body fat the person changed, even with source still set', () => {
    const changedKg = synced({ kg: 81.0, syncedKg: 82.4 });
    const changedFat = synced({ bodyFatPct: 20, syncedBodyFatPct: 18.2 });
    expect(isSyncedWeighIn(changedKg)).toBe(false);
    for (const r of [changedKg, changedFat]) {
      expect(plan([reading({ measuredAt: '2026-11-14T05:00:00.000Z', kg: 82.0 })], [r]).update).toEqual([]);
      expect(plan([reading({ kg: 82.0 })], [r]).update).toEqual([]);
    }
  });

  it('skips a deleted day, and remembers it', () => {
    const p = plan([reading()], [synced({ deleted: true })]);
    expect(p.add).toEqual([]);
    expect(p.remember).toEqual({ [weightHandledKey('2026-11-14')]: { how: 'skipped', at: '2026-11-14T06:12:00.000Z' } });
  });

  it('never writes a day remembered as skipped, live record or not', () => {
    const handled = { 'weight:2026-11-14': { how: 'skipped' as const, at: 'x' } };
    expect(plan([reading()], [], handled)).toEqual({ add: [], update: [], remember: {} });
    expect(plan([reading({ measuredAt: '2026-11-14T05:00:00.000Z' })], [synced()], handled).update).toEqual([]);
  });

  it('an earlier reading that arrived late replaces the held one; a later one never does', () => {
    const held = synced({ bodyFatPct: 18.2 });
    const earlier = plan([reading({ measuredAt: '2026-11-14T05:40:00.000Z', kg: 82.0, origin: WITHINGS })], [held]);
    expect(earlier.update).toHaveLength(1);
    expect(earlier.update[0].after).toMatchObject({ kg: 82.0, syncedKg: 82.0, origin: WITHINGS, measuredAt: '2026-11-14T05:40:00.000Z' });
    // The earlier reading had no body fat: the held one's does not describe it.
    expect(earlier.update[0].after).not.toHaveProperty('bodyFatPct');
    expect(earlier.update[0].after).not.toHaveProperty('syncedBodyFatPct');
    expect(plan([reading({ measuredAt: '2026-11-14T07:00:00.000Z', kg: 81.0 })], [held]).update).toEqual([]);
  });

  it('at the same instant, the origin that sorts first wins', () => {
    const held = synced({ origin: 'com.b.scale' });
    expect(plan([reading({ origin: 'com.a.scale', kg: 82.6 })], [held]).update).toHaveLength(1);
    expect(plan([reading({ origin: 'com.c.scale', kg: 82.6 })], [held]).update).toEqual([]);
  });

  it('the same reading corrected (its kg), or gaining body fat, is an update', () => {
    const corrected = plan([reading({ kg: 82.1 })], [synced()]);
    expect(corrected.update[0].after).toMatchObject({ kg: 82.1, syncedKg: 82.1 });
    const gained = plan([reading({ bodyFatPct: 18.2 })], [synced()]);
    expect(gained.update[0].after).toMatchObject({ kg: 82.4, bodyFatPct: 18.2, syncedBodyFatPct: 18.2 });
    // The same reading read later without its body fat keeps the body fat.
    expect(plan([reading()], [synced({ bodyFatPct: 18.2 })]).update).toEqual([]);
  });

  it('writes nothing for equal figures, also when the instant is written another way', () => {
    expect(plan([reading()], [synced({ measuredAt: '2026-11-14T06:12:00Z' })])).toEqual({ add: [], update: [], remember: {} });
    expect(plan([reading({ kg: 82.401 })], [synced()]).update).toEqual([]);
  });

  it('keeps the person\'s waist, hip, neck and note', () => {
    const held = synced({ waistCm: 88, hipCm: 99, neckCm: 38, note: 'after holiday' });
    const after = plan([reading({ kg: 82.1 })], [held]).update[0].after;
    expect(after).toMatchObject({ waistCm: 88, hipCm: 99, neckCm: 38, note: 'after holiday', kg: 82.1 });
    expect(after.id).toBe(held.id);
  });

  it('two phones that saw different readings converge on the earliest', () => {
    const early = reading({ measuredAt: '2026-11-14T05:40:00.000Z', kg: 82.0 });
    const late = reading({ measuredAt: '2026-11-14T06:12:00.000Z', kg: 82.4 });
    // Phone A saw only the late one and saved it; phone B saw both.
    const a = plan([late], []).add[0];
    const b = plan([early], []).add[0];
    // A pulls B's record (or B pulls A's): either way the next run lands on the earliest, then stays.
    const onA = plan([late], [record({ ...b, id: 'w' })]);
    expect(onA.update).toEqual([]);
    const onB = plan([early], [record({ ...a, id: 'w' })]);
    expect(onB.update[0].after).toMatchObject({ kg: 82.0, measuredAt: '2026-11-14T05:40:00.000Z' });
    expect(plan([early], [onB.update[0].after]).update).toEqual([]);
  });

  it('one weigh-in a day even if a day is listed twice', () => {
    expect(plan([reading(), reading({ kg: 90 })], []).add).toHaveLength(1);
  });
});

describe('the read window (rule g)', () => {
  const now = Date.parse('2026-11-14T09:00:00Z');
  it('reads 28 days the first time, from the midnight of the day before', () => {
    expect(weightReadRange(null, now, ams)).toEqual({ firstDay: '2026-10-18', from: '2026-10-16T22:00:00.000Z', to: '2026-11-14T09:00:00.000Z' });
  });
  it('then from the day before the last read, at least the last 3 days, never past 28', () => {
    expect(weightReadRange('2026-11-14T07:00:00Z', now, ams).firstDay).toBe('2026-11-12');
    expect(weightReadRange('2026-11-08T07:00:00Z', now, ams).firstDay).toBe('2026-11-07');
    expect(weightReadRange('2026-09-01T07:00:00Z', now, ams).firstDay).toBe('2026-10-18');
    expect(weightReadRange('garbage', now, ams).firstDay).toBe('2026-10-18');
  });
});

describe('Undo (rule h)', () => {
  it('removes what it added, gives an update back as the person\'s own, and marks every date', () => {
    const added = planWeights({ weighIns: [reading({ date: '2026-11-13', measuredAt: '2026-11-13T06:00:00.000Z' })], existing: [], handled: {} });
    const held = synced({ waistCm: 88 });
    const updated = planWeights({ weighIns: [reading({ kg: 82.1 })], existing: [held], handled: {} });
    const p = { add: added.add, update: updated.update };
    const current: WeightEntry[] = [record({ ...added.add[0], id: 'w-13', measuredAt: '2026-11-13T06:00:00Z' }), { ...updated.update[0].after, note: 'typed since' }];
    const undo = undoWeighIns(p, current);
    expect(undo.remove.map((r) => r.id)).toEqual(['w-13']);
    expect(undo.restore).toHaveLength(1);
    expect(undo.restore[0]).toMatchObject({ id: held.id, kg: 82.4, waistCm: 88, note: 'typed since', deleted: false });
    expect(isSyncedWeighIn(undo.restore[0])).toBe(false);
    expect(undo.restore[0]).not.toHaveProperty('source');
    expect(undo.marks).toEqual({
      'weight:2026-11-13': { how: 'skipped', at: '2026-11-13T06:00:00.000Z' },
      'weight:2026-11-14': { how: 'skipped', at: '2026-11-14T06:12:00.000Z' },
    });
  });

  it('leaves a weigh-in the person changed since the sync, and still marks it', () => {
    const added = planWeights({ weighIns: [reading()], existing: [], handled: {} });
    const changed = record({ ...added.add[0], id: 'w', kg: 80 });
    const undo = undoWeighIns(added, [changed]);
    expect(undo.remove).toEqual([]);
    expect(Object.keys(undo.marks)).toEqual(['weight:2026-11-14']);
  });
});

describe('reading (rule i)', () => {
  const range = { from: '2026-11-01T00:00:00Z', to: '2026-11-14T09:00:00Z' };
  it('does not ask without access, and turns a failure into an answer', async () => {
    let asked = 0;
    const ok = { readWeighIns: async () => (asked++, [w('2026-11-14T06:12:00Z', 82.4)]) };
    expect(await readWeighInsSafely(ok, range, NO_ACCESS)).toEqual({ ok: true, samples: [] });
    expect(asked).toBe(0);
    expect(await readWeighInsSafely(ok, range, { ...NO_ACCESS, weight: true })).toMatchObject({ ok: true, samples: [{ value: 82.4 }] });
    const refused = { readWeighIns: async () => Promise.reject(new HealthError('permission', 'no')) };
    expect(await readWeighInsSafely(refused, range, { ...NO_ACCESS, weight: true })).toEqual({ ok: false, code: 'permission', detail: 'no' });
    const broken = { readWeighIns: async () => Promise.reject(new Error('boom')) };
    expect(await readWeighInsSafely(broken, range, { ...NO_ACCESS, weight: true })).toEqual({ ok: false, code: 'failed', detail: 'boom' });
  });
});
