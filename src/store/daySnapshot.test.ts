import { beforeEach, describe, expect, it } from 'vitest';

import type { Profile } from '@/types';

import { recordToday } from './daySnapshot';
import { useStore } from './index';
import { computeDayFromStore, live } from './selectors';

const profile: Partial<Profile> = {
  name: 'Alex', sex: 'male', birthDate: '1990-01-01', heightCm: 180, weightKg: 80, activityLevel: 'light',
  goal: 'lose', weeklyRateKg: 0.5, units: 'metric', eatBackExercise: true, useAdaptiveTdee: true, onboardedAt: '2026-01-01T00:00:00.000Z',
};

beforeEach(() => useStore.getState().resetAll());

describe('day snapshots', () => {
  it('does nothing before onboarding', () => {
    expect(recordToday('2026-05-10')).toBe(false);
    expect(live(useStore.getState().days)).toHaveLength(0);
  });

  it('records the day once and does not rewrite it while nothing changes', () => {
    useStore.getState().setProfile(profile);
    expect(recordToday('2026-05-10')).toBe(true);
    expect(recordToday('2026-05-10')).toBe(false);
    const days = live(useStore.getState().days);
    expect(days).toHaveLength(1);
    expect(days[0].date).toBe('2026-05-10');
    expect(days[0].target).toBe(computeDayFromStore(useStore.getState(), '2026-05-10')!.target);
  });

  it('a goal change updates today but leaves yesterday as it was', () => {
    useStore.getState().setProfile(profile);
    recordToday('2026-05-09');
    const before = computeDayFromStore(useStore.getState(), '2026-05-09')!.target;

    useStore.getState().setProfile({ goal: 'maintain', weeklyRateKg: 0 });
    recordToday('2026-05-10');

    const s = useStore.getState();
    const yesterday = computeDayFromStore(s, '2026-05-09')!;
    const today = computeDayFromStore(s, '2026-05-10')!;
    expect(yesterday.target).toBe(before);
    expect(today.target).toBeGreaterThan(before + 400); // maintenance is about 550 kcal above a 0.5 kg/week deficit
    expect(live(s.days)).toHaveLength(2);
  });

  it('follows a change made later the same day', () => {
    useStore.getState().setProfile(profile);
    recordToday('2026-05-10');
    useStore.getState().setProfile({ calorieTargetOverride: 1800 });
    expect(recordToday('2026-05-10')).toBe(true);
    const days = live(useStore.getState().days);
    expect(days).toHaveLength(1);
    expect(days[0].target).toBe(1800);
  });
});
