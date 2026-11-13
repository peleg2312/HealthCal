/**
 * Strength routines: a named list of exercises with a set count each, started
 * in one tap. Kept on this device for now (like the drafts), not synced; a
 * synced collection needs a type and a table owned by the lead.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { ActivityEntry, StrengthExercise } from '@/types';

import { draftKey, newDraft, type StrengthDraft } from './strengthDraft';

export interface RoutineExercise {
  name: string;
  sets: number;
}

export interface Routine {
  id: string;
  name: string;
  exercises: RoutineExercise[];
  createdAt: string;
}

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

/** "Bench press, Barbell row, Overhead press" with set counts kept out for a short line. */
export function routineSummary(t: Pick<RoutineTemplate, 'exercises'>): string {
  return t.exercises.map((e) => e.name).join(', ');
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

interface RoutineState {
  routines: Routine[];
  add: (name: string, exercises: RoutineExercise[]) => Routine;
  remove: (id: string) => Routine | undefined;
  /** Put a removed routine back at its old position (undo). */
  restore: (routine: Routine, index: number) => void;
}

export const useRoutines = create<RoutineState>()(
  persist(
    (set, get) => ({
      routines: [],
      add: (name, exercises) => {
        const routine: Routine = {
          id: draftKey(),
          name: uniqueRoutineName(name, get().routines.map((r) => r.name)),
          exercises,
          createdAt: new Date().toISOString(),
        };
        set((s) => ({ routines: [...s.routines, routine] }));
        return routine;
      },
      remove: (id) => {
        const found = get().routines.find((r) => r.id === id);
        set((s) => ({ routines: s.routines.filter((r) => r.id !== id) }));
        return found;
      },
      restore: (routine, index) =>
        set((s) => {
          if (s.routines.some((r) => r.id === routine.id)) return {};
          const next = [...s.routines];
          next.splice(Math.min(index, next.length), 0, routine);
          return { routines: next };
        }),
    }),
    { name: 'healthcal-strength-routines', version: 1, storage: createJSONStorage(() => AsyncStorage) },
  ),
);
