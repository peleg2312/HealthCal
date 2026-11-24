// The second way back after a diary delete (WCAG 2.2.1: the toast's Undo leaves on a timer). A meal card
// lists the entries removed from it today, newest first, each with Restore (the kit's `RestoreRow`), so a
// record deleted by mistake can be brought back after the toast has gone. Pure: no React, no storage.
import { isWaterDrinkEntry } from '@/features/drinks/via';
import { toISODate } from '@/lib/dates';
import type { FoodEntry, ISODate, MealType } from '@/types';

/** At most this many removed entries are offered per meal card, so a cleared meal does not fill the page. */
export const RESTORE_MAX = 3;

/**
 * The entries of `meal` on `date` that were deleted on `today` (the delete's stamp read on the local
 * calendar), newest delete first, at most `RESTORE_MAX`. A drink's calories logged on Water are left out
 * (Water offers its own way back, and they are never shown as diary rows).
 */
export function removedToday(entries: Record<string, FoodEntry>, date: ISODate, meal: MealType, today: ISODate, max: number = RESTORE_MAX): FoodEntry[] {
  return Object.values(entries)
    .filter((e) => e.deleted && e.date === date && e.meal === meal && !isWaterDrinkEntry(e) && !!e.updatedAt && toISODate(new Date(e.updatedAt)) === today)
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0))
    .slice(0, max);
}
