import { describe, expect, it } from 'vitest';

import { ACTIVITY_BY_ID } from '@/data/activities';
import type { ActivityEntry } from '@/types';

import { basisFromEntry, buildActivityEntry, cleanExercises, formatPace, localiseSpeedText, paceModeFor, rebuildActivityEntry, sessionWaterMl, summariseWeek } from './build';

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

describe('editing a saved session (review activity-trackers-2)', () => {
  const march = buildActivityEntry({ activity: ACTIVITY_BY_ID.running, intensity: 'moderate', durationMin: 60, date: '2026-03-10', weightKg: 90, baselineKcalPerDay: 2600, loggedAt: '2026-03-10T08:00:00.000Z' });
  const saved = { ...march, id: 'a1', updatedAt: '2026-03-10T08:00:00.000Z' } as ActivityEntry;
  const today = { weightKg: 75, baselineKcalPerDay: 2200 };

  it('recovers the weight and baseline the entry was built with', () => {
    const b = basisFromEntry(saved, today);
    expect(b.weightKg).toBeCloseTo(90, 6);
    expect(b.baselineKcalPerDay).toBeCloseTo(2600, 6);
  });

  it('falls back when the stored numbers cannot carry the basis', () => {
    expect(basisFromEntry({ met: 0, durationMin: 30, kcalGross: 0, kcalNet: 0 }, today)).toEqual(today);
    // A session whose net was clipped to zero cannot carry the baseline in its calories; the stored value does.
    const stored = basisFromEntry({ ...saved, kcalNet: 0 }, today);
    expect(stored.baselineKcalPerDay).toBe(2600);
    // An older entry without the stored basis falls back for the part it cannot recover.
    const legacy = basisFromEntry({ ...saved, kcalNet: 0, weightKg: undefined, baselineKcalPerDay: undefined }, today);
    expect(legacy.weightKg).toBeCloseTo(90, 6);
    expect(legacy.baselineKcalPerDay).toBe(2200);
  });

  it('keeps the saved calories exactly when only notes, date or distance change', () => {
    const r = rebuildActivityEntry(saved, { activity: ACTIVITY_BY_ID.running, intensity: 'moderate', durationMin: 60, date: '2026-03-11', notes: 'typo fixed', distanceKm: 10 }, today);
    expect(r.kcalGross).toBe(saved.kcalGross);
    expect(r.kcalNet).toBe(saved.kcalNet);
    expect(r.met).toBe(saved.met);
    expect(r.notes).toBe('typo fixed');
    expect(r.date).toBe('2026-03-11');
    expect(r.loggedAt).toBe(saved.loggedAt);
  });

  it('re-prices a changed duration at the original weight, not today\'s', () => {
    const r = rebuildActivityEntry(saved, { activity: ACTIVITY_BY_ID.running, intensity: 'moderate', durationMin: 30, date: saved.date }, today);
    expect(r.kcalGross).toBeCloseTo(saved.kcalGross / 2, 6);
    expect(r.kcalNet).toBeCloseTo(saved.kcalNet / 2, 6);
  });

  it('keeps a catalogue MET change from moving an untouched session', () => {
    const old = { ...saved, met: 9.8, kcalGross: 9.8 * 3.5 * 90 / 200 * 60 } as ActivityEntry;
    const r = rebuildActivityEntry(old, { activity: ACTIVITY_BY_ID.running, intensity: 'moderate', durationMin: 60, date: old.date }, today);
    expect(r.met).toBe(9.8);
    expect(r.kcalGross).toBe(old.kcalGross);
  });
});

describe('sessionWaterMl (review consistency-7)', () => {
  it('previews a lone session as the full amount', () => {
    expect(sessionWaterMl([], { durationMin: 60, intensity: 'vigorous' })).toBe(800);
  });
  it('previews only what is left under the daily cap', () => {
    const others = [{ durationMin: 120, intensity: 'vigorous' as const }];
    expect(sessionWaterMl(others, { durationMin: 60, intensity: 'vigorous' })).toBe(400);
    expect(sessionWaterMl([{ durationMin: 180, intensity: 'vigorous' as const }], { durationMin: 180, intensity: 'vigorous' })).toBe(0);
  });
});

describe('localiseSpeedText (review imperial-5)', () => {
  it('leaves metric text alone', () => {
    expect(localiseSpeedText('About 10 km/h', 'metric')).toBe('About 10 km/h');
  });
  it('converts single speeds and ranges to mph to the nearest half', () => {
    expect(localiseSpeedText('Jog, about 8 km/h', 'imperial')).toBe('Jog, about 5 mph');
    expect(localiseSpeedText('About 12 km/h or faster', 'imperial')).toBe('About 7.5 mph or faster');
    expect(localiseSpeedText('Moderate, 6.5-9.5 km/h', 'imperial')).toBe('Moderate, 4-6 mph');
    expect(localiseSpeedText('Leisure, under 16 km/h', 'imperial')).toBe('Leisure, under 10 mph');
    expect(localiseSpeedText('Slow, under 100 skips/min', 'imperial')).toBe('Slow, under 100 skips/min');
  });
  it('leaves no km/h in any catalogue hint for imperial users', () => {
    for (const a of Object.values(ACTIVITY_BY_ID)) for (const h of Object.values(a.intensityHint ?? {})) expect(localiseSpeedText(h, 'imperial')).not.toMatch(/km/);
  });
});
