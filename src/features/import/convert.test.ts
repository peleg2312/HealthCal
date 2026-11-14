import { afterEach, describe, expect, it } from 'vitest';

import { ACTIVITY_BY_ID } from '@/data/activities';
import { buildActivityEntry } from '@/features/activity/build';
import { grossKcal, sessionGuidelineMinutes } from '@/lib/exercise';
import { stableId } from '@/lib/hash';

import { garminExternalId, impliedMet, importedEntryId, nearestIntensity, toActivityEntry } from './convert';
import type { ImportedWorkout } from './types';

const ctx = { weightKg: 70, baselineKcalPerDay: 2160 };

function workout(over: Partial<ImportedWorkout> = {}): ImportedWorkout {
  return {
    format: 'fit', fileName: 'run.fit', index: 1, startUtc: '2026-11-10T07:30:00Z', startFromLocalTime: false,
    durationSec: 3000, elapsedSec: 3100, durationIncludesPauses: false, distanceM: 10012.4, kcal: 650,
    avgHeartRate: 151.6, maxHeartRate: 172, sport: 'running', subSport: 'generic', title: 'Morning tempo', device: 'Garmin',
    ...over,
  };
}

describe('toActivityEntry with measured calories', () => {
  it('stores Garmin calories as gross and subtracts the baseline for the same minutes, floored at zero', () => {
    const e = toActivityEntry(workout(), ACTIVITY_BY_ID.running, ctx);
    expect(e.kcalGross).toBe(650);
    // 50 minutes of a 2160 kcal/day baseline is 75 kcal.
    expect(e.kcalNet).toBeCloseTo(575, 6);
    expect(e).toMatchObject({
      source: 'garmin', measured: true, externalId: 'garmin:2026-11-10T07:30:00Z', startedAt: '2026-11-10T07:30:00Z',
      durationMin: 50, avgHeartRate: 152, distanceKm: 10.012, activityId: 'running', name: 'Running', category: 'cardio',
      weightKg: 70, baselineKcalPerDay: 2160, notes: 'Morning tempo', loggedAt: '2026-11-10T08:21:40.000Z',
    });
    // Only net calories reach the day: a session below the baseline adds nothing.
    expect(toActivityEntry(workout({ kcal: 40 }), ACTIVITY_BY_ID.running, ctx).kcalNet).toBe(0);
  });

  it('without a distance, picks the effort level whose MET is nearest the MET the calories imply', () => {
    // running METs: light 8.5, moderate 9.3, vigorous 11.8. With a distance the speed decides instead (effort.test.ts).
    const kcalAt = (met: number) => Math.round(grossKcal(met, 70, 50));
    const noDistance = { distanceM: null };
    expect(toActivityEntry(workout({ ...noDistance, kcal: kcalAt(8.0) }), ACTIVITY_BY_ID.running, ctx).intensity).toBe('light');
    expect(toActivityEntry(workout({ ...noDistance, kcal: kcalAt(9.6) }), ACTIVITY_BY_ID.running, ctx).intensity).toBe('moderate');
    const hard = toActivityEntry(workout({ ...noDistance, kcal: kcalAt(12.5) }), ACTIVITY_BY_ID.running, ctx);
    expect(hard.intensity).toBe('vigorous');
    expect(hard.met).toBe(11.8);
    // Guideline minutes follow the chosen level: hard running counts double.
    expect(sessionGuidelineMinutes(hard.met, hard.durationMin, hard.intensity)).toBe(100);
    // A yoga session whose calories are near resting stays light, so it adds no guideline minutes.
    const yoga = toActivityEntry(workout({ sport: 'training', durationSec: 1176, kcal: 39, distanceM: null }), ACTIVITY_BY_ID.yoga, ctx);
    expect(yoga.intensity).toBe('light');
    expect(sessionGuidelineMinutes(yoga.met, yoga.durationMin, yoga.intensity)).toBe(0);
  });

  it('works out the implied MET and the nearest level', () => {
    expect(impliedMet(grossKcal(7, 80, 30), 80, 30)).toBeCloseTo(7, 9);
    expect(nearestIntensity({ met: { light: 3, moderate: 5, vigorous: 8 } }, 4)).toBe('light');
    expect(nearestIntensity({ met: { light: 3, moderate: 5, vigorous: 8 } }, 6.6)).toBe('vigorous');
    expect(nearestIntensity({ met: { light: 4.8, moderate: 4.8, vigorous: 4.8 } }, 9)).toBe('light');
  });

  it('keeps distance only for activities that track it and leaves out a title that just names the sport', () => {
    const e = toActivityEntry(workout({ title: 'Running' }), ACTIVITY_BY_ID.yoga, ctx);
    expect(e.distanceKm).toBeUndefined();
    expect(toActivityEntry(workout({ title: 'Run' }), ACTIVITY_BY_ID.running, ctx).notes).toBe('Run');
    expect(toActivityEntry(workout({ title: 'running' }), ACTIVITY_BY_ID.running, ctx).notes).toBeUndefined();
    expect(toActivityEntry(workout({ distanceM: 0 }), ACTIVITY_BY_ID.cycling, ctx).distanceKm).toBeUndefined();
  });

  it('treats zero calories as unknown and estimates instead', () => {
    const e = toActivityEntry(workout({ kcal: 0, distanceM: null }), ACTIVITY_BY_ID.running, ctx);
    expect(e.measured).toBeUndefined();
    expect(e.intensity).toBe('moderate');
  });
});

describe('toActivityEntry without calories (GPX)', () => {
  it('estimates exactly as a hand-logged session does and is not marked measured', () => {
    // No distance, so the chosen effort applies (with one, the speed decides: effort.test.ts).
    const w = workout({ format: 'gpx', kcal: null, durationSec: 2777, elapsedSec: 2777, durationIncludesPauses: true, distanceM: null });
    const e = toActivityEntry(w, ACTIVITY_BY_ID.running, ctx);
    const hand = buildActivityEntry({ activity: ACTIVITY_BY_ID.running, intensity: 'moderate', durationMin: 2777 / 60, date: e.date, weightKg: 70, baselineKcalPerDay: 2160, loggedAt: e.loggedAt });
    expect(e.kcalGross).toBeCloseTo(hand.kcalGross, 9);
    expect(e.kcalNet).toBeCloseTo(hand.kcalNet, 9);
    expect(e.durationMin).toBe(hand.durationMin);
    expect(e.measured).toBeUndefined();
    expect(e.source).toBe('garmin');
    expect(toActivityEntry(w, ACTIVITY_BY_ID.running, { ...ctx, estimateIntensity: 'vigorous' }).met).toBe(11.8);
  });
});

describe('identity and calendar day', () => {
  const tz = process.env.TZ;
  afterEach(() => {
    process.env.TZ = tz;
  });

  it('derives a stable id from the external id', () => {
    const e = toActivityEntry(workout(), ACTIVITY_BY_ID.running, ctx);
    expect(e.id).toBe(stableId('activities', 'garmin:2026-11-10T07:30:00Z'));
    expect(importedEntryId(e.externalId)).toBe(e.id);
    expect(garminExternalId({ startUtc: '2026-11-10T07:30:00Z', leg: { number: 1, of: 3 } })).toBe('garmin:2026-11-10T07:30:00Z/leg');
  });

  it('files the workout under the local day of its start in the device time zone', () => {
    const late = workout({ startUtc: '2026-11-10T23:30:00Z' });
    process.env.TZ = 'UTC';
    expect(toActivityEntry(late, ACTIVITY_BY_ID.running, ctx).date).toBe('2026-11-10');
    process.env.TZ = 'Europe/Amsterdam';
    expect(toActivityEntry(late, ACTIVITY_BY_ID.running, ctx).date).toBe('2026-11-11');
    process.env.TZ = 'America/Los_Angeles';
    expect(toActivityEntry(workout({ startUtc: '2026-11-10T05:00:00Z' }), ACTIVITY_BY_ID.running, ctx).date).toBe('2026-11-09');
  });
});
