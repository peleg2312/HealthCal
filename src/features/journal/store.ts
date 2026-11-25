/**
 * The meal photo journal on this device: its index (which photo belongs to which diary entries) under its own
 * device key, `healthcal.mealPhotos`, and whether photos are kept at all, `healthcal.keepMealPhotos` (on unless
 * turned off). Never the store, never synced, never in the backup or the export. The pictures are in
 * ./files.ts (phones) or ./files.web.ts (web); the rules are pure in ./rules.ts.
 *
 * - `keepMealPhoto`: called once an estimate from a photo is added; keeps a small copy linked to its entries.
 * - `deletePhoto`: hides a photo at once with a toast and Undo; its file goes `UNDO_MS` later.
 * - `pruneJournal`: removes the files `photosToPrune` names (run when the journal loads and after each change).
 * - `eraseMealPhotos`: every photo and the index (erasing this device, "Delete all meal photos").
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImageManipulator from 'expo-image-manipulator';
import { create } from 'zustand';

import { addDays, today } from '@/lib/dates';
import { newId } from '@/lib/id';
import { useStore } from '@/store';
import { useHydration } from '@/store/persistence';
import type { ISODate, MealType } from '@/types';
import { toast } from '@/ui';

import { demoPhotos, journalDemoOn } from './demo';
import { photosAvailable, removeAllPhotos, removePhoto, writePhoto } from './files';
import { JOURNAL_WORDS, PHOTO_EDGE, PHOTO_QUALITY, photosToPrune, UNDO_MS, type MealPhoto } from './rules';

export const JOURNAL_KEY = 'healthcal.mealPhotos';
export const KEEP_PHOTOS_KEY = 'healthcal.keepMealPhotos';

interface JournalState {
  /** null until read from the device. */
  photos: MealPhoto[] | null;
  /** Whether a new photo is kept (on unless turned off). */
  keep: boolean;
  /** Whether this device can keep photos at all (false in a browser without its database); null until asked. */
  available: boolean | null;
}

export const useJournal = create<JournalState>(() => ({ photos: null, keep: true, available: null }));

let loading: Promise<void> | null = null;

function isPhoto(x: unknown): x is MealPhoto {
  const p = x as MealPhoto;
  return !!p && typeof p.id === 'string' && typeof p.date === 'string' && typeof p.meal === 'string' && Array.isArray(p.entryIds) && typeof p.keptAt === 'string';
}

/** Reads the index once (single flight), then prunes what can go. */
export function loadJournal(): Promise<void> {
  if (!loading) {
    loading = (async () => {
      let photos: MealPhoto[] = [];
      let keep = true;
      try {
        const [raw, keepRaw] = await Promise.all([AsyncStorage.getItem(JOURNAL_KEY), AsyncStorage.getItem(KEEP_PHOTOS_KEY)]);
        const parsed: unknown = raw ? JSON.parse(raw) : [];
        if (Array.isArray(parsed)) photos = parsed.filter(isPhoto);
        keep = keepRaw !== '0';
      } catch {
        // Unreadable: an empty journal, photos kept.
      }
      if (journalDemoOn() && photos.length === 0) {
        const day = today();
        photos = demoPhotos(Object.values(useStore.getState().foodEntries), day, [day, addDays(day, -1), addDays(day, -2)]);
      }
      const available = await photosAvailable();
      // Anything changed while the read was in flight is newer than what was stored.
      if (useJournal.getState().photos === null) useJournal.setState({ photos, keep, available });
      else useJournal.setState({ available });
      void pruneJournal();
    })();
  }
  return loading;
}

async function saveIndex(): Promise<void> {
  if (journalDemoOn()) return;
  try {
    await AsyncStorage.setItem(JOURNAL_KEY, JSON.stringify(useJournal.getState().photos ?? []));
  } catch (e) {
    console.warn('meal photos: could not save the index', e);
  }
}

function setPhotos(next: (photos: MealPhoto[]) => MealPhoto[]): void {
  useJournal.setState((s) => ({ photos: next(s.photos ?? []) }));
  void saveIndex();
}

/**
 * Keeps a small copy of an added photo estimate, linked to the entries it wrote. Quietly does nothing when
 * keeping is off, the device cannot keep photos, or the photo cannot be read: the estimate is logged anyway.
 */
export async function keepMealPhoto(input: { uri: string; date: ISODate; meal: MealType; entryIds: string[] }): Promise<boolean> {
  if (input.entryIds.length === 0) return false;
  await loadJournal();
  const s = useJournal.getState();
  if (!s.keep || !s.available) return false;
  try {
    let ref = await ImageManipulator.ImageManipulator.manipulate(input.uri, { maxWidth: PHOTO_EDGE, maxHeight: PHOTO_EDGE }).renderAsync();
    if (Math.max(ref.width, ref.height) > PHOTO_EDGE) {
      const wide = ref.width >= ref.height;
      ref = await ImageManipulator.ImageManipulator.manipulate(ref).resize(wide ? { width: PHOTO_EDGE } : { height: PHOTO_EDGE }).renderAsync();
    }
    const saved = await ref.saveAsync({ format: ImageManipulator.SaveFormat.JPEG, compress: PHOTO_QUALITY, base64: true });
    const base64 = (saved.base64 ?? '').replace(/^data:[^,]*,/, '');
    if (!base64) return false;
    const id = newId();
    if (!(await writePhoto(id, base64))) return false;
    const photo: MealPhoto = { id, date: input.date, meal: input.meal, entryIds: input.entryIds, keptAt: new Date().toISOString(), width: saved.width, height: saved.height };
    setPhotos((photos) => [...photos, photo]);
    return true;
  } catch (e) {
    console.warn('meal photo: could not keep it', e);
    return false;
  }
}

/** Hides a photo at once, with a toast whose Undo brings it back; its file goes `UNDO_MS` later. */
export function deletePhoto(id: string): void {
  const at = new Date().toISOString();
  setPhotos((photos) => photos.map((p) => (p.id === id ? { ...p, deletedAt: at } : p)));
  toast(JOURNAL_WORDS.deleted, { label: 'Undo', onPress: () => setPhotos((photos) => photos.map((p) => (p.id === id && p.deletedAt === at ? { ...p, deletedAt: undefined } : p))) });
  setTimeout(() => void pruneJournal(), UNDO_MS + 1000);
}

/** Removes the files of photos that can go (`photosToPrune`) and drops them from the index. */
export async function pruneJournal(): Promise<void> {
  const photos = useJournal.getState().photos;
  if (!photos?.length) return;
  const loaded = useHydration.getState().status === 'ready';
  const gone = new Set(photosToPrune(photos, useStore.getState().foodEntries, Date.now(), today(), loaded));
  if (gone.size === 0) return;
  for (const id of gone) await removePhoto(id);
  setPhotos((list) => list.filter((p) => !gone.has(p.id)));
}

/** Every photo and the index: erasing this device, or "Delete all meal photos". */
export async function eraseMealPhotos(): Promise<void> {
  useJournal.setState({ photos: [] });
  await removeAllPhotos();
  try {
    await AsyncStorage.removeItem(JOURNAL_KEY);
  } catch {
    // Nothing more to do: the files are gone.
  }
}

/** Turns keeping new photos on or off on this device. Photos already kept stay until deleted. */
export function setKeepPhotos(on: boolean): void {
  useJournal.setState({ keep: on });
  AsyncStorage.setItem(KEEP_PHOTOS_KEY, on ? '1' : '0').catch(() => {});
}
