/**
 * What one sync does with the workouts it read. Pure: the engine passes what
 * the health store returned and what the diary holds, and gets back what to
 * save by itself, what to ask about, and which apps were seen.
 *
 * The workouts go through the file import's own pipeline (prepareImport,
 * chooseActivity, entriesToSave and its duplicate rules), so a workout means
 * the same thing whether it came from a FIT file or from Health Connect:
 *
 *   new                      saved by itself
 *   a better reading         of a workout already stored (now with calories or
 *                            a distance): the stored record gets the numbers
 *   the watch's reading      of a workout the diary has from another app (the
 *                            phone recorded the run too): it takes that one's place
 *   already stored           nothing
 *   deleted by the person    nothing: a sync never brings a workout back
 *   might be a duplicate     of a session logged by hand, or of something else
 *                            at the same time: waits in "Needs a look"
 *   no matching activity     waits in "Needs a look" until the person says what it was
 */
import { ACTIVITY_BY_ID } from '@/data/activities';
import { garminExternalId, type ConvertContext } from '@/features/import/convert';
import { candidateKey, chooseActivity, entriesToSave, prepareImport, type ImportCandidate } from '@/features/import/plan';
import { sportKey } from '@/features/import/sports';
import { isoSeconds } from '@/features/import/time';
import type { ImportedWorkout } from '@/features/import/types';
import type { ActivityEntry } from '@/types';

import { finishEntry, recordIdFor, sportOf, toImportedWorkout, workoutSpan, type HealthEntry } from './convert';
import { wholeMinutes, workoutEnergy } from './energy';
import { HEALTH_CONNECT_TYPES } from './exerciseTypes';
import { mergeOrigins } from './merge';
import { originName } from './origins';
import type { HealthWorkout } from './types';

/** What this phone already did with a workout, by record id. */
export interface Handled {
  /** 'saved': a sync or the person added it here. 'skipped': the person said no (or undid a change to it). */
  how: 'saved' | 'skipped';
  /** The workout's start, so old entries can be dropped. */
  at: string;
}

export type ReviewKind = 'duplicate' | 'activity';

/** A workout that waits for the person in "Needs a look". Plain data: it is kept on the device between syncs. */
export interface ReviewItem {
  /** The record id the workout would be saved under; the item's key. */
  id: string;
  workout: HealthWorkout;
  /** 'duplicate': it may repeat something in the diary. 'activity': no app activity matches its type. */
  kind: ReviewKind;
  /** Why it was not added by itself, in plain words. */
  reason: string;
  /** The saved session it may repeat. */
  matchId: string | null;
  /** True when that session was logged by hand. */
  matchByHand: boolean;
  /** What "Add" saves. Null until the activity is known. */
  entry: HealthEntry | null;
  /** Activities to offer first when asking. */
  alternatives: string[];
  /** The health store's type in plain words ('Skating'). */
  sportName: string;
  /** The app the workout came from ('Garmin Connect'). */
  from: string;
  /** The activity the person chose for this workout, kept until it is saved or skipped. */
  picked?: string;
}

export interface PlannedSave {
  entry: HealthEntry;
  /** The app the workout came from, for the confirmation. */
  from: string;
}

export interface PlannedUpdate extends PlannedSave {
  /** The stored record as it is now (Undo puts it back). */
  before: ActivityEntry;
}

export interface PlannedReplace extends PlannedSave {
  /** The other app's reading of the same workout, which is taken out (soft-deleted). */
  remove: ActivityEntry;
}

export interface OriginSeen {
  origin: string;
  name: string;
  /** How many workouts of this app were read. */
  count: number;
  /** Start of its newest workout, ISO. */
  latest: string;
}

export interface SyncPlan {
  add: PlannedSave[];
  update: PlannedUpdate[];
  replace: PlannedReplace[];
  review: ReviewItem[];
  /** The apps whose workouts were read, newest first. */
  origins: OriginSeen[];
  /** Readings that are never saved, counted so the screen can say so. */
  leftOut: { otherApp: number; notExercise: number; unusable: number };
}

export interface PlanInput {
  workouts: HealthWorkout[];
  /** Every saved activity, soft-deleted ones included. */
  existing: ActivityEntry[];
  ctx: ConvertContext;
  handled?: Record<string, Handled>;
  /** Activities the person chose before for a kind of workout (see `choiceKey`). */
  choices?: Record<string, string>;
  /** Activities the person chose for single workouts, by `workoutKey`. */
  picks?: Record<string, string>;
}

/** A workout's identity in the health store. */
export const workoutKey = (w: Pick<HealthWorkout, 'origin' | 'id'>): string => `${w.origin}|${w.id}`;

/** Types that can be anything ("Other workout", "Exercise class", a type newer than the table). */
const isCatchAll = (w: Pick<HealthWorkout, 'store' | 'exerciseType'>) =>
  w.store !== 'health-connect' || w.exerciseType === 0 || w.exerciseType === 26 || !(w.exerciseType in HEALTH_CONNECT_TYPES);

/**
 * The key under which a chosen activity is remembered for later workouts of the
 * same kind: the type ('Paddling' is always the kayak), or for a catch-all type
 * the type and the workout's name ('Other workout' named 'Bouldering'). Null
 * for a catch-all workout without a name: that could be anything, so it is asked each time.
 */
export function choiceKey(w: Pick<HealthWorkout, 'store' | 'exerciseType' | 'title'>): string | null {
  if (!isCatchAll(w)) return `${w.store}:${w.exerciseType}`;
  const title = sportKey(w.title ?? '');
  return title ? `${w.store}:${w.exerciseType}:${title}` : null;
}

const known = (id: string | null | undefined): id is string => !!id && id in ACTIVITY_BY_ID;

/** The activity a workout is saved as, or null when the person has to say. */
function wantedActivity(w: HealthWorkout, choices: Record<string, string>, picks: Record<string, string>): string | null {
  const pick = picks[workoutKey(w)];
  if (known(pick)) return pick;
  const table = sportOf(w).activityId;
  if (table) return table;
  const key = choiceKey(w);
  const remembered = key ? choices[key] : undefined;
  return known(remembered) ? remembered : null;
}

/**
 * Saved workouts as the file pipeline recognises imports. A synced record is
 * presented with the identity the file import gives the same start instant, so
 * the pipeline's own rules (same workout, better reading, deleted) apply to it
 * exactly as they do to a file import.
 */
function asImportView(e: ActivityEntry): ActivityEntry {
  if (e.source !== 'health' || !e.startedAt) return e;
  const ms = Date.parse(e.startedAt);
  if (!Number.isFinite(ms)) return e;
  return { ...e, source: 'garmin', externalId: garminExternalId({ startUtc: isoSeconds(ms) }) };
}

type Decision = 'add' | 'update' | 'replace' | 'ask-activity' | 'ask-duplicate' | 'none';

/** "running session", but "spinning class" rather than "spinning class session". */
const sessionNoun = (name: string) => {
  const n = name.toLowerCase();
  return /\b(class|session|workout|training)$/.test(n) ? n : `${n} session`;
};

function reasonFor(decision: Decision, row: ImportCandidate, from: string, sportName: string, match: ActivityEntry | null, other: string | null): string {
  if (decision === 'ask-activity') return `${from} recorded this as “${sportName.toLowerCase()}”, which could be several activities here. Choose what it was.`;
  if (match && !match.source && !match.startedAt) {
    return `You logged a ${Math.round(match.durationMin)} min ${sessionNoun(match.name)} by hand on this day. If it is the same workout, replace it with this one or skip this one.`;
  }
  if (match) {
    const started = match.startedAt ? Date.parse(match.startedAt) : Number.NaN;
    const sameTime = Number.isFinite(started) && Math.abs(started - Date.parse(row.workout.startUtc)) < Math.max(row.workout.durationSec, 60) * 1000;
    return sameTime ? `You already have a ${sessionNoun(match.name)} at this time.` : `Looks like the ${sessionNoun(match.name)} you already have, at a different clock time.`;
  }
  return `Covers the same time as another workout from ${other ?? from}.`;
}

function summariseOrigins(workouts: HealthWorkout[]): OriginSeen[] {
  const by = new Map<string, OriginSeen>();
  for (const w of workouts) {
    const span = workoutSpan(w);
    if (!span) continue;
    const seen = by.get(w.origin);
    if (!seen) by.set(w.origin, { origin: w.origin, name: originName(w.origin, w.originName), count: 1, latest: span.startUtc });
    else {
      seen.count += 1;
      if (span.startUtc > seen.latest) seen.latest = span.startUtc;
    }
  }
  return [...by.values()].sort((a, b) => b.latest.localeCompare(a.latest) || a.name.localeCompare(b.name));
}

export function planSync(input: PlanInput): SyncPlan {
  const { ctx } = input;
  const handled = input.handled ?? {};
  const choices = input.choices ?? {};
  const picks = input.picks ?? {};
  const real = new Map(input.existing.map((e) => [e.id, e]));

  /** The live record the diary holds for this very reading (same start instant), from a sync or from a file. */
  const storedFor = (w: HealthWorkout): ActivityEntry | null => {
    const span = workoutSpan(w);
    const e = span ? real.get(recordIdFor(span.startUtc)) : undefined;
    return e && !e.deleted && !!e.source && !!e.startedAt ? e : null;
  };

  // 1. Each usable exercise session once.
  const leftOut = { otherApp: 0, notExercise: 0, unusable: 0 };
  const seen = new Set<string>();
  const usable: HealthWorkout[] = [];
  for (const w of input.workouts) {
    const key = workoutKey(w);
    if (seen.has(key)) continue;
    seen.add(key);
    if (!workoutSpan(w)) leftOut.unusable += 1;
    else if (sportOf(w).ignore) leftOut.notExercise += 1;
    else usable.push(w);
  }
  const origins = summariseOrigins(usable);

  // 2. One reading per workout when two apps recorded it. A reading the diary already
  //    has is judged by what is stored (it may have been read without its details this time).
  const merged = mergeOrigins(usable, (w) => {
    const stored = storedFor(w);
    const span = workoutSpan(w);
    return { stored: stored !== null, measured: stored ? !!stored.measured : span !== null && workoutEnergy(w, span.durationSec, ctx).basis !== 'none' };
  });
  leftOut.otherApp = merged.dropped.length;
  /** Stored records of readings that lost to the reading kept (by the kept workout). */
  const outranked = new Map<HealthWorkout, ActivityEntry[]>();
  for (const d of merged.dropped) {
    const stored = storedFor(d.workout);
    const span = workoutSpan(d.workout);
    // Only a synced record still as it was read: the person has not changed its length.
    if (!stored || stored.source !== 'health' || !span || stored.durationMin !== wholeMinutes(span.durationSec)) continue;
    outranked.set(d.keptInstead, [...(outranked.get(d.keptInstead) ?? []), stored]);
  }

  // 3. The file import's pipeline, against the diary.
  const byKey = new Map<string, HealthWorkout>();
  const imported: ImportedWorkout[] = [];
  merged.kept.forEach((w, i) => {
    const iw = toImportedWorkout(w, i, ctx);
    if (!iw) return;
    imported.push(iw);
    byKey.set(candidateKey(iw), w);
  });
  const view = input.existing.map(asImportView);
  let rows = prepareImport(imported, view, ctx);

  // 4. The activity comes from this feature's table and the person's choices. A workout
  //    the diary already has keeps the activity it is stored with. One chooseActivity
  //    call rebuilds every row from the activity set on it (as the import screen does).
  const wanted = (row: ImportCandidate) => wantedActivity(byKey.get(row.key) as HealthWorkout, choices, picks);
  const staged = rows.map((row) => {
    const stored = row.match && (row.status === 'update' || row.status === 'already-imported') && known(row.match.activityId) ? row.match.activityId : null;
    const activityId = stored ?? wanted(row);
    return row.activityId === activityId ? row : { ...row, activityId };
  });
  const anchor = staged.find((r) => r.activityId !== null);
  if (anchor && staged.some((r, i) => r !== rows[i])) rows = chooseActivity(staged, anchor.key, anchor.activityId as string, view, ctx);

  // 5. Decide each row; entriesToSave then yields what is saved by itself, each record once.
  const decide = (row: ImportCandidate): Decision => {
    if (row.status === 'duplicate-in-file' || row.status === 'already-imported') return 'none';
    const done = handled[recordIdFor(row.workout.startUtc)];
    if (done?.how === 'skipped') return 'none';
    if (row.status === 'update') {
      const stored = row.match ? real.get(row.match.id) : undefined;
      // Only a record that is still as it was read: there, and of the same length (the person has not edited it).
      if (!stored || stored.deleted || !row.entry || stored.durationMin !== row.entry.durationMin) return 'none';
      return 'update';
    }
    // Saved here before and gone since: the person deleted it.
    if (done) return 'none';
    if (wanted(row) === null || !row.entry) return 'ask-activity';
    if (row.status === 'probable-duplicate') {
      const twins = outranked.get(byKey.get(row.key) as HealthWorkout) ?? [];
      return row.match && twins.some((t) => t.id === row.match?.id) ? 'replace' : 'ask-duplicate';
    }
    return 'add';
  };
  const decisions = new Map<string, Decision>();
  rows = rows.map((row) => {
    const d = decide(row);
    decisions.set(row.key, d);
    return { ...row, selected: (d === 'add' || d === 'update' || d === 'replace') && row.entry !== null };
  });
  const rowOf = new Map(rows.filter((r) => r.entry !== null).map((r) => [r.entry, r]));

  const add: PlannedSave[] = [];
  const update: PlannedUpdate[] = [];
  const replace: PlannedReplace[] = [];
  for (const entry of entriesToSave(rows)) {
    const row = rowOf.get(entry) as ImportCandidate;
    const w = byKey.get(row.key) as HealthWorkout;
    const from = originName(w.origin, w.originName);
    const d = decisions.get(row.key);
    const stored = row.match ? real.get(row.match.id) : undefined;
    if (d === 'update' && stored) update.push({ entry: finishEntry(entry, w, ctx, stored), before: stored, from });
    else if (d === 'replace' && stored) {
      const saved = finishEntry(entry, w, ctx);
      // The person's own note on the reading that goes travels with the workout.
      const notes = [saved.notes, stored.notes?.trim()].filter(Boolean);
      if (notes.length) saved.notes = [...new Set(notes)].join(' · ');
      replace.push({ entry: saved, remove: stored, from });
    } else add.push({ entry: finishEntry(entry, w, ctx), from });
  }

  // 6. What waits for the person, newest first (the pipeline's order).
  const review: ReviewItem[] = [];
  for (const row of rows) {
    const d = decisions.get(row.key);
    if (d !== 'ask-activity' && d !== 'ask-duplicate') continue;
    const w = byKey.get(row.key) as HealthWorkout;
    const sport = sportOf(w);
    const from = originName(w.origin, w.originName);
    const match = d === 'ask-duplicate' && row.match ? (real.get(row.match.id) ?? null) : null;
    const otherRow = row.sameAsKey ? byKey.get(row.sameAsKey) : undefined;
    const pick = picks[workoutKey(w)];
    const item: ReviewItem = {
      id: recordIdFor(row.workout.startUtc),
      workout: w,
      kind: d === 'ask-activity' ? 'activity' : 'duplicate',
      reason: reasonFor(d, row, from, sport.name, match, otherRow ? originName(otherRow.origin, otherRow.originName) : null),
      matchId: match ? match.id : null,
      matchByHand: !!match && !match.source && !match.startedAt,
      entry: d === 'ask-duplicate' && row.entry ? finishEntry(row.entry, w, ctx) : null,
      alternatives: [...new Set([...row.suggestion.alternatives, ...sport.alternatives])].filter(known),
      sportName: sport.name,
      from,
    };
    if (known(pick)) item.picked = pick;
    review.push(item);
  }

  return { add, update, replace, review, origins, leftOut };
}
