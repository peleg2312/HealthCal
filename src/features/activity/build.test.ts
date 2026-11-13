import { describe, expect, it } from 'vitest';

import { ACTIVITY_BY_ID } from '@/data/activities';
import type { ActivityEntry } from '@/types';

import { buildActivityEntry, cleanExercises, formatPace, paceModeFor, summariseWeek } from './build';

const base = { weightKg: 78.4, baselineKcalPerDay: 2330, date: '2026-11-13', loggedAt: '2026-11-13T18:00:00.000Z' };

describe('buildActivityEntry', () => {
  it('computes gross and net kcal from the MET for the chosen intensity', () => {
    const e = buildActivityEntry({ ...base, activity: ACTIVITY_BY_ID.volleyball, intensity: 'moderate', durationMin: 75 });
    // 4.0 MET x 3.5 x 78.4 kg / 200 x 75 min
    expect(e.met).toBe(4);
    expect(e.kcalGross).toBeCloseTo(411.6, 1);
    // minus 2330 / 1440 x 75 = 121.35
    expect(e.kcalNet).toBeCloseTo(290.25, 1);
    expect(e).toMatchObject({ activityId: 'volleyball', name: 'Volleyball', emoji: '🏐', category: 'team', intensity: 'moderate', durationMin: 75, date: '2026-11-13' });
    expect(e.distanceKm).toBeUndefined();
    expect(e.notes).toBeUndefined();
  });

  it('keeps distance only for activities that track it and trims notes', () => {
    const run = buildActivityEntry({ ...base, activity: ACTIVITY_BY_ID.running, intensity: 'vigorous', durationMin: 30, distanceKm: 6, notes: '  tempo  ' });
    expect(run.distanceKm).toBe(6);
    expect(run.notes).toBe('tempo');
    expect(run.met).toBe(11.8);
    const yoga = buildActivityEntry({ ...base, activity: ACTIVITY_BY_ID.yoga, intensity: 'light', durationMin: 30, distanceKm: 3, notes: '   ' });
    expect(yoga.distanceKm).toBeUndefined();
    expect(yoga.notes).toBeUndefined();
  });

  it('never returns negative net calories and rounds duration to at least a minute', () => {
    const e = buildActivityEntry({ ...base, activity: ACTIVITY_BY_ID.stretching, intensity: 'light', durationMin: 0.2 });
    expect(e.durationMin).toBe(1);
    expect(e.kcalNet).toBeGreaterThanOrEqual(0);
  });

  it('keeps strength exercises without empty sets', () => {
    const e = buildActivityEntry({
      ...base,
      activity: ACTIVITY_BY_ID.strength_training,
      intensity: 'moderate',
      durationMin: 50,
      exercises: [
        { name: ' Bench press ', sets: [{ reps: 8, weightKg: 60, done: true }, { reps: 0, weightKg: 60 }] },
        { name: 'Squat', sets: [{ reps: 0, weightKg: 100 }] },
      ],
    });
    expect(e.exercises).toEqual([{ name: 'Bench press', sets: [{ reps: 8, weightKg: 60, done: true }] }]);
    expect(e.kcalGross).toBeCloseTo((5 * 3.5 * 78.4 * 50) / 200, 5);
  });

  it('drops exercises entirely when nothing was filled in', () => {
    expect(cleanExercises([{ name: 'Row', sets: [] }])).toBeUndefined();
  });
});

describe('summariseWeek', () => {
  const mk = (date: string, met: number, durationMin: number, kcalNet = 100): ActivityEntry => ({
    id: `${date}-${met}`,
    updatedAt: '',
    date,
    activityId: 'x',
    name: 'x',
    emoji: 'x',
    category: 'cardio',
    intensity: 'moderate',
    durationMin,
    met,
    kcalNet,
    kcalGross: kcalNet + 50,
    loggedAt: `${date}T10:00:00Z`,
  });

  it('counts vigorous minutes double and light minutes not at all toward the guideline', () => {
    const dates = ['2026-11-09', '2026-11-10'];
    const s = summariseWeek([mk('2026-11-09', 4, 30), mk('2026-11-10', 9.3, 20), mk('2026-11-10', 2.3, 40), mk('2026-11-01', 8, 60)], dates);
    expect(s.moderateMinutes).toBe(30);
    expect(s.vigorousMinutes).toBe(20);
    expect(s.guidelineMinutes).toBe(70);
    expect(s.totalMinutes).toBe(90);
    expect(s.sessions).toBe(3);
    expect(s.kcalNet).toBe(300);
    expect(s.byDate['2026-11-10'].minutes).toBe(60);
  });
});

describe('pace helpers', () => {
  it('chooses pace for running and speed for cycling', () => {
    expect(paceModeFor(ACTIVITY_BY_ID.running)).toBe('pace');
    expect(paceModeFor(ACTIVITY_BY_ID.cycling)).toBe('speed');
    expect(paceModeFor(ACTIVITY_BY_ID.swimming)).toBe('swim');
  });
  it('formats minutes per unit', () => {
    expect(formatPace(5.5)).toBe('5:30');
    expect(formatPace(4.999)).toBe('5:00');
  });
});
