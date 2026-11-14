/**
 * G3 and G6: an imported workout and a session logged by hand.
 *
 * A hand-logged session has no real start time, only the moment it was saved.
 * It is a possible duplicate of an imported workout when both are on the same
 * day, the activities are in the same category, the durations are within 25%
 * of each other, and it was saved after the imported workout started.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ACTIVITY_BY_ID } from '@/data/activities';
import { buildActivityEntry } from '@/features/activity/build';
import type { ActivityEntry } from '@/types';

import { entriesToSave, prepareImport, replaceHandLoggedPlan } from './plan';
import { readImportFile } from './read';

const ctx = { weightKg: 78.8, baselineKcalPerDay: 2200 };
const enc = (s: string) => new TextEncoder().encode(s);
const csv = (rows: string) => readImportFile(enc(`Activity Type,Date,Title,Distance,Calories,Time,Elapsed Time\n${rows}\n`), 'Activities.csv', { csv: { distanceUnit: 'km' } }).workouts;

function hand(activityId: string, durationMin: number, date: string, loggedAtLocal: string, over: Partial<ActivityEntry> = {}): ActivityEntry {
  const loggedAt = new Date(loggedAtLocal).toISOString();
  return {
    ...buildActivityEntry({ activity: ACTIVITY_BY_ID[activityId], intensity: 'moderate', durationMin, date, weightKg: 78.8, baselineKcalPerDay: 2200, loggedAt }),
    id: `hand-${activityId}`,
    updatedAt: loggedAt,
    ...over,
  };
}

describe('G3/G6: imports against sessions logged by hand', () => {
  const tz = process.env.TZ;
  beforeEach(() => {
    process.env.TZ = 'Europe/Amsterdam';
  });
  afterEach(() => {
    process.env.TZ = tz;
  });

  it('G3: flags a morning spin class logged by hand at lunch as Spinning, imported as Stationary bike', () => {
    const spinning = hand('spinning', 45, '2026-11-14', '2026-11-14T11:38:00');
    const rows = prepareImport(csv('Indoor Cycling,2026-11-14 07:00:00,"Spin class","0.00","420","00:46:00","00:46:00"'), [spinning], ctx);
    expect(rows[0].activityId).toBe('stationary_bike');
    expect(rows[0]).toMatchObject({ status: 'probable-duplicate', selected: false });
    expect(rows[0].match?.id).toBe('hand-spinning');
    expect(rows[0].reason).toBe('You logged a 45 min spinning session by hand on this day. If it is the same workout, leave this unticked, or import it and delete the hand-logged one.');
    expect(entriesToSave(rows)).toEqual([]);
  });

  it('G3: matches siblings in one category (Running and Cross-country running) with durations within 25%', () => {
    const run = hand('running', 40, '2026-11-14', '2026-11-14T12:00:00');
    expect(prepareImport(csv('Trail Running,2026-11-14 08:00:00,"Hills","8.00","600","00:48:00","00:50:00"'), [run], ctx)[0].status).toBe('probable-duplicate');
    // 40 against 60 minutes is more than 25% apart: a different workout.
    expect(prepareImport(csv('Trail Running,2026-11-14 08:00:00,"Hills","8.00","600","01:00:00","01:00:00"'), [run], ctx)[0].status).toBe('new');
  });

  it('G6: a hand log saved before the imported workout began cannot be that workout', () => {
    // The seed's walk was saved at 18:00; the imported walk started at 23:40.
    const walk = hand('walking', 45, '2026-11-12', '2026-11-12T18:00:00');
    const rows = prepareImport(csv('Walking,2026-11-12 23:40:00,"Late walk","3.60","190","00:45:00","00:46:00"'), [walk], ctx);
    expect(rows[0]).toMatchObject({ status: 'new', selected: true, reason: null });
  });

  it('G6: the same day and activity alone is not enough; another category or another day is left alone', () => {
    const yoga = hand('yoga', 45, '2026-11-14', '2026-11-14T12:00:00');
    expect(prepareImport(csv('Indoor Cycling,2026-11-14 07:00:00,"Spin class","0.00","420","00:46:00","00:46:00"'), [yoga], ctx)[0].status).toBe('new');
    const yesterday = hand('spinning', 45, '2026-11-13', '2026-11-14T11:38:00');
    expect(prepareImport(csv('Indoor Cycling,2026-11-14 07:00:00,"Spin class","0.00","420","00:46:00","00:46:00"'), [yesterday], ctx)[0].status).toBe('new');
  });

  it('offers to replace the hand-logged session: the import is saved, the hand log removed, and both can be undone', () => {
    const spinning = hand('spinning', 45, '2026-11-14', '2026-11-14T11:38:00', { notes: 'Legs heavy' });
    const rows = prepareImport(csv('Indoor Cycling,2026-11-14 07:00:00,"Spin class","0.00","420","00:46:00","00:46:00"'), [spinning], ctx);
    const plan = replaceHandLoggedPlan(rows[0]);
    expect(plan).not.toBeNull();
    expect(plan!.remove.id).toBe('hand-spinning');
    expect(plan!.save).toMatchObject({ activityId: 'stationary_bike', measured: true, kcalGross: 420, date: '2026-11-14', source: 'garmin' });
    // The person's own note travels with the workout that replaces it.
    expect(plan!.save.notes).toBe('Spin class · Legs heavy');
    // Only a probable duplicate of a hand log can be replaced this way.
    expect(replaceHandLoggedPlan({ ...rows[0], status: 'new', match: null })).toBeNull();
  });
});
