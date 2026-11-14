/**
 * State of one Garmin import, from picked files to saved entries. Held in a
 * small zustand store (not persisted: the bytes stay in memory only) so the
 * async reading steps and the sheets share it without prop drilling.
 */
import { create } from 'zustand';

import { formulaTdee } from '@/lib/energy';
import { useStore } from '@/store';
import type { ActivityEntry, Intensity } from '@/types';
import { haptic, toast } from '@/ui';

import type { ConvertContext, ImportedEntry } from '../convert';
import { chooseActivity, entriesToSave, prepareImport, setSelected, type ImportCandidate } from '../plan';
import { readImportFile, type ImportBatch } from '../read';
import type { ReadOptions } from '../types';

import { isTickable, shiftDays, topFile, workouts as workoutsLabel } from './format';
import type { PickedFile } from './pickFiles';

export type Phase = 'start' | 'reading' | 'questions' | 'review' | 'done';

export interface Answers {
  /** Distance unit of the Activities CSV. */
  distanceUnit: 'km' | 'mi';
  /** IANA zone the CSV's times are in; null = this device's zone. */
  csvTimeZone: string | null;
  /** Zone for FIT files whose clock was never set; null = this device's zone. */
  fitTimeZone: string | null;
  /** Effort used to estimate files without calories (GPX). */
  estimateIntensity: Intensity;
}

export interface ImportResult {
  entries: ImportedEntry[];
  undone: boolean;
}

interface ImportSession {
  phase: Phase;
  files: PickedFile[];
  /** Files that could not even be opened. */
  failed: { name: string; message: string }[];
  progress: { index: number; total: number; name: string } | null;
  answers: Answers;
  /** Whole-day correction per picked file, for FIT files whose clock was never set. */
  dayShift: Record<string, number>;
  batches: { name: string; batch: ImportBatch }[];
  rows: ImportCandidate[];
  /** Picked files that hold an Activities CSV (so the distance and time zone questions apply). */
  csvFiles: string[];
  /** Picked files with a FIT recorded by a watch whose clock was not set. */
  systemTimeFiles: string[];
  result: ImportResult | null;
}

const initial = (distanceUnit: 'km' | 'mi' = 'km'): ImportSession => ({
  phase: 'start',
  files: [],
  failed: [],
  progress: null,
  answers: { distanceUnit, csvTimeZone: null, fitTimeZone: null, estimateIntensity: 'moderate' },
  dayShift: {},
  batches: [],
  rows: [],
  csvFiles: [],
  systemTimeFiles: [],
  result: null,
});

export const useImportSession = create<ImportSession>(() => initial());

const set = useImportSession.setState;
const get = useImportSession.getState;

/** Weight and resting baseline, the same ones a hand-logged session uses (saveActivity). */
function context(): ConvertContext {
  const profile = useStore.getState().profile;
  return {
    weightKg: profile?.weightKg ?? 70,
    baselineKcalPerDay: profile ? formulaTdee(profile) : 2000,
    estimateIntensity: get().answers.estimateIntensity,
  };
}

/** Every saved activity, soft-deleted ones included, so a deleted import is still recognised. */
const existing = (): ActivityEntry[] => Object.values(useStore.getState().activities);

const nextFrame = () => new Promise<void>((resolve) => setTimeout(resolve, 30));

/** Start over, with the CSV unit defaulting to the app's own unit setting. */
export function resetImport() {
  const units = useStore.getState().profile?.units;
  set(initial(units === 'imperial' ? 'mi' : 'km'), true);
}

/** New files were picked: read them, then ask what the files cannot say, or go straight to review. */
export async function startWithFiles(files: PickedFile[], failed: PickResultFailed) {
  set({ files, failed, dayShift: {}, result: null });
  await readAll();
  const s = get();
  set({ phase: s.csvFiles.length > 0 || s.systemTimeFiles.length > 0 ? 'questions' : 'review' });
}
type PickResultFailed = { name: string; message: string }[];

/** The questions were answered: read again with the answers and show the list. */
export async function confirmAnswers() {
  await readAll();
  set({ phase: 'review' });
}

export function setAnswers(patch: Partial<Answers>) {
  const before = get().answers;
  set({ answers: { ...before, ...patch } });
  // A new zone moves the starts shown on the questions screen, so read again straight away (small files: milliseconds).
  if (get().phase === 'questions' && (('fitTimeZone' in patch && patch.fitTimeZone !== before.fitTimeZone) || ('csvTimeZone' in patch && patch.csvTimeZone !== before.csvTimeZone))) {
    void readAll(true);
  }
}

export function setDayShift(file: string, days: number) {
  set({ dayShift: { ...get().dayShift, [file]: days } });
}

function readOptions(a: Answers): ReadOptions {
  return {
    csv: { distanceUnit: a.distanceUnit, timeZone: a.csvTimeZone ?? undefined },
    timeZone: a.fitTimeZone ?? undefined,
  };
}

/**
 * Read every picked file. Reading is synchronous, so the screen gets a frame
 * between files to show which one is being read.
 */
async function readAll(quiet = false) {
  const { files, answers } = get();
  if (!quiet) set({ phase: 'reading' });
  const batches: ImportSession['batches'] = [];
  for (let i = 0; i < files.length; i += 1) {
    set({ progress: { index: i, total: files.length, name: files[i].name } });
    await nextFrame();
    batches.push({ name: files[i].name, batch: readImportFile(files[i].bytes, files[i].name, readOptions(answers)) });
  }
  const csvFiles = batches.filter((b) => b.batch.files.some((f) => f.format === 'csv') || b.batch.errors.some((e) => e.code === 'csv-options-needed')).map((b) => b.name);
  const systemTimeFiles = batches.filter((b) => b.batch.warnings.some((w) => w.code === 'fit-system-time')).map((b) => b.name);
  set({ batches, csvFiles, systemTimeFiles, progress: null });
  rebuild();
}

/** The workouts read, with any day correction applied. Pure: pass the session's batches and shifts. */
export function shiftedWorkouts(batches: ImportSession['batches'], dayShift: Record<string, number>) {
  const picked = batches.map((b) => b.name);
  return batches.flatMap((b) => b.batch.workouts).map((w) => shiftDays(w, dayShift[topFile(w.fileName, picked)] ?? 0));
}

const currentWorkouts = () => shiftedWorkouts(get().batches, get().dayShift);

/** Build the list from scratch (after reading, or after something outside changed, such as a restore). */
function rebuild() {
  set({ rows: prepareImport(currentWorkouts(), existing(), context()) });
}

export function toggleRow(key: string) {
  const row = get().rows.find((r) => r.key === key);
  if (!row || !isTickable(row)) return;
  set({ rows: setSelected(get().rows, key, !row.selected) });
}

/** Tick every new workout that has an activity, or untick everything. */
export function selectAll(on: boolean) {
  set({ rows: get().rows.map((r) => ({ ...r, selected: on ? r.status === 'new' && isTickable(r) : false })) });
}

/**
 * The person picked an activity for one row, or for every row Garmin gave the
 * same unknown sport. One chooseActivity call rebuilds every row from its
 * current activity, so the other picks are set first and rebuilt together.
 */
export function pickActivity(key: string, activityId: string, alsoKeys: string[] = []) {
  const { rows } = get();
  const others = new Set(alsoKeys.filter((k) => k !== key));
  const staged = others.size ? rows.map((r) => (others.has(r.key) ? { ...r, activityId } : r)) : rows;
  let next = chooseActivity(staged, key, activityId, existing(), context());
  // Rows given an activity in bulk become ticked when they are new (chooseActivity ticks only `key`).
  for (const k of others) {
    const r = next.find((x) => x.key === k);
    if (r && r.status === 'new' && r.entry && !r.selected) next = setSelected(next, k, true);
  }
  set({ rows: next });
}

/** Change the effort used for estimates (files without calories) and rebuild those entries. */
export function setEstimateIntensity(intensity: Intensity) {
  setAnswers({ estimateIntensity: intensity });
  const { rows } = get();
  const any = rows.find((r) => r.activityId !== null);
  if (!any) return;
  // chooseActivity rebuilds every row with the new context and keeps the ticks.
  const keep = new Map(rows.map((r) => [r.key, r.selected]));
  let next = chooseActivity(rows, any.key, any.activityId!, existing(), context());
  next = next.map((r) => (r.key === any.key ? { ...r, selected: keep.get(r.key) === true && isTickable(r) } : r));
  set({ rows: next });
}

/** Bring back workouts imported before and then deleted. */
export function restoreDeleted(keys: string[]) {
  const s = useStore.getState();
  let n = 0;
  for (const r of get().rows) {
    if (keys.includes(r.key) && r.match?.deleted) {
      s.restore('activities', r.match.id);
      n += 1;
    }
  }
  if (!n) return;
  rebuild();
  haptic.success();
  toast(`${workoutsLabel(n)} restored`, {
    label: 'Undo',
    onPress: () => {
      for (const r of get().rows) if (keys.includes(r.key) && r.match) useStore.getState().remove('activities', r.match.id);
      rebuild();
    },
  });
}

/** Save the ticked workouts. Undo removes exactly what was added. */
export function commitImport() {
  const entries = entriesToSave(get().rows);
  if (!entries.length) return;
  useStore.getState().upsertMany('activities', entries);
  haptic.success();
  set({ phase: 'done', result: { entries, undone: false } });
  toast(`${workoutsLabel(entries.length)} imported`, { label: 'Undo', onPress: () => undoImport(entries) });
}

export function undoImport(entries: ImportedEntry[]) {
  const store = useStore.getState();
  for (const e of entries) store.remove('activities', e.id);
  const r = get().result;
  // Only mark this session's result when it is the import being undone.
  if (r && r.entries === entries) set({ result: { ...r, undone: true } });
}
