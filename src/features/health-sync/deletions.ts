/**
 * The sync's memory of a day the person deleted, written at the moment of the
 * delete (from src/features/trackers/actions.ts), not at the next plan.
 *
 * Why at once: planWeights and planSleep also remember a day when they find its
 * record deleted, but only while the deletion marker is still on the device.
 * Without an account the store drops a marker 24 hours after the delete
 * (TOMBSTONE_HOURS_LOCAL in src/store/persistence.ts), at the next start, while
 * the read window covers the last days again: a weigh-in or a night deleted
 * right after a sync added it, with no sync before the next day's open, came
 * back. And a phone offline at the delete never plans that day before another
 * phone may bring the record back (docs/health-sync.md, "Deleted stays deleted").
 *
 * The mark is the plans' own ('weight:<date>' or 'sleep:<date>', 'skipped'),
 * kept by pruneHandled like any other. It never hides something the person
 * wants: a day they type a weigh-in or a night for again is theirs, which a sync
 * leaves alone anyway, and the delete's Undo takes the mark out again when this
 * delete put it there.
 */
import type { ISODate } from '@/types';

import { weightHandledKey } from './body';
import { sleepHandledKey } from './sleep';
import { pruneHandled, rememberMarks } from './state';
import { useHealthSync, whenLoaded } from './store';
import type { Handled } from './plan';

/** `handled` with the day marked as skipped (a mark already there stays), pruned as a sync prunes. */
export function withDeletedDay(handled: Record<string, Handled>, key: string, at: string, now: number): Record<string, Handled> {
  return pruneHandled(rememberMarks(handled, { [key]: { how: 'skipped', at } }), now);
}

const noonOf = (date: ISODate) => `${date}T12:00:00.000Z`;
const instantOr = (x: string | undefined, date: ISODate) => (typeof x === 'string' && Number.isFinite(Date.parse(x)) ? new Date(Date.parse(x)).toISOString() : noonOf(date));

/**
 * Mark `key` in this phone's health-sync memory (after it has loaded from the
 * device, so the saved memory cannot overwrite it). Returns the Undo: it takes
 * the mark out only when this call put it there.
 */
function rememberDeletedDay(key: string, at: string): () => void {
  let added = false;
  const marked = whenLoaded().then(() => {
    const { handled } = useHealthSync.getState();
    if (handled[key]) return;
    added = true;
    useHealthSync.setState({ handled: withDeletedDay(handled, key, at, Date.now()) });
  });
  return () => {
    void marked.then(() => {
      if (!added) return;
      added = false;
      const { handled } = useHealthSync.getState();
      if (!handled[key]) return;
      const { [key]: _gone, ...rest } = handled;
      useHealthSync.setState({ handled: rest });
    });
  };
}

/** A weigh-in the person deleted: no sync adds that day's weigh-in again. Returns the Undo. */
export function rememberDeletedWeighIn(entry: { date: ISODate; measuredAt?: string }): () => void {
  return rememberDeletedDay(weightHandledKey(entry.date), instantOr(entry.measuredAt, entry.date));
}

/** A night the person deleted: no sync adds that night again. Returns the Undo. */
export function rememberDeletedNight(entry: { date: ISODate; startedAt?: string }): () => void {
  return rememberDeletedDay(sleepHandledKey(entry.date), instantOr(entry.startedAt, entry.date));
}
