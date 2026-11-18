/**
 * The one store write that keeps a drink's pair together after its diary entry is edited: when a
 * live water record points at the entry, its amount follows the entry's grams and its day follows
 * the entry's day (`waterForEntryEdit`), and any edit writes it again with the entry. An edit the
 * pair could not follow (a future day, more than 10,000 ml) is refused first (`pairEditBlocked`).
 * Called by the food log's rewriteEntry and by updateEntryDirect in the same act as the entry's own
 * write; their Undo puts back the snapshot this returns, so both records return exactly as they were.
 */
import { today } from '@/lib/dates';
import { useStore } from '@/store';
import type { FoodEntry, WaterEntry } from '@/types';

import { pairEditProblem, waterForEntryEdit, waterPointingAt } from './rules';

/**
 * Why this edit of `before` cannot be saved while a live water record points at it (a future day,
 * or more than one water record holds), or null. Asked by every write path before it writes, so the
 * pair never ends with numbers that disagree; the detail screen asks the same rule before Save.
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
 * moves). Returns the water record as it was before (for Undo), or null when there is no live pair.
 */
export function followEntry(before: Pick<FoodEntry, 'id' | 'grams' | 'date'> | undefined, after: Pick<FoodEntry, 'grams' | 'date'>): WaterEntry | null {
  if (!before) return null;
  const store = useStore.getState();
  const water = waterPointingAt(store.water, before.id);
  if (!water) return null;
  // Written even when nothing about the water changes (a meal change): the pair then carries one
  // newer stamp, so a delete of both on another phone before this edit can never leave the entry
  // live without its water after the two phones sync.
  const patch = waterForEntryEdit(water, before, after, today());
  store.upsert('water', { ...water, ...(patch ?? null) });
  return water;
}

/** Undo of an edit: the entry and, when it moved, its water record, exactly as they were. */
export function undoEdit(entryBefore: FoodEntry, waterBefore: WaterEntry | null): void {
  const s = useStore.getState();
  s.upsert('foodEntries', entryBefore);
  if (waterBefore) s.upsert('water', waterBefore);
}
