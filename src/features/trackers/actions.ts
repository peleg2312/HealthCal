/**
 * Writes for the tracker screens. Each save or delete can be undone from the
 * toast, and weigh-ins keep `profile.weightKg` (and body fat) in step with the
 * newest record so calorie and water targets follow.
 */
import { formatDuration } from '@/lib/dates';
import { formatWeight } from '@/lib/units';
import { live } from '@/store/selectors';
import { useStore } from '@/store';
import type { FastingSession, ISODate, Profile, SleepEntry, SleepQuality, WeightEntry } from '@/types';
import { haptic, toast } from '@/ui';

import { bodyFatFollowsDelete, fastProgress, findByDate, isMostRecentDate, latestBodyFat, nightAfterEdit, weighInAfterEdit } from './helpers';
import { isSyncedWeighIn } from './weighInSource';

type WeightPatch = Partial<Omit<WeightEntry, 'id' | 'updatedAt' | 'deleted' | 'date'>>;

function profileSnapshot(): Pick<Profile, 'weightKg' | 'bodyFatPct'> | null {
  const p = useStore.getState().profile;
  return p ? { weightKg: p.weightKg, bodyFatPct: p.bodyFatPct } : null;
}

/**
 * Point the profile at the newest live weigh-in. When `bodyFatChanged`, body fat
 * also follows the newest weigh-in that has a reading, or is cleared, so BMR does
 * not keep using a value the user removed.
 */
function syncProfileToLatest(bodyFatChanged: boolean) {
  const s = useStore.getState();
  if (!s.profile) return;
  const entries = live(s.weights).sort((a, b) => a.date.localeCompare(b.date));
  const latest = entries[entries.length - 1];
  const patch: Partial<Profile> = {};
  if (latest && latest.kg !== s.profile.weightKg) patch.weightKg = latest.kg;
  if (bodyFatChanged) {
    const bf = latestBodyFat(entries);
    if (bf !== s.profile.bodyFatPct) patch.bodyFatPct = bf;
  }
  if (Object.keys(patch).length) s.setProfile(patch);
}

/**
 * Save or update the record for `date` (one per date). Fields not in the patch
 * are kept, so saving a weight does not wipe measurements and vice versa. A
 * weigh-in from a health store whose weight or body fat is changed here becomes
 * the person's own (`weighInAfterEdit`), and the sync leaves it alone after that.
 */
export function saveWeightRecord(date: ISODate, patch: WeightPatch & { kg: number }, opts: { message?: string } = {}): WeightEntry {
  const s = useStore.getState();
  const entries = live(s.weights);
  const existing = findByDate(entries, date);
  const before = profileSnapshot();
  const saved = s.upsert('weights', weighInAfterEdit(existing, date, patch));
  const updatesProfile = isMostRecentDate(entries, date);
  if (updatesProfile) {
    s.setProfile({ weightKg: patch.kg, ...(patch.bodyFatPct !== undefined ? { bodyFatPct: patch.bodyFatPct } : {}) });
    // Body fat cleared on the newest weigh-in: fall back to the newest other reading, or none.
    if ('bodyFatPct' in patch && patch.bodyFatPct === undefined) syncProfileToLatest(true);
  }
  haptic.success();
  toast(opts.message ?? (existing ? 'Weigh-in updated' : 'Weigh-in saved'), {
    label: 'Undo',
    onPress: () => {
      const st = useStore.getState();
      if (existing) st.upsert('weights', existing);
      else st.remove('weights', saved.id);
      if (updatesProfile && before) st.setProfile(before);
    },
  });
  return saved;
}

export function deleteWeightRecord(entry: WeightEntry) {
  const s = useStore.getState();
  const before = profileSnapshot();
  // Only the newest body fat reading feeds the profile, and only when the profile's value came from it:
  // deleting an older one, or one whose body fat the person typed over in Goals or on /body, leaves it alone.
  const feedsBodyFat = bodyFatFollowsDelete(s.profile, entry, live(s.weights));
  s.remove('weights', entry.id);
  syncProfileToLatest(feedsBodyFat);
  haptic.tap();
  // A synced one is not added again: its deletion marker (and the sync's memory) keep it out.
  toast(isSyncedWeighIn(entry) ? 'Weigh-in deleted. Sync will not add it again' : 'Weigh-in deleted', {
    label: 'Undo',
    onPress: () => {
      const st = useStore.getState();
      st.restore('weights', entry.id);
      if (before) st.setProfile(before);
    },
  });
}

/**
 * "Use it for targets" on /weight: point the profile at a synced weigh-in, by
 * the person's own tap (a sync never writes the profile). Sets the weight, and
 * the body fat when the weigh-in has one; Undo puts the earlier figures back.
 * (Not named use…: it is called from a press handler, not a hook.)
 */
export function applyWeighInToTargets(entry: Pick<WeightEntry, 'kg' | 'bodyFatPct'>) {
  const s = useStore.getState();
  if (!s.profile) return;
  const before = profileSnapshot();
  s.setProfile({ weightKg: entry.kg, ...(typeof entry.bodyFatPct === 'number' ? { bodyFatPct: entry.bodyFatPct } : {}) });
  haptic.success();
  toast(`Targets now use ${formatWeight(entry.kg, s.profile.units)}`, {
    label: 'Undo',
    tint: 'weight',
    onPress: () => {
      if (before) useStore.getState().setProfile(before);
    },
  });
}

/**
 * Save the night for `date`. `quality` null leaves the night without one (a synced
 * night the person has not rated). A night read from a health store stays one
 * while only its quality changes; a new time asleep makes it the person's own
 * (`nightAfterEdit`). Undo puts the whole previous record back.
 */
export function saveSleep(date: ISODate, hours: number, quality: SleepQuality | null) {
  const s = useStore.getState();
  const existing = findByDate(live(s.sleep), date);
  const saved = s.upsert('sleep', nightAfterEdit(existing, date, hours, quality));
  haptic.success();
  toast(existing ? 'Sleep updated' : 'Sleep saved', {
    label: 'Undo',
    tint: 'sleep',
    onPress: () => {
      const st = useStore.getState();
      if (existing) st.upsert('sleep', existing);
      else st.remove('sleep', saved.id);
    },
  });
}

export function deleteSleep(entry: SleepEntry) {
  useStore.getState().remove('sleep', entry.id);
  haptic.tap();
  toast('Night deleted', { label: 'Undo', tint: 'sleep', onPress: () => useStore.getState().restore('sleep', entry.id) });
}

export function startFast(targetHours: number, startISO: string = new Date().toISOString()): FastingSession {
  haptic.press();
  return useStore.getState().upsert('fasting', { start: startISO, targetHours });
}

export function updateFast(session: FastingSession, patch: Partial<Pick<FastingSession, 'start' | 'end' | 'targetHours'>>) {
  return useStore.getState().upsert('fasting', { ...session, ...patch });
}

export function endFast(session: FastingSession) {
  const ended = updateFast(session, { end: new Date().toISOString() });
  const mins = Math.round(fastProgress(ended.start, ended.targetHours, Date.now(), ended.end).elapsedMs / 60_000);
  const message = `Fast ended after ${formatDuration(mins)}`;
  haptic.success();
  toast(message, {
    label: 'Undo',
    onPress: () => {
      const { end: _end, ...rest } = ended;
      useStore.getState().upsert('fasting', rest);
    },
  });
}

export function deleteFast(session: FastingSession) {
  useStore.getState().remove('fasting', session.id);
  haptic.tap();
  toast('Fast deleted', { label: 'Undo', onPress: () => useStore.getState().restore('fasting', session.id) });
}
