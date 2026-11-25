/**
 * Meal photos kept on the phone as a food journal: the rules, pure (no React, no storage, no clock read).
 *
 * When a photo estimate is added (src/app/food/photo.tsx), a small copy of the photo is kept on this device
 * only (`PHOTO_EDGE`, a JPEG at `PHOTO_QUALITY`), linked to the diary entries that add wrote. Never uploaded,
 * never synced, never in the export or the backup: the index lives under its own device key and the picture in
 * the app's own files (phones) or the browser's own database (web). See ./store.ts and ./files*.ts.
 *
 * - A photo is shown while the person has not deleted it and at least one entry it produced is still in the
 *   diary (`shownPhotos`). Deleting the entries hides it; an Undo or a Restore brings it back with them.
 * - Its file goes for good (`photosToPrune`) once the person's own delete can no longer be undone
 *   (`UNDO_MS` after it), or once every entry it produced has been gone since before today: deleted on an
 *   earlier day (the diary's Restore rows list only today's), or no longer in the store at all (erased, or a
 *   marker the store has dropped). Pruning waits for the store to be loaded, so an empty store at start-up
 *   never reads as "every entry gone".
 * - The journal lists the days with photos, newest first, each day's photos in meal order (`journalDays`).
 */
import { MEAL_LABEL } from '@/lib/nutrition';
import { formatShortDate, weekdayShort } from '@/lib/dates';
import type { FoodEntry, ISODate, MealType } from '@/types';

/** The kept copy's long edge in px, and its JPEG quality: a thumbnail and a clear day view, about 30 KB. */
export const PHOTO_EDGE = 480;
export const PHOTO_QUALITY = 0.7;
/** How long a deleted photo can still come back with its toast's Undo before its file goes. */
export const UNDO_MS = 60_000;

export interface MealPhoto {
  id: string;
  /** The diary day and meal the estimate was added to. */
  date: ISODate;
  meal: MealType;
  /** The entries that add wrote. */
  entryIds: string[];
  keptAt: string;
  width: number;
  height: number;
  /** When the person deleted it: hidden at once, its file goes `UNDO_MS` later. */
  deletedAt?: string;
}

type Entries = Record<string, Pick<FoodEntry, 'deleted' | 'updatedAt' | 'date'> | undefined>;

const MEAL_ORDER: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

/** Whether a photo is shown: not deleted, and at least one of its entries is live. */
export function isShown(photo: MealPhoto, entries: Entries): boolean {
  return !photo.deletedAt && photo.entryIds.some((id) => {
    const e = entries[id];
    return !!e && !e.deleted;
  });
}

/** The photos shown, newest day first and in meal order within a day. */
export function shownPhotos(photos: readonly MealPhoto[], entries: Entries): MealPhoto[] {
  return photos.filter((p) => isShown(p, entries)).sort(byDayAndMeal);
}

function byDayAndMeal(a: MealPhoto, b: MealPhoto): number {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1;
  const m = MEAL_ORDER.indexOf(a.meal) - MEAL_ORDER.indexOf(b.meal);
  return m || a.keptAt.localeCompare(b.keptAt);
}

/**
 * The photos whose files can go now. `today` is the local day of `now` (a day key, read by the caller).
 * Nothing is pruned for entries before the store is loaded: the caller passes `loaded` false until then.
 */
export function photosToPrune(photos: readonly MealPhoto[], entries: Entries, now: number, today: ISODate, loaded: boolean): string[] {
  return photos
    .filter((p) => {
      if (p.deletedAt) return now - Date.parse(p.deletedAt) >= UNDO_MS;
      if (!loaded) return false;
      return p.entryIds.every((id) => {
        const e = entries[id];
        if (!e) return true;
        // Deleted today: the diary still offers it back (its Restore row), so the photo waits with it.
        return !!e.deleted && localDay(e.updatedAt) < today;
      });
    })
    .map((p) => p.id);
}

/** The local calendar day of an ISO time. */
function localDay(iso: string): ISODate {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '0000-00-00';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export interface JournalDay {
  date: ISODate;
  photos: MealPhoto[];
}

/** The days with photos, newest first. */
export function journalDays(photos: readonly MealPhoto[]): JournalDay[] {
  const out: JournalDay[] = [];
  for (const p of [...photos].sort(byDayAndMeal)) {
    const last = out[out.length - 1];
    if (last && last.date === p.date) last.photos.push(p);
    else out.push({ date: p.date, photos: [p] });
  }
  return out;
}

/** A day's heading: "Today", "Yesterday", else "Tue, Nov 24". */
export function journalDayTitle(date: ISODate, today: ISODate, yesterday: ISODate): string {
  if (date === today) return 'Today';
  if (date === yesterday) return 'Yesterday';
  return `${weekdayShort(date)}, ${formatShortDate(date)}`;
}

/** The meal a photo was added to, as its tile says it ("Lunch"). */
export function photoMealLabel(photo: Pick<MealPhoto, 'meal'>): string {
  return MEAL_LABEL[photo.meal];
}

/** A tile's spoken name: its meal, day and what it holds ("Lunch, Today: Rice, chicken and 1 more. Open"). */
export function photoTileLabel(photo: Pick<MealPhoto, 'meal'>, dayTitle: string, names: readonly string[]): string {
  const what = names.length === 0 ? '' : names.length <= 2 ? `: ${names.join(' and ')}` : `: ${names[0]}, ${names[1]} and ${names.length - 2} more`;
  return `Photo of ${photoMealLabel(photo).toLowerCase()}, ${dayTitle}${what}`;
}

/** The fixed words of the journal, its rows and the privacy page. */
export const JOURNAL_WORDS = {
  title: 'Meal photos',
  subtitle: 'On this phone only',
  rowSubtitle: 'Photos from your AI estimates, kept on this phone',
  menuSubtitle: 'Photos from your AI estimates, on this phone only',
  emptyTitle: 'No meal photos yet',
  emptyMessage: 'When you add an AI estimate from a photo, a small copy is kept here, on this phone only. It is never uploaded or synced.',
  emptyAction: 'Snap a meal',
  offMessage: 'Keeping photos is off. Turn it on to keep a small copy of the next photo you add.',
  keepTitle: 'Keep meal photos',
  keepSubtitle: 'A small copy of each photo you add, on this phone only',
  privacyNote: 'Photos stay on this phone. They are never uploaded, synced or put in an export, and erasing this device removes them.',
  webUnavailable: 'This browser cannot keep photos, so none are kept here.',
  deleteAll: 'Delete all meal photos',
  deleteAllQuestion: 'Delete every meal photo on this phone?',
  deleteAllMessage: 'The photos are removed from this phone. Your diary entries stay as they are.',
  deleted: 'Photo deleted',
  allDeleted: 'Meal photos deleted',
  openDay: 'Open in the diary',
  deleteOne: 'Delete photo',
} as const;
