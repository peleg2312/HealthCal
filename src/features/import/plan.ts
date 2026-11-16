/**
 * The list the import screen shows: every workout read, the app activity it
 * matches, the entry it would save, and whether it is a duplicate. Pure, so
 * the screen holds it in state and calls back here when the person changes a row.
 */
import { ACTIVITY_BY_ID } from '@/data/activities';
import { formatDayLabel } from '@/lib/dates';
import type { ActivityEntry } from '@/types';

import { toActivityEntry, type ConvertContext, type ImportedEntry } from './convert';
import { checkDuplicates, correctedDay, gainsText, type ImportStatus, type UpdateGain } from './dedupe';
import { suggestActivity, type SportMatch } from './sports';
import type { ImportedWorkout } from './types';

export interface ImportCandidate {
  /** Stable key for list rows: '<file>#<index>'. */
  key: string;
  workout: ImportedWorkout;
  /** What the sport mapping suggested. */
  suggestion: SportMatch;
  /** The activity the entry uses: the suggestion, or what the person picked. Null means the screen must ask. */
  activityId: string | null;
  /** The entry that would be saved; null until there is an activity. */
  entry: ImportedEntry | null;
  status: ImportStatus;
  /** Why it is not 'new', in plain words. */
  reason: string | null;
  /** The saved entry it matched, if any (may be soft-deleted). */
  match: ActivityEntry | null;
  /** For an update, or a deleted workout this file would restore richer: what this reading adds. */
  adds: UpdateGain[];
  /** For an update: the person changed the stored workout after importing it, so the update is not ticked by default. */
  edited: boolean;
  /** Key of the candidate in this import that it duplicates or overlaps. */
  sameAsKey: string | null;
  /** Ticked by default: new workouts and updates with an activity. */
  selected: boolean;
}

export const candidateKey = (w: Pick<ImportedWorkout, 'fileName' | 'index'>) => `${w.fileName}#${w.index}`;

function build(workout: ImportedWorkout, activityId: string | null, suggestion: SportMatch, ctx: ConvertContext) {
  const activity = activityId ? ACTIVITY_BY_ID[activityId] : undefined;
  return {
    key: candidateKey(workout),
    workout,
    suggestion,
    activityId: activity ? activity.id : null,
    entry: activity ? toActivityEntry(workout, activity, ctx) : null,
  };
}

/**
 * The stored workout with this reading's numbers: the record's id, day and the
 * person's own note stay, everything the file measured is replaced. Used to
 * save an update and to restore a deleted import with the values on its row.
 * The day moves only to the day the file says the workout was done, over a day
 * that was just the phone's guess (correctedDay).
 */
export function asReplacement(stored: ActivityEntry, entry: ImportedEntry, workout?: Pick<ImportedWorkout, 'startUtc' | 'utcOffsetMin'>): ImportedEntry {
  const day = workout ? correctedDay(stored, workout) : null;
  const out: ImportedEntry = { ...entry, id: stored.id, date: day ?? stored.date, externalId: stored.externalId ?? entry.externalId };
  // A workout keeps where it first came from (a Garmin file stays one when a Health export improves it).
  if (stored.source === 'garmin' || stored.source === 'health') out.source = stored.source;
  if (stored.notes) out.notes = stored.notes;
  // A strength session's sets are the person's own too.
  if (stored.exercises) out.exercises = stored.exercises;
  return out;
}

const canTick = (status: ImportStatus) => status !== 'already-imported' && status !== 'duplicate-in-file';

function withDuplicates(rows: ReturnType<typeof build>[], existing: ActivityEntry[], ctx: ConvertContext, keepSelection?: Map<string, boolean>): ImportCandidate[] {
  const checks = checkDuplicates(
    rows.map((r) => ({
      workout: r.workout,
      activityId: r.activityId,
      category: r.entry?.category ?? null,
      suggested: r.activityId === r.suggestion.activityId,
      tracksDistance: r.activityId ? ACTIVITY_BY_ID[r.activityId]?.tracksDistance === true : false,
    })),
    existing,
  );
  const out = rows.map((r, i) => {
    const c = checks[i];
    let entry = r.entry;
    let reason = c.reason;
    if (c.match && (c.status === 'update' || (c.status === 'already-imported' && c.match.deleted)) && entry) {
      // The person may have changed the activity of the stored workout; an
      // automatic match does not overrule that.
      const own = ACTIVITY_BY_ID[c.match.activityId];
      if (own && own.id !== r.activityId && r.activityId === r.suggestion.activityId) entry = toActivityEntry(r.workout, own, ctx);
      entry = asReplacement(c.match, entry, r.workout);
      if (c.status === 'update') reason = updateReason(c.match, entry, c.adds, c.edited === true);
    }
    // An update that would undo the person's own change is offered, not ticked.
    const defaultSelected = (c.status === 'new' || (c.status === 'update' && !c.edited)) && entry !== null;
    const kept = keepSelection?.get(r.key);
    return {
      ...r,
      activityId: entry ? entry.activityId : r.activityId,
      entry,
      status: c.status,
      reason,
      match: c.match,
      adds: c.adds,
      edited: c.edited === true,
      sameAsKey: c.sameAs === null ? null : rows[c.sameAs].key,
      // A row can only be selected when it has an entry, and never when it is the same workout again.
      selected: entry !== null && canTick(c.status) && (kept ?? defaultSelected),
    };
  });
  // Newest first, legs of one event in order.
  return out.sort((a, b) => b.workout.startUtc.localeCompare(a.workout.startUtc) || a.key.localeCompare(b.key));
}

const kcalText = (n: number) => Math.round(n).toLocaleString('en-US');

/**
 * "Imported before from a file with less in it. This one adds ...: +306 kcal to the day instead of the estimated +512. ..."
 * or, when the person changed the stored workout, what importing would undo.
 */
function updateReason(stored: ActivityEntry, entry: ImportedEntry, adds: UpdateGain[], edited: boolean): string {
  const kcal = adds.includes('calories') ? `: +${kcalText(entry.kcalNet)} kcal to the day instead of the estimated +${kcalText(stored.kcalNet)}` : '';
  const day =
    entry.date !== stored.date
      ? ` and moves it to ${formatDayLabel(entry.date)}, the day it was done where it was recorded; your notes stay.`
      : '; the day and your notes stay.';
  if (edited) {
    const changes: string[] = [];
    if (entry.durationMin !== stored.durationMin) changes.push(`${stored.durationMin} min here, ${entry.durationMin} min in the file`);
    if (entry.intensity !== stored.intensity) changes.push(`${stored.intensity} effort here, ${entry.intensity} in the file`);
    const what = changes.length ? ` (${changes.join('; ')})` : '';
    return `You changed this workout after importing it${what}. This file has ${gainsText(adds)}${kcal}. Importing it replaces your changes with the file’s numbers, so it is left unticked.`;
  }
  const others = adds.filter((g) => g !== 'day');
  const lead = others.length
    ? `Imported before from a file with less in it. This one adds ${gainsText(others)}${kcal}.`
    : 'Imported before from a file that does not say where it was recorded.';
  return `${lead} Importing replaces the numbers${day}`;
}

/**
 * Match every workout to an activity, build its entry and check duplicates.
 * `existing` is every saved activity entry, soft-deleted ones included.
 */
export function prepareImport(workouts: ImportedWorkout[], existing: ActivityEntry[], ctx: ConvertContext): ImportCandidate[] {
  const rows = workouts.map((w) => {
    const suggestion = suggestActivity(w);
    return build(w, suggestion.activityId, suggestion, ctx);
  });
  return withDuplicates(rows, existing, ctx, undefined);
}

/** The person picked a different activity for one row (or one for a row that had none). */
export function chooseActivity(candidates: ImportCandidate[], key: string, activityId: string, existing: ActivityEntry[], ctx: ConvertContext): ImportCandidate[] {
  const selection = new Map(candidates.map((c) => [c.key, c.selected]));
  const rows = candidates.map((c) => (c.key === key ? build(c.workout, activityId, c.suggestion, ctx) : build(c.workout, c.activityId, c.suggestion, ctx)));
  // The newly matched row becomes selectable; select it unless it is a duplicate.
  selection.delete(key);
  return withDuplicates(rows, existing, ctx, selection);
}

/** Tick or untick a row. Rows without an entry, and repeats of the same workout, cannot be ticked. */
export function setSelected(candidates: ImportCandidate[], key: string, selected: boolean): ImportCandidate[] {
  return candidates.map((c) =>
    c.key === key ? { ...c, selected: selected && c.entry !== null && canTick(c.status) } : c,
  );
}

/** The entries to save: ticked rows, each once. */
export function entriesToSave(candidates: ImportCandidate[]): ImportedEntry[] {
  const seen = new Set<string>();
  const out: ImportedEntry[] = [];
  for (const c of candidates) {
    if (!c.selected || !c.entry || seen.has(c.entry.id)) continue;
    seen.add(c.entry.id);
    out.push(c.entry);
  }
  return out;
}

/**
 * How much the ticked rows change each day: a new workout adds its numbers,
 * an update adds the difference from what is stored now.
 */
export function netChange(c: Pick<ImportCandidate, 'status' | 'match' | 'entry'>): { kcalNet: number; durationMin: number } {
  if (!c.entry) return { kcalNet: 0, durationMin: 0 };
  if (c.status === 'update' && c.match) return { kcalNet: c.entry.kcalNet - c.match.kcalNet, durationMin: c.entry.durationMin - c.match.durationMin };
  return { kcalNet: c.entry.kcalNet, durationMin: c.entry.durationMin };
}

export interface ReplaceHandLogged {
  /** The imported workout to save. */
  save: ImportedEntry;
  /** The hand-logged session it replaces (soft-deleted, so Undo can bring it back). */
  remove: ActivityEntry;
}

/**
 * For a row flagged as a possible duplicate of a session logged by hand: save
 * the import, with the device's measured numbers, and remove the hand log. The
 * person's own note on the hand log travels with the workout.
 */
export function replaceHandLoggedPlan(c: Pick<ImportCandidate, 'status' | 'match' | 'entry'>): ReplaceHandLogged | null {
  const hand = c.match;
  if (c.status !== 'probable-duplicate' || !c.entry || !hand || hand.deleted || hand.source || hand.startedAt) return null;
  const save: ImportedEntry = { ...c.entry };
  const notes = [c.entry.notes, hand.notes?.trim()].filter(Boolean);
  if (notes.length) save.notes = [...new Set(notes)].join(' · ');
  return { save, remove: hand };
}
