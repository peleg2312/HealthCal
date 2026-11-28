import { describe, expect, it } from 'vitest';

import { buddyCup, buddyDaysTogether, canShowSaved, daysLeftInWeek, NOTE_KINDS, TOGETHER_RULES, togetherGoalChoices, togetherProgress } from './together';

describe('the shared cup', () => {
  it('pours the circle’s share and is reached at the goal or past it, never above full', () => {
    expect(togetherProgress({ total: 412, target: 600 })).toEqual({ share: 412 / 600, reached: false, left: 188 });
    expect(togetherProgress({ total: 600, target: 600 })).toEqual({ share: 1, reached: true, left: 0 });
    expect(togetherProgress({ total: 700, target: 600 }).share).toBe(1);
    expect(togetherProgress({ total: -5, target: 0 }).share).toBe(0);
  });

  it('counts the days left in the week, today included', () => {
    expect(daysLeftInWeek('2026-11-23', '2026-11-23')).toBe(7);
    expect(daysLeftInWeek('2026-11-23', '2026-11-28')).toBe(2);
    expect(daysLeftInWeek('2026-11-23', '2026-11-29')).toBe(1);
    expect(daysLeftInWeek('2026-11-23', '2026-11-30')).toBe(0);
  });
});

describe('goal choices', () => {
  it('offers three reachable minute goals for a new circle, in steps of 30', () => {
    expect(togetherGoalChoices('minutes', 4)).toEqual([360, 480, 600]);
    for (const x of togetherGoalChoices('minutes', 2)) expect(x % 30).toBe(0);
  });

  it('builds on last week’s total when there is one', () => {
    expect(togetherGoalChoices('minutes', 3, 400)).toEqual([330, 390, 450]);
    expect(togetherGoalChoices('days', 3, 12)).toEqual([10, 12, 14]);
  });

  it('stays within what the server accepts', () => {
    const { minutes, days } = TOGETHER_RULES.target;
    for (const n of [1, 2, 6, 9]) {
      for (const x of togetherGoalChoices('minutes', n)) expect(x).toBeGreaterThanOrEqual(minutes.min);
      for (const x of togetherGoalChoices('days', n, 1)) expect(x).toBeGreaterThanOrEqual(days.min);
      for (const x of togetherGoalChoices('minutes', n, 99999)) expect(x).toBeLessThanOrEqual(minutes.max);
    }
    expect(togetherGoalChoices('days', 2, 1)).toHaveLength(3);
  });
});

describe('buddies and notes', () => {
  it('draws a day full when both logged, half when one did', () => {
    expect([2, 1, 0, null].map((c) => buddyCup(c as 0 | 1 | 2 | null))).toEqual(['full', 'half', 'empty', 'none']);
    expect(buddyDaysTogether([{ day: '2026-11-23', count: 2 }, { day: '2026-11-24', count: 1 }, { day: '2026-11-25', count: 2 }])).toBe(2);
  });

  it('offers three preset notes and nothing else', () => {
    expect(NOTE_KINDS).toEqual(['thinking_of_you', 'walk_later', 'nice_week']);
  });
});

describe('Show to friends on a saved meal', () => {
  const me = { mealsAllowed: true };
  const friends = [{ shareMeals: true }];
  it('is offered with friends on, 18 or over, a friend to pick and a server that has it', () => {
    expect(canShowSaved({ me, friends })).toBe(true);
    expect(canShowSaved({ me, friends, togetherAvailable: true, mealsAvailable: true })).toBe(true);
  });
  it('hides calmly otherwise', () => {
    expect(canShowSaved(null)).toBe(false);
    expect(canShowSaved({ me: null, friends })).toBe(false);
    expect(canShowSaved({ me: { mealsAllowed: false }, friends })).toBe(false);
    expect(canShowSaved({ me, friends: [{ shareMeals: false }] })).toBe(false);
    expect(canShowSaved({ me, friends, togetherAvailable: false })).toBe(false);
    expect(canShowSaved({ me, friends, mealsAvailable: false })).toBe(false);
  });
});
