/**
 * G5: the day a workout belongs to is the day where it was done. A FIT file
 * that carries both timestamp and local_timestamp states the recording's UTC
 * offset; the entry's date and the time shown use it, whatever zone the phone
 * is in, and the CSV of the same workout read in that zone gives the same day.
 */
import { afterEach, describe, expect, it } from 'vitest';

import { ACTIVITY_BY_ID } from '@/data/activities';

import { toActivityEntry } from './convert';
import { readFit } from './fit';
import { ACTIVITY, FILE_ID, FitWriter, fitTime, SESSION, sessionValues } from './fitEncoder';
import { entriesToSave, prepareImport } from './plan';
import { readImportFile } from './read';
import { recordedWallTime } from './time';
import { metaLine } from './ui/format';

const ctx = { weightKg: 78.8, baselineKcalPerDay: 2200 };

/** A 45-minute run with an activity message whose local_timestamp is `offsetH` hours from UTC. */
function fitWithLocal(startIso: string, offsetH: number | null, elapsed = 45 * 60, kcal = 520) {
  const w = new FitWriter();
  w.define(0, 0, FILE_ID).data(0, [4, 1, 2697, fitTime(startIso)]);
  w.define(1, 18, SESSION).data(1, sessionValues({ start: startIso, sport: 1, subSport: 0, elapsedS: elapsed, distanceM: 7000, kcal, avgHr: 150, maxHr: 170 }));
  const end = fitTime(startIso) + elapsed;
  w.define(2, 34, ACTIVITY).data(2, [end, elapsed * 1000, 1, offsetH === null ? null : end + offsetH * 3600]);
  return w.bytes();
}

const nyRunCsv = new TextEncoder().encode('Activity Type,Date,Title,Distance,Calories,Time,Elapsed Time\nRunning,2026-11-10 19:30:00,"Evening run","7.00","520","00:45:00","00:45:00"\n');

describe('G5: the recording zone decides the day', () => {
  const tz = process.env.TZ;
  afterEach(() => {
    process.env.TZ = tz;
  });

  it('reads the offset from local_timestamp minus timestamp', () => {
    expect(readFit(fitWithLocal('2026-11-11T00:30:00Z', -5)).workouts[0].utcOffsetMin).toBe(-300);
    expect(readFit(fitWithLocal('2026-06-11T00:30:00Z', 5.75)).workouts[0].utcOffsetMin).toBe(345);
    // No local_timestamp: unknown, so the phone's zone is used as before.
    expect(readFit(fitWithLocal('2026-11-11T00:30:00Z', null)).workouts[0].utcOffsetMin ?? null).toBeNull();
    // An offset no zone has is ignored rather than trusted.
    expect(readFit(fitWithLocal('2026-11-11T00:30:00Z', 20)).workouts[0].utcOffsetMin ?? null).toBeNull();
  });

  it('files a New York evening run under Nov 10 on a phone in Amsterdam, and shows 19:30', () => {
    process.env.TZ = 'Europe/Amsterdam';
    const w = readFit(fitWithLocal('2026-11-11T00:30:00Z', -5), 'ny-run.fit').workouts[0];
    expect(recordedWallTime(w)).toMatchObject({ date: '2026-11-10', hour: 19, minute: 30 });
    expect(toActivityEntry(w, ACTIVITY_BY_ID.running, ctx).date).toBe('2026-11-10');
    expect(metaLine(w, '2026-11-14', 'metric', false)).toMatch(/^Tue, Nov 10 · 19:30 · /);
  });

  it('gives the same day whether the FIT or the CSV (read in New York time) is imported first', () => {
    process.env.TZ = 'Europe/Amsterdam';
    const fit = readFit(fitWithLocal('2026-11-11T00:30:00Z', -5), 'ny-run.fit').workouts;
    const csv = readImportFile(nyRunCsv, 'Activities.csv', { csv: { distanceUnit: 'km', timeZone: 'America/New_York' } }).workouts;
    expect(csv[0].startUtc).toBe('2026-11-11T00:30:00Z');
    expect(csv[0].utcOffsetMin).toBe(-300);
    const fromFit = entriesToSave(prepareImport(fit, [], ctx))[0];
    const fromCsv = entriesToSave(prepareImport(csv, [], ctx))[0];
    expect(fromFit.date).toBe('2026-11-10');
    expect(fromCsv.date).toBe('2026-11-10');
    expect(fromFit.externalId).toBe(fromCsv.externalId);
  });

  it('keeps the phone’s day for files that state no zone (TCX, GPX, FIT without local_timestamp)', () => {
    const w = readFit(fitWithLocal('2026-11-10T23:30:00Z', null)).workouts[0];
    process.env.TZ = 'UTC';
    expect(toActivityEntry(w, ACTIVITY_BY_ID.running, ctx).date).toBe('2026-11-10');
    process.env.TZ = 'Europe/Amsterdam';
    expect(toActivityEntry(w, ACTIVITY_BY_ID.running, ctx).date).toBe('2026-11-11');
  });
});
