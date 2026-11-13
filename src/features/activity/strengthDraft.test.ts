import { describe, expect, it } from 'vitest';

import type { ActivityEntry } from '@/types';

import { draftFromEntry, draftHasContent, draftOnOpen, edits, newDraft, restRemainingMs } from './strengthDraft';

const entry = {
  id: 'w1',
  updatedAt: '2026-11-10T19:00:00.000Z',
  date: '2026-11-10',
  activityId: 'strength_training',
  name: 'Strength training',
  emoji: '🏋️',
  category: 'strength',
  intensity: 'moderate',
  durationMin: 50,
  met: 5,
  kcalGross: 300,
  kcalNet: 220,
  loggedAt: '2026-11-10T19:00:00.000Z',
  exercises: [{ name: 'Bench press', sets: [{ reps: 5, weightKg: 80, done: true }] }],
} as ActivityEntry;

describe('draftOnOpen for a new workout (review activity-trackers-1)', () => {
  it('replaces an empty leftover draft with one on the requested day', () => {
    const stale = newDraft('2026-11-09');
    expect(draftOnOpen(stale, { date: '2026-11-12' })).toEqual(newDraft('2026-11-12'));
    expect(draftOnOpen(undefined, { date: '2026-11-12' })?.date).toBe('2026-11-12');
  });
  it('keeps a draft that has exercises, time, a typed duration or notes', () => {
    const withEx = edits.addExercise(newDraft('2026-11-09'), 'Squat');
    expect(draftOnOpen(withEx, { date: '2026-11-12' })).toBeNull();
    expect(draftOnOpen({ ...newDraft('2026-11-09'), manualMin: 20 }, { date: '2026-11-12' })).toBeNull();
    expect(draftOnOpen({ ...newDraft('2026-11-09'), notes: 'legs' }, { date: '2026-11-12' })).toBeNull();
    expect(draftHasContent({ ...newDraft('2026-11-09'), notes: '  ' })).toBe(false);
  });
});

describe('draftOnOpen for an edit (review activity-trackers-4)', () => {
  it('builds a draft from the entry when none is stored', () => {
    const d = draftOnOpen(undefined, { entry, date: '2026-11-13' })!;
    expect(d.entryId).toBe('w1');
    expect(d.baseUpdatedAt).toBe(entry.updatedAt);
    expect(d.manualMin).toBe(50);
  });
  it('keeps unsaved edits made from the current version of the entry', () => {
    const d = { ...draftFromEntry(entry), notes: 'unsaved' };
    expect(draftOnOpen(d, { entry, date: '2026-11-13' })).toBeNull();
  });
  it('rebuilds a draft made from an older version of the entry', () => {
    const old = { ...draftFromEntry(entry), notes: 'stale' };
    const newer = { ...entry, updatedAt: '2026-11-11T08:00:00.000Z', durationMin: 60 } as ActivityEntry;
    const d = draftOnOpen(old, { entry: newer, date: '2026-11-13' })!;
    expect(d.manualMin).toBe(60);
    expect(d.notes).toBe('');
    // Drafts saved before baseUpdatedAt existed are rebuilt too.
    const legacy = { ...draftFromEntry(entry) };
    delete legacy.baseUpdatedAt;
    expect(draftOnOpen(legacy, { entry, date: '2026-11-13' })).not.toBeNull();
  });
});

describe('rest between sets', () => {
  const d0 = newDraft('2026-11-13');
  it('starts, adjusts and skips a rest', () => {
    const d = edits.startRest(d0, 'Bench press', 90, 1_000);
    expect(d.restEndsAt).toBe(91_000);
    expect(restRemainingMs(d, 31_000)).toBe(60_000);
    const longer = edits.adjustRest(d, 15, 31_000);
    expect(longer.restEndsAt).toBe(106_000);
    expect(longer.restTotalSec).toBe(105);
    const shorter = edits.adjustRest(d, -15, 85_000);
    expect(restRemainingMs(shorter, 85_000)).toBe(0);
    expect(edits.skipRest(d).restEndsAt).toBeNull();
  });
  it('keeps rest lengths within 15 s and 10 min and ignores adjustments after it ended', () => {
    expect(edits.startRest(d0, 'Row', 3, 0).restTotalSec).toBe(15);
    expect(edits.startRest(d0, 'Row', 5000, 0).restTotalSec).toBe(600);
    const ended = edits.startRest(d0, 'Row', 60, 0);
    expect(edits.adjustRest(ended, 15, 61_000)).toBe(ended);
  });
});
