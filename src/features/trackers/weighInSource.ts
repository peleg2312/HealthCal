/**
 * Whether a weigh-in is one a health store wrote (src/features/health-sync/body.ts)
 * and still holds the figures the sync wrote, and the words for where it came from.
 *
 * A record is a synced one only while its kg and body fat still equal what the
 * sync wrote (`syncedKg`, `syncedBodyFatPct`). Anything else is the person's
 * own, whatever its `source` says: an older app, onboarding or a backup restore
 * can change the figures while keeping the other fields, and a value the person
 * typed always wins. Every rule and every screen asks this, never `source` alone.
 */
import { originName } from '@/features/health-sync/origins';
import type { WeightEntry } from '@/types';

/** Two kilogram figures are the same reading below this difference (the sheet saves 2 decimals). */
export const KG_SAME = 0.005;
/** Two body-fat figures are the same below this difference (saved with 1 decimal). */
export const FAT_SAME = 0.05;

const num = (x: unknown): number | undefined => (typeof x === 'number' && Number.isFinite(x) ? x : undefined);

/** True when both are absent, or both present and within FAT_SAME. */
export function sameFat(a: number | null | undefined, b: number | null | undefined): boolean {
  const x = num(a);
  const y = num(b);
  if (x === undefined || y === undefined) return x === undefined && y === undefined;
  return Math.abs(x - y) < FAT_SAME;
}

/** True when the two kilogram figures are one reading. */
export const sameKg = (a: number, b: number): boolean => Math.abs(a - b) < KG_SAME;

type SyncFields = Pick<WeightEntry, 'kg' | 'bodyFatPct' | 'source' | 'syncedKg' | 'syncedBodyFatPct'>;

/** A weigh-in a health store wrote, still as it wrote it. */
export function isSyncedWeighIn(r: SyncFields | null | undefined): boolean {
  if (!r || r.source !== 'health') return false;
  const synced = num(r.syncedKg);
  if (synced === undefined || typeof r.kg !== 'number' || !sameKg(r.kg, synced)) return false;
  return sameFat(r.bodyFatPct, r.syncedBodyFatPct);
}

/** The fields that say a weigh-in came from a health store: dropped when it becomes the person's own. */
export const WEIGH_IN_SYNC_FIELDS = ['source', 'store', 'origin', 'measuredAt', 'syncedKg', 'syncedBodyFatPct'] as const;

/** The record without the fields that say where a reading came from. */
export function withoutSyncFields<T extends Partial<WeightEntry>>(r: T): T {
  const out: T = { ...r };
  for (const k of WEIGH_IN_SYNC_FIELDS) delete out[k];
  return out;
}

/**
 * "From Garmin Connect" for a synced weigh-in, "From your Health export" for one
 * from the export file, null otherwise (entered or changed by the person).
 */
export function weighInFromLine(r: SyncFields & Pick<WeightEntry, 'store' | 'origin'>): string | null {
  if (!isSyncedWeighIn(r)) return null;
  if (r.store === 'file') return 'From your Health export';
  return `From ${r.origin ? originName(r.origin) : 'your health app'}`;
}
