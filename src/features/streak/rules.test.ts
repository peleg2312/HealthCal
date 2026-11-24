import { describe, expect, it } from 'vitest';

import { dueMilestone, justExtended, milestoneFor, milestoneKey, pourIndex, streakLine } from './rules';

describe('justExtended', () => {
  it('is the day’s first entry adding to the streak', () => {
    expect(justExtended({ streak: 11, loggedToday: false }, { streak: 12, loggedToday: true })).toBe(true);
  });
  it('is not a second entry on the same day', () => {
    expect(justExtended({ streak: 12, loggedToday: true }, { streak: 12, loggedToday: true })).toBe(false);
  });
  it('is not a first day ever', () => {
    expect(justExtended({ streak: 0, loggedToday: false }, { streak: 1, loggedToday: true })).toBe(false);
  });
  it('is not an Undo that takes today back out', () => {
    expect(justExtended({ streak: 12, loggedToday: true }, { streak: 11, loggedToday: false })).toBe(false);
  });
});

describe('milestones', () => {
  it('are 7, 30 and 100 exactly', () => {
    expect(milestoneFor(7)).toBe(7);
    expect(milestoneFor(30)).toBe(30);
    expect(milestoneFor(100)).toBe(100);
    expect(milestoneFor(8)).toBeNull();
    expect(milestoneFor(14)).toBeNull();
  });
  it('are due on the day they are reached, once on this device', () => {
    const today = '2026-11-14';
    expect(dueMilestone({ streak: 7, loggedToday: true }, today, [])).toBe(7);
    expect(dueMilestone({ streak: 7, loggedToday: true }, today, [milestoneKey(7, today)])).toBeNull();
    // Today not logged yet: the 7 is yesterday's count, already past.
    expect(dueMilestone({ streak: 7, loggedToday: false }, today, [])).toBeNull();
    expect(dueMilestone({ streak: 8, loggedToday: true }, today, [])).toBeNull();
    // A new run reaching 7 again on another day is a new moment.
    expect(dueMilestone({ streak: 7, loggedToday: true }, today, [milestoneKey(7, '2026-09-01')])).toBe(7);
  });
});

describe('copy and pacing', () => {
  it('says the streak forgives', () => {
    expect(streakLine(12)).toBe('12 days. A day without a log will not break it.');
  });
  it('keeps a long row to about 25 steps', () => {
    expect(pourIndex(3, 7)).toBe(3);
    expect(pourIndex(0, 100)).toBe(0);
    expect(pourIndex(99, 100)).toBe(24);
    expect(pourIndex(50, 100)).toBe(12);
  });
});
