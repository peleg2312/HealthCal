/**
 * G4: the edit screen tells the truth. A session a device measured shows the
 * stored device figures while activity, effort and duration are unchanged,
 * which is also exactly what saving keeps; once one of them changes it is an
 * estimate again, and the screen knows the measured figure will be replaced.
 */
import { describe, expect, it } from 'vitest';

import { ACTIVITY_BY_ID } from '@/data/activities';
import type { ActivityEntry } from '@/types';

import { buildActivityEntry, estimateSession, rebuildActivityEntry, sessionPreview } from './build';

const basis = { weightKg: 78.8, baselineKcalPerDay: 2200 };

/** The lorimer TCX run as the import stores it: 384 kcal by the watch, 46 min. */
const measured: ActivityEntry = {
  ...buildActivityEntry({ activity: ACTIVITY_BY_ID.running, intensity: 'moderate', durationMin: 46, distanceKm: 8.047, date: '2024-09-19', ...basis, loggedAt: '2024-09-19T11:51:15.000Z' }),
  id: 'imp',
  updatedAt: '2024-09-19T12:00:00.000Z',
  kcalGross: 384,
  kcalNet: 384 - (2200 / 1440) * 46,
  measured: true,
  source: 'garmin',
  externalId: 'garmin:2024-09-19T11:05:15Z',
  startedAt: '2024-09-19T11:05:15Z',
};

const form = (over: Partial<{ activityId: string; intensity: ActivityEntry['intensity']; durationMin: number }> = {}) => {
  const f = { activityId: 'running', intensity: 'moderate' as ActivityEntry['intensity'], durationMin: 46, ...over };
  return { ...f, met: ACTIVITY_BY_ID[f.activityId].met[f.intensity] };
};

describe('G4: the edit screen of a measured session', () => {
  it('shows the stored device figures, not a MET estimate, while nothing that prices it changed', () => {
    const p = sessionPreview(measured, form(), basis);
    expect(p).toEqual({ kind: 'measured', gross: 384, net: 314 });
    // ...and that is what a plain save keeps.
    const saved = rebuildActivityEntry(measured, { activity: ACTIVITY_BY_ID.running, intensity: 'moderate', durationMin: 46, date: measured.date, notes: 'Felt good' }, basis);
    expect(Math.round(saved.kcalGross)).toBe(p.gross);
    expect(Math.round(saved.kcalNet)).toBe(p.net);
    expect(saved.measured).toBe(true);
  });

  it('becomes an estimate as soon as the activity, effort or duration changes, and says it replaces the measured figure', () => {
    for (const change of [{ durationMin: 50 }, { intensity: 'vigorous' as const }, { activityId: 'trail_running' }]) {
      const f = form(change);
      const p = sessionPreview(measured, f, basis);
      expect(p.kind).toBe('estimate');
      if (p.kind !== 'estimate') continue;
      expect(p.replacesMeasured).toBe(true);
      const est = estimateSession(f.met, basis.weightKg, f.durationMin, basis.baselineKcalPerDay);
      expect(p.gross).toBe(est.gross);
      expect(p.net).toBe(est.net);
      // And the save agrees: no longer measured.
      const saved = rebuildActivityEntry(measured, { activity: ACTIVITY_BY_ID[f.activityId], intensity: f.intensity, durationMin: f.durationMin, date: measured.date }, basis);
      expect(saved.measured).toBe(false);
      expect(Math.round(saved.kcalGross)).toBe(p.gross);
    }
  });

  it('keeps estimating hand-logged sessions and new ones exactly as before', () => {
    const hand = { ...measured, measured: undefined };
    expect(sessionPreview(hand, form(), basis)).toMatchObject({ kind: 'estimate', replacesMeasured: false });
    expect(sessionPreview(undefined, form(), basis)).toMatchObject({ kind: 'estimate', replacesMeasured: false });
  });
});
