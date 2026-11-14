import { describe, expect, it } from 'vitest';

import { workoutSpan } from './convert';
import { workoutEnergy } from './energy';
import { mergeOrigins } from './merge';
import { CTX, GARMIN, SAMSUNG, STRAVA, workout } from './testing';
import type { HealthWorkout } from './types';

const quality = (w: HealthWorkout) => ({ stored: false, measured: workoutEnergy(w, workoutSpan(w)!.durationSec, CTX).basis !== 'none' });
const merge = (ws: HealthWorkout[]) => mergeOrigins(ws, quality);

describe('mergeOrigins', () => {
  it('keeps one reading of a run two apps recorded, whatever order they are read in', () => {
    const watch = workout({ start: '2026-11-12T06:00:00Z', minutes: 45, activeKcal: 480 });
    const phone = workout({ start: '2026-11-12T06:02:00Z', minutes: 41, origin: SAMSUNG });
    for (const order of [[watch, phone], [phone, watch]]) {
      const m = merge(order);
      expect(m.kept).toEqual([watch]);
      expect(m.dropped).toEqual([{ workout: phone, keptInstead: watch }]);
    }
  });

  it('a short phone walk inside a long watch hike is the same outing', () => {
    const hike = workout({ start: '2026-11-12T08:00:00Z', minutes: 180, activeKcal: 900 });
    const stroll = workout({ start: '2026-11-12T09:00:00Z', minutes: 20, origin: SAMSUNG, activeKcal: 60 });
    expect(merge([hike, stroll]).kept).toEqual([hike]);
  });

  it('two apps at different times are two workouts, oldest first', () => {
    const evening = workout({ start: '2026-11-12T17:00:00Z', minutes: 30, origin: STRAVA });
    const morning = workout({ start: '2026-11-12T06:00:00Z', minutes: 45 });
    expect(merge([evening, morning]).kept).toEqual([morning, evening]);
  });

  it('a small overlap is not the same workout', () => {
    const a = workout({ start: '2026-11-12T06:00:00Z', minutes: 60 });
    const b = workout({ start: '2026-11-12T06:50:00Z', minutes: 60, origin: STRAVA });
    expect(merge([a, b]).kept).toHaveLength(2);
  });

  it('leaves two sessions of the same app alone, even when they overlap', () => {
    const a = workout({ start: '2026-11-12T06:00:00Z', minutes: 60, origin: GARMIN });
    const b = workout({ start: '2026-11-12T06:10:00Z', minutes: 40, origin: GARMIN });
    expect(merge([a, b]).kept).toHaveLength(2);
  });

  it('with no calories on either side, Garmin Connect is kept', () => {
    const watch = workout({ start: '2026-11-12T06:00:00Z', minutes: 30 });
    const phone = workout({ start: '2026-11-12T06:00:00Z', minutes: 45, origin: STRAVA });
    expect(merge([phone, watch]).kept).toEqual([watch]);
  });

  it('between equals, the reading the diary already has stays', () => {
    const a = workout({ start: '2026-11-12T06:00:00Z', minutes: 30, origin: SAMSUNG });
    const b = workout({ start: '2026-11-12T06:00:00Z', minutes: 45, origin: STRAVA });
    expect(merge([a, b]).kept).toEqual([b]);
    expect(mergeOrigins([a, b], (w) => ({ measured: false, stored: w === a })).kept).toEqual([a]);
  });
});
