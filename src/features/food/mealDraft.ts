/**
 * The saved meal being built or edited. Shared by the builder screen
 * (/food/meal-edit) and its food picker (/food/meal-pick), which is pushed on
 * top of it and adds items here. Nothing is stored until the builder saves.
 */
import { create } from 'zustand';

import type { SavedMeal, SavedMealItem } from '@/types';

import { currentValues } from './usuals';

export interface DraftRow {
  key: string;
  item: SavedMealItem;
}

interface MealDraftState {
  /** True once a builder has opened the draft. */
  active: boolean;
  /** The saved meal being edited, or null for a new one. */
  id: string | null;
  name: string;
  servings: number | null;
  rows: DraftRow[];
  /** True once anything was changed since the draft opened. */
  dirty: boolean;
}

let seq = 0;
const nextKey = () => `d${Date.now().toString(36)}${(seq++).toString(36)}`;

export const useMealDraft = create<MealDraftState>(() => ({ active: false, id: null, name: '', servings: 1, rows: [], dirty: false }));

/**
 * Open the builder's draft for a meal (or a new one). Leaving the builder does
 * not throw unsaved work away: opening the same meal again picks the draft up
 * where it was left. Returns true when it did. `fresh` starts over regardless.
 */
export function openMealDraft(meal?: SavedMeal, fresh = false): boolean {
  const cur = useMealDraft.getState();
  if (!fresh && cur.active && cur.dirty && cur.id === (meal?.id ?? null) && (cur.rows.length > 0 || cur.name.trim() !== '')) return true;
  resetDraft(meal);
  return false;
}

function resetDraft(meal?: SavedMeal): void {
  useMealDraft.setState({
    active: true,
    id: meal?.id ?? null,
    name: meal?.name ?? '',
    servings: meal?.servings && meal.servings > 1 ? meal.servings : 1,
    // Each line as logging the meal adds it: a bundled food at today's values for its grams (currentValues), so the
    // builder's totals and amount editor agree with the + sheet and Saved meals. Stored only if the person saves.
    rows: (meal?.items ?? []).map((item) => ({ key: nextKey(), item: currentValues(item) })),
    dirty: false,
  });
}

export function closeMealDraft(): void {
  useMealDraft.setState({ active: false, id: null, name: '', servings: 1, rows: [], dirty: false });
}

export function setDraftName(name: string): void {
  useMealDraft.setState({ name, dirty: true });
}

export function setDraftServings(servings: number | null): void {
  useMealDraft.setState({ servings, dirty: true });
}

export function addDraftItem(item: SavedMealItem): string {
  const key = nextKey();
  useMealDraft.setState((s) => ({ rows: [...s.rows, { key, item }], dirty: true }));
  return key;
}

export function updateDraftItem(key: string, item: SavedMealItem): void {
  useMealDraft.setState((s) => ({ rows: s.rows.map((r) => (r.key === key ? { key, item } : r)), dirty: true }));
}

/** Remove a row; returns a function that puts it back where it was. */
export function removeDraftItem(key: string): () => void {
  const { rows } = useMealDraft.getState();
  const index = rows.findIndex((r) => r.key === key);
  if (index < 0) return () => {};
  const row = rows[index];
  useMealDraft.setState({ rows: rows.filter((r) => r.key !== key), dirty: true });
  return () =>
    useMealDraft.setState((s) => {
      if (s.rows.some((r) => r.key === key)) return s;
      const next = [...s.rows];
      next.splice(Math.min(index, next.length), 0, row);
      return { rows: next };
    });
}
