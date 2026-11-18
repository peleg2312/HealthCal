/**
 * Strength routines: a named list of exercises with a set count each, started
 * in one tap. Saved in the synced `routines` collection, so they follow the
 * user to other devices and into backups.
 */
import { useMemo } from 'react';

import { isolateRtl } from '@/lib/bidi';
import { useStore } from '@/store';
import { useLive } from '@/store/selectors';
import type { ActivityEntry, Routine, StrengthExercise } from '@/types';

import { draftKey, newDraft, type StrengthDraft } from './strengthDraft';

export interface RoutineExercise {
  name: string;
  sets: number;
}

export type { Routine };

/** A routine card that has not been saved: the automatic "repeat last workout". */
export interface RoutineTemplate {
  name: string;
  exercises: RoutineExercise[];
  /** Day of the workout it repeats. */
  date?: string;
}

const MAX_SETS = 20;

/** Exercises and set counts from logged sets (sets with no reps are dropped, at least one set each). */
export function routineExercises(exercises: Pick<StrengthExercise, 'name' | 'sets'>[]): RoutineExercise[] {
  const out: RoutineExercise[] = [];
  for (const ex of exercises) {
    const name = ex.name.trim();
    if (!name) continue;
    const sets = ex.sets.filter((s) => (s.reps ?? 0) > 0).length || ex.sets.length;
    if (sets <= 0) continue;
    out.push({ name, sets: Math.min(MAX_SETS, sets) });
  }
  return out;
}

/** The newest logged session with exercises, as a template, or null. */
export function lastWorkoutTemplate(entries: ActivityEntry[]): RoutineTemplate | null {
  let best: ActivityEntry | null = null;
  for (const e of entries) {
    if (e.deleted || !e.exercises?.length) continue;
    if (!best || e.date > best.date || (e.date === best.date && e.loggedAt > best.loggedAt)) best = e;
  }
  if (!best) return null;
  const exercises = routineExercises(best.exercises!);
  return exercises.length ? { name: 'Repeat last workout', exercises, date: best.date } : null;
}

/**
 * A draft holding the routine's exercises with empty sets, so last session's
 * numbers show as placeholders and a tick accepts them. Starting a routine
 * starts the clock.
 */
export function draftFromRoutine(t: Pick<RoutineTemplate, 'exercises'>, base: StrengthDraft, now: number = Date.now()): StrengthDraft {
  return {
    ...base,
    startedAt: base.startedAt ?? (base.accumulatedMs === 0 && base.manualMin === null ? now : null),
    exercises: t.exercises.map((ex) => ({
      key: draftKey(),
      name: ex.name,
      sets: Array.from({ length: Math.max(1, ex.sets) }, () => ({ key: draftKey(), weightKg: null, reps: null, done: false })),
    })),
  };
}

export function startRoutineDraft(t: Pick<RoutineTemplate, 'exercises'>, date: string, now: number = Date.now()): StrengthDraft {
  return draftFromRoutine(t, newDraft(date), now);
}

/**
 * "Bench press, Barbell row, Overhead press" with set counts kept out for a short line. Drawn text
 * only: an exercise named in Hebrew or Arabic is isolated (`isolateRtl`), so the line starts at the
 * left and the commas stay between the names.
 */
export function routineSummary(t: Pick<RoutineTemplate, 'exercises'>): string {
  return t.exercises.map((e) => isolateRtl(e.name)).join(', ');
}

export function routineSetCount(t: Pick<RoutineTemplate, 'exercises'>): number {
  return t.exercises.reduce((n, e) => n + e.sets, 0);
}

/** A name not already taken, case-insensitive ("Push day", "Push day 2"). */
export function uniqueRoutineName(name: string, taken: string[]): string {
  const base = name.trim() || 'Workout';
  const lower = new Set(taken.map((t) => t.trim().toLowerCase()));
  if (!lower.has(base.toLowerCase())) return base;
  let i = 2;
  while (lower.has(`${base} ${i}`.toLowerCase())) i += 1;
  return `${base} ${i}`;
}

const byCreation = (a: Routine, b: Routine) => a.createdAt.localeCompare(b.createdAt);

/** Saved routines, oldest first. */
export function useRoutineList(): Routine[] {
  const routines = useLive('routines');
  return useMemo(() => [...routines].sort(byCreation), [routines]);
}

export function listRoutines(): Routine[] {
  return Object.values(useStore.getState().routines)
    .filter((r) => !r.deleted)
    .sort(byCreation);
}

export function addRoutine(name: string, exercises: RoutineExercise[]): Routine {
  return useStore.getState().upsert('routines', {
    name: uniqueRoutineName(name, listRoutines().map((r) => r.name)),
    exercises,
    createdAt: new Date().toISOString(),
  });
}

/** Remove a routine (it can be brought back with `restoreRoutine`). Returns it, or undefined if unknown. */
export function removeRoutine(id: string): Routine | undefined {
  const found = listRoutines().find((r) => r.id === id);
  if (found) useStore.getState().remove('routines', id);
  return found;
}

export function restoreRoutine(id: string): void {
  useStore.getState().restore('routines', id);
}
