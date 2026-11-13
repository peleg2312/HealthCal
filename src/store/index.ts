/**
 * Single local-first store. Every screen reads and writes here; the UI never
 * waits on the network. The sync service pushes `dirty` records to the backend
 * and merges remote changes back in with last-write-wins on `updatedAt`.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { newId, nowISO } from '@/lib/id';
import type {
  ActivityEntry,
  Collection,
  CustomFood,
  FastingSession,
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
];

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

interface StoreState extends Collections {
  /** Supabase user id that owns the local data, or null while used without an account. */
  ownerId: string | null;
  profile: Profile | null;
  settings: Settings;
  /** Foods the user recently logged or starred, newest first, for instant re-logging. */
  recentFoods: Food[];
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
}

export type Store = StoreState & StoreActions;

function emptyCollections(): Collections {
  return { foodEntries: {}, customFoods: {}, savedMeals: {}, activities: {}, water: {}, weights: {}, sleep: {}, fasting: {} };
}

function emptyDirty(): Dirty {
  return { foodEntries: {}, customFoods: {}, savedMeals: {}, activities: {}, water: {}, weights: {}, sleep: {}, fasting: {} };
}

function initialState(): StoreState {
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

export const useStore = create<Store>()(
  persist(
    (set, get) => ({
      ...initialState(),

      setProfile: (patch) =>
        set((s) => ({
          profile: { ...(s.profile ?? ({} as Profile)), ...patch, updatedAt: nowISO() },
          profileDirty: true,
        })),

      setSettings: (patch) =>
        set((s) => ({ settings: { ...s.settings, ...patch, updatedAt: nowISO() }, settingsDirty: true })),

      setReminders: (patch) =>
        set((s) => ({
          settings: { ...s.settings, reminders: { ...s.settings.reminders, ...patch }, updatedAt: nowISO() },
          settingsDirty: true,
        })),

      upsert: (collection, record) => get().upsertMany(collection, [record])[0],

      upsertMany: (collection, records) => {
        const stamped = records.map((r) => ({
          ...r,
          id: r.id ?? newId(),
          updatedAt: nowISO(),
          deleted: false,
        })) as unknown as CollectionTypes[typeof collection][];
        set((s) => {
          const next = { ...s[collection] } as Record<string, SyncedRecord>;
          const dirty: Record<string, true> = { ...s.dirty[collection] };
          for (const r of stamped) {
            next[r.id] = r;
            dirty[r.id] = true;
          }
          return { [collection]: next, dirty: { ...s.dirty, [collection]: dirty } } as Partial<Store>;
        });
        return stamped;
      },

      remove: (collection, id) =>
        set((s) => {
          const existing = (s[collection] as Record<string, SyncedRecord>)[id];
          if (!existing) return {};
          return {
            [collection]: { ...s[collection], [id]: { ...existing, deleted: true, updatedAt: nowISO() } },
            dirty: { ...s.dirty, [collection]: { ...s.dirty[collection], [id]: true } },
          } as Partial<Store>;
        }),

      restore: (collection, id) =>
        set((s) => {
          const existing = (s[collection] as Record<string, SyncedRecord>)[id];
          if (!existing) return {};
          return {
            [collection]: { ...s[collection], [id]: { ...existing, deleted: false, updatedAt: nowISO() } },
            dirty: { ...s.dirty, [collection]: { ...s.dirty[collection], [id]: true } },
          } as Partial<Store>;
        }),

      rememberFood: (food) =>
        set((s) => ({
          recentFoods: [food, ...s.recentFoods.filter((f) => f.id !== food.id)].slice(0, MAX_RECENT_FOODS),
        })),

      toggleFavoriteFood: (food) =>
        set((s) => {
          const isFav = s.favoriteFoodIds.includes(food.id);
          return {
            favoriteFoodIds: isFav ? s.favoriteFoodIds.filter((id) => id !== food.id) : [food.id, ...s.favoriteFoodIds],
            // Keep the definition around so a favourite can be logged offline.
            recentFoods: s.recentFoods.some((f) => f.id === food.id) ? s.recentFoods : [food, ...s.recentFoods],
          };
        }),

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
          if (profile && (!s.profile || !s.profileDirty || profile.updatedAt > s.profile.updatedAt)) {
            next.profile = profile;
            next.profileDirty = false;
          }
          if (settings && (!s.settingsDirty || settings.updatedAt > s.settings.updatedAt)) {
            next.settings = { ...DEFAULT_SETTINGS, ...settings, reminders: { ...DEFAULT_SETTINGS.reminders, ...settings.reminders } };
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
            lastSyncedAt: nowISO(),
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
    }),
    {
      name: 'healthcal-v1',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<StoreState>;
        return {
          ...current,
          ...p,
          settings: {
            ...DEFAULT_SETTINGS,
            ...(p.settings ?? {}),
            reminders: { ...DEFAULT_SETTINGS.reminders, ...(p.settings?.reminders ?? {}) },
          },
          dirty: { ...emptyDirty(), ...(p.dirty ?? {}) },
        };
      },
    },
  ),
);

/** Count of local changes not yet on the server. */
export function pendingChanges(s: StoreState): number {
  let n = (s.profileDirty ? 1 : 0) + (s.settingsDirty ? 1 : 0);
  for (const c of COLLECTIONS) n += Object.keys(s.dirty[c]).length;
  return n;
}
