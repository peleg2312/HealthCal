/**
 * Pure builders for exports and backups: CSV tables for spreadsheets and a
 * complete JSON backup that can be imported again (merge by id, newer wins).
 */
import { effectiveMl } from '@/lib/hydration';
import type {
  ActivityEntry,
  Collection,
  Food,
  FoodEntry,
  Profile,
  Settings,
  SyncedRecord,
  WaterEntry,
  WeightEntry,
} from '@/types';

// ------------------------------------------------------------------ CSV

export type Cell = string | number | boolean | null | undefined;

/**
 * RFC 4180 cell. Text that a spreadsheet would run as a formula (= + - @ at
 * the start) is prefixed with an apostrophe so an export can never execute.
 */
export function csvCell(v: Cell): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return Number.isFinite(v) ? String(Math.round(v * 100) / 100) : '';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  let s = v;
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers: string[], rows: Cell[][]): string {
  return [headers, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

const byDateThen = <T extends { date: string }>(key: (x: T) => string) => (a: T, b: T) =>
  a.date.localeCompare(b.date) || key(a).localeCompare(key(b));

const MEAL_ORDER = { breakfast: 0, lunch: 1, dinner: 2, snack: 3 } as const;

export function foodCsv(entries: FoodEntry[]): string {
  const rows = entries
    .filter((e) => !e.deleted)
    .sort((a, b) => a.date.localeCompare(b.date) || MEAL_ORDER[a.meal] - MEAL_ORDER[b.meal] || a.loggedAt.localeCompare(b.loggedAt))
    .map((e) => [
      e.date,
      e.meal,
      e.name,
      e.brand,
      e.quantity,
      e.servingLabel,
      e.grams || null,
      e.nutrients.kcal,
      e.nutrients.protein,
      e.nutrients.carbs,
      e.nutrients.fat,
      e.nutrients.fiber,
      e.nutrients.sugar,
      e.nutrients.sodium,
      e.source,
      e.kcalRange ? `${e.kcalRange[0]}-${e.kcalRange[1]}` : null,
      e.loggedAt,
    ]);
  return toCsv(
    ['date', 'meal', 'food', 'brand', 'quantity', 'serving', 'grams', 'kcal', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g', 'sugar_g', 'sodium_mg', 'source', 'kcal_range', 'logged_at'],
    rows,
  );
}

export function activitiesCsv(entries: ActivityEntry[]): string {
  const rows = entries
    .filter((e) => !e.deleted)
    .sort(byDateThen((x) => x.loggedAt))
    .map((e) => [e.date, e.name, e.category, e.intensity, e.durationMin, e.distanceKm, e.met, e.kcalNet, e.kcalGross, e.notes]);
  return toCsv(['date', 'activity', 'category', 'intensity', 'duration_min', 'distance_km', 'met', 'kcal_net', 'kcal_gross', 'notes'], rows);
}

export function weightCsv(entries: WeightEntry[]): string {
  const rows = entries
    .filter((e) => !e.deleted)
    .sort(byDateThen((x) => x.updatedAt))
    .map((e) => [e.date, e.kg, e.bodyFatPct, e.waistCm, e.hipCm, e.neckCm, e.note]);
  return toCsv(['date', 'weight_kg', 'body_fat_pct', 'waist_cm', 'hip_cm', 'neck_cm', 'note'], rows);
}

export function waterCsv(entries: WaterEntry[]): string {
  const rows = entries
    .filter((e) => !e.deleted)
    .sort(byDateThen((x) => x.loggedAt))
    .map((e) => [e.date, e.beverage, e.ml, Math.round(effectiveMl(e.ml, e.beverage)), e.loggedAt]);
  return toCsv(['date', 'drink', 'ml', 'hydration_ml', 'logged_at'], rows);
}

// --------------------------------------------------------------- backup

export const BACKUP_FORMAT = 'healthcal-backup';
export const BACKUP_VERSION = 1;

export type BackupCollections = { [K in Collection]: SyncedRecord[] };

export interface Backup {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  app: 'HealthCal';
  /** Stored values are metric: kg, cm, ml, km, kcal, g. */
  units: 'metric';
  profile: Profile | null;
  settings: Settings;
  collections: BackupCollections;
  favoriteFoodIds: string[];
  recentFoods: Food[];
  recentActivityIds: string[];
}

export interface BackupSource {
  profile: Profile | null;
  settings: Settings;
  collections: { [K in Collection]: Record<string, SyncedRecord> };
  favoriteFoodIds: string[];
  recentFoods: Food[];
  recentActivityIds: string[];
}

export const BACKUP_COLLECTIONS: Collection[] = ['foodEntries', 'customFoods', 'savedMeals', 'activities', 'water', 'weights', 'sleep', 'fasting'];

/** Everything the user created, live records only. */
export function buildBackup(src: BackupSource, now: Date = new Date()): Backup {
  const collections = {} as BackupCollections;
  for (const c of BACKUP_COLLECTIONS) {
    collections[c] = Object.values(src.collections[c] ?? {})
      .filter((r) => !r.deleted)
      .sort((a, b) => a.id.localeCompare(b.id));
  }
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    app: 'HealthCal',
    units: 'metric',
    profile: src.profile,
    settings: src.settings,
    collections,
    favoriteFoodIds: src.favoriteFoodIds,
    recentFoods: src.recentFoods,
    recentActivityIds: src.recentActivityIds,
  };
}

export function backupJson(src: BackupSource, now: Date = new Date()): string {
  return JSON.stringify(buildBackup(src, now), null, 2);
}

export type ParseResult = { ok: true; backup: Backup } | { ok: false; message: string };

function isRecord(x: unknown): x is SyncedRecord {
  return !!x && typeof x === 'object' && typeof (x as SyncedRecord).id === 'string' && typeof (x as SyncedRecord).updatedAt === 'string';
}

/** Validate an imported file. Unknown fields are kept; malformed records are skipped. */
export function parseBackup(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, message: 'This file is not valid JSON. Choose a HealthCal backup file.' };
  }
  const o = raw as Partial<Backup> | null;
  if (!o || typeof o !== 'object' || o.format !== BACKUP_FORMAT) {
    return { ok: false, message: 'This file is not a HealthCal backup.' };
  }
  if (typeof o.version !== 'number' || o.version > BACKUP_VERSION) {
    return { ok: false, message: 'This backup was made by a newer version of HealthCal. Update the app and try again.' };
  }
  const collections = {} as BackupCollections;
  for (const c of BACKUP_COLLECTIONS) {
    const list = (o.collections as Partial<BackupCollections> | undefined)?.[c];
    collections[c] = Array.isArray(list) ? list.filter(isRecord) : [];
  }
  return {
    ok: true,
    backup: {
      format: BACKUP_FORMAT,
      version: o.version,
      exportedAt: typeof o.exportedAt === 'string' ? o.exportedAt : '',
      app: 'HealthCal',
      units: 'metric',
      profile: o.profile && typeof o.profile === 'object' ? o.profile : null,
      settings: o.settings as Settings,
      collections,
      favoriteFoodIds: Array.isArray(o.favoriteFoodIds) ? o.favoriteFoodIds.filter((x) => typeof x === 'string') : [],
      recentFoods: Array.isArray(o.recentFoods) ? o.recentFoods : [],
      recentActivityIds: Array.isArray(o.recentActivityIds) ? o.recentActivityIds.filter((x) => typeof x === 'string') : [],
    },
  };
}

export interface MergeResult {
  collections: { [K in Collection]: Record<string, SyncedRecord> };
  /** Ids that were added or replaced, per collection (to mark for sync). */
  changed: { [K in Collection]: string[] };
  added: number;
  updated: number;
  unchanged: number;
}

/** Merge by id; a record replaces the local one only when it is newer. */
export function mergeCollections(
  local: { [K in Collection]: Record<string, SyncedRecord> },
  incoming: BackupCollections,
): MergeResult {
  const collections = {} as MergeResult['collections'];
  const changed = {} as MergeResult['changed'];
  let added = 0;
  let updated = 0;
  let unchanged = 0;
  for (const c of BACKUP_COLLECTIONS) {
    const next = { ...(local[c] ?? {}) };
    changed[c] = [];
    for (const r of incoming[c] ?? []) {
      const mine = next[r.id];
      if (!mine) {
        next[r.id] = r;
        changed[c].push(r.id);
        added += 1;
      } else if (r.updatedAt > mine.updatedAt) {
        next[r.id] = r;
        changed[c].push(r.id);
        updated += 1;
      } else unchanged += 1;
    }
    collections[c] = next;
  }
  return { collections, changed, added, updated, unchanged };
}

/** File name stem with the local date: healthcal-food-2026-11-13. */
export function exportFileName(kind: string, date: string, ext: 'csv' | 'json'): string {
  return `healthcal-${kind}-${date}.${ext}`;
}
