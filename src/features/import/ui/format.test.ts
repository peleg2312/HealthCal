import { describe, expect, it } from 'vitest';

import type { ImportCandidate } from '../plan';
import type { ImportedWorkout } from '../types';

import { calorieView, countRows, dayLabel, distanceLabel, durationLabel, fileNotes, filterRows, innerPath, shiftDays, summarise, topFile } from './format';

const workout = (over: Partial<ImportedWorkout> = {}): ImportedWorkout => ({
  format: 'fit',
  fileName: 'a.fit',
  index: 1,
  startUtc: '2025-12-27T13:12:58Z',
  startFromLocalTime: false,
  durationSec: 3686,
  elapsedSec: 3686,
  durationIncludesPauses: false,
  distanceM: 10330,
  kcal: 658,
  avgHeartRate: 133,
  maxHeartRate: null,
  sport: 'running',
  subSport: null,
  title: null,
  device: null,
  ...over,
});

const row = (over: Partial<ImportCandidate> = {}): ImportCandidate => ({
  key: 'a.fit#1',
  workout: workout(),
  suggestion: { activityId: 'running', alternatives: [] },
  activityId: 'running',
  entry: { id: 'x', date: '2025-12-27', activityId: 'running', name: 'Running', emoji: '', category: 'cardio', intensity: 'moderate', durationMin: 61, met: 9, kcalGross: 658, kcalNet: 560.4, weightKg: 75, baselineKcalPerDay: 2300, source: 'garmin', externalId: 'garmin:x', startedAt: 'x', loggedAt: 'x', measured: true } as ImportCandidate['entry'],
  status: 'new',
  reason: null,
  match: null,
  sameAsKey: null,
  selected: true,
  ...over,
});

describe('import screen formatting', () => {
  it('labels days relative to today, with the year only when it differs', () => {
    expect(dayLabel('2026-11-14', '2026-11-14')).toBe('Today');
    expect(dayLabel('2026-11-13', '2026-11-14')).toBe('Yesterday');
    expect(dayLabel('2026-11-11', '2026-11-14')).toBe('Wed, Nov 11');
    expect(dayLabel('2025-12-27', '2026-11-14')).toBe('Sat, Dec 27, 2025');
  });

  it('formats durations and distances in the person’s units', () => {
    expect(durationLabel(45.4)).toBe('45 s');
    expect(durationLabel(3686)).toBe('1 h 1 min');
    expect(distanceLabel(10330, 'metric')).toBe('10.33 km');
    expect(distanceLabel(10330, 'imperial')).toBe('6.42 mi');
    expect(distanceLabel(0, 'metric')).toBeNull();
    expect(distanceLabel(3.6, 'metric')).toBeNull();
    expect(distanceLabel(null, 'metric')).toBeNull();
  });

  it('shows the watch figure and the net part that is added', () => {
    expect(calorieView(row())).toMatchObject({ added: '+560', estimate: false, detail: '658 by watch' });
  });

  it('labels an estimate with its range', () => {
    const r = row({ workout: workout({ format: 'gpx', kcal: null }), entry: { ...row().entry!, measured: undefined, kcalNet: 500 } });
    expect(calorieView(r)).toMatchObject({ added: '~500', estimate: true, detail: 'est. 400–600' });
  });

  it('adds nothing for a workout that is already in the app or listed twice', () => {
    expect(calorieView(row({ status: 'already-imported' })).added).toBeNull();
    expect(calorieView(row({ status: 'duplicate-in-file' })).added).toBeNull();
    expect(calorieView(row({ entry: null, activityId: null })).detail).toBe('658 by watch');
  });

  it('counts and filters rows', () => {
    const rows = [
      row(),
      row({ key: 'b', activityId: null, entry: null, selected: false }),
      row({ key: 'c', status: 'already-imported', selected: false, match: { deleted: true } as ImportCandidate['match'] }),
      row({ key: 'd', status: 'probable-duplicate', selected: false }),
      row({ key: 'e', status: 'duplicate-in-file', activityId: null, entry: null, selected: false }),
    ];
    const c = countRows(rows);
    expect(c).toMatchObject({ total: 5, selected: 1, choose: 1, alreadyImported: 1, deletedBefore: 1, duplicates: 3, probable: 1, locked: 2 });
    expect(filterRows(rows, 'choose').map((r) => r.key)).toEqual(['b']);
    expect(filterRows(rows, 'duplicates').map((r) => r.key)).toEqual(['c', 'd', 'e']);
    expect(filterRows(rows, 'selected').map((r) => r.key)).toEqual(['a.fit#1']);
  });

  it('sums what an import adds per day', () => {
    const s = summarise([
      { date: '2026-11-13', durationMin: 45, kcalNet: 444.2 },
      { date: '2026-11-11', durationMin: 60, kcalNet: 509 },
      { date: '2026-11-13', durationMin: 10, kcalNet: 20 },
    ]);
    expect(s.sessions).toBe(3);
    expect(s.kcal).toBe(973);
    expect(s.days.map((d) => [d.date, d.sessions])).toEqual([
      ['2026-11-13', 2],
      ['2026-11-11', 1],
    ]);
  });

  it('shifts a start by whole days without milliseconds', () => {
    expect(shiftDays(workout(), -1).startUtc).toBe('2025-12-26T13:12:58Z');
    expect(shiftDays(workout(), 0)).toEqual(workout());
  });

  it('attributes files inside an archive to the picked file', () => {
    expect(topFile('export.zip/a/b.fit', ['x.fit', 'export.zip'])).toBe('export.zip');
    expect(innerPath('export.zip/a/b.fit', 'export.zip')).toBe('a/b.fit');
    expect(innerPath('x.fit', 'x.fit')).toBeNull();
    const notes = fileNotes(
      [
        {
          name: 'export.zip',
          batch: {
            workouts: [],
            files: [
              { file: 'export.zip', format: 'zip' },
              { file: 'export.zip/a.fit', format: 'fit' },
              { file: 'export.zip/b.fit', format: 'fit' },
            ],
            warnings: [
              { code: 'fit-crc', message: 'damaged', file: 'export.zip/a.fit' },
              { code: 'fit-crc', message: 'damaged', file: 'export.zip/b.fit' },
            ],
            errors: [{ file: 'export.zip/c.fit', code: 'not-fit', message: 'not fit' }],
          },
        },
      ],
      [workout({ fileName: 'export.zip/a.fit' }), workout({ fileName: 'export.zip/b.fit' })],
    );
    expect(notes[0]).toMatchObject({ file: 'export.zip', formats: ['FIT'], workouts: 2, errors: [{ inner: 'c.fit', message: 'not fit' }] });
    expect(notes[0].warnings).toHaveLength(1);
  });
});
