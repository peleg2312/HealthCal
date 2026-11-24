/**
 * G2: a better file replaces a poorer one. A workout stored from a GPX (an
 * estimate) arrives again as the TCX or FIT of the same run, carrying the
 * watch's calories and heart rate. The row is an 'update', ticked, and saving
 * replaces the numbers while keeping the record's id, day and the person's
 * note. A deleted workout restored from such a row comes back with the row's
 * numbers, not the old estimate.
 */
import { describe, expect, it } from 'vitest';

import type { ActivityEntry } from '@/types';

import { entriesToSave, netChange, prepareImport } from './plan';
import type { ImportedWorkout } from './types';
import { calorieView, countRows, filterRows, summarise } from './ui/format';

const ctx = { weightKg: 78.8, baselineKcalPerDay: 2200 };

const base: ImportedWorkout = {
  format: 'gpx', fileName: 'activity_1.gpx', index: 1, startUtc: '2024-09-19T11:05:15Z', startFromLocalTime: false,
  durationSec: 2860, elapsedSec: 2860, durationIncludesPauses: true, distanceM: 8030, kcal: null,
  avgHeartRate: null, maxHeartRate: null, sport: 'running', subSport: null, title: 'Lorimer Avinger', device: null,
};
const gpx = base;
const tcx: ImportedWorkout = { ...base, format: 'tcx', fileName: 'activity_1.tcx', durationSec: 2760, elapsedSec: 2860, durationIncludesPauses: false, distanceM: 8047, kcal: 384, avgHeartRate: 152, title: null };

/** Save as the store's upsert does. */
function save(entries: ReturnType<typeof entriesToSave>, into: ActivityEntry[] = []): ActivityEntry[] {
  const byId = new Map(into.map((e) => [e.id, e]));
  for (const e of entries) byId.set(e.id, { ...e, updatedAt: '2026-11-14T10:00:00.000Z', deleted: false });
  return [...byId.values()];
}

describe('G2: a richer reading of an imported workout', () => {
  const stored = save(entriesToSave(prepareImport([gpx], [], ctx)));
  const fromGpx = stored[0];

  it('stores the GPX as an estimate', () => {
    expect(fromGpx.measured).toBeUndefined();
    expect(fromGpx.kcalGross).toBeGreaterThan(500);
  });

  it('offers the TCX as an update, ticked, saying what will change', () => {
    const rows = prepareImport([tcx], stored, ctx);
    expect(rows[0]).toMatchObject({ status: 'update', selected: true, adds: ['calories', 'heart-rate'] });
    expect(rows[0].reason).toBe(
      `Imported before from a file with less in it. This one adds the calories your watch measured and heart rate: +314 kcal to the day instead of the estimated +${Math.round(fromGpx.kcalNet)}. Importing replaces the numbers; the day and your notes stay.`,
    );
    // Not counted among duplicates; counted as an update.
    expect(filterRows(rows, 'duplicates')).toEqual([]);
    expect(countRows(rows)).toMatchObject({ updates: 1, selected: 1, locked: 0, duplicates: 0 });
    expect(calorieView(rows[0])).toMatchObject({ added: '~314', estimate: false, detail: '384 by watch' });
  });

  it('replaces the numbers and keeps the record’s id, day and the person’s note', () => {
    const edited = stored.map((e) => ({ ...e, notes: 'Hilly loop', date: '2024-09-20' }));
    const rows = prepareImport([tcx], edited, ctx);
    const [entry] = entriesToSave(rows);
    expect(entry).toMatchObject({ id: fromGpx.id, date: '2024-09-20', notes: 'Hilly loop', kcalGross: 384, measured: true, avgHeartRate: 152, durationMin: 46 });
    expect(entry.kcalNet).toBeCloseTo(384 - (2200 / 1440) * 46, 6);
    const after = save([entry], edited);
    expect(after).toHaveLength(1);
    // The day changes by the difference, not by the whole figure.
    expect(netChange(rows[0]).kcalNet).toBeCloseTo(entry.kcalNet - fromGpx.kcalNet, 6);
    expect(summarise([entry], edited)).toMatchObject({ sessions: 0, updated: 1, kcal: Math.round(entry.kcalNet - fromGpx.kcalNet) });
    // Reading the TCX again now adds nothing.
    expect(prepareImport([tcx], after, ctx)[0].status).toBe('already-imported');
    // And a poorer file never downgrades it.
    expect(prepareImport([gpx], after, ctx)[0].status).toBe('already-imported');
  });

  it('keeps the activity the person chose for the stored workout', () => {
    const changed = stored.map((e) => ({ ...e, activityId: 'trail_running', name: 'Trail running' }));
    const [entry] = entriesToSave(prepareImport([tcx], changed, ctx));
    expect(entry).toMatchObject({ activityId: 'trail_running', kcalGross: 384, measured: true });
  });

  it('restores a deleted workout with the numbers on the row, not the old estimate', () => {
    const deleted = stored.map((e) => ({ ...e, deleted: true, notes: 'Hilly loop' }));
    const rows = prepareImport([tcx], deleted, ctx);
    expect(rows[0]).toMatchObject({ status: 'already-imported', selected: false });
    expect(rows[0].reason).toBe('You imported this workout before and then deleted it. Restoring it uses this file, which adds the calories your watch measured and heart rate.');
    // What Restore saves (session.ts restoreDeleted upserts the row's entry under the stored id).
    expect(rows[0].entry).toMatchObject({ id: fromGpx.id, kcalGross: 384, measured: true, notes: 'Hilly loop', date: fromGpx.date });
    // The row shows the same figure it restores.
    expect(calorieView(rows[0]).detail).toBe('384 by watch');
  });

  it('does not offer a same-or-poorer reading as an update', () => {
    const fromTcx = save(entriesToSave(prepareImport([tcx], [], ctx)));
    expect(prepareImport([gpx], fromTcx, ctx)[0].status).toBe('already-imported');
    expect(prepareImport([{ ...tcx, format: 'csv', fileName: 'Activities.csv' }], fromTcx, ctx)[0].status).toBe('already-imported');
  });
});
