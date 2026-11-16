/**
 * State of one import (Garmin files or the Health app's export), from picked
 * files to saved entries. Held in a small zustand store (not persisted: the
 * bytes stay in memory only) so the async reading steps and the sheets share
 * it without prop drilling.
 *
 * Nothing is saved until the person taps Import (or Save steps): a Health
 * export's steps wait with its workouts, go in with them, and Undo takes both
 * out. Leaving the screen while a file is read stops the read (`leaveImport`):
 * a read that was left or started over never writes into the session again.
 */
import { create } from 'zustand';

import { exportWorkouts } from '@/features/health-sync/exportFile';
import { findHealthExport, readHealthExport, type ExportRead } from '@/features/health-sync/exportRead';
import { mergeFileSteps, type FileSteps } from '@/features/health-sync/steps';
import { useHealthSync, whenLoaded } from '@/features/health-sync/store';
import { today } from '@/lib/dates';
import { bmr, formulaTdee } from '@/lib/energy';
import { useStore } from '@/store';
import type { ActivityEntry, Intensity } from '@/types';
import { haptic, toast } from '@/ui';

import type { ConvertContext, ImportedEntry } from '../convert';
import { chooseActivity, entriesToSave, prepareImport, replaceHandLoggedPlan, setSelected, type ImportCandidate } from '../plan';
import { HealthExportError } from '../appleExport';
import { readImportFile, type ImportBatch } from '../read';
import { plural, warn, type ReadOptions } from '../types';
import { StreamCancelled } from '../zip';

import { isTickable, shiftDays, topFile, workouts as workoutsLabel } from './format';
import { readAll as readAllBytes, type PickedFile } from './pickFiles';

export type Phase = 'start' | 'reading' | 'questions' | 'review' | 'done';

export interface Answers {
  /** Distance unit of the Activities CSV. */
  distanceUnit: 'km' | 'mi';
  /** IANA zone the CSV's times are in; null = this device's zone. */
  csvTimeZone: string | null;
  /** Zone for FIT files whose clock was never set; null = this device's zone. */
  fitTimeZone: string | null;
  /** Effort used to estimate files without calories (GPX); null = from the pace where the activity has speed bands, else moderate. */
  estimateIntensity: Intensity | null;
}

export interface ImportResult {
  entries: ImportedEntry[];
  /** The stored versions of workouts this import updated, as they were before (Undo puts them back). */
  previous: ActivityEntry[];
  /** Steps from a Health export saved with this import: how many days, and what the phone kept before (Undo puts it back). */
  steps: { days: number; before: FileSteps | null } | null;
  undone: boolean;
}

interface ImportSession {
  phase: Phase;
  files: PickedFile[];
  /** Files that could not even be opened. */
  failed: { name: string; message: string }[];
  /** Which file is being read; `share` (0 to 1) for a large Health export read piece by piece. */
  progress: { index: number; total: number; name: string; share?: number } | null;
  /** What was read from a Health export, by picked file name, so answering the CSV questions does not read it again. */
  exports: Record<string, ExportRead>;
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
  exports: {},
  answers: { distanceUnit, csvTimeZone: null, fitTimeZone: null, estimateIntensity: null },
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
function context(): ConvertContext & { bmrKcalPerDay?: number } {
  const profile = useStore.getState().profile;
  return {
    weightKg: profile?.weightKg ?? 70,
    baselineKcalPerDay: profile ? formulaTdee(profile) : 2000,
    estimateIntensity: get().answers.estimateIntensity,
    // The resting rate an Apple Health workout's active energy is measured above (health-sync/energy.ts), as for a synced one.
    ...(profile ? { bmrKcalPerDay: bmr(profile).kcal } : null),
  };
}

/** Every saved activity, soft-deleted ones included, so a deleted import is still recognised. */
const existing = (): ActivityEntry[] => Object.values(useStore.getState().activities);

const nextFrame = () => new Promise<void>((resolve) => setTimeout(resolve, 30));

/**
 * Which read is the current one. Every start, start-over and leaving the
 * screen moves it on; a read checks it after every wait, and one that is no
 * longer current stops (between two pieces of a Health export) and writes nothing.
 */
let run = 0;
/** The Cancel button was tapped during the current read. */
let cancelRequested = false;

/** A read that is no longer the current one (the screen was left, or files were picked again). */
class Superseded extends Error {}

const stillCurrent = (mine: number) => {
  if (mine !== run) throw new Superseded();
};

/** Start over, with the CSV unit defaulting to the app's own unit setting. Any read under way stops and is dropped. */
export function resetImport() {
  run += 1;
  cancelRequested = false;
  const units = useStore.getState().profile?.units;
  set(initial(units === 'imperial' ? 'mi' : 'km'), true);
}

/** The screen closed (X, back, or another screen took its place): stop any read, keep nothing it read. */
export function leaveImport() {
  resetImport();
}

/** New files were picked: read them, then ask what the files cannot say, or go straight to review. */
export async function startWithFiles(files: PickedFile[], failed: PickResultFailed) {
  const mine = ++run;
  cancelRequested = false;
  set({ files, failed, dayShift: {}, result: null, exports: {} });
  try {
    await readAll(false, mine);
  } catch (e) {
    // Left or started over: the session belongs to someone else now; nothing to say or undo.
    if (e instanceof Superseded || mine !== run) return;
    if (e instanceof StreamCancelled) {
      // Nothing was saved: reading stops, and the screen is back where it started.
      resetImport();
      toast('Reading stopped. Nothing was changed');
      return;
    }
    throw e;
  }
  if (mine !== run) return;
  const s = get();
  set({ phase: s.csvFiles.length > 0 || s.systemTimeFiles.length > 0 ? 'questions' : 'review' });
}
type PickResultFailed = { name: string; message: string }[];

/** The questions were answered: read again with the answers and show the list. */
export async function confirmAnswers() {
  const mine = run;
  try {
    await readAll(false, mine);
  } catch (e) {
    if (e instanceof Superseded) return;
    throw e;
  }
  if (mine === run) set({ phase: 'review' });
}

export function setAnswers(patch: Partial<Answers>) {
  const before = get().answers;
  set({ answers: { ...before, ...patch } });
  // A new zone moves the starts shown on the questions screen, so read again straight away (small files: milliseconds).
  if (get().phase === 'questions' && (('fitTimeZone' in patch && patch.fitTimeZone !== before.fitTimeZone) || ('csvTimeZone' in patch && patch.csvTimeZone !== before.csvTimeZone))) {
    const mine = run;
    readAll(true, mine).catch((e) => {
      if (!(e instanceof Superseded)) throw e;
    });
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
async function readAll(quiet: boolean, mine: number) {
  const { files, answers } = get();
  if (!quiet) set({ phase: 'reading' });
  const batches: ImportSession['batches'] = [];
  for (let i = 0; i < files.length; i += 1) {
    set({ progress: { index: i, total: files.length, name: files[i].name } });
    await nextFrame();
    stillCurrent(mine);
    const exported = await readExport(files[i], i, files.length, mine);
    stillCurrent(mine);
    if (exported) {
      batches.push({ name: files[i].name, batch: exported });
      continue;
    }
    let bytes: Uint8Array;
    try {
      bytes = await readAllBytes(files[i].source);
    } catch {
      stillCurrent(mine);
      batches.push({ name: files[i].name, batch: { workouts: [], warnings: [], errors: [{ file: files[i].name, code: 'empty', message: 'This file could not be opened. Try saving it to the device first, then choose it again.' }], files: [{ file: files[i].name, format: null }] } });
      continue;
    }
    stillCurrent(mine);
    batches.push({ name: files[i].name, batch: readImportFile(bytes, files[i].name, readOptions(answers)) });
  }
  stillCurrent(mine);
  const csvFiles = batches.filter((b) => b.batch.files.some((f) => f.format === 'csv') || b.batch.errors.some((e) => e.code === 'csv-options-needed')).map((b) => b.name);
  const systemTimeFiles = batches.filter((b) => b.batch.warnings.some((w) => w.code === 'fit-system-time')).map((b) => b.name);
  set({ batches, csvFiles, systemTimeFiles, progress: null });
  rebuild();
}

/** Stop reading a Health export (between two pieces of it). Nothing read so far is kept. */
export function cancelImport() {
  cancelRequested = true;
}

/** A frame for the screen between pieces, so the page never freezes. */
const breathe = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

const APPLE_DAMAGED = 'This Health export is damaged or incomplete and cannot be read. Export it again from the Health app.';

/**
 * A Health export (export.zip or export.xml), read piece by piece with its
 * progress shown; null when the file is not one (it is then read as before).
 * Its workouts go to the review list like any other file's; its steps wait in
 * `exports` and are saved with the import (`commitImport`). A ZIP cut short is
 * reported here, from its end, and never read whole.
 */
async function readExport(file: PickedFile, index: number, total: number, mine: number): Promise<ImportBatch | null> {
  const name = file.name;
  let read = get().exports[name];
  if (!read) {
    let found;
    try {
      found = await findHealthExport(file.source);
    } catch {
      return null;
    }
    stillCurrent(mine);
    if (!found) return null;
    if (found.kind === 'cut-zip') {
      return found.apple
        ? { workouts: [], warnings: [], errors: [{ file: name, code: 'apple-damaged', message: APPLE_DAMAGED }], files: [{ file: name, format: 'apple' }] }
        : { workouts: [], warnings: [], errors: [{ file: name, code: 'not-zip', message: 'This ZIP file is cut short and cannot be opened. Download or copy it again.' }], files: [{ file: name, format: 'zip' }] };
    }
    try {
      let shown = -1;
      read = await readHealthExport(file.source, found, {
        now: Date.now(),
        onProgress: (share) => {
          // Whole percents only: the screen redraws a hundred times at most.
          const pct = Math.floor(share * 100);
          if (pct !== shown) {
            shown = pct;
            set({ progress: { index, total, name, share } });
          }
        },
        cancelled: () => cancelRequested || mine !== run,
        // 128 KB of the archive inflates to about 1 to 4 MB of XML: scanned in well under a frame's worth of a long task.
        chunkSize: 128 * 1024,
        yieldEvery: breathe,
      });
    } catch (e) {
      if (e instanceof StreamCancelled) {
        if (mine !== run) throw new Superseded();
        throw e;
      }
      stillCurrent(mine);
      const message = e instanceof HealthExportError ? 'This file is not an export from the Health app.' : APPLE_DAMAGED;
      return { workouts: [], warnings: [], errors: [{ file: name, code: 'apple-damaged', message }], files: [{ file: name, format: 'apple' }] };
    }
    stillCurrent(mine);
    // The phone's step memory is loaded now, so saving with the import (a tap later) is immediate.
    if (read.steps) await whenLoaded();
    stillCurrent(mine);
    set({ exports: { ...get().exports, [name]: read } });
  }
  const { workouts, leftOut } = exportWorkouts(read.workouts, name, context());
  const warnings = [];
  if (read.steps) {
    const n = Object.keys(read.steps.days).length;
    warnings.push(warn('apple-steps', `Steps for ${plural(n, 'day', 'days')} are saved on this phone with the import. They show on Train and are never added to your calories.`, name));
  }
  if (leftOut.otherSource) warnings.push(warn('apple-merged', `${plural(leftOut.otherSource, 'workout was', 'workouts were')} recorded by two sources and ${leftOut.otherSource === 1 ? 'is' : 'are'} listed once.`, name));
  if (leftOut.notExercise) warnings.push(warn('apple-not-exercise', `${plural(leftOut.notExercise, 'rest or transition was', 'rests or transitions were')} left out.`, name));
  return { workouts, warnings, errors: [], files: [{ file: name, format: 'apple' }] };
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
  set({ rows: get().rows.map((r) => ({ ...r, selected: on ? (r.status === 'new' || (r.status === 'update' && !r.edited)) && isTickable(r) : false })) });
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
    if (r && (r.status === 'new' || (r.status === 'update' && !r.edited)) && r.entry && !r.selected) next = setSelected(next, k, true);
  }
  set({ rows: next });
}

/** Change the effort used for estimates (files without calories) and rebuild those entries. */
export function setEstimateIntensity(intensity: Intensity | null) {
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

/**
 * Bring back workouts imported before and then deleted. The workout comes back
 * with the numbers of the row being shown (the file just read), keeping its
 * id, day and the person's note; a row without an activity restores as it was.
 */
export function restoreDeleted(keys: string[]) {
  const s = useStore.getState();
  const restored: { before: ActivityEntry }[] = [];
  for (const r of get().rows) {
    if (!keys.includes(r.key) || !r.match?.deleted) continue;
    restored.push({ before: r.match });
    if (r.entry && r.entry.id === r.match.id) s.upsert('activities', r.entry);
    else s.restore('activities', r.match.id);
  }
  if (!restored.length) return;
  rebuild();
  haptic.success();
  toast(`${workoutsLabel(restored.length)} restored`, {
    label: 'Undo',
    onPress: () => {
      // Put back exactly what was there: the old values, still deleted.
      useStore.getState().upsertMany('activities', restored.map((x) => x.before));
      for (const x of restored) useStore.getState().remove('activities', x.before.id);
      rebuild();
    },
  });
}

/**
 * Replace a session logged by hand with the imported workout it duplicates:
 * the device's measured numbers win. Undo brings the hand log back and takes
 * the import out again.
 */
export function replaceHandLogged(key: string) {
  const row = get().rows.find((r) => r.key === key);
  const plan = row ? replaceHandLoggedPlan(row) : null;
  if (!plan) return;
  const store = useStore.getState();
  const before = store.activities[plan.save.id];
  store.upsert('activities', plan.save);
  store.remove('activities', plan.remove.id);
  rebuild();
  haptic.success();
  toast(`Replaced your hand-logged ${plan.remove.name.toLowerCase()}`, {
    label: 'Undo',
    onPress: () => {
      const st = useStore.getState();
      st.restore('activities', plan.remove.id);
      if (before) {
        st.upsert('activities', before);
        if (before.deleted) st.remove('activities', before.id);
      } else st.remove('activities', plan.save.id);
      rebuild();
    },
  });
}

/** The steps the Health exports read in this visit hold, oldest file first (null when none). Pure. */
export function stepsToSave(exports: Record<string, ExportRead>): (FileSteps & { fromDay: string })[] {
  return Object.values(exports)
    .map((r) => r.steps)
    .filter((x): x is NonNullable<ExportRead['steps']> => x !== null)
    .sort((a, b) => (a.asOf < b.asOf ? -1 : a.asOf > b.asOf ? 1 : 0));
}

/** How many days of steps the import would save (every file's days together). Pure. */
export function stepDayCount(exports: Record<string, ExportRead>): number {
  const days = new Set<string>();
  for (const s of stepsToSave(exports)) for (const d of Object.keys(s.days)) days.add(d);
  return days.size;
}

/**
 * Save the ticked workouts, and the steps of any Health export read. Undo
 * removes exactly what was added, puts updated workouts back as they were and
 * puts the phone's steps back as they were before.
 */
export function commitImport() {
  const rows = get().rows;
  const entries = entriesToSave(rows);
  const files = stepsToSave(get().exports);
  if (!entries.length && !files.length) return;
  const stored = useStore.getState().activities;
  const previous = entries.map((e) => stored[e.id]).filter((e): e is ActivityEntry => !!e && !e.deleted);
  if (entries.length) useStore.getState().upsertMany('activities', entries);
  let steps: ImportResult['steps'] = null;
  if (files.length) {
    const before = useHealthSync.getState().fileSteps;
    let kept = before;
    const day = today();
    for (const f of files) kept = mergeFileSteps(kept, f, day);
    useHealthSync.setState({ fileSteps: kept });
    steps = { days: stepDayCount(get().exports), before };
  }
  haptic.success();
  const result: ImportResult = { entries, previous, steps, undone: false };
  set({ phase: 'done', result });
  const updated = previous.length;
  const added = entries.length - updated;
  const message = [added ? `${workoutsLabel(added)} imported` : '', updated ? `${workoutsLabel(updated)} updated` : '', !entries.length && steps ? 'Steps saved' : ''].filter(Boolean).join(', ');
  toast(message, { label: 'Undo', onPress: () => undoImport(result) });
}

export function undoImport(result: ImportResult) {
  const store = useStore.getState();
  const back = new Set(result.previous.map((e) => e.id));
  if (result.previous.length) store.upsertMany('activities', result.previous);
  for (const e of result.entries) if (!back.has(e.id)) store.remove('activities', e.id);
  if (result.steps) useHealthSync.setState({ fileSteps: result.steps.before });
  const r = get().result;
  // Only mark this session's result when it is the import being undone.
  if (r && r.entries === result.entries) set({ result: { ...r, undone: true } });
}
