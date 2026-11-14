/**
 * Duplicate detection for imports.
 *
 *  - The same workout read twice (the same file again, or FIT and CSV of one
 *    activity) is 'already-imported' or 'duplicate-in-file' and adds nothing.
 *  - A workout already imported from a file that carried less (a GPX with
 *    no calories, a CSV without heart rate) is an 'update' when this reading
 *    adds something: saving replaces the numbers and keeps the record.
 *  - A workout that overlaps something already in the diary (typically a
 *    session the person logged by hand) is a 'probable-duplicate': the screen
 *    should show it unticked so the person decides.
 */
import type { ActivityEntry } from '@/types';

import { garminExternalId } from './convert';
import { recordedWallTime } from './time';
import type { ImportedWorkout } from './types';

export type ImportStatus = 'new' | 'update' | 'already-imported' | 'duplicate-in-file' | 'probable-duplicate';

export interface DuplicateCheck {
  status: ImportStatus;
  /** Plain-language reason for any status other than 'new'. */
  reason: string | null;
  /** For 'update' (and a deleted workout this reading would restore richer): what this reading adds. */
  adds: UpdateGain[];
  /** The saved entry this matched, when there is one (may be soft-deleted). */
  match: ActivityEntry | null;
  /** For 'duplicate-in-file' and batch overlaps: index of the workout in the same batch that is kept instead. */
  sameAs: number | null;
}

/** Minimal shape a candidate needs: the workout and, when it has been matched, the app activity it became. */
export interface DedupeCandidate {
  workout: ImportedWorkout;
  activityId?: string | null;
  category?: string | null;
  /** True when the matched activity records a distance (so a distance in the file is worth having). */
  tracksDistance?: boolean;
}

/** What a reading of a workout carries that the stored copy lacks. */
export type UpdateGain = 'calories' | 'heart-rate' | 'distance';

/**
 * What this reading would add to a stored copy of the same workout: the
 * device's own calories where the stored ones are an estimate, heart rate, or
 * distance. Empty when it carries nothing more.
 */
export function updateGains(c: DedupeCandidate, stored: ActivityEntry): UpdateGain[] {
  const w = c.workout;
  const out: UpdateGain[] = [];
  if (w.kcal !== null && w.kcal > 0 && !stored.measured) out.push('calories');
  if (w.avgHeartRate !== null && w.avgHeartRate > 0 && !stored.avgHeartRate) out.push('heart-rate');
  if (c.tracksDistance && w.distanceM !== null && w.distanceM >= 10 && !stored.distanceKm) out.push('distance');
  return out;
}

const GAIN_WORDS: Record<UpdateGain, string> = { calories: 'the calories your watch measured', 'heart-rate': 'heart rate', distance: 'distance' };

/** "the calories your watch measured, heart rate and distance". */
export function gainsText(gains: UpdateGain[]): string {
  const words = gains.map((g) => GAIN_WORDS[g]);
  return words.length <= 1 ? (words[0] ?? '') : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
}

/** Richer formats win when the same workout arrives twice in one import. */
const FORMAT_RANK: Record<ImportedWorkout['format'], number> = { fit: 0, tcx: 1, csv: 2, gpx: 3 };

/** Two readings of one workout start within 90 s of each other (less for very short sessions). */
const START_TOLERANCE_MS = 90_000;

interface Span {
  start: number;
  end: number;
}

function workoutSpan(w: ImportedWorkout): Span {
  const start = Date.parse(w.startUtc);
  return { start, end: start + (w.elapsedSec ?? w.durationSec) * 1000 };
}

/**
 * Two readings of one workout: starts within 90 s and durations within 5% or
 * 90 s, whichever is more. Both allowances shrink for sessions of a few
 * minutes (to a quarter and a fifth of their length), so a short walk and the
 * short run right after it are not taken for one workout.
 */
export function sameWorkout(a: { startMs: number; durationSec: number }, b: { startMs: number; durationSec: number }): boolean {
  const longer = Math.max(a.durationSec, b.durationSec);
  const startTolerance = Math.min(START_TOLERANCE_MS, Math.max(10_000, 250 * longer));
  if (Math.abs(a.startMs - b.startMs) > startTolerance) return false;
  const tolerance = Math.max(0.05 * longer, Math.min(90, 0.2 * longer));
  return Math.abs(a.durationSec - b.durationSec) <= tolerance;
}

/** Different activities are different workouts; an unmatched one (null) could be anything. */
const compatible = (a: string | null | undefined, b: string | null | undefined) => !a || !b || a === b;

/** Overlap as a share of the shorter span (0 to 1). */
function overlapShare(a: Span, b: Span): number {
  const shorter = Math.min(a.end - a.start, b.end - b.start);
  if (shorter <= 0) return 0;
  return Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start)) / shorter;
}

/** Durations of one workout logged twice are within this share of the longer one. */
const HAND_DURATION_SHARE = 0.25;

/**
 * A session logged by hand has no real start time, only the moment it was
 * saved (loggedAt). It may be the imported workout when all of these hold:
 *  - it is on the same local day the workout was done,
 *  - the activities are in the same category (Spinning and Stationary bike,
 *    Running and Trail running),
 *  - the durations are within 25% of each other,
 *  - it was saved after the workout started: a session saved before the
 *    workout began cannot be a record of it.
 */
export function handLoggedMatch(
  e: Pick<ActivityEntry, 'startedAt' | 'source' | 'date' | 'category' | 'durationMin' | 'loggedAt' | 'deleted'>,
  w: { day: string; startMs: number; durationSec: number; category: string | null },
): boolean {
  if (e.deleted || e.startedAt || e.source) return false;
  if (!w.category || e.category !== w.category || e.date !== w.day) return false;
  const a = Math.max(1, e.durationMin || 0);
  const b = w.durationSec / 60;
  if (Math.abs(a - b) > HAND_DURATION_SHARE * Math.max(a, b)) return false;
  const logged = Date.parse(e.loggedAt);
  return Number.isFinite(logged) && logged >= w.startMs;
}

const handLoggedReason = (e: ActivityEntry) =>
  `You logged a ${Math.round(e.durationMin)} min ${sessionNoun(e.name)} by hand on this day. If it is the same workout, leave this unticked, or import it and delete the hand-logged one.`;

/** "running session", but "spinning class" rather than "spinning class session". */
const sessionNoun = (name: string) => {
  const n = name.toLowerCase();
  return /\b(class|session|workout|training)$/.test(n) ? n : `${n} session`;
};

const isGarmin = (e: ActivityEntry) => e.source === 'garmin';

/**
 * Check each candidate against the others in the same import and against the
 * saved activity entries. Pass every saved entry, soft-deleted ones included:
 * a workout the person deleted after an earlier import is reported as
 * 'already-imported' rather than silently brought back.
 */
export function checkDuplicates(candidates: DedupeCandidate[], existing: ActivityEntry[]): DuplicateCheck[] {
  const out: DuplicateCheck[] = candidates.map(() => ({ status: 'new', reason: null, match: null, sameAs: null, adds: [] }));
  const spans = candidates.map((c) => workoutSpan(c.workout));
  const byExternal = new Map<string, ActivityEntry>();
  for (const e of existing) if (e.externalId) byExternal.set(e.externalId, e);

  // 1. Within the batch: the same workout twice keeps the richest reading.
  const order = candidates.map((_, i) => i).sort((a, b) => FORMAT_RANK[candidates[a].workout.format] - FORMAT_RANK[candidates[b].workout.format] || a - b);
  const kept: number[] = [];
  for (const i of order) {
    const w = candidates[i].workout;
    const twin = kept.find((k) =>
      compatible(candidates[i].activityId, candidates[k].activityId) &&
      sameWorkout({ startMs: spans[i].start, durationSec: w.durationSec }, { startMs: spans[k].start, durationSec: candidates[k].workout.durationSec }),
    );
    if (twin !== undefined) {
      const other = candidates[twin].workout.fileName;
      const reason = other === w.fileName ? `This workout is listed twice in ${other}; it is imported once.` : `The same workout is also in ${other}, which is used instead.`;
      out[i] = { status: 'duplicate-in-file', reason, match: null, sameAs: twin, adds: [] };
    } else kept.push(i);
  }

  // 2. Against saved entries.
  for (const i of kept) {
    const c = candidates[i];
    const w = c.workout;
    const span = spans[i];
    const ext =
      byExternal.get(garminExternalId(w)) ??
      existing.find((e) => isGarmin(e) && !!e.startedAt && sameWorkout({ startMs: span.start, durationSec: w.durationSec }, { startMs: Date.parse(e.startedAt), durationSec: e.durationMin * 60 }));
    if (ext) {
      const adds = updateGains(c, ext);
      if (ext.deleted) {
        // Restoring brings the workout back with this row's numbers (session.ts), so say what that adds.
        const more = adds.length ? ` Restoring it uses this file, which adds ${gainsText(adds)}.` : '';
        out[i] = { status: 'already-imported', reason: `You imported this workout before and then deleted it.${more}`, match: ext, sameAs: null, adds };
      } else if (adds.length) {
        out[i] = {
          status: 'update',
          reason: `Imported before from a file with less in it. This one adds ${gainsText(adds)}. Importing replaces the numbers; the day and your notes stay.`,
          match: ext,
          sameAs: null,
          adds,
        };
      } else out[i] = { status: 'already-imported', reason: 'Already imported.', match: ext, sameAs: null, adds: [] };
      continue;
    }
    const live = existing.filter((e) => !e.deleted);
    // Same Garmin workout read with a different time zone: same length and calories, start shifted by whole quarter hours.
    const shifted = live.find((e) => {
      if (!isGarmin(e) || !e.startedAt || w.kcal === null) return false;
      const diff = Math.abs(Date.parse(e.startedAt) - span.start);
      const quarter = 15 * 60_000;
      return diff > START_TOLERANCE_MS && diff <= 14 * 3_600_000 && diff % quarter <= 2000 && Math.abs(e.durationMin - Math.round(w.durationSec / 60)) <= 1 && Math.abs(e.kcalGross - w.kcal) <= 1;
    });
    if (shifted) {
      out[i] = { status: 'probable-duplicate', reason: `Looks like the ${shifted.name.toLowerCase()} already imported, at a different clock time. The time zone chosen for this file may differ.`, match: shifted, sameAs: null, adds: [] };
      continue;
    }
    // Something with a real start time (another import) that covers the same time.
    const overlapping = live.find((e) => {
      const started = e.startedAt ? Date.parse(e.startedAt) : Number.NaN;
      if (!Number.isFinite(started)) return false;
      return overlapShare(span, { start: started, end: started + Math.max(1, e.durationMin || 0) * 60_000 }) >= 0.5;
    });
    if (overlapping) {
      const how = overlapping.source === 'garmin' ? 'an imported' : 'a';
      out[i] = { status: 'probable-duplicate', reason: `You already have ${how} ${overlapping.name.toLowerCase()} session at this time.`, match: overlapping, sameAs: null, adds: [] };
      continue;
    }
    const day = recordedWallTime(w).date;
    const hand = live.find((e) => handLoggedMatch(e, { day, startMs: span.start, durationSec: w.durationSec, category: c.category ?? null }));
    if (hand) out[i] = { status: 'probable-duplicate', reason: handLoggedReason(hand), match: hand, sameAs: null, adds: [] };
  }

  // 3. Different workouts in this import that cover the same time (a CSV multisport row and the FIT legs).
  const live = kept.filter((i) => out[i].status === 'new');
  for (let a = 0; a < live.length; a++) {
    for (let b = a + 1; b < live.length; b++) {
      const i = live[a];
      const j = live[b];
      if (out[i].status !== 'new' || out[j].status !== 'new') continue;
      if (overlapShare(spans[i], spans[j]) < 0.5) continue;
      // Flag the poorer (lower ranked) reading; on a tie, the longer one (a summary of several legs), else the later one.
      const ri = FORMAT_RANK[candidates[i].workout.format];
      const rj = FORMAT_RANK[candidates[j].workout.format];
      const li = spans[i].end - spans[i].start;
      const lj = spans[j].end - spans[j].start;
      const loser = ri !== rj ? (ri > rj ? i : j) : li !== lj ? (li > lj ? i : j) : Math.max(i, j);
      const winner = loser === i ? j : i;
      out[loser] = { status: 'probable-duplicate', reason: `Covers the same time as another workout in this import (${candidates[winner].workout.fileName}).`, match: null, sameAs: winner, adds: [] };
    }
  }
  return out;
}
