/**
 * Items the second test round found after the G2-G7 fixes:
 *  - hand-log matching by kind of workout, not by the broad catalogue category
 *    (a walk is not a run; a hike is a walk),
 *  - re-importing after the person corrected the session must not undo the
 *    correction by default,
 *  - "adds distance" only when the activity the update keeps records one,
 *  - the effort the person picks for estimates wins over the speed,
 *  - Replace + Undo leaves the hand-log warning, not "you deleted it",
 *  - an update from a file that states its offset moves the workout to the
 *    day it was done, unless the person moved it themselves.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ACTIVITY_BY_ID } from '@/data/activities';
import { buildActivityEntry, rebuildActivityEntry } from '@/features/activity/build';
import type { ActivityEntry } from '@/types';

import { toActivityEntry } from './convert';
import { updateGains } from './dedupe';
import { entriesToSave, prepareImport } from './plan';
import { readImportFile } from './read';
import type { ImportedWorkout } from './types';

const ctx = { weightKg: 78.8, baselineKcalPerDay: 2200 };
const enc = (s: string) => new TextEncoder().encode(s);
const csv = (rows: string) =>
  readImportFile(enc(`Activity Type,Date,Title,Distance,Calories,Time,Elapsed Time\n${rows}\n`), 'Activities.csv', { csv: { distanceUnit: 'km' } }).workouts;

function hand(activityId: string, durationMin: number, date: string, loggedAtLocal: string): ActivityEntry {
  const loggedAt = new Date(loggedAtLocal).toISOString();
  return {
    ...buildActivityEntry({ activity: ACTIVITY_BY_ID[activityId], intensity: 'moderate', durationMin, date, weightKg: 78.8, baselineKcalPerDay: 2200, loggedAt }),
    id: `hand-${activityId}`,
    updatedAt: loggedAt,
  };
}

function save(entries: ReturnType<typeof entriesToSave>, into: ActivityEntry[] = []): ActivityEntry[] {
  const byId = new Map(into.map((e) => [e.id, e]));
  for (const e of entries) byId.set(e.id, { ...e, updatedAt: '2026-11-14T10:00:00.000Z', deleted: false });
  return [...byId.values()];
}

const tcx: ImportedWorkout = {
  format: 'tcx', fileName: 'activity_1.tcx', index: 1, startUtc: '2026-11-13T08:05:15Z', startFromLocalTime: false,
  durationSec: 2760, elapsedSec: 2860, durationIncludesPauses: false, distanceM: 8047, kcal: 384,
  avgHeartRate: 152, maxHeartRate: null, sport: 'running', subSport: null, title: null, device: null,
};
const gpx: ImportedWorkout = { ...tcx, format: 'gpx', fileName: 'activity_1.gpx', durationSec: 2860, durationIncludesPauses: true, kcal: null, avgHeartRate: null };

describe('second round', () => {
  const tz = process.env.TZ;
  beforeEach(() => {
    process.env.TZ = 'Europe/Amsterdam';
  });
  afterEach(() => {
    process.env.TZ = tz;
  });

  it('a walk and a hike are one kind of workout, in both directions', () => {
    const hiking = hand('hiking', 60, '2026-11-14', '2026-11-14T18:10:00');
    expect(prepareImport(csv('Walking,2026-11-14 07:00:00,"Walk","4.00","220","00:55:00","00:55:00"'), [hiking], ctx)[0]).toMatchObject({ status: 'probable-duplicate', selected: false });
    const walking = hand('walking', 50, '2026-11-14', '2026-11-14T18:10:00');
    expect(prepareImport(csv('Hiking,2026-11-14 07:00:00,"Hike","5.00","400","00:55:00","00:55:00"'), [walking], ctx)[0]).toMatchObject({ status: 'probable-duplicate', selected: false });
  });

  it('a morning run is not the evening walk logged by hand', () => {
    const walking = hand('walking', 45, '2026-11-14', '2026-11-14T18:10:00');
    expect(prepareImport(csv('Running,2026-11-14 07:00:00,"Run","8.00","520","00:46:00","00:46:00"'), [walking], ctx)[0]).toMatchObject({ status: 'new', selected: true });
  });

  it('a re-import does not undo the person’s duration fix by default', () => {
    const stored = save(entriesToSave(prepareImport([tcx], [], ctx)));
    const fixed = rebuildActivityEntry(stored[0], { activity: ACTIVITY_BY_ID.running, intensity: stored[0].intensity, durationMin: 30, date: stored[0].date }, ctx);
    const after = save([{ ...fixed, id: stored[0].id } as never]);
    const [row] = prepareImport([tcx], after, ctx);
    expect(row.selected).toBe(false);
    expect(row.reason).toMatch(/^You changed this workout after importing it/);
    expect(row.reason).toContain('30 min');
    expect(row.reason).not.toContain('file with less in it');
    expect(entriesToSave([row])).toEqual([]);
  });

  it('a re-import does not undo an effort or activity change on a measured workout by default', () => {
    const stored = save(entriesToSave(prepareImport([tcx], [], ctx)));
    const other = stored[0].intensity === 'vigorous' ? 'moderate' : 'vigorous';
    const fixed = rebuildActivityEntry(stored[0], { activity: ACTIVITY_BY_ID.running, intensity: other, durationMin: stored[0].durationMin, date: stored[0].date }, ctx);
    expect(fixed.measured).toBe(false);
    const [row] = prepareImport([tcx], save([{ ...fixed, id: stored[0].id } as never]), ctx);
    expect(row.selected).toBe(false);
    expect(row.reason).toMatch(/^You changed this workout after importing it/);
  });

  it('a GPX import with a different elapsed time is still a poorer file, not an edit', () => {
    const stored = save(entriesToSave(prepareImport([gpx], [], ctx)));
    const [row] = prepareImport([{ ...tcx, durationSec: 2400 }], stored, ctx);
    expect(row).toMatchObject({ status: 'update', selected: true });
  });

  it('does not offer distance to an activity that keeps none', () => {
    const stored = save(entriesToSave(prepareImport([tcx], [], ctx)));
    const elliptical = { ...stored[0], activityId: 'elliptical', name: 'Elliptical trainer', category: 'cardio' as const, distanceKm: undefined };
    expect(updateGains({ workout: tcx, activityId: 'running', suggested: true }, elliptical)).toEqual([]);
    const [row] = prepareImport([tcx], [elliptical], ctx);
    expect(row.status).toBe('already-imported');
  });

  it('the effort the person picks for an estimate wins over the speed', () => {
    const run = ACTIVITY_BY_ID.running;
    expect(toActivityEntry(gpx, run, ctx).intensity).toBe('moderate');
    expect(toActivityEntry(gpx, run, { ...ctx, estimateIntensity: 'vigorous' }).intensity).toBe('vigorous');
    expect(toActivityEntry(gpx, run, { ...ctx, estimateIntensity: 'light' }).intensity).toBe('light');
    // Measured calories are not an estimate: the choice does not touch them.
    expect(toActivityEntry(tcx, run, { ...ctx, estimateIntensity: 'light' })).toMatchObject({ kcalGross: 384, intensity: 'moderate' });
  });

  it('after Replace and Undo the row still warns about the hand log', () => {
    const spinning = hand('spinning', 45, '2026-11-14', '2026-11-14T18:06:00');
    const w = csv('Indoor Cycling,2026-11-14 07:00:00,"Spin class","0.00","420","00:46:00","00:46:00"');
    const imported = entriesToSave(prepareImport(w, [], ctx));
    const deletedImport = save(imported).map((e) => ({ ...e, deleted: true }));
    const [row] = prepareImport(w, [spinning, ...deletedImport], ctx);
    expect(row).toMatchObject({ status: 'probable-duplicate', selected: false });
    expect(row.match?.id).toBe('hand-spinning');
    expect(row.reason).toMatch(/^You logged a 45 min spinning class by hand/);
  });

  it('an update from a FIT that states its offset moves the workout to the day it was done', () => {
    const tcxNy: ImportedWorkout = { ...tcx, startUtc: '2026-11-11T00:30:00Z', avgHeartRate: null };
    const stored = save(entriesToSave(prepareImport([tcxNy], [], ctx)));
    expect(stored[0].date).toBe('2026-11-11');
    const fit: ImportedWorkout = { ...tcxNy, format: 'fit', fileName: 'ny-run.fit', avgHeartRate: 150, utcOffsetMin: -300 };
    const [row] = prepareImport([fit], stored, ctx);
    expect(row.status).toBe('update');
    expect(row.entry?.date).toBe('2026-11-10');
    expect(row.reason).toContain('Nov 10');
    // A day the person chose themselves stays.
    const moved = stored.map((e) => ({ ...e, date: '2026-11-12' }));
    expect(prepareImport([fit], moved, ctx)[0].entry?.date).toBe('2026-11-12');
  });
});

describe('second round: the day from a file that states its offset', () => {
  const tz = process.env.TZ;
  beforeEach(() => {
    process.env.TZ = 'Europe/Amsterdam';
  });
  afterEach(() => {
    process.env.TZ = tz;
  });

  it('a FIT that adds nothing but the day still moves the TCX’s workout, whichever came first', () => {
    const tcxNy: ImportedWorkout = { ...tcx, startUtc: '2026-11-11T00:30:00Z' };
    const fit: ImportedWorkout = { ...tcxNy, format: 'fit', fileName: 'ny-run.fit', utcOffsetMin: -300 };
    const stored = save(entriesToSave(prepareImport([tcxNy], [], ctx)));
    const [row] = prepareImport([fit], stored, ctx);
    expect(row).toMatchObject({ status: 'update', selected: true, adds: ['day'] });
    expect(row.reason).toMatch(/^Imported before from a file that does not say where it was recorded\. Importing replaces the numbers and moves it to .*Nov 10/);
    const after = save(entriesToSave([row]), stored);
    expect(after.map((e) => e.date)).toEqual(['2026-11-10']);
    // FIT first gives the same day, and the TCX afterwards changes nothing.
    const fitFirst = save(entriesToSave(prepareImport([fit], [], ctx)));
    expect(fitFirst[0].date).toBe('2026-11-10');
    expect(prepareImport([tcxNy], fitFirst, ctx)[0].status).toBe('already-imported');
    expect(prepareImport([fit], after, ctx)[0].status).toBe('already-imported');
  });
});
