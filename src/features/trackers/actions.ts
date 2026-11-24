/**
 * Writes for the tracker screens. Each save or delete can be undone from the
 * toast. Saving the newest weigh-in points `profile.weightKg` (and body fat) at
 * it, so calorie and water targets follow; deleting one moves the profile only
 * when its figures came from that weigh-in (`profileAfterDelete`). A weigh-in a
 * health store wrote reaches the profile only by the person's own save of it or
 * "Use it for targets", never by deleting another one.
 */
import { rememberDeletedNight, rememberDeletedWeighIn } from '@/features/health-sync/deletions';
import { formatDuration } from '@/lib/dates';
import { live } from '@/store/selectors';
import { useStore } from '@/store';
import type { FastingSession, ISODate, Profile, SleepEntry, SleepQuality, WeightEntry } from '@/types';
import { haptic, toast } from '@/ui';

import { fastProgress, findByDate, isMostRecentDate, nightAfterEdit, ownLatestBodyFat, profileAfterDelete, weighInAfterEdit, weightText } from './helpers';
import { isSyncedWeighIn, sameFat } from './weighInSource';

type WeightPatch = Partial<Omit<WeightEntry, 'id' | 'updatedAt' | 'deleted' | 'date'>>;

function profileSnapshot(): Pick<Profile, 'weightKg' | 'bodyFatPct'> | null {
  const p = useStore.getState().profile;
  return p ? { weightKg: p.weightKg, bodyFatPct: p.bodyFatPct } : null;
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
    // Body fat cleared on the newest weigh-in: fall back to the newest other reading of the person's own, or none.
    if ('bodyFatPct' in patch && patch.bodyFatPct === undefined) {
      const st = useStore.getState();
      const bf = ownLatestBodyFat(live(st.weights));
      if (st.profile && bf !== st.profile.bodyFatPct) st.setProfile({ bodyFatPct: bf });
    }
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
  // The profile moves only when its figures came from this weigh-in, and never onto a synced one by itself.
  const patch = profileAfterDelete(s.profile, entry, live(s.weights));
  s.remove('weights', entry.id);
  if (Object.keys(patch).length) s.setProfile(patch);
  // Remembered now, not at the next sync: without an account the deletion marker is gone a day later.
  const forget = rememberDeletedWeighIn(entry);
  haptic.tap();
  // A synced one is not added again: its deletion marker (and the sync's memory) keep it out.
  toast(isSyncedWeighIn(entry) ? 'Weigh-in deleted. Sync will not add it again' : 'Weigh-in deleted', {
    label: 'Undo',
    onPress: () => {
      const st = useStore.getState();
      st.restore('weights', entry.id);
      forget();
      if (before && Object.keys(patch).length) st.setProfile(before);
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
  // Name the body fat too when the tap changed it, so the toast says everything the tap set.
  const fat = typeof entry.bodyFatPct === 'number' && !sameFat(entry.bodyFatPct, s.profile.bodyFatPct) ? ` and ${entry.bodyFatPct.toFixed(1)}% body fat` : '';
  // One decimal, as the weigh-in it names is shown ("Targets now use 82.0 kg").
  toast(`Targets now use ${weightText(entry.kg, s.profile.units)}${fat}`, {
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
  // Remembered now, not at the next sync: without an account the deletion marker is gone a day later.
  const forget = rememberDeletedNight(entry);
  haptic.tap();
  toast('Night deleted', {
    label: 'Undo',
    tint: 'sleep',
    onPress: () => {
      useStore.getState().restore('sleep', entry.id);
      forget();
    },
  });
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
