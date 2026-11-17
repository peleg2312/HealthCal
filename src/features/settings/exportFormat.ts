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
  /** Null in a parsed backup whose settings were missing or malformed. */
  settings: Settings | null;
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

export const BACKUP_COLLECTIONS: Collection[] = ['foodEntries', 'customFoods', 'savedMeals', 'activities', 'water', 'weights', 'sleep', 'fasting', 'favorites', 'days', 'routines'];

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

export type ParseResult = { ok: true; backup: Backup; skipped: number } | { ok: false; message: string };

// --------------------------------------------------------- validation
//
// A backup can be hand-edited or come from elsewhere. Every record is checked
// against the shape the app and the sync server need (UUID id, parseable
// timestamp, real day key, finite numbers), because one bad row would fail
// every sync push or crash the screens that read it. Bad records are skipped
// and counted, never repaired by guesswork.

type Obj = Record<string, unknown>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MEALS = ['breakfast', 'lunch', 'dinner', 'snack'];

const isObj = (x: unknown): x is Obj => !!x && typeof x === 'object' && !Array.isArray(x);
const isStr = (x: unknown): x is string => typeof x === 'string';
const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const isNonNeg = (x: unknown): x is number => isNum(x) && x >= 0;
const optNum = (x: unknown) => x === undefined || x === null || isNum(x);
const isTime = (x: unknown) => isStr(x) && Number.isFinite(Date.parse(x));

/** A real local calendar day key, YYYY-MM-DD. */
export function isDayKey(x: unknown): x is string {
  if (!isStr(x) || !/^\d{4}-\d{2}-\d{2}$/.test(x)) return false;
  const [y, m, d] = x.split('-').map(Number);
  const date = new Date(y, m - 1, d, 12);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

function isRecord(x: unknown): x is SyncedRecord & Obj {
  return isObj(x) && isStr(x.id) && UUID.test(x.id) && isTime(x.updatedAt) && (x.deleted === undefined || typeof x.deleted === 'boolean');
}

export function isNutrients(x: unknown): boolean {
  return (
    isObj(x) &&
    isNonNeg(x.kcal) &&
    isNonNeg(x.protein) &&
    isNonNeg(x.carbs) &&
    isNonNeg(x.fat) &&
    optNum(x.fiber) &&
    optNum(x.sugar) &&
    optNum(x.satFat) &&
    optNum(x.sodium)
  );
}

export function isFood(x: unknown): x is Food {
  return (
    isObj(x) &&
    isStr(x.id) &&
    x.id.length > 0 &&
    isStr(x.name) &&
    isNutrients(x.per100g) &&
    Array.isArray(x.servings) &&
    x.servings.every((v) => isObj(v) && isStr(v.label) && isNum(v.grams) && v.grams > 0) &&
    isStr(x.source)
  );
}

function isLoggedItem(x: unknown): boolean {
  return isObj(x) && isStr(x.name) && isNutrients(x.nutrients) && optNum(x.quantity) && optNum(x.grams) && (x.food === undefined || x.food === null || isFood(x.food));
}

const SLEEP_STORES = ['healthConnect', 'healthKit', 'file'];
const SLEEP_STAGES = ['light', 'deep', 'rem', 'awake'] as const;

/** A night's optional fields: its rating, and where a synced night came from (SleepEntry in src/types). */
function isSleepExtras(r: Obj): boolean {
  const q = r.quality;
  const s = r.stages;
  return (
    (q === undefined || (Number.isInteger(q) && (q as number) >= 1 && (q as number) <= 5)) &&
    (r.source === undefined || r.source === 'health') &&
    (r.store === undefined || SLEEP_STORES.includes(r.store as string)) &&
    (r.origin === undefined || isStr(r.origin)) &&
    (r.startedAt === undefined || isTime(r.startedAt)) &&
    (r.endedAt === undefined || isTime(r.endedAt)) &&
    (s === undefined || s === null || (isObj(s) && SLEEP_STAGES.every((k) => isNonNeg(s[k]))))
  );
}

/** Shape checks per collection, on top of the common id and timestamp. */
const VALIDATORS: Record<Collection, (r: Obj) => boolean> = {
  foodEntries: (r) => isDayKey(r.date) && MEALS.includes(r.meal as string) && isLoggedItem(r),
  customFoods: (r) => isFood(r),
  savedMeals: (r) => isStr(r.name) && Array.isArray(r.items) && r.items.every(isLoggedItem) && optNum(r.servings),
  activities: (r) => isDayKey(r.date) && isStr(r.name) && isNonNeg(r.durationMin) && isNonNeg(r.kcalNet) && isNonNeg(r.kcalGross) && optNum(r.met) && optNum(r.distanceKm),
  water: (r) => isDayKey(r.date) && isNum(r.ml) && r.ml > 0 && r.ml <= 10000,
  weights: (r) => isDayKey(r.date) && isNum(r.kg) && r.kg > 0 && r.kg < 700 && optNum(r.bodyFatPct),
  sleep: (r) => isDayKey(r.date) && isNum(r.hours) && r.hours >= 0 && r.hours <= 24 && isSleepExtras(r),
  fasting: (r) => isTime(r.start) && (r.end === undefined || r.end === null || isTime(r.end)) && isNum(r.targetHours),
  favorites: (r) => isFood(r.food),
  days: (r) => isDayKey(r.date) && isNonNeg(r.target) && isNonNeg(r.tdee) && isNum(r.weightKg),
  routines: (r) =>
    isStr(r.name) &&
    r.name.length > 0 &&
    isStr(r.createdAt) &&
    Array.isArray(r.exercises) &&
    r.exercises.every((e) => isObj(e) && isStr(e.name) && isNum(e.sets) && e.sets >= 0),
};

export function isValidRecord(collection: Collection, x: unknown): boolean {
  return isRecord(x) && VALIDATORS[collection](x);
}

/** The profile fields the energy maths reads. Anything else is kept as it is. */
export function isValidProfile(x: unknown): x is Profile {
  return (
    isObj(x) &&
    isTime(x.updatedAt) &&
    (x.sex === 'female' || x.sex === 'male') &&
    isDayKey(x.birthDate) &&
    isNum(x.heightCm) &&
    x.heightCm > 50 &&
    x.heightCm < 300 &&
    isNum(x.weightKg) &&
    x.weightKg > 20 &&
    x.weightKg < 700 &&
    (x.goal === 'lose' || x.goal === 'maintain' || x.goal === 'gain') &&
    isNonNeg(x.weeklyRateKg) &&
    (x.units === 'metric' || x.units === 'imperial') &&
    isStr(x.activityLevel) &&
    optNum(x.targetWeightKg) &&
    optNum(x.calorieTargetOverride) &&
    optNum(x.waterGoalMlOverride) &&
    optNum(x.bodyFatPct) &&
    (x.macroSplitOverride === undefined ||
      x.macroSplitOverride === null ||
      (isObj(x.macroSplitOverride) && isNonNeg(x.macroSplitOverride.protein) && isNonNeg(x.macroSplitOverride.carbs) && isNonNeg(x.macroSplitOverride.fat)))
  );
}

function isValidSettings(x: unknown): x is Settings {
  return (
    isObj(x) &&
    isTime(x.updatedAt) &&
    (x.reminders === undefined || isObj(x.reminders)) &&
    (x.waterPresets === undefined || (Array.isArray(x.waterPresets) && x.waterPresets.every(isNum))) &&
    (x.morningSummary === undefined || typeof x.morningSummary === 'boolean') &&
    (x.morningSeenDay === undefined || isDayKey(x.morningSeenDay))
  );
}

/** Validate an imported file. Unknown fields are kept; malformed records are skipped and counted. */
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
  let skipped = 0;
  const collections = {} as BackupCollections;
  for (const c of BACKUP_COLLECTIONS) {
    const list = (o.collections as Partial<BackupCollections> | undefined)?.[c];
    const all: unknown[] = Array.isArray(list) ? list : [];
    collections[c] = all.filter((r) => isValidRecord(c, r)) as SyncedRecord[];
    skipped += all.length - collections[c].length;
  }
  const profile = o.profile === null || o.profile === undefined ? null : isValidProfile(o.profile) ? o.profile : null;
  if (o.profile && !profile) skipped += 1;
  const recent: unknown[] = Array.isArray(o.recentFoods) ? o.recentFoods : [];
  return {
    ok: true,
    skipped,
    backup: {
      format: BACKUP_FORMAT,
      version: o.version,
      exportedAt: typeof o.exportedAt === 'string' ? o.exportedAt : '',
      app: 'HealthCal',
      units: 'metric',
      profile,
      // Null when missing or malformed: the device keeps its own settings.
      settings: isValidSettings(o.settings) ? o.settings : null,
      collections,
      favoriteFoodIds: Array.isArray(o.favoriteFoodIds) ? o.favoriteFoodIds.filter((x) => typeof x === 'string') : [],
      recentFoods: recent.filter(isFood),
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
