/**
 * Whether a change to the store was the person's own doing: a record in one of their logs (food, water,
 * workouts, weigh-ins, nights, fasts, their foods, meals, favourites and routines) written on this device just
 * now. Pure, no React: the morning watcher (./useMorningPage) asks it on every store change so the morning page
 * stands down once the person has acted in this visit (./rule, 'acted').
 *
 * Left out, because the app writes them by itself: the day snapshots (`days`), and records a health store
 * brought in (`source: 'health'`). A record a sync pulled carries the time it was written on the other device,
 * so it is not "just now" unless someone used the two devices within the same seconds.
 */
export const PERSON_COLLECTIONS = ['foodEntries', 'customFoods', 'savedMeals', 'activities', 'water', 'weights', 'sleep', 'fasting', 'favorites', 'routines'] as const;

/** A record written within this many ms of the change is one this device wrote now. */
export const JUST_NOW_MS = 5000;

type Rec = { updatedAt?: string; source?: string } | null | undefined;
type Maps = Partial<Record<(typeof PERSON_COLLECTIONS)[number], Record<string, Rec> | undefined>>;

export function wroteByPerson(next: Maps, prev: Maps, now: number): boolean {
  for (const c of PERSON_COLLECTIONS) {
    const a = next[c];
    const b = prev[c];
    if (a === b || !a) continue;
    for (const id of Object.keys(a)) {
      const r = a[id];
      if (!r || r === b?.[id] || r.source === 'health') continue;
      const at = r.updatedAt ? Date.parse(r.updatedAt) : Number.NaN;
      if (Number.isFinite(at) && at >= now - JUST_NOW_MS) return true;
    }
  }
  return false;
}
