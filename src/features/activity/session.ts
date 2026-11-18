/**
 * The single path for writing activity sessions. Screens call these instead of
 * touching the store so every entry is built the same way (net and gross kcal
 * from the profile's weight at the time it was first saved), recents stay current and every change
 * can be undone.
 */
import { router } from 'expo-router';

import { ACTIVITY_BY_ID } from '@/data/activities';
import { isolateRtl } from '@/lib/bidi';
import { formulaTdee } from '@/lib/energy';
import { nowISO } from '@/lib/id';
import { useStore } from '@/store';
import type { ActivityEntry, Intensity, StrengthExercise } from '@/types';
import { haptic, toast } from '@/ui';

import { buildActivityEntry, rebuildActivityEntry } from './build';
import { useStrengthDrafts } from './strengthDraft';

export interface SaveActivityInput {
  activityId: string;
  intensity: Intensity;
  durationMin: number;
  distanceKm?: number | null;
  notes?: string | null;
  date: string;
  exercises?: StrengthExercise[] | null;
  /** Update this entry instead of adding a new one. */
  entryId?: string;
}

export function saveActivity(input: SaveActivityInput): ActivityEntry | null {
  const store = useStore.getState();
  const profile = store.profile;
  const activity = ACTIVITY_BY_ID[input.activityId];
  if (!profile || !activity) return null;
  const existing = input.entryId ? store.activities[input.entryId] : undefined;
  const current = { weightKg: profile.weightKg, baselineKcalPerDay: formulaTdee(profile) };
  // An edit keeps the calories the session was saved with unless its effort changed,
  // and never re-prices an old session at today's weight.
  const built = existing
    ? rebuildActivityEntry(existing, { ...input, activity }, current)
    : buildActivityEntry({ ...input, activity, ...current, loggedAt: nowISO() });

  if (existing) {
    const previous = existing;
    const entry = store.upsert('activities', { ...built, id: existing.id });
    haptic.success();
    toast(`${isolateRtl(entry.name)} updated`, {
      label: 'Undo',
      onPress: () => useStore.getState().upsert('activities', previous),
    });
    return entry;
  }

  const entry = store.upsert('activities', built);
  store.rememberActivity(activity.id);
  haptic.success();
  toast(`${isolateRtl(entry.name)} logged, about ${Math.round(entry.kcalNet)} kcal above resting`, {
    label: 'Undo',
    onPress: () => useStore.getState().remove('activities', entry.id),
  });
  return entry;
}

export function deleteActivity(entry: ActivityEntry): void {
  useStore.getState().remove('activities', entry.id);
  // An unsaved edit of this workout would otherwise outlive it.
  useStrengthDrafts.getState().discard(entry.id);
  haptic.tap();
  toast(`Removed ${isolateRtl(entry.name.toLowerCase())}`, {
    label: 'Undo',
    onPress: () => useStore.getState().restore('activities', entry.id),
  });
}

/** Open the right editor for a saved session. */
export function openSession(entry: ActivityEntry) {
  if (entry.exercises?.length) router.push(`/activity/strength?entryId=${entry.id}`);
  else router.push(`/activity/log?entryId=${entry.id}`);
}

/**
 * Leave the logging flow after save or delete: back to wherever it started
 * (the tab the user was on), skipping the picker. A deep-linked page with no
 * stack lands on the Train tab.
 */
export function leaveFlow() {
  if (router.canDismiss()) router.dismissAll();
  else router.replace('/train');
}
