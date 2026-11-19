/**
 * The one store write that keeps a drink's pair together after its diary entry is edited.
 *
 * A drink logged on Water (`foodEntryId`): when a live water record points at the entry, its amount
 * follows the entry's grams and its day follows the entry's day (`waterForEntryEdit`), and any edit
 * writes it again with the entry. An edit the pair could not follow (a future day, more than 10,000
 * ml) is refused first (`pairEditBlocked`).
 *
 * A drink logged in the diary (`fromEntryId`, ./diary.ts): the entry leads and is never refused. Its
 * live water is recomputed from the edited entry (`diaryDrinkMl`: floor 1 ml, cap 10,000 ml, never by
 * scaling the old volume) and takes the entry's day, future days included, written with the entry in
 * one act with one stamp (the store's `upsertEntriesWithWater`), only when the amount, the serving or
 * the day changed (`entryEditMovesWater`); an edit of the meal, the name or the calories alone leaves
 * the water record untouched, stamp included. An edit never creates this water and never removes it;
 * water deleted on Water stays deleted.
 *
 * Called by the food log's rewriteEntry and by updateEntryDirect in the same act as the entry's own
 * write; their Undo (`undoEdit`) puts back the snapshot this returns.
 */
import { today } from '@/lib/dates';
import { useStore } from '@/store';
import type { FoodEntry, WaterEntry } from '@/types';

import { diaryDrinkMl, entryEditMovesWater, type EntryWaterFields } from './diary';
import { pairEditProblem, waterForEntryEdit, waterFromEntry, waterPointingAt } from './rules';

/**
 * Why this edit of `before` cannot be saved while a live water record from Water points at it (a future
 * day, or more than one water record holds), or null. Asked by every write path before it writes, so the
 * pair never ends with numbers that disagree; the detail screen asks the same rule before Save. A drink
 * logged in the diary is never refused (its water follows the entry).
 */
export function pairEditBlocked(before: Pick<FoodEntry, 'id' | 'grams' | 'date' | 'deleted'> | undefined, after: Pick<FoodEntry, 'grams' | 'date'>): string | null {
  if (!before || before.deleted) return null;
  const store = useStore.getState();
  const water = waterPointingAt(store.water, before.id);
  if (!water) return null;
  return pairEditProblem(water, before, after, today(), store.profile?.units ?? 'metric')?.text ?? null;
}

/**
 * Move the water record paired with `before` to match `after` (and write it again even when nothing
 * moves). `after` is the entry as just written (the callers pass the whole record). Returns the water
 * record as it was before (for Undo), or null when there is no live pair.
 */
export function followEntry(
  before: (Pick<FoodEntry, 'id' | 'grams' | 'date'> & Partial<EntryWaterFields>) | undefined,
  after: Pick<FoodEntry, 'grams' | 'date'> & Partial<FoodEntry>,
): WaterEntry | null {
  if (!before) return null;
  const store = useStore.getState();
  const water = waterPointingAt(store.water, before.id);
  if (water) {
    // Written even when nothing about the water changes (a meal change): the pair then carries one
    // newer stamp, so a delete of both on another phone before this edit can never leave the entry
    // live without its water after the two phones sync.
    const patch = waterForEntryEdit(water, before, after, today());
    store.upsert('water', { ...water, ...(patch ?? null) });
    return water;
  }
  const fromDiary = waterFromEntry(store.water, before.id);
  if (!fromDiary) return null;
  const entry: FoodEntry = after.id === before.id && after.name !== undefined ? (after as FoodEntry) : { ...store.foodEntries[before.id], grams: after.grams, date: after.date };
  // A meal, name or calories change: the entry is already written; its water stays as it is. Still
  // returned, so the edit's Undo can tell a pair deleted together since.
  if (!entryEditMovesWater(before, entry)) return fromDiary;
  const ml = diaryDrinkMl(entry) ?? fromDiary.ml;
  // The entry and its water written again together, one stamp.
  store.upsertEntriesWithWater([{ entry, water: { ...fromDiary, ml } }]);
  return fromDiary;
}

/**
 * Undo of an edit: the entry exactly as it was, and its water record as it was only when that water is
 * still live (water the person deleted on Water in between stays deleted; no edit removes water, so
 * "removed by this same edit" never arises). A drink logged in the diary is written back with its entry
 * in one act with one stamp, or the entry alone when only its meal, name or calories differ from now. When the pair was deleted together since the edit, nothing comes back.
 */
export function undoEdit(entryBefore: FoodEntry, waterBefore: WaterEntry | null): void {
  const s = useStore.getState();
  const now = waterBefore ? s.water[waterBefore.id] : undefined;
  const live = !!now && !now.deleted;
  const entryNow = s.foodEntries[entryBefore.id];
  // The drink was deleted as a pair since the edit (both records, one act, from either side): the
  // edit's Undo does not bring back half of it.
  if (now && !live && entryNow?.deleted && entryNow.updatedAt === now.updatedAt) return;
  if (waterBefore && live && waterBefore.fromEntryId && !waterBefore.foodEntryId) {
    // Undoing a meal, name or calories change: the water was not touched by the edit and is not now.
    if (entryNow && !entryEditMovesWater(entryNow, entryBefore)) s.upsert('foodEntries', entryBefore);
    else s.upsertEntriesWithWater([{ entry: entryBefore, water: waterBefore }]);
    return;
  }
  s.upsert('foodEntries', entryBefore);
  if (waterBefore && live) s.upsert('water', waterBefore);
}
