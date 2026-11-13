/**
 * Saving the store on the device.
 *
 * The state is split across many small storage values instead of one large
 * one: a `meta` value (profile, settings, pending flags) plus one value per
 * collection per month. A single value that grows forever eventually exceeds
 * what the platform will store or read in one piece (about 2 MB per value on
 * Android), after which the app could no longer load its own data. Month
 * buckets stay small, and a change rewrites only the bucket it touched.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, Platform } from 'react-native';
import { create } from 'zustand';

import { BUILTIN_FOODS } from '@/data/foods';
import type { Collection, Food, FoodEntry, SyncedRecord } from '@/types';

import { COLLECTIONS, emptyDirty, useStore, type StoreState } from './index';

export const META_KEY = 'healthcal/meta';
export const CHUNK_PREFIX = 'healthcal/c/';
/** The single value used by early builds; read once and then replaced by the split layout. */
export const LEGACY_KEY = 'healthcal-v1';

type RecordMap = Record<string, SyncedRecord>;

interface Meta {
  version: 2;
  ownerId: StoreState['ownerId'];
  profile: StoreState['profile'];
  settings: StoreState['settings'];
  recentFoods: StoreState['recentFoods'];
  recentActivityIds: StoreState['recentActivityIds'];
  dirty: StoreState['dirty'];
  profileDirty: boolean;
  settingsDirty: boolean;
  lastPulledAt: string | null;
  lastSyncedAt: string | null;
}

const META_FIELDS = ['ownerId', 'profile', 'settings', 'recentFoods', 'recentActivityIds', 'dirty', 'profileDirty', 'settingsDirty', 'lastPulledAt', 'lastSyncedAt'] as const;

/** Month bucket for a record: its calendar month when it has a date, otherwise one shared bucket. */
export function bucketOf(record: SyncedRecord): string {
  const r = record as { date?: unknown; start?: unknown };
  if (typeof r.date === 'string' && /^\d{4}-\d{2}/.test(r.date)) return r.date.slice(0, 7);
  if (typeof r.start === 'string' && /^\d{4}-\d{2}/.test(r.start)) return r.start.slice(0, 7);
  return 'all';
}

export const chunkKey = (collection: Collection, bucket: string) => `${CHUNK_PREFIX}${collection}/${bucket}`;

export function splitIntoChunks(collection: Collection, map: RecordMap): Record<string, RecordMap> {
  const out: Record<string, RecordMap> = {};
  for (const rec of Object.values(map)) {
    const key = chunkKey(collection, bucketOf(rec));
    (out[key] = out[key] ?? {})[rec.id] = rec;
  }
  return out;
}

/** Cheap fingerprint of a bucket: changes whenever a record is added, removed, edited or deleted. */
export function signature(bucket: RecordMap): string {
  let count = 0;
  let stamps = 0;
  let deleted = 0;
  for (const rec of Object.values(bucket)) {
    count += 1;
    stamps += Date.parse(rec.updatedAt) % 1_000_000_007;
    if (rec.deleted) deleted += 1;
  }
  return `${count}|${stamps}|${deleted}`;
}

let builtinById: Map<string, Food> | null = null;
const builtin = (id: string | undefined): Food | undefined => {
  if (!id) return undefined;
  builtinById = builtinById ?? new Map(BUILTIN_FOODS.map((f) => [f.id, f]));
  return builtinById.get(id);
};

/**
 * Diary entries carry the food they were logged from so they can be re-scaled
 * later. For bundled foods that definition already ships with the app, so it
 * is left out when saving and re-attached when loading.
 */
function serializeChunk(collection: Collection, bucket: RecordMap): string {
  if (collection !== 'foodEntries') return JSON.stringify(bucket);
  const slim: RecordMap = {};
  for (const rec of Object.values(bucket)) {
    const e = rec as FoodEntry;
    slim[rec.id] = e.food && e.food.source === 'builtin' && builtin(e.food.id) ? ({ ...e, food: undefined } as FoodEntry) : rec;
  }
  return JSON.stringify(slim);
}

function parseChunk(collection: Collection, raw: string): RecordMap {
  const bucket = JSON.parse(raw) as RecordMap;
  if (collection !== 'foodEntries') return bucket;
  for (const rec of Object.values(bucket)) {
    const e = rec as FoodEntry;
    if (!e.food) {
      const food = builtin(e.foodId);
      if (food) e.food = food;
    }
  }
  return bucket;
}

const TOMBSTONE_DAYS_SYNCED = 30;
const TOMBSTONE_HOURS_LOCAL = 24;

/**
 * Deleted records are kept as markers so the deletion can sync. Once a marker
 * has been uploaded and is a month old (or a day old when no account is in
 * use, where nothing needs it), it is dropped from the device.
 */
export function purgeTombstones(state: Partial<StoreState>, now: number = Date.now()): Partial<StoreState> {
  const maxAge = state.ownerId ? TOMBSTONE_DAYS_SYNCED * 86_400_000 : TOMBSTONE_HOURS_LOCAL * 3_600_000;
  const out: Partial<StoreState> = { ...state };
  for (const c of COLLECTIONS) {
    const map = state[c] as RecordMap | undefined;
    if (!map) continue;
    const pending = state.dirty?.[c] ?? {};
    let next: RecordMap | null = null;
    for (const rec of Object.values(map)) {
      if (!rec.deleted || pending[rec.id] || now - Date.parse(rec.updatedAt) < maxAge) continue;
      next = next ?? { ...map };
      delete next[rec.id];
    }
    if (next) (out as Record<string, unknown>)[c] = next;
  }
  return out;
}

/** Read everything saved on the device, or null when nothing has been saved yet. */
export async function loadPersisted(): Promise<Partial<StoreState> | null> {
  const keys = await AsyncStorage.getAllKeys();
  if (keys.includes(META_KEY)) {
    const chunkKeys = keys.filter((k) => k.startsWith(CHUNK_PREFIX));
    const pairs = await AsyncStorage.multiGet([META_KEY, ...chunkKeys]);
    const state: Partial<StoreState> = {};
    for (const [key, raw] of pairs) {
      if (!raw) continue;
      if (key === META_KEY) {
        const meta = JSON.parse(raw) as Meta;
        for (const f of META_FIELDS) (state as Record<string, unknown>)[f] = meta[f];
        continue;
      }
      const collection = key.slice(CHUNK_PREFIX.length).split('/')[0] as Collection;
      if (!COLLECTIONS.includes(collection)) continue;
      const map = ((state as Record<string, unknown>)[collection] = (state as Record<string, RecordMap>)[collection] ?? {}) as RecordMap;
      Object.assign(map, parseChunk(collection, raw));
    }
    return state;
  }
  if (keys.includes(LEGACY_KEY)) {
    const raw = await AsyncStorage.getItem(LEGACY_KEY);
    if (raw) return (JSON.parse(raw) as { state?: Partial<StoreState> }).state ?? null;
  }
  return null;
}

export interface Saver {
  /** Write whatever changed since the last save. Resolves when it is on the device. */
  flush: () => Promise<void>;
  /** Forget what was written before, so the next flush rewrites everything it compares. */
  reset: () => void;
}

/** Builds a saver that remembers what it last wrote and only writes the difference. */
export function createSaver(getState: () => StoreState): Saver {
  let lastMaps: Partial<Record<Collection, unknown>> = {};
  let lastSigs: Record<string, string> = {};
  let lastMeta: unknown[] = [];
  let running: Promise<void> = Promise.resolve();

  const save = async () => {
    const s = getState();
    const writes: [string, string][] = [];
    const removes: string[] = [];
    const nextSigs = { ...lastSigs };

    for (const c of COLLECTIONS) {
      if (s[c] === lastMaps[c]) continue;
      const chunks = splitIntoChunks(c, s[c] as RecordMap);
      for (const [key, bucket] of Object.entries(chunks)) {
        const sig = signature(bucket);
        if (nextSigs[key] !== sig) {
          writes.push([key, serializeChunk(c, bucket)]);
          nextSigs[key] = sig;
        }
      }
      const prefix = `${CHUNK_PREFIX}${c}/`;
      for (const key of Object.keys(nextSigs)) {
        if (key.startsWith(prefix) && !(key in chunks)) {
          removes.push(key);
          delete nextSigs[key];
        }
      }
    }

    const metaValues = META_FIELDS.map((f) => s[f]);
    if (metaValues.some((v, i) => v !== lastMeta[i])) {
      const meta: Meta = { version: 2, ownerId: s.ownerId, profile: s.profile, settings: s.settings, recentFoods: s.recentFoods, recentActivityIds: s.recentActivityIds, dirty: s.dirty, profileDirty: s.profileDirty, settingsDirty: s.settingsDirty, lastPulledAt: s.lastPulledAt, lastSyncedAt: s.lastSyncedAt };
      writes.push([META_KEY, JSON.stringify(meta)]);
    }

    if (writes.length) await AsyncStorage.multiSet(writes);
    if (removes.length) await AsyncStorage.multiRemove(removes);
    // Only now is the new layout complete, so the old single value can go.
    if (writes.length) await AsyncStorage.removeItem(LEGACY_KEY).catch(() => {});

    lastMaps = Object.fromEntries(COLLECTIONS.map((c) => [c, s[c]]));
    lastSigs = nextSigs;
    lastMeta = metaValues;
  };

  return {
    // Saves run one after another so a slow write is never overtaken by a newer one.
    flush: () => (running = running.catch(() => {}).then(save)),
    reset: () => {
      lastMaps = {};
      lastSigs = {};
      lastMeta = [];
    },
  };
}

// ------------------------------------------------------------- app wiring

export interface HydrationState {
  status: 'loading' | 'ready' | 'error';
  /** The last attempt to save failed (usually: the device or browser storage is full). */
  saveFailed: boolean;
}

export const useHydration = create<HydrationState>(() => ({ status: 'loading', saveFailed: false }));

let saver: Saver | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let started = false;

async function flushNow(): Promise<void> {
  if (!saver) return;
  if (timer) clearTimeout(timer);
  timer = null;
  try {
    await saver.flush();
    if (useHydration.getState().saveFailed) useHydration.setState({ saveFailed: false });
  } catch (error) {
    console.warn('Saving to the device failed', error);
    useHydration.setState({ saveFailed: true });
  }
}

/** Save pending changes right away (before signing out, erasing, or leaving the app). */
export function flushPersistence(): Promise<void> {
  return flushNow();
}

/** Another browser tab wrote to storage: fold its changes in so neither tab overwrites the other. */
async function mergeFromOtherTab(): Promise<void> {
  try {
    const snapshot = await loadPersisted();
    if (snapshot) useStore.getState().mergeLocal(snapshot);
  } catch {
    // The other tab may be mid-write; the next storage event retries.
  }
}

/** Load saved data into the store and keep saving changes from then on. Safe to call more than once. */
export async function startPersistence(): Promise<void> {
  if (started && useHydration.getState().status !== 'error') return;
  useHydration.setState({ status: 'loading' });
  try {
    const snapshot = await loadPersisted();
    if (snapshot) useStore.getState().hydrate(purgeTombstones({ ...snapshot, dirty: { ...emptyDirty(), ...(snapshot.dirty ?? {}) } }));
  } catch (error) {
    console.warn('Loading saved data failed', error);
    useHydration.setState({ status: 'error' });
    return;
  }
  useHydration.setState({ status: 'ready' });
  if (started) return;
  started = true;

  saver = createSaver(() => useStore.getState());
  useStore.subscribe((state) => {
    // Erasing everything must reach the device at once, not after a pause.
    const erased = state.profile === null && state.ownerId === null && COLLECTIONS.every((c) => Object.keys(state[c]).length === 0);
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void flushNow(), erased ? 0 : 300);
  });
  void flushNow();

  AppState.addEventListener('change', (next) => {
    if (next !== 'active') void flushNow();
  });
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.addEventListener('pagehide', () => void flushNow());
    let mergeTimer: ReturnType<typeof setTimeout> | null = null;
    window.addEventListener('storage', (event) => {
      if (!event.key || !event.key.startsWith('healthcal/')) return;
      if (mergeTimer) clearTimeout(mergeTimer);
      mergeTimer = setTimeout(() => void mergeFromOtherTab(), 120);
    });
  }
}

/** Remove everything this app saved on the device. Used by the recovery screen. */
export async function wipePersisted(): Promise<void> {
  const keys = await AsyncStorage.getAllKeys();
  await AsyncStorage.multiRemove(keys.filter((k) => k === LEGACY_KEY || k.startsWith('healthcal/')));
  saver?.reset();
  useStore.getState().resetAll();
}

/** Test and tooling handle: lets a browser test read the live state without knowing the storage layout. */
if ((typeof __DEV__ !== 'undefined' && __DEV__) || process.env.EXPO_PUBLIC_E2E === '1') {
  (globalThis as Record<string, unknown>).__healthcal = { getState: () => useStore.getState(), flush: flushNow };
}
