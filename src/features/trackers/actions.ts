/**
 * Writes for the tracker screens. Each save or delete can be undone from the
 * toast, and weigh-ins keep `profile.weightKg` (and body fat) in step with the
 * newest record so calorie and water targets follow.
 */
import { formatDuration } from '@/lib/dates';
import { live } from '@/store/selectors';
import { useStore } from '@/store';
import type { FastingSession, ISODate, Profile, SleepEntry, WeightEntry } from '@/types';
import { haptic, toast } from '@/ui';

import { fastProgress, findByDate, isMostRecentDate } from './helpers';

type WeightPatch = Partial<Omit<WeightEntry, 'id' | 'updatedAt' | 'deleted' | 'date'>>;

function profileSnapshot(): Pick<Profile, 'weightKg' | 'bodyFatPct'> | null {
  const p = useStore.getState().profile;
  return p ? { weightKg: p.weightKg, bodyFatPct: p.bodyFatPct } : null;
}

/** Point the profile at the newest live weigh-in. */
function syncProfileToLatest() {
  const s = useStore.getState();
  const entries = live(s.weights).sort((a, b) => a.date.localeCompare(b.date));
  const latest = entries[entries.length - 1];
  if (latest && s.profile && latest.kg !== s.profile.weightKg) s.setProfile({ weightKg: latest.kg });
}

/**
 * Save or update the record for `date` (one per date). Fields not in the patch
 * are kept, so saving a weight does not wipe measurements and vice versa.
 */
export function saveWeightRecord(date: ISODate, patch: WeightPatch & { kg: number }, opts: { message?: string } = {}): WeightEntry {
  const s = useStore.getState();
  const entries = live(s.weights);
  const existing = findByDate(entries, date);
  const before = profileSnapshot();
  const saved = s.upsert('weights', { ...(existing ?? {}), ...patch, date, id: existing?.id });
  const updatesProfile = isMostRecentDate(entries, date);
  if (updatesProfile) {
    s.setProfile({ weightKg: patch.kg, ...(patch.bodyFatPct !== undefined ? { bodyFatPct: patch.bodyFatPct } : {}) });
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
  s.remove('weights', entry.id);
  syncProfileToLatest();
  haptic.tap();
  toast('Weigh-in deleted', {
    label: 'Undo',
    onPress: () => {
      const st = useStore.getState();
      st.restore('weights', entry.id);
      if (before) st.setProfile(before);
    },
  });
}

export function saveSleep(date: ISODate, hours: number, quality: SleepEntry['quality']) {
  const s = useStore.getState();
  const existing = findByDate(live(s.sleep), date);
  const saved = s.upsert('sleep', { ...(existing ?? {}), date, hours, quality, id: existing?.id });
  haptic.success();
  toast(existing ? 'Sleep updated' : 'Sleep saved', {
    label: 'Undo',
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
  toast('Night deleted', { label: 'Undo', onPress: () => useStore.getState().restore('sleep', entry.id) });
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
