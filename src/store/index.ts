/**
 * Single local-first store. Every screen reads and writes here; the UI never
 * waits on the network. The sync service pushes `dirty` records to the backend
 * and merges remote changes back in with last-write-wins on `updatedAt`.
 * Saving to the device is handled separately by ./persistence.
 */
import { create } from 'zustand';

import { stableId } from '@/lib/hash';
import { newId } from '@/lib/id';
import type {
  ActivityEntry,
  Collection,
  CustomFood,
  FastingSession,
  FavoriteFood,
  Food,
  FoodEntry,
  Profile,
  SavedMeal,
  Settings,
  SleepEntry,
  SyncedRecord,
  WaterEntry,
  WeightEntry,
} from '@/types';

export interface CollectionTypes {
  foodEntries: FoodEntry;
  customFoods: CustomFood;
  savedMeals: SavedMeal;
  activities: ActivityEntry;
  water: WaterEntry;
  weights: WeightEntry;
  sleep: SleepEntry;
  fasting: FastingSession;
  favorites: FavoriteFood;
}

export const COLLECTIONS: Collection[] = [
  'foodEntries',
  'customFoods',
  'savedMeals',
  'activities',
  'water',
  'weights',
  'sleep',
  'fasting',
  'favorites',
];

/** Collections that hold at most one live record per calendar day. */
export const ONE_PER_DATE: Collection[] = ['weights', 'sleep'];

type Collections = { [K in Collection]: Record<string, CollectionTypes[K]> };
type Dirty = { [K in Collection]: Record<string, true> };

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  haptics: true,
  celebrations: true,
  waterPresets: [150, 250, 330, 500],
  fastingTargetHours: 16,
  reminders: {
    enabled: false,
    quietStart: '22:00',
    quietEnd: '07:30',
    water: { enabled: true, everyMinutes: 120 },
    meals: { enabled: true, breakfast: '08:30', lunch: '13:00', dinner: '19:30' },
    dailySummary: { enabled: true, time: '20:30' },
    weighIn: { enabled: false, time: '07:45', weekdays: [1, 4] },
    movement: { enabled: false, time: '17:30' },
  },
  updatedAt: new Date(0).toISOString(),
};

export interface StoreState extends Collections {
  /** Supabase user id that owns the local data, or null while used without an account. */
  ownerId: string | null;
  profile: Profile | null;
  settings: Settings;
  /** Foods the user recently logged or starred, newest first, for instant re-logging. */
  recentFoods: Food[];
  /** Ids of starred foods, newest first. Derived from the `favorites` collection. */
  favoriteFoodIds: string[];
  recentActivityIds: string[];
  dirty: Dirty;
  profileDirty: boolean;
  settingsDirty: boolean;
  /** Server timestamp of the newest change already merged. */
  lastPulledAt: string | null;
  lastSyncedAt: string | null;
}

interface StoreActions {
  setProfile: (patch: Partial<Profile>) => void;
  setSettings: (patch: Partial<Settings>) => void;
  setReminders: (patch: Partial<Settings['reminders']>) => void;
  /** Insert or update a record. `id` and `updatedAt` are filled in when missing. */
  upsert: <K extends Collection>(
    collection: K,
    record: Omit<CollectionTypes[K], keyof SyncedRecord> & Partial<SyncedRecord>,
  ) => CollectionTypes[K];
  upsertMany: <K extends Collection>(
    collection: K,
    records: (Omit<CollectionTypes[K], keyof SyncedRecord> & Partial<SyncedRecord>)[],
  ) => CollectionTypes[K][];
  remove: (collection: Collection, id: string) => void;
  /** Bring a soft-deleted record back (undo). */
  restore: (collection: Collection, id: string) => void;
  rememberFood: (food: Food) => void;
  toggleFavoriteFood: (food: Food) => void;
  rememberActivity: (activityId: string) => void;
  /** Merge records that arrived from the backend without marking them dirty. */
  mergeRemote: (input: {
    records: { collection: Collection; record: SyncedRecord }[];
    profile?: Profile | null;
    settings?: Settings | null;
    pulledAt: string;
  }) => void;
  clearDirty: (input: { ids: { collection: Collection; id: string; updatedAt: string }[]; profileAt?: string; settingsAt?: string }) => void;
  markAllDirty: () => void;
  setOwner: (ownerId: string | null) => void;
  resetAll: () => void;
  /** Replace the in-memory state with what was saved on the device (app start). */
  hydrate: (snapshot: Partial<StoreState>) => void;
  /** Merge state saved by another browser tab: newest version of each record wins, pending flags are kept. */
  mergeLocal: (snapshot: Partial<StoreState>) => void;
  /** Refill the recent-foods list from logged entries (after signing in on a new device). */
  rebuildRecents: () => void;
}

export type Store = StoreState & StoreActions;

function emptyCollections(): Collections {
  return { foodEntries: {}, customFoods: {}, savedMeals: {}, activities: {}, water: {}, weights: {}, sleep: {}, fasting: {}, favorites: {} };
}

export function emptyDirty(): Dirty {
  return { foodEntries: {}, customFoods: {}, savedMeals: {}, activities: {}, water: {}, weights: {}, sleep: {}, fasting: {}, favorites: {} };
}

export function initialState(): StoreState {
  return {
    ...emptyCollections(),
    ownerId: null,
    profile: null,
    settings: DEFAULT_SETTINGS,
    recentFoods: [],
    favoriteFoodIds: [],
    recentActivityIds: [],
    dirty: emptyDirty(),
    profileDirty: false,
    settingsDirty: false,
    lastPulledAt: null,
    lastSyncedAt: null,
  };
}

const MAX_RECENT_FOODS = 60;

/**
 * Edit time for a record. It never goes backwards relative to the version
 * being replaced, so an edit made on a device whose clock runs behind still
 * wins over the version it was made from.
 */
export function nextStamp(previous?: string): string {
  const now = Date.now();
  const prev = previous ? Date.parse(previous) : Number.NaN;
  return new Date(Number.isFinite(prev) && prev >= now ? prev + 1 : now).toISOString();
}

export function withSettingsDefaults(settings: Partial<Settings> | null | undefined): Settings {
  return { ...DEFAULT_SETTINGS, ...(settings ?? {}), reminders: { ...DEFAULT_SETTINGS.reminders, ...(settings?.reminders ?? {}) } };
}

/** Id for a new record: derived from the date for one-per-day collections, random otherwise. */
function idFor(collection: Collection, record: { id?: string; date?: unknown }): string {
  if (record.id) return record.id;
  if (ONE_PER_DATE.includes(collection) && typeof record.date === 'string') return stableId(collection, record.date);
  return newId();
}

export function favoriteRecordId(foodId: string): string {
  return stableId('favorites', foodId);
}

function favoriteIds(favorites: Record<string, FavoriteFood>): string[] {
  return Object.values(favorites)
    .filter((f) => !f.deleted && f.food?.id)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map((f) => f.food.id);
}

/**
 * Keep one live record per date. Duplicates appear when two devices (or an
 * import) each created a record for the same day with different ids: the
 * newest edit stays and the others are soft-deleted so the removal syncs.
 * Returns the same objects when nothing needed changing.
 */
export function collapseDateDuplicates<T extends SyncedRecord & { date?: string }>(
  map: Record<string, T>,
  dirty: Record<string, true>,
): { map: Record<string, T>; dirty: Record<string, true> } {
  const newest = new Map<string, T>();
  const losers: T[] = [];
  for (const rec of Object.values(map)) {
    if (rec.deleted || typeof rec.date !== 'string') continue;
    const best = newest.get(rec.date);
    if (!best) newest.set(rec.date, rec);
    else if (rec.updatedAt > best.updatedAt || (rec.updatedAt === best.updatedAt && rec.id > best.id)) {
      losers.push(best);
      newest.set(rec.date, rec);
    } else losers.push(rec);
  }
  if (losers.length === 0) return { map, dirty };
  const nextMap = { ...map };
  const nextDirty = { ...dirty };
  for (const rec of losers) {
    nextMap[rec.id] = { ...rec, deleted: true, updatedAt: nextStamp(rec.updatedAt) };
    nextDirty[rec.id] = true;
  }
  return { map: nextMap, dirty: nextDirty };
}

/** Recent foods rebuilt from the diary: the latest distinct foods that carry a definition. */
function recentsFromEntries(entries: Record<string, FoodEntry>): Food[] {
  const seen = new Set<string>();
  const out: Food[] = [];
  const sorted = Object.values(entries)
    .filter((e) => !e.deleted && e.food)
    .sort((a, b) => b.loggedAt.localeCompare(a.loggedAt));
  for (const e of sorted) {
    const food = e.food as Food;
    if (seen.has(food.id)) continue;
    seen.add(food.id);
    out.push(food);
    if (out.length >= MAX_RECENT_FOODS) break;
  }
  return out;
}

export const useStore = create<Store>()((set, get) => ({
  ...initialState(),

  setProfile: (patch) =>
    set((s) => ({
      profile: { ...(s.profile ?? ({} as Profile)), ...patch, updatedAt: nextStamp(s.profile?.updatedAt) },
      profileDirty: true,
    })),

  setSettings: (patch) =>
    set((s) => ({ settings: { ...s.settings, ...patch, updatedAt: nextStamp(s.settings.updatedAt) }, settingsDirty: true })),

  setReminders: (patch) =>
    set((s) => ({
      settings: { ...s.settings, reminders: { ...s.settings.reminders, ...patch }, updatedAt: nextStamp(s.settings.updatedAt) },
      settingsDirty: true,
    })),

  upsert: (collection, record) => get().upsertMany(collection, [record])[0],

  upsertMany: (collection, records) => {
    const existing = get()[collection] as Record<string, SyncedRecord>;
    const stamped = records.map((r) => {
      const id = idFor(collection, r as { id?: string; date?: unknown });
      return { ...r, id, updatedAt: nextStamp(existing[id]?.updatedAt), deleted: false };
    }) as unknown as CollectionTypes[typeof collection][];
    set((s) => {
      let next = { ...s[collection] } as Record<string, SyncedRecord>;
      let dirty: Record<string, true> = { ...s.dirty[collection] };
      for (const r of stamped) {
        next[r.id] = r;
        dirty[r.id] = true;
      }
      if (ONE_PER_DATE.includes(collection)) {
        // A record just written is the newest, so any older record for the same date gives way to it.
        const collapsed = collapseDateDuplicates(next as Record<string, SyncedRecord & { date?: string }>, dirty);
        next = collapsed.map;
        dirty = collapsed.dirty;
      }
      const patch = { [collection]: next, dirty: { ...s.dirty, [collection]: dirty } } as Partial<Store>;
      if (collection === 'favorites') patch.favoriteFoodIds = favoriteIds(next as Record<string, FavoriteFood>);
      return patch;
    });
    return stamped;
  },

  remove: (collection, id) =>
    set((s) => {
      const existing = (s[collection] as Record<string, SyncedRecord>)[id];
      if (!existing) return {};
      const next = { ...s[collection], [id]: { ...existing, deleted: true, updatedAt: nextStamp(existing.updatedAt) } };
      const patch = { [collection]: next, dirty: { ...s.dirty, [collection]: { ...s.dirty[collection], [id]: true } } } as Partial<Store>;
      if (collection === 'favorites') patch.favoriteFoodIds = favoriteIds(next as Record<string, FavoriteFood>);
      return patch;
    }),

  restore: (collection, id) =>
    set((s) => {
      const existing = (s[collection] as Record<string, SyncedRecord>)[id];
      if (!existing) return {};
      let next = { ...s[collection], [id]: { ...existing, deleted: false, updatedAt: nextStamp(existing.updatedAt) } } as Record<string, SyncedRecord>;
      let dirty: Record<string, true> = { ...s.dirty[collection], [id]: true };
      if (ONE_PER_DATE.includes(collection)) {
        const collapsed = collapseDateDuplicates(next as Record<string, SyncedRecord & { date?: string }>, dirty);
        next = collapsed.map;
        dirty = collapsed.dirty;
      }
      const patch = { [collection]: next, dirty: { ...s.dirty, [collection]: dirty } } as Partial<Store>;
      if (collection === 'favorites') patch.favoriteFoodIds = favoriteIds(next as Record<string, FavoriteFood>);
      return patch;
    }),

  rememberFood: (food) =>
    set((s) => ({
      recentFoods: [food, ...s.recentFoods.filter((f) => f.id !== food.id)].slice(0, MAX_RECENT_FOODS),
    })),

  toggleFavoriteFood: (food) => {
    const id = favoriteRecordId(food.id);
    const current = get().favorites[id];
    if (current && !current.deleted) get().remove('favorites', id);
    else get().upsert('favorites', { id, food });
  },

  rememberActivity: (activityId) =>
    set((s) => ({
      recentActivityIds: [activityId, ...s.recentActivityIds.filter((id) => id !== activityId)].slice(0, 12),
    })),

  mergeRemote: ({ records, profile, settings, pulledAt }) =>
    set((s) => {
      const patch: Partial<Collections> = {};
      for (const { collection, record } of records) {
        const current = (patch[collection] ?? s[collection]) as Record<string, SyncedRecord>;
        const local = current[record.id];
        // Local edits not yet pushed win only if they are newer.
        if (local && local.updatedAt > record.updatedAt) continue;
        (patch as Record<string, unknown>)[collection] = { ...current, [record.id]: record };
      }
      const next: Partial<Store> = { ...patch, lastPulledAt: pulledAt };
      // The same day logged on two devices arrives as two records: keep the newest.
      for (const c of ONE_PER_DATE) {
        if (!patch[c]) continue;
        const collapsed = collapseDateDuplicates(patch[c] as Record<string, SyncedRecord & { date?: string }>, (next.dirty ?? s.dirty)[c]);
        if (collapsed.map !== patch[c]) {
          (next as Record<string, unknown>)[c] = collapsed.map;
          next.dirty = { ...(next.dirty ?? s.dirty), [c]: collapsed.dirty };
        }
      }
      if (patch.favorites) next.favoriteFoodIds = favoriteIds(patch.favorites);
      if (patch.foodEntries && s.recentFoods.length === 0) next.recentFoods = recentsFromEntries(patch.foodEntries);
      if (profile && (!s.profile || !s.profileDirty || profile.updatedAt > s.profile.updatedAt)) {
        next.profile = profile;
        next.profileDirty = false;
      }
      if (settings && (!s.settingsDirty || settings.updatedAt > s.settings.updatedAt)) {
        next.settings = withSettingsDefaults(settings);
        next.settingsDirty = false;
      }
      return next;
    }),

  clearDirty: ({ ids, profileAt, settingsAt }) =>
    set((s) => {
      const dirty = { ...s.dirty };
      for (const { collection, id, updatedAt } of ids) {
        const current = (s[collection] as Record<string, SyncedRecord>)[id];
        // Edited again while the push was in flight: leave it dirty.
        if (current && current.updatedAt !== updatedAt) continue;
        if (dirty[collection] === s.dirty[collection]) dirty[collection] = { ...s.dirty[collection] };
        delete dirty[collection][id];
      }
      return {
        dirty,
        profileDirty: profileAt && s.profile?.updatedAt === profileAt ? false : s.profileDirty,
        settingsDirty: settingsAt && s.settings.updatedAt === settingsAt ? false : s.settingsDirty,
        lastSyncedAt: new Date().toISOString(),
      };
    }),

  markAllDirty: () =>
    set((s) => {
      const dirty = emptyDirty();
      for (const c of COLLECTIONS) for (const id of Object.keys(s[c])) dirty[c][id] = true;
      return { dirty, profileDirty: !!s.profile, settingsDirty: true };
    }),

  setOwner: (ownerId) => set({ ownerId }),

  resetAll: () => set({ ...initialState() }),

  hydrate: (snapshot) =>
    set(() => {
      const base = initialState();
      const next: StoreState = { ...base, ...snapshot, settings: withSettingsDefaults(snapshot.settings), dirty: { ...emptyDirty(), ...(snapshot.dirty ?? {}) } };
      for (const c of COLLECTIONS) (next as unknown as Record<string, unknown>)[c] = snapshot[c] ?? {};
      // Starred foods used to be a plain id list; give each one a record so it syncs.
      const legacyIds = (snapshot.favoriteFoodIds ?? []).filter((id) => !next.favorites[favoriteRecordId(id)]);
      if (legacyIds.length) {
        const known = new Map<string, Food>();
        for (const f of next.recentFoods) known.set(f.id, f);
        for (const f of Object.values(next.customFoods)) if (!f.deleted) known.set(f.id, f);
        const favorites = { ...next.favorites };
        const dirty = { ...next.dirty.favorites };
        for (const foodId of legacyIds) {
          const food = known.get(foodId);
          if (!food) continue;
          const id = favoriteRecordId(foodId);
          favorites[id] = { id, food, updatedAt: nextStamp(), deleted: false };
          dirty[id] = true;
        }
        next.favorites = favorites;
        next.dirty = { ...next.dirty, favorites: dirty };
      }
      next.favoriteFoodIds = favoriteIds(next.favorites);
      return next;
    }),

  mergeLocal: (snapshot) =>
    set((s) => {
      const next: Partial<Store> = {};
      let dirty = s.dirty;
      for (const c of COLLECTIONS) {
        const theirs = (snapshot[c] ?? {}) as Record<string, SyncedRecord>;
        const mine = s[c] as Record<string, SyncedRecord>;
        let merged: Record<string, SyncedRecord> | null = null;
        for (const rec of Object.values(theirs)) {
          const local = mine[rec.id];
          if (local && local.updatedAt >= rec.updatedAt) continue;
          merged = merged ?? { ...mine };
          merged[rec.id] = rec;
        }
        // Only replace a collection that really changed, so two tabs settle instead of echoing each other.
        if (merged) (next as Record<string, unknown>)[c] = merged;
        const theirDirty = snapshot.dirty?.[c] ?? {};
        const extra = Object.keys(theirDirty).filter((id) => !dirty[c][id]);
        if (extra.length) dirty = { ...dirty, [c]: { ...dirty[c], ...Object.fromEntries(extra.map((id) => [id, true as const])) } };
      }
      if (dirty !== s.dirty) next.dirty = dirty;
      if (next.favorites) next.favoriteFoodIds = favoriteIds(next.favorites);
      if (snapshot.profile && (!s.profile || snapshot.profile.updatedAt > s.profile.updatedAt)) {
        next.profile = snapshot.profile;
        next.profileDirty = s.profileDirty || !!snapshot.profileDirty;
      }
      if (snapshot.settings && snapshot.settings.updatedAt > s.settings.updatedAt) {
        next.settings = withSettingsDefaults(snapshot.settings);
        next.settingsDirty = s.settingsDirty || !!snapshot.settingsDirty;
      }
      if (snapshot.ownerId !== undefined && snapshot.ownerId !== s.ownerId && s.ownerId === null) next.ownerId = snapshot.ownerId;
      if (snapshot.lastPulledAt && (!s.lastPulledAt || Date.parse(snapshot.lastPulledAt) > Date.parse(s.lastPulledAt))) next.lastPulledAt = snapshot.lastPulledAt;
      return next;
    }),

  rebuildRecents: () =>
    set((s) => (s.recentFoods.length > 0 ? {} : { recentFoods: recentsFromEntries(s.foodEntries) })),
}));

/** Count of local changes not yet on the server. */
export function pendingChanges(s: StoreState): number {
  let n = (s.profileDirty ? 1 : 0) + (s.settingsDirty ? 1 : 0);
  for (const c of COLLECTIONS) n += Object.keys(s.dirty[c]).length;
  return n;
}
