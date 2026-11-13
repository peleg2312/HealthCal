/**
 * Records the targets of the current day as it happens.
 *
 * Targets move: the user changes a goal, weight changes, the expenditure
 * estimate learns. A past day should still be judged against the target it
 * had on that day, so the first time a day is seen (and whenever today's
 * target changes during the day) its numbers are written to the `days`
 * collection. Past days are never rewritten.
 */
import { today } from '@/lib/dates';
import type { ISODate } from '@/types';

import { useStore, type Store } from './index';
import { computeEnergyModel, live } from './selectors';

/** The snapshot today should have, or null when there is no profile yet. Pure. */
export function snapshotFor(s: Store, date: ISODate) {
  if (!s.profile?.onboardedAt) return null;
  const model = computeEnergyModel(s.profile, live(s.foodEntries), live(s.weights), date, live(s.activities));
  return { date, target: model.target.target, tdee: Math.round(model.tdee), eatBackExercise: s.profile.eatBackExercise, weightKg: s.profile.weightKg };
}

/** Write today's snapshot if it is missing or out of date. Returns true when something was written. */
export function recordToday(date: ISODate = today()): boolean {
  const s = useStore.getState();
  const wanted = snapshotFor(s, date);
  if (!wanted) return false;
  const current = live(s.days).find((d) => d.date === date);
  if (current && current.target === wanted.target && current.tdee === wanted.tdee && current.eatBackExercise === wanted.eatBackExercise && current.weightKg === wanted.weightKg) return false;
  s.upsert('days', wanted);
  return true;
}

/** Keep today's snapshot current while the app runs. Returns a function that stops it. */
export function startDaySnapshots(): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => recordToday(), 800);
  };
  recordToday();
  const unsub = useStore.subscribe((state, prev) => {
    // Only what the targets depend on; writing the snapshot itself must not re-trigger this.
    if (state.profile !== prev.profile || state.foodEntries !== prev.foodEntries || state.weights !== prev.weights || state.activities !== prev.activities) schedule();
  });
  // Roll over at midnight even if nothing is logged.
  const tick = setInterval(() => recordToday(), 60_000);
  return () => {
    unsub();
    clearInterval(tick);
    if (timer) clearTimeout(timer);
  };
}
