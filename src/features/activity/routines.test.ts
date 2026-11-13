import { beforeEach, describe, expect, it } from 'vitest';

import type { ActivityEntry } from '@/types';

import { useStore } from '@/store';

import { addRoutine, draftFromRoutine, lastWorkoutTemplate, listRoutines, removeRoutine, restoreRoutine, routineExercises, routineSetCount, startRoutineDraft, uniqueRoutineName } from './routines';
import { draftHasContent, newDraft } from './strengthDraft';

const lift = (id: string, date: string, loggedAt: string, names: string[], extra: Partial<ActivityEntry> = {}) =>
  ({
    id,
    updatedAt: loggedAt,
    date,
    loggedAt,
    activityId: 'strength_training',
    name: 'Strength training',
    emoji: '🏋️',
    category: 'strength',
    intensity: 'moderate',
    durationMin: 45,
    met: 5,
    kcalGross: 300,
    kcalNet: 200,
    exercises: names.map((n) => ({ name: n, sets: [{ reps: 5, weightKg: 80 }, { reps: 5, weightKg: 80 }, { reps: 0, weightKg: 0 }] })),
    ...extra,
  }) as ActivityEntry;

describe('lastWorkoutTemplate', () => {
  it('uses the newest session with exercises, by day then time logged', () => {
    const t = lastWorkoutTemplate([
      lift('a', '2026-11-08', '2026-11-08T10:00:00Z', ['Back squat']),
      lift('b', '2026-11-10', '2026-11-10T08:00:00Z', ['Bench press', 'Barbell row']),
      lift('c', '2026-11-10', '2026-11-10T07:00:00Z', ['Deadlift']),
      lift('d', '2026-11-12', '2026-11-12T07:00:00Z', ['Plank'], { deleted: true }),
      lift('e', '2026-11-13', '2026-11-13T07:00:00Z', [], { exercises: undefined }),
    ])!;
    expect(t.date).toBe('2026-11-10');
    expect(t.exercises).toEqual([
      { name: 'Bench press', sets: 2 },
      { name: 'Barbell row', sets: 2 },
    ]);
  });
  it('returns null with no strength history', () => {
    expect(lastWorkoutTemplate([])).toBeNull();
  });
});

describe('routineExercises', () => {
  it('counts sets with reps, keeps at least one set and drops blank names', () => {
    expect(routineExercises([{ name: ' Dip ', sets: [{ reps: 0, weightKg: 0 }] }, { name: '', sets: [{ reps: 5, weightKg: 0 }] }])).toEqual([{ name: 'Dip', sets: 1 }]);
    expect(routineSetCount({ exercises: [{ name: 'A', sets: 3 }, { name: 'B', sets: 4 }] })).toBe(7);
  });
});

describe('starting a routine', () => {
  const tpl = { exercises: [{ name: 'Bench press', sets: 3 }, { name: 'Barbell row', sets: 2 }] };
  it('creates empty sets so last numbers show as placeholders, and starts the clock', () => {
    const d = startRoutineDraft(tpl, '2026-11-13', 1000);
    expect(d.date).toBe('2026-11-13');
    expect(d.startedAt).toBe(1000);
    expect(d.exercises.map((e) => [e.name, e.sets.length])).toEqual([['Bench press', 3], ['Barbell row', 2]]);
    expect(d.exercises[0].sets.every((s) => s.weightKg === null && s.reps === null && !s.done)).toBe(true);
    expect(draftHasContent(d)).toBe(true);
  });
  it('keeps the date and a typed duration of the draft it fills', () => {
    const d = draftFromRoutine(tpl, { ...newDraft('2026-11-10'), manualMin: 40 }, 1000);
    expect(d.date).toBe('2026-11-10');
    expect(d.startedAt).toBeNull();
    expect(d.manualMin).toBe(40);
  });
});

describe('routine store', () => {
  beforeEach(() => useStore.getState().resetAll());
  it('names routines uniquely, keeps them in the synced store, and undoes a removal', async () => {
    expect(uniqueRoutineName('Push day', ['push day', 'Push day 2'])).toBe('Push day 3');
    const a = addRoutine('Push day', [{ name: 'Bench press', sets: 3 }]);
    await new Promise((r) => setTimeout(r, 2));
    addRoutine('Push day', [{ name: 'Dip', sets: 3 }]);
    await new Promise((r) => setTimeout(r, 2));
    addRoutine('Legs', [{ name: 'Back squat', sets: 5 }]);
    expect(listRoutines().map((r) => r.name)).toEqual(['Push day', 'Push day 2', 'Legs']);
    // Saved in the synced collection and queued for upload.
    expect(useStore.getState().dirty.routines[a.id]).toBe(true);

    const removed = removeRoutine(a.id)!;
    expect(listRoutines()).toHaveLength(2);
    restoreRoutine(removed.id);
    restoreRoutine(removed.id);
    expect(listRoutines().map((r) => r.name)).toEqual(['Push day', 'Push day 2', 'Legs']);
    expect(removeRoutine('unknown')).toBeUndefined();
  });
});
