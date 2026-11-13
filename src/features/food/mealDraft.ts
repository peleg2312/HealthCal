/**
 * The saved meal being built or edited. Shared by the builder screen
 * (/food/meal-edit) and its food picker (/food/meal-pick), which is pushed on
 * top of it and adds items here. Nothing is stored until the builder saves.
 */
import { create } from 'zustand';

import type { SavedMeal, SavedMealItem } from '@/types';

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

export function openMealDraft(meal?: SavedMeal): void {
  useMealDraft.setState({
    active: true,
    id: meal?.id ?? null,
    name: meal?.name ?? '',
    servings: meal?.servings && meal.servings > 1 ? meal.servings : 1,
    rows: (meal?.items ?? []).map((item) => ({ key: nextKey(), item })),
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
