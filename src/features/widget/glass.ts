/**
 * The widget's glass and its Undo. The glass is the same plain-water record as Today's glass and the
 * reminder's (`logPlainGlass`, through the store), always on today. Its guards, in memory only (the
 * widget task runs in the app's own JavaScript, so a running app and the widget share them):
 *
 * - One glass per drawing: every drawing carries its own token in the glass's click data, and a
 *   second tap on a drawing that already logged a glass logs nothing. That is the double tap on a
 *   widget, whose second tap lands on the same picture before it is drawn again (a cold start can
 *   take seconds).
 * - The one-tap guard of every glass in the app (`ONE_TAP_GUARD_MS`).
 *
 * The Undo carries the record's id in its click data, so it works in a later process too, but only
 * for a live plain glass of today logged under `UNDO_WINDOW_MS` ago: never another kind of water
 * record, never an old one.
 */
import { tooSoon } from '@/features/food/oneTap';
import { logPlainGlass } from '@/features/today/glass';
import { useStore } from '@/store';
import type { ISODate, WaterEntry } from '@/types';

/** How long after a glass the widget offers its Undo. */
export const UNDO_WINDOW_MS = 10 * 60_000;

/** The last glass logged from the widget in this process: what the next drawings offer to undo. */
export interface RecentGlass {
  id: string;
  ml: number;
  date: ISODate;
  at: number;
}

let recent: RecentGlass | null = null;
let lastAcceptedAt = 0;
let lastDrawing: string | null = null;

/** True when a tap on the glass of `drawing` at `now` may log a glass (and records it as taken). */
export function acceptGlassTap(drawing: string | null, now: number): boolean {
  if (drawing !== null && drawing === lastDrawing) return false;
  if (tooSoon(lastAcceptedAt, now)) return false;
  lastAcceptedAt = now;
  lastDrawing = drawing;
  return true;
}

/** Log one glass of `ml` on `date` from the widget. */
export function logWidgetGlass(date: ISODate, ml: number, now: number): WaterEntry {
  const entry = logPlainGlass(date, ml);
  recent = { id: entry.id, ml, date, at: now };
  return entry;
}

/** A water record the widget's Undo may remove: a live plain glass of `date`, logged under UNDO_WINDOW_MS before `now`. */
export function isUndoableGlass(w: WaterEntry | undefined, date: ISODate, now: number): w is WaterEntry {
  if (!w || w.deleted || w.date !== date || w.beverage !== 'water') return false;
  if (w.drink || w.foodEntryId || w.fromEntryId) return false;
  const at = Date.parse(w.loggedAt);
  return Number.isFinite(at) && now - at < UNDO_WINDOW_MS && at - now < 60_000;
}

/** Remove the widget's glass `id` (a soft delete, as every delete). False when it may not be undone any more. */
export function undoWidgetGlass(id: string, date: ISODate, now: number): boolean {
  const w = useStore.getState().water[id];
  if (!isUndoableGlass(w, date, now)) return false;
  useStore.getState().remove('water', id);
  if (recent?.id === id) recent = null;
  return true;
}

/** The glass the next drawing offers to undo, or null: logged from the widget in this process and still undoable. */
export function recentWidgetGlass(water: Record<string, WaterEntry>, date: ISODate, now: number): RecentGlass | null {
  if (!recent || recent.date !== date || now - recent.at >= UNDO_WINDOW_MS) return null;
  return isUndoableGlass(water[recent.id], date, now) ? recent : null;
}

/** Tests only: forget the guards and the last glass. */
export function resetWidgetGlassForTests(): void {
  recent = null;
  lastAcceptedAt = 0;
  lastDrawing = null;
}
