/**
 * The list the import screen shows: every workout read, the app activity it
 * matches, the entry it would save, and whether it is a duplicate. Pure, so
 * the screen holds it in state and calls back here when the person changes a row.
 */
import { ACTIVITY_BY_ID } from '@/data/activities';
import type { ActivityEntry } from '@/types';

import { toActivityEntry, type ConvertContext, type ImportedEntry } from './convert';
import { checkDuplicates, type ImportStatus } from './dedupe';
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
  /** Key of the candidate in this import that it duplicates or overlaps. */
  sameAsKey: string | null;
  /** Ticked by default: only new workouts with an activity. */
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

function withDuplicates(rows: ReturnType<typeof build>[], existing: ActivityEntry[], keepSelection?: Map<string, boolean>): ImportCandidate[] {
  const checks = checkDuplicates(
    rows.map((r) => ({ workout: r.workout, activityId: r.activityId, category: r.entry?.category ?? null })),
    existing,
  );
  const out = rows.map((r, i) => {
    const c = checks[i];
    const defaultSelected = c.status === 'new' && r.entry !== null;
    const kept = keepSelection?.get(r.key);
    return {
      ...r,
      status: c.status,
      reason: c.reason,
      match: c.match,
      sameAsKey: c.sameAs === null ? null : rows[c.sameAs].key,
      // A row can only be selected when it has an entry, and never when it is the same workout again.
      selected: r.entry !== null && c.status !== 'already-imported' && c.status !== 'duplicate-in-file' && (kept ?? defaultSelected),
    };
  });
  // Newest first, legs of one event in order.
  return out.sort((a, b) => b.workout.startUtc.localeCompare(a.workout.startUtc) || a.key.localeCompare(b.key));
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
  return withDuplicates(rows, existing, undefined);
}

/** The person picked a different activity for one row (or one for a row that had none). */
export function chooseActivity(candidates: ImportCandidate[], key: string, activityId: string, existing: ActivityEntry[], ctx: ConvertContext): ImportCandidate[] {
  const selection = new Map(candidates.map((c) => [c.key, c.selected]));
  const rows = candidates.map((c) => (c.key === key ? build(c.workout, activityId, c.suggestion, ctx) : build(c.workout, c.activityId, c.suggestion, ctx)));
  // The newly matched row becomes selectable; select it unless it is a duplicate.
  selection.delete(key);
  return withDuplicates(rows, existing, selection);
}

/** Tick or untick a row. Rows without an entry, and repeats of the same workout, cannot be ticked. */
export function setSelected(candidates: ImportCandidate[], key: string, selected: boolean): ImportCandidate[] {
  return candidates.map((c) =>
    c.key === key ? { ...c, selected: selected && c.entry !== null && c.status !== 'already-imported' && c.status !== 'duplicate-in-file' } : c,
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
