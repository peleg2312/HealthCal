import { describe, expect, it } from 'vitest';

import {
  dayEnergyReadRange,
  exerciseNetByDate,
  maintenanceKcal,
  mergeDayEnergy,
  pruneDayEnergy,
  readDayEnergySafely,
  validEnergyDay,
  watchEstimate,
  type EnergyDays,
} from './dayEnergy';
import { zoneClock } from './steps';
import { HealthError, NO_ACCESS } from './types';

const GARMIN = 'com.garmin.android.apps.connectmobile';
const HC = 'com.google.android.apps.healthdata';
const BMR = 1700;
const TODAY = '2026-11-18';

const day = (kcal: number, activeKcal = 600, origins = [GARMIN]) => ({ kcal, activeKcal, origins });
/** The 7 complete days before TODAY (11th to 17th), from `kcals` (null: no entry). */
const week = (kcals: (number | null)[], origins = [GARMIN]): EnergyDays => {
  const out: EnergyDays = {};
  kcals.forEach((k, i) => {
    if (k !== null) out[`2026-11-${String(11 + i).padStart(2, '0')}`] = day(k, 600, origins);
  });
  return out;
};

describe('a valid day', () => {
  it('needs active energy, resting energy too, and a total between the resting rate and four times it', () => {
    expect(validEnergyDay(day(2600), BMR)).toBe(true);
    expect(validEnergyDay(day(2600, 0), BMR)).toBe(false); // nothing recorded: a store's resting fill alone
    expect(validEnergyDay(day(600, 600), BMR)).toBe(false); // an iPhone with no basal energy
    expect(validEnergyDay(day(1650), BMR)).toBe(false); // below resting: the watch was off part of the day
    expect(validEnergyDay(day(4 * BMR + 1), BMR)).toBe(false); // implausible
    expect(validEnergyDay(day(4 * BMR), BMR)).toBe(true);
    expect(validEnergyDay(day(2600), 0)).toBe(false);
  });
});

describe('the watch estimate', () => {
  const none = {};
  it('is null with fewer than 5 valid days, and never uses today', () => {
    expect(watchEstimate(week([2600, 2600, 2600, 2600, null, null, null]), TODAY, none, 2400, BMR, 'health-connect')).toBeNull();
    const withToday = { ...week([2600, 2600, 2600, 2600, null, null, null]), [TODAY]: day(2600) };
    expect(watchEstimate(withToday, TODAY, none, 2400, BMR, 'health-connect')).toBeNull();
    // An invalid day does not count toward the five.
    expect(watchEstimate(week([2600, 2600, 2600, 2600, 900, null, null]), TODAY, none, 2400, BMR, 'health-connect')).toBeNull();
  });

  it('averages the valid days, rounded to 10, and names the one app', () => {
    const est = watchEstimate(week([2600, 2655, 2700, null, 2610, 2640, 1000]), TODAY, none, 2400, BMR, 'health-connect');
    expect(est).toEqual({ avg: 2640, n: 5, label: 'Garmin Connect', app: 2400 });
  });

  it('leaves Health Connect\'s own origin out of the label, and names the store for a mix', () => {
    expect(watchEstimate(week([2600, 2600, 2600, 2600, 2600, 2600, 2600], [GARMIN, HC]), TODAY, none, 2400, BMR, 'health-connect')?.label).toBe('Garmin Connect');
    const mixed = { ...week([2600, 2600, 2600, 2600, 2600, 2600, null]), '2026-11-17': day(2600, 600, ['com.sec.android.app.shealth']) };
    expect(watchEstimate(mixed, TODAY, none, 2400, BMR, 'health-connect')?.label).toBe('Health Connect');
    expect(watchEstimate(week([2600, 2600, 2600, 2600, 2600], []), TODAY, none, 2400, BMR, 'apple-health')?.label).toBe('Apple Health');
  });

  it('on an iPhone, leaves Apple\'s own devices out of the name when a watch app recorded too', () => {
    const IPHONE = 'com.apple.health.device';
    expect(watchEstimate(week([2600, 2600, 2600, 2600, 2600], [GARMIN, IPHONE]), TODAY, none, 2400, BMR, 'apple-health')?.label).toBe('Garmin Connect');
    // Apple's devices alone: the device kind is not known here, so the store's name.
    expect(watchEstimate(week([2600, 2600, 2600, 2600, 2600], [IPHONE]), TODAY, none, 2400, BMR, 'apple-health')?.label).toBe('Apple Health');
  });

  it('HealthCal\'s side is the maintenance the targets use plus the same days\' workouts', () => {
    const days = week([2600, 2600, 2600, 2600, 2600, null, null]);
    // Workouts on two of the valid days and on one day that is not counted (the 17th has no watch figure).
    const ex = { '2026-11-11': 400, '2026-11-13': 300, '2026-11-17': 900 };
    const learned = { usingAdaptive: true, adaptive: { tdee: 2310 }, formulaTdee: 2450 };
    const formula = { ...learned, usingAdaptive: false };
    expect(watchEstimate(days, TODAY, ex, maintenanceKcal(learned), BMR, 'health-connect')?.app).toBe(2450); // 2310 + 140
    expect(watchEstimate(days, TODAY, ex, maintenanceKcal(formula), BMR, 'health-connect')?.app).toBe(2590); // 2450 + 140
  });

  it('counts live workouts\' net calories per date', () => {
    expect(
      exerciseNetByDate([
        { date: '2026-11-11', kcalNet: 300 },
        { date: '2026-11-11', kcalNet: 100 },
        { date: '2026-11-12', kcalNet: 250, deleted: true },
      ]),
    ).toEqual({ '2026-11-11': 400 });
  });
});

describe('what is kept', () => {
  const ams = zoneClock('Europe/Amsterdam');
  const now = Date.parse('2026-11-18T09:00:00Z');

  it('reads 14 days the first time, then the last 3 or from the day before the last read', () => {
    expect(dayEnergyReadRange(null, now, ams)).toEqual({ from: '2026-11-04T23:00:00.000Z', to: '2026-11-18T09:00:00.000Z', fromDay: '2026-11-05', toDay: '2026-11-18' });
    expect(dayEnergyReadRange('2026-11-18T07:00:00Z', now, ams).fromDay).toBe('2026-11-16');
    expect(dayEnergyReadRange('2026-11-10T07:00:00Z', now, ams).fromDay).toBe('2026-11-09');
    expect(dayEnergyReadRange('2026-09-10T07:00:00Z', now, ams).fromDay).toBe('2026-11-05');
  });

  it('merges a read over the kept days: older kept, re-read replaced or dropped, nothing past the window', () => {
    const before: EnergyDays = { '2026-11-01': day(2500), '2026-11-14': day(2500), '2026-11-16': day(2500), '2026-11-17': day(2500) };
    const read = [
      { day: '2026-11-17', kcal: 2650.4, activeKcal: 700.2, origins: [GARMIN, HC] },
      { day: '2026-11-18', kcal: 900, activeKcal: 0, origins: [HC] },
      { day: '2026-11-18', kcal: 300, activeKcal: 100, origins: [GARMIN] },
      { day: 'bad', kcal: 1, activeKcal: 1, origins: [] },
      { day: '2026-11-19', kcal: 2000, activeKcal: 100, origins: [] },
    ];
    expect(mergeDayEnergy(before, read, '2026-11-16', TODAY)).toEqual({
      '2026-11-14': day(2500),
      '2026-11-17': { kcal: 2650, activeKcal: 700, origins: [GARMIN, HC] },
      '2026-11-18': { kcal: 1200, activeKcal: 100, origins: [GARMIN, HC] },
    });
    expect(pruneDayEnergy(before, TODAY)).toEqual({ '2026-11-14': day(2500), '2026-11-16': day(2500), '2026-11-17': day(2500) });
  });

  it('a refused or failed read is an answer, and nothing is asked without access', async () => {
    const range = dayEnergyReadRange(null, now, ams);
    let asked = 0;
    const ok = { readDayEnergy: async () => (asked++, [{ day: TODAY, kcal: 1, activeKcal: 1, origins: [] }]) };
    expect(await readDayEnergySafely(ok, range, NO_ACCESS)).toEqual({ ok: true, days: [] });
    expect(asked).toBe(0);
    expect((await readDayEnergySafely(ok, range, { ...NO_ACCESS, dayEnergy: true })).ok).toBe(true);
    const bad = { readDayEnergy: async () => Promise.reject(new HealthError('timeout', 'slow')) };
    expect(await readDayEnergySafely(bad, range, { ...NO_ACCESS, dayEnergy: true })).toEqual({ ok: false, code: 'timeout', detail: 'slow' });
  });
});
