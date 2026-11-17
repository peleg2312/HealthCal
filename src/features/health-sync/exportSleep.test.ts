import { describe, expect, it } from 'vitest';

import type { SleepRecord } from '@/features/import/appleExport';
import type { SleepEntry } from '@/types';

import { createSleepTally, exportSleepOrigin, exportSleepStage, fileNights, planFileSleep } from './exportFile';
import { DEVICES } from './exportFixture';
import { sleepHandledKey, type SleepNight } from './sleep';
import { zoneClock } from './steps';

const amsterdam = zoneClock('Europe/Amsterdam');
const NOW = Date.parse('2026-11-16T09:00:00Z');
const FIRST = '2026-10-13';
// How the export names the person's own devices: never kept.
const WATCH = 'Dana’s Apple Watch';
const PHONE = 'Dana’s iPhone';

const rec = (sourceName: string, device: string, start: string, end: string, value: string, timeZone: string | null = null): SleepRecord => ({
  sourceName,
  device: device.replace(/&lt;/g, '<').replace(/&gt;/g, '>'),
  startDate: start,
  endDate: end,
  value: `HKCategoryValueSleepAnalysis${value}`,
  timeZone,
});

/** A watch night with stages, 23:00 to 06:40 (+0100), waking on `day`, with a short awake spell and the HKTimeZone the watch writes. */
function watchNight(prev: string, day: string): SleepRecord[] {
  const w = (s: string, e: string, v: string) => rec(WATCH, DEVICES.watch, s, e, v, 'Europe/Amsterdam');
  return [
    w(`${prev} 23:00:00 +0100`, `${day} 00:30:00 +0100`, 'AsleepCore'),
    w(`${day} 00:30:00 +0100`, `${day} 01:45:00 +0100`, 'AsleepDeep'),
    w(`${day} 01:45:00 +0100`, `${day} 02:00:00 +0100`, 'Awake'),
    w(`${day} 02:00:00 +0100`, `${day} 04:00:00 +0100`, 'AsleepCore'),
    w(`${day} 04:00:00 +0100`, `${day} 06:40:00 +0100`, 'AsleepREM'),
  ];
}

function nightsOf(records: SleepRecord[], now = NOW) {
  const t = createSleepTally(amsterdam);
  for (const r of records) t.addRecord(r);
  return t.nights(now, FIRST);
}

describe('sleep from the Health export', () => {
  it('maps every sleep value, and anything else to unknown', () => {
    expect(['InBed', 'AsleepUnspecified', 'Asleep', 'Awake', 'AsleepCore', 'AsleepDeep', 'AsleepREM', 'Napping'].map((v) => exportSleepStage(`HKCategoryValueSleepAnalysis${v}`))).toEqual([
      'inBed',
      'asleep',
      'asleep',
      'awake',
      'light',
      'deep',
      'rem',
      'unknown',
    ]);
  });

  it('keeps the kind of device or a known app, never a name', () => {
    expect(exportSleepOrigin(WATCH, '<<HKDevice: 0x1>, name:Apple Watch, manufacturer:Apple Inc., model:Watch, hardware:Watch6,1>')).toBe('com.apple.health.watch');
    expect(exportSleepOrigin(PHONE, '<<HKDevice: 0x2>, name:iPhone, manufacturer:Apple Inc., model:iPhone>')).toBe('com.apple.health.iphone');
    expect(exportSleepOrigin('Connect', '')).toBe('com.garmin.connect.mobile');
    expect(exportSleepOrigin('Dana’s Sleep Diary', '')).toBe('file:other');
  });

  it('takes the watch’s staged night and adds nothing from the iPhone’s time in bed beside it', () => {
    const records = [...watchNight('2026-11-14', '2026-11-15'), rec(PHONE, DEVICES.phone, '2026-11-14 22:40:00 +0100', '2026-11-15 07:05:00 +0100', 'InBed')];
    const nights = nightsOf(records);
    expect(nights).toHaveLength(1);
    const [n] = nights;
    expect(n).toMatchObject({ date: '2026-11-15', store: 'file', origin: 'com.apple.health.watch', kind: 'watch', startedAt: '2026-11-14T22:00:00.000Z', endedAt: '2026-11-15T05:40:00.000Z' });
    // 7 h 40 min in all, 15 min of it awake: 7 h 25 min asleep.
    expect(n.hours).toBe(7.42);
    expect(n.stages).toEqual({ light: 210, deep: 75, rem: 160, awake: 15 });
    expect(JSON.stringify(nights)).not.toMatch(/Dana|HKDevice/);
  });

  it('leaves a nap out, and a day with only a nap has no night', () => {
    const nap = (day: string) => rec(WATCH, DEVICES.watch, `${day} 14:00:00 +0100`, `${day} 14:40:00 +0100`, 'AsleepCore', 'Europe/Amsterdam');
    const nights = nightsOf([...watchNight('2026-11-13', '2026-11-14'), nap('2026-11-14'), nap('2026-11-12')]);
    expect(nights.map((n) => [n.date, n.hours])).toEqual([['2026-11-14', 7.42]]);
  });

  it('measures a night across the clocks going back by its instants', () => {
    // 25 October 2026: 23:00 +0200 to 07:00 +0100 is nine hours.
    const nights = nightsOf([rec(WATCH, DEVICES.watch, '2026-10-24 23:00:00 +0200', '2026-10-25 07:00:00 +0100', 'AsleepUnspecified', 'Europe/Amsterdam')]);
    expect(nights).toEqual([expect.objectContaining({ date: '2026-10-25', hours: 9, stages: null })]);
  });

  it('reads the wake day where the night was slept (HKTimeZone), not where the file was written', () => {
    // Written in Amsterdam's offset; slept in Tokyo, waking at 07:00 there on the 10th (23:00 on the 9th in Amsterdam).
    const nights = nightsOf([rec(WATCH, DEVICES.watch, '2026-11-09 15:00:00 +0100', '2026-11-09 23:00:00 +0100', 'AsleepCore', 'Asia/Tokyo')]);
    expect(nights.map((n) => [n.date, n.zoneOffsetSec])).toEqual([['2026-11-10', 9 * 3600]]);
  });

  it('keeps two apps of the same kind apart: one night is never made of two', () => {
    const a = rec('Pillow', '', '2026-11-15 00:00:00 +0100', '2026-11-15 04:00:00 +0100', 'Asleep');
    const b = rec('Dana’s Sleep Diary', '', '2026-11-15 03:00:00 +0100', '2026-11-15 08:00:00 +0100', 'Asleep');
    const nights = nightsOf([a, b]);
    expect(nights).toHaveLength(1);
    // The longer one, not their union (8 h).
    expect(nights[0]).toMatchObject({ hours: 5, origin: 'file:other', stages: null });
  });

  it('makes no night from time in bed alone, and leaves out a night still going on when the export was made', () => {
    expect(nightsOf([rec(PHONE, DEVICES.phone, '2026-11-14 23:00:00 +0100', '2026-11-15 07:00:00 +0100', 'InBed')])).toEqual([]);
    const exportedAt = Date.parse('2026-11-15T05:45:00Z');
    expect(nightsOf(watchNight('2026-11-14', '2026-11-15'), exportedAt)).toEqual([]);
  });
});

const night = (date: string, hours: number, origin = 'com.apple.health.watch'): SleepNight => ({
  date,
  store: 'file',
  origin,
  kind: 'watch',
  startedAt: `${date}T00:00:00.000Z`,
  endedAt: `${date}T0${Math.floor(hours)}:00:00.000Z`,
  asleepMin: hours * 60,
  hours,
  stages: { light: 200, deep: 60, rem: 100, awake: 10 },
  zoneOffsetSec: 3600,
});

const entry = (date: string, extra: Partial<SleepEntry> = {}): SleepEntry => ({ id: `sleep-${date}`, updatedAt: '2026-11-16T00:00:00.000Z', date, hours: 7, ...extra });

describe('saving the file’s nights', () => {
  it('takes the newer file’s night where two files cover a day', () => {
    const older = { asOf: '2026-11-10T08:00:00.000Z', nights: [night('2026-11-08', 6), night('2026-11-09', 5)] };
    const newer = { asOf: '2026-11-16T08:00:00.000Z', nights: [night('2026-11-09', 7)] };
    expect(fileNights([newer, older]).map((n) => [n.date, n.hours])).toEqual([
      ['2026-11-08', 6],
      ['2026-11-09', 7],
    ]);
  });

  it('adds new nights, never replaces one by hand or from a health store, and leaves deleted days out', () => {
    const nights = ['2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15'].map((d) => night(d, 7));
    const existing = [
      entry('2026-11-11', { quality: 4 }), // by hand
      entry('2026-11-12', { source: 'health', store: 'healthConnect', origin: 'com.garmin.android.apps.connectmobile', stages: null }),
      entry('2026-11-13', { deleted: true }),
      // An earlier import of the same watch, with other figures: corrected, the rating kept.
      entry('2026-11-14', { hours: 6, quality: 2, source: 'health', store: 'file', origin: 'com.apple.health.watch', stages: null }),
    ];
    const plan = planFileSleep(nights, existing, { [sleepHandledKey('2026-11-15')]: { how: 'skipped', at: '2026-11-15T00:00:00.000Z' } });
    expect(plan.add.map((a) => a.date)).toEqual(['2026-11-10']);
    expect(plan.add[0]).toMatchObject({ source: 'health', store: 'file', origin: 'com.apple.health.watch' });
    expect(plan.add[0]).not.toHaveProperty('quality');
    expect(plan.update.map((u) => [u.after.date, u.after.hours, u.after.quality, u.after.id])).toEqual([['2026-11-14', 7, 2, 'sleep-2026-11-14']]);
    expect({ found: plan.found, kept: plan.kept, deleted: plan.deleted }).toEqual({ found: 6, kept: 2, deleted: 2 });
  });

  it('writes nothing for the same file read again', () => {
    const n = night('2026-11-10', 7);
    const saved = entry('2026-11-10', { hours: 7, source: 'health', store: 'file', origin: n.origin, startedAt: n.startedAt, endedAt: n.endedAt, stages: { ...n.stages! } });
    const plan = planFileSleep([n], [saved], {});
    expect(plan.add.length + plan.update.length).toBe(0);
    expect(plan.kept).toBe(1);
  });
});
