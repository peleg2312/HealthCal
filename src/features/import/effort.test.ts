/**
 * G7: the effort label of an imported workout matches its pace. For an
 * activity whose effort hints state speeds, the speed decides the level; the
 * MET implied by the calories is used only without a distance.
 */
import { describe, expect, it } from 'vitest';

import { ACTIVITY_BY_ID } from '@/data/activities';

import { toActivityEntry } from './convert';
import { SPEED_BANDS, speedIntensity } from './effort';
import type { ImportedWorkout } from './types';

const ctx = { weightKg: 78.8, baselineKcalPerDay: 2200 };

const w = (over: Partial<ImportedWorkout>): ImportedWorkout => ({
  format: 'tcx', fileName: 'run.tcx', index: 1, startUtc: '2024-09-19T11:05:15Z', startFromLocalTime: false,
  durationSec: 2760, elapsedSec: 2760, durationIncludesPauses: false, distanceM: 8047, kcal: 384,
  avgHeartRate: 150, maxHeartRate: null, sport: 'Running', subSport: null, title: null, device: null,
  ...over,
});

describe('G7: effort from speed', () => {
  it('labels the lorimer run (8.05 km in 46 min, 10.5 km/h) Moderate, not Easy', () => {
    const e = toActivityEntry(w({}), ACTIVITY_BY_ID.running, ctx);
    expect(e.intensity).toBe('moderate');
    expect(e.met).toBe(ACTIVITY_BY_ID.running.met.moderate);
    // The device's calories stay exactly as measured.
    expect(e.kcalGross).toBe(384);
    expect(e.measured).toBe(true);
  });

  it('uses the bands the running hints state: about 8, about 10, 12 or faster', () => {
    const at = (kmh: number) => speedIntensity(ACTIVITY_BY_ID.running, w({ distanceM: (kmh * 2760) / 3.6 }));
    expect(at(7.5)).toBe('light');
    expect(at(8.9)).toBe('light');
    expect(at(9.0)).toBe('moderate');
    expect(at(10.1)).toBe('moderate');
    expect(at(11.0)).toBe('vigorous');
    expect(at(13)).toBe('vigorous');
  });

  it('labels walks and rides by speed too', () => {
    expect(speedIntensity(ACTIVITY_BY_ID.walking, w({ distanceM: 4000, durationSec: 3600 }))).toBe('light');
    expect(speedIntensity(ACTIVITY_BY_ID.walking, w({ distanceM: 5200, durationSec: 3600 }))).toBe('moderate');
    expect(speedIntensity(ACTIVITY_BY_ID.walking, w({ distanceM: 6500, durationSec: 3600 }))).toBe('vigorous');
    expect(speedIntensity(ACTIVITY_BY_ID.cycling, w({ distanceM: 14000, durationSec: 3600 }))).toBe('light');
    expect(speedIntensity(ACTIVITY_BY_ID.cycling, w({ distanceM: 20000, durationSec: 3600 }))).toBe('moderate');
    expect(speedIntensity(ACTIVITY_BY_ID.cycling, w({ distanceM: 25000, durationSec: 3600 }))).toBe('vigorous');
  });

  it('falls back to the implied MET without a distance, or for activities whose hints give no speed', () => {
    expect(speedIntensity(ACTIVITY_BY_ID.running, w({ distanceM: null }))).toBeNull();
    expect(speedIntensity(ACTIVITY_BY_ID.running, w({ distanceM: 0 }))).toBeNull();
    expect(speedIntensity(ACTIVITY_BY_ID.hiking, w({}))).toBeNull();
    // Without distance the calories decide: 384 kcal in 46 min at 78.8 kg implies about 6 MET, nearest Easy.
    expect(toActivityEntry(w({ distanceM: null }), ACTIVITY_BY_ID.running, ctx).intensity).toBe('light');
  });

  it('uses the speed for a file without calories too (GPX), instead of the general effort choice', () => {
    const e = toActivityEntry(w({ format: 'gpx', kcal: null }), ACTIVITY_BY_ID.running, { ...ctx, estimateIntensity: 'light' });
    expect(e.intensity).toBe('moderate');
    expect(e.measured).toBeUndefined();
    // Without a distance the chosen effort still applies.
    expect(toActivityEntry(w({ format: 'gpx', kcal: null, distanceM: null }), ACTIVITY_BY_ID.running, { ...ctx, estimateIntensity: 'light' }).intensity).toBe('light');
  });

  it('every band matches the speeds written in that activity’s effort hints', () => {
    const speeds = (s: string) => [...s.matchAll(/(\d+(?:\.\d+)?)/g)].map((m) => Number(m[1]));
    for (const [id, band] of Object.entries(SPEED_BANDS)) {
      const a = ACTIVITY_BY_ID[id];
      expect(a, id).toBeDefined();
      expect(a.tracksDistance, id).toBe(true);
      const light = speeds(a.intensityHint?.light ?? '');
      const moderate = speeds(a.intensityHint?.moderate ?? '');
      // The light hint's speeds sit below the first threshold, the moderate hint's between the two.
      expect(Math.max(...light), id).toBeLessThanOrEqual(band.moderateFrom);
      for (const v of moderate) {
        expect(v, id).toBeGreaterThanOrEqual(band.moderateFrom);
        if (band.vigorousFrom !== null) expect(v, id).toBeLessThanOrEqual(band.vigorousFrom);
      }
      if (band.vigorousFrom !== null) for (const v of speeds(a.intensityHint?.vigorous ?? '')) expect(v, id).toBeGreaterThanOrEqual(band.vigorousFrom);
    }
  });
});
