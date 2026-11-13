/**
 * In-progress strength workouts. Kept outside the synced store (a draft is not
 * a record yet) but persisted locally so a workout survives leaving the screen
 * or reloading the app. Key 'new' is the workout being started; an edit of a
 * saved session uses the entry id as key.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { ActivityEntry, Intensity, StrengthExercise } from '@/types';

export interface DraftSet {
  key: string;
  weightKg: number | null;
  reps: number | null;
  done: boolean;
}

export interface DraftExercise {
  key: string;
  name: string;
  sets: DraftSet[];
}

export interface StrengthDraft {
  entryId?: string;
  /** updatedAt of the saved entry this edit started from; a newer entry replaces an untouched draft. */
  baseUpdatedAt?: string;
  date: string;
  intensity: Intensity;
  notes: string;
  exercises: DraftExercise[];
  /** Epoch ms when the timer was last started; null while paused. */
  startedAt: number | null;
  /** Time accumulated before the last start. */
  accumulatedMs: number;
  /** Duration typed by the user; wins over the timer when set. */
  manualMin: number | null;
  /** Epoch ms when the current rest between sets ends; null or absent when not resting. */
  restEndsAt?: number | null;
  /** Length of the current rest, seconds (what -15 s / +15 s change). */
  restTotalSec?: number;
  /** Exercise the current rest follows. */
  restExercise?: string;
}

export const DEFAULT_REST_SEC = 90;
export const MIN_REST_SEC = 15;
export const MAX_REST_SEC = 600;

export function restRemainingMs(d: StrengthDraft, now: number = Date.now()): number {
  return d.restEndsAt ? Math.max(0, d.restEndsAt - now) : 0;
}

let seq = 0;
export const draftKey = () => `${Date.now().toString(36)}-${(seq++).toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

export function newDraft(date: string): StrengthDraft {
  return { date, intensity: 'moderate', notes: '', exercises: [], startedAt: null, accumulatedMs: 0, manualMin: null };
}

export function draftFromEntry(entry: ActivityEntry): StrengthDraft {
  return {
    entryId: entry.id,
    baseUpdatedAt: entry.updatedAt,
    date: entry.date,
    intensity: entry.intensity,
    notes: entry.notes ?? '',
    exercises: (entry.exercises ?? []).map((ex) => ({
      key: draftKey(),
      name: ex.name,
      sets: ex.sets.map((s) => ({ key: draftKey(), weightKg: s.weightKg, reps: s.reps, done: s.done ?? true })),
    })),
    startedAt: null,
    accumulatedMs: 0,
    manualMin: entry.durationMin,
  };
}

export function elapsedMs(d: StrengthDraft, now: number = Date.now()): number {
  return d.accumulatedMs + (d.startedAt ? Math.max(0, now - d.startedAt) : 0);
}

export function draftDurationMin(d: StrengthDraft, now?: number): number {
  if (d.manualMin && d.manualMin > 0) return Math.round(d.manualMin);
  return Math.round(elapsedMs(d, now) / 60000);
}

export function draftToExercises(d: StrengthDraft): StrengthExercise[] {
  return d.exercises.map((ex) => ({
    name: ex.name,
    sets: ex.sets.map((s) => ({ reps: s.reps ?? 0, weightKg: s.weightKg ?? 0, done: s.done })),
  }));
}

export function draftHasContent(d: StrengthDraft | undefined): boolean {
  return !!d && (d.exercises.length > 0 || elapsedMs(d) > 0 || d.manualMin !== null || d.notes.trim().length > 0);
}

/**
 * The draft to show when the workout screen opens, or null to keep the stored
 * one. A new workout reuses the stored draft only while it holds something
 * (otherwise it starts fresh on the requested day, so an empty leftover from
 * an earlier day never decides the date). An edit reuses the stored draft only
 * if it was made from the entry as it is now; if the entry changed since
 * (sync, undo), the draft is rebuilt from the record so stale sets cannot
 * overwrite newer data.
 */
export function draftOnOpen(stored: StrengthDraft | undefined, open: { entry?: ActivityEntry; date: string }): StrengthDraft | null {
  if (open.entry) {
    if (stored && stored.entryId === open.entry.id && stored.baseUpdatedAt === open.entry.updatedAt) return null;
    return draftFromEntry(open.entry);
  }
  if (stored && !stored.entryId && draftHasContent(stored)) return null;
  return newDraft(open.date);
}

interface DraftState {
  drafts: Record<string, StrengthDraft>;
  /** Last rest length per exercise (lower-case name), seconds. */
  restSec: Record<string, number>;
  setRestSec: (exercise: string, sec: number) => void;
  /** Not persisted: which screen visit last decided the draft for each key. */
  openedBy: Record<string, string>;
  /** Put the draft a visit starts from (or keep the stored one) and mark the visit as decided. */
  open: (key: string, visit: string, next: StrengthDraft | null) => void;
  put: (key: string, draft: StrengthDraft) => void;
  update: (key: string, fn: (d: StrengthDraft) => StrengthDraft) => void;
  discard: (key: string) => void;
}

export const useStrengthDrafts = create<DraftState>()(
  persist(
    (set) => ({
      drafts: {},
      restSec: {},
      openedBy: {},
      open: (key, visit, next) =>
        set((s) => ({ drafts: next ? { ...s.drafts, [key]: next } : s.drafts, openedBy: { ...s.openedBy, [key]: visit } })),
      setRestSec: (exercise, sec) => set((s) => ({ restSec: { ...s.restSec, [exercise.trim().toLowerCase()]: sec } })),
      put: (key, draft) => set((s) => ({ drafts: { ...s.drafts, [key]: draft } })),
      update: (key, fn) =>
        set((s) => {
          const d = s.drafts[key];
          if (!d) return {};
          return { drafts: { ...s.drafts, [key]: fn(d) } };
        }),
      discard: (key) =>
        set((s) => {
          const next = { ...s.drafts };
          delete next[key];
          return { drafts: next };
        }),
    }),
    {
      name: 'healthcal-strength-drafts',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ drafts: s.drafts, restSec: s.restSec }),
    },
  ),
);

// ----------------------------------------------------------- draft edits (pure)

export const edits = {
  addExercise: (d: StrengthDraft, name: string, first?: { weightKg: number; reps: number }): StrengthDraft => ({
    ...d,
    // The clock starts with the first exercise of a new workout unless the user already set it.
    startedAt: !d.entryId && d.startedAt === null && d.accumulatedMs === 0 && d.manualMin === null ? Date.now() : d.startedAt,
    exercises: [
      ...d.exercises,
      { key: draftKey(), name, sets: [{ key: draftKey(), weightKg: first?.weightKg ?? null, reps: first?.reps ?? null, done: false }] },
    ],
  }),
  removeExercise: (d: StrengthDraft, exKey: string): StrengthDraft => ({ ...d, exercises: d.exercises.filter((e) => e.key !== exKey) }),
  addSet: (d: StrengthDraft, exKey: string, fallback?: { weightKg: number; reps: number }): StrengthDraft => ({
    ...d,
    exercises: d.exercises.map((e) => {
      if (e.key !== exKey) return e;
      const last = e.sets[e.sets.length - 1];
      return {
        ...e,
        sets: [...e.sets, { key: draftKey(), weightKg: last?.weightKg ?? fallback?.weightKg ?? null, reps: last?.reps ?? fallback?.reps ?? null, done: false }],
      };
    }),
  }),
  updateSet: (d: StrengthDraft, exKey: string, setKey: string, patch: Partial<DraftSet>): StrengthDraft => ({
    ...d,
    exercises: d.exercises.map((e) => (e.key !== exKey ? e : { ...e, sets: e.sets.map((s) => (s.key === setKey ? { ...s, ...patch } : s)) })),
  }),
  removeSet: (d: StrengthDraft, exKey: string, setKey: string): StrengthDraft => ({
    ...d,
    exercises: d.exercises.map((e) => (e.key !== exKey ? e : { ...e, sets: e.sets.filter((s) => s.key !== setKey) })),
  }),
  /** Starting the clock continues from a typed duration, if any. */
  start: (d: StrengthDraft): StrengthDraft =>
    d.startedAt ? d : { ...d, startedAt: Date.now(), accumulatedMs: d.manualMin ? d.manualMin * 60000 : d.accumulatedMs, manualMin: null },
  pause: (d: StrengthDraft): StrengthDraft => (d.startedAt ? { ...d, accumulatedMs: elapsedMs(d), startedAt: null } : d),
  /** Ticking a set starts the rest before the next one. */
  startRest: (d: StrengthDraft, exercise: string, sec: number, now: number = Date.now()): StrengthDraft => {
    const len = clampRest(sec);
    return { ...d, restEndsAt: now + len * 1000, restTotalSec: len, restExercise: exercise };
  },
  /** -15 s / +15 s on a running rest; never below zero left. */
  adjustRest: (d: StrengthDraft, deltaSec: number, now: number = Date.now()): StrengthDraft => {
    if (!d.restEndsAt || d.restEndsAt <= now) return d;
    return { ...d, restEndsAt: Math.max(now, d.restEndsAt + deltaSec * 1000), restTotalSec: clampRest((d.restTotalSec ?? DEFAULT_REST_SEC) + deltaSec) };
  },
  skipRest: (d: StrengthDraft): StrengthDraft => ({ ...d, restEndsAt: null }),
};

function clampRest(sec: number): number {
  return Math.min(MAX_REST_SEC, Math.max(MIN_REST_SEC, Math.round(sec)));
}
