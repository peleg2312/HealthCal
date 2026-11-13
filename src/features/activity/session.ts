/**
 * The single path for writing activity sessions. Screens call these instead of
 * touching the store so every entry is built the same way (net and gross kcal
 * from the profile's current weight), recents stay current and every change
 * can be undone.
 */
import { router } from 'expo-router';

import { ACTIVITY_BY_ID } from '@/data/activities';
import { formulaTdee } from '@/lib/energy';
import { nowISO } from '@/lib/id';
import { useStore } from '@/store';
import type { ActivityEntry, Intensity, StrengthExercise } from '@/types';
import { haptic, toast } from '@/ui';

import { buildActivityEntry } from './build';

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
  const built = buildActivityEntry({
    ...input,
    activity,
    weightKg: profile.weightKg,
    baselineKcalPerDay: formulaTdee(profile),
    loggedAt: existing?.loggedAt ?? nowISO(),
  });

  if (existing) {
    const previous = existing;
    const entry = store.upsert('activities', { ...built, id: existing.id });
    haptic.success();
    toast(`${entry.name} updated`, {
      label: 'Undo',
      onPress: () => useStore.getState().upsert('activities', previous),
    });
    return entry;
  }

  const entry = store.upsert('activities', built);
  store.rememberActivity(activity.id);
  haptic.success();
  toast(`${entry.name} logged, about ${Math.round(entry.kcalNet)} kcal above resting`, {
    label: 'Undo',
    onPress: () => useStore.getState().remove('activities', entry.id),
  });
  return entry;
}

export function deleteActivity(entry: ActivityEntry): void {
  useStore.getState().remove('activities', entry.id);
  haptic.tap();
  toast(`Removed ${entry.name.toLowerCase()}`, {
    label: 'Undo',
    onPress: () => useStore.getState().restore('activities', entry.id),
  });
}

/** Open the right editor for a saved session. */
export function openSession(entry: ActivityEntry) {
  if (entry.exercises?.length) router.push(`/activity/strength?entryId=${entry.id}`);
  else router.push(`/activity/log?entryId=${entry.id}`);
}
