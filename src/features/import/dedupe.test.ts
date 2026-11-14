import { describe, expect, it } from 'vitest';

import { ACTIVITY_BY_ID } from '@/data/activities';
import { buildActivityEntry } from '@/features/activity/build';
import type { ActivityEntry } from '@/types';

import { toActivityEntry } from './convert';
import { checkDuplicates } from './dedupe';
import { simpleActivity } from './fitEncoder';
import { chooseActivity, entriesToSave, prepareImport, setSelected } from './plan';
import { readImportFile } from './read';
import type { ImportedWorkout } from './types';

const ctx = { weightKg: 70, baselineKcalPerDay: 2160 };
const enc = (s: string) => new TextEncoder().encode(s);

const runFit = simpleActivity({ start: '2026-11-10T07:30:00Z', sport: 1, elapsedS: 3100, timerS: 3000, distanceM: 10000, kcal: 650, avgHr: 150 });
const runCsv = enc('Activity Type,Date,Title,Distance,Calories,Time,Elapsed Time\nRunning,2026-11-10 07:30:00,"Tempo","10.00","650","00:50:00","00:51:40"\n');
const csvUtc = { csv: { distanceUnit: 'km', timeZone: 'UTC' } } as const;

/** What saving the ticked rows would leave in the store (ids filled, as upsert does). */
function save(entries: ReturnType<typeof entriesToSave>, into: ActivityEntry[] = []): ActivityEntry[] {
  const byId = new Map(into.map((e) => [e.id, e]));
  for (const e of entries) byId.set(e.id, { ...e, updatedAt: '2026-11-14T10:00:00.000Z', deleted: false });
  return [...byId.values()];
}

describe('importing twice', () => {
  it('adds nothing the second time', () => {
    const first = prepareImport(readImportFile(runFit, 'run.fit').workouts, [], ctx);
    expect(first.map((c) => c.status)).toEqual(['new']);
    const store = save(entriesToSave(first));
    expect(store).toHaveLength(1);

    const again = prepareImport(readImportFile(runFit, 'run.fit').workouts, store, ctx);
    expect(again[0]).toMatchObject({ status: 'already-imported', reason: 'Already imported.', selected: false });
    expect(entriesToSave(again)).toEqual([]);
  });

  it('recognises the same workout as FIT and as a CSV row, in one import or across imports', () => {
    const both = [...readImportFile(runCsv, 'Activities.csv', csvUtc).workouts, ...readImportFile(runFit, 'run.fit').workouts];
    const rows = prepareImport(both, [], ctx);
    const fit = rows.find((r) => r.workout.format === 'fit');
    const csv = rows.find((r) => r.workout.format === 'csv');
    expect(fit?.status).toBe('new');
    expect(csv).toMatchObject({ status: 'duplicate-in-file', selected: false, sameAsKey: fit?.key, reason: 'The same workout is also in run.fit, which is used instead.' });
    expect(entriesToSave(rows)).toHaveLength(1);

    // CSV first, FIT later: the same workout, and the FIT adds heart rate, so it is offered as an update of the same record.
    const store = save(entriesToSave(prepareImport(readImportFile(runCsv, 'Activities.csv', csvUtc).workouts, [], ctx)));
    const later = prepareImport(readImportFile(runFit, 'run.fit').workouts, store, ctx);
    expect(later[0]).toMatchObject({ status: 'update', adds: ['heart-rate'], selected: true });
    expect(later[0].entry?.id).toBe(store[0].id);
    // Once updated, the FIT is already imported.
    const after = save(entriesToSave(later), store);
    expect(after).toHaveLength(1);
    expect(prepareImport(readImportFile(runFit, 'run.fit').workouts, after, ctx)[0].status).toBe('already-imported');
  });

  it('flags a CSV read in the wrong time zone as a probable duplicate', () => {
    const store = save(entriesToSave(prepareImport(readImportFile(runFit, 'run.fit').workouts, [], ctx)));
    const shifted = readImportFile(runCsv, 'Activities.csv', { csv: { distanceUnit: 'km', timeZone: 'Asia/Tokyo' } }).workouts;
    const rows = prepareImport(shifted, store, ctx);
    expect(rows[0].status).toBe('probable-duplicate');
    expect(rows[0].reason).toBe('Looks like the running already imported, at a different clock time. The time zone chosen for this file may differ.');
    expect(rows[0].selected).toBe(false);
  });

  it('does not bring back a workout the person deleted', () => {
    const store = save(entriesToSave(prepareImport(readImportFile(runFit, 'run.fit').workouts, [], ctx))).map((e) => ({ ...e, deleted: true }));
    const rows = prepareImport(readImportFile(runFit, 'run.fit').workouts, store, ctx);
    expect(rows[0]).toMatchObject({ status: 'already-imported', reason: 'You imported this workout before and then deleted it.', selected: false });
  });
});

describe('sessions logged by hand', () => {
  const manual = (over: Partial<ActivityEntry>): ActivityEntry => ({
    ...buildActivityEntry({ activity: ACTIVITY_BY_ID.running, intensity: 'moderate', durationMin: 50, date: '2026-11-10', weightKg: 70, baselineKcalPerDay: 2160, loggedAt: '2026-11-10T08:30:00.000Z' }),
    id: 'm1', updatedAt: '2026-11-10T08:30:00.000Z', ...over,
  });

  it('flags a workout the person already logged by hand for the same time', () => {
    const rows = prepareImport(readImportFile(runFit, 'run.fit').workouts, [manual({})], ctx);
    expect(rows[0]).toMatchObject({
      status: 'probable-duplicate',
      reason: 'You logged a 50 min running session by hand on this day. If it is the same workout, leave this unticked, or import it and delete the hand-logged one.',
      selected: false,
    });
    expect(rows[0].match?.id).toBe('m1');
    // The person can still tick it.
    expect(setSelected(rows, rows[0].key, true)[0].selected).toBe(true);
  });

  it('flags the same activity logged by hand on the same day, even at another time', () => {
    const rows = prepareImport(readImportFile(runFit, 'run.fit').workouts, [manual({ loggedAt: '2026-11-10T19:00:00.000Z' })], ctx);
    expect(rows[0].status).toBe('probable-duplicate');
  });

  it('leaves a different session on the same day alone', () => {
    const yoga = manual({ activityId: 'yoga', name: 'Yoga', category: 'mind', loggedAt: '2026-11-10T19:00:00.000Z' });
    expect(prepareImport(readImportFile(runFit, 'run.fit').workouts, [yoga], ctx)[0].status).toBe('new');
    // Deleted hand-logged sessions do not count.
    expect(prepareImport(readImportFile(runFit, 'run.fit').workouts, [manual({ deleted: true })], ctx)[0].status).toBe('new');
  });
});

describe('multisport', () => {
  const legs: ImportedWorkout[] = [
    { start: '2025-06-22T07:34:37Z', d: 3600, sport: 'cycling' },
    { start: '2025-06-22T08:34:37Z', d: 300, sport: 'transition' },
    { start: '2025-06-22T08:39:37Z', d: 2400, sport: 'running' },
  ].map((l, i) => ({
    format: 'fit', fileName: 'tri.fit', index: i + 1, startUtc: l.start, startFromLocalTime: false, durationSec: l.d, elapsedSec: l.d, durationIncludesPauses: false,
    distanceM: 1000, kcal: 300, avgHeartRate: null, maxHeartRate: null, sport: l.sport, subSport: null, title: null, device: null, leg: { number: i + 1, of: 3 },
    ...(l.sport === 'transition' ? { transition: true } : {}),
  }));
  const summaryRow: ImportedWorkout = { ...legs[0], format: 'csv', fileName: 'Activities.csv', index: 1, durationSec: 6300, elapsedSec: 6300, sport: 'Multisport', leg: undefined, startFromLocalTime: true };

  it('keeps legs, asks about transitions and flags the CSV summary row that covers them', () => {
    const rows = prepareImport([summaryRow, ...legs], [], ctx);
    const by = (sport: string) => rows.find((r) => r.workout.sport === sport);
    expect(by('cycling')).toMatchObject({ status: 'new', selected: true, activityId: 'cycling' });
    expect(by('running')).toMatchObject({ status: 'new', selected: true });
    expect(by('transition')).toMatchObject({ status: 'new', selected: false, activityId: null, entry: null });
    expect(by('Multisport')).toMatchObject({ status: 'probable-duplicate', selected: false, reason: 'Covers the same time as another workout in this import (tri.fit).' });
    // Legs never share an id with the summary row that starts at the same second.
    const cycling = by('cycling');
    expect(cycling?.entry?.externalId).toBe('garmin:2025-06-22T07:34:37Z/leg');
  });

  it('flags legs that fall inside a summary row imported earlier', () => {
    const store = save([toActivityEntry(summaryRow, ACTIVITY_BY_ID.running, ctx)]);
    const rows = prepareImport(legs, store, ctx);
    expect(rows.filter((r) => r.workout.sport !== 'transition').every((r) => r.status === 'probable-duplicate')).toBe(true);
  });
});

describe('choosing an activity', () => {
  it('builds the entry when the person picks one and keeps other choices', () => {
    const tcx = enc(
      '<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2"><Activities><Activity Sport="Other"><Id>2026-11-09T16:00:00Z</Id><Lap StartTime="2026-11-09T16:00:00Z"><TotalTimeSeconds>1200</TotalTimeSeconds><DistanceMeters>1200</DistanceMeters><Calories>120</Calories></Lap></Activity></Activities></TrainingCenterDatabase>',
    );
    const batch = [...readImportFile(tcx, 'sup.tcx').workouts, ...readImportFile(runFit, 'run.fit').workouts];
    let rows = prepareImport(batch, [], ctx);
    const sup = rows.find((r) => r.workout.format === 'tcx');
    expect(sup).toMatchObject({ activityId: null, entry: null, selected: false });
    rows = setSelected(rows, rows.find((r) => r.workout.format === 'fit')!.key, false);
    rows = chooseActivity(rows, sup!.key, 'paddleboarding', [], ctx);
    const after = rows.find((r) => r.workout.format === 'tcx');
    expect(after).toMatchObject({ activityId: 'paddleboarding', selected: true });
    expect(after?.entry).toMatchObject({ name: 'Stand-up paddleboarding', kcalGross: 120, measured: true });
    // The run the person unticked stays unticked.
    expect(rows.find((r) => r.workout.format === 'fit')?.selected).toBe(false);
    expect(entriesToSave(rows).map((e) => e.activityId)).toEqual(['paddleboarding']);
  });

  it('checkDuplicates works on bare workouts too', () => {
    const w = readImportFile(runFit, 'run.fit').workouts[0];
    expect(checkDuplicates([{ workout: w }, { workout: { ...w, fileName: 'copy.fit' } }], []).map((c) => c.status)).toEqual(['new', 'duplicate-in-file']);
    expect(checkDuplicates([{ workout: w }, { workout: { ...w, index: 2 } }], [])[1].reason).toBe('This workout is listed twice in run.fit; it is imported once.');
  });

  it('does not merge a short walk with the short run right after it, or two different activities', () => {
    // Real sample: fenix 5 walk of 45 s at 14:32:51 and run of 57 s at 14:34:09.
    const walk = readImportFile(simpleActivity({ start: '2017-06-11T14:32:51Z', sport: 11, elapsedS: 45.379, kcal: 4 }), 'walk.fit').workouts[0];
    const run = readImportFile(simpleActivity({ start: '2017-06-11T14:34:09Z', sport: 1, elapsedS: 56.887, kcal: 5 }), 'run.fit').workouts[0];
    expect(checkDuplicates([{ workout: walk }, { workout: run }], []).map((c) => c.status)).toEqual(['new', 'new']);
    const w = readImportFile(runFit, 'run.fit').workouts[0];
    expect(checkDuplicates([{ workout: w, activityId: 'running' }, { workout: { ...w, fileName: 'b.fit' }, activityId: 'cycling' }], []).map((c) => c.status)).toEqual(['new', 'probable-duplicate']);
  });
});
