import { create } from "zustand";

import type { Food } from "@/types";

/**
 * Hand-off slot for the food a user just picked (from search, a barcode scan
 * or their favourites) on its way to the detail screen. Route params only
 * carry strings, so the definition travels through here instead.
 */
interface DraftState {
  food: Food | null;
  set: (food: Food | null) => void;
}

export const useFoodDraft = create<DraftState>((set) => ({
  food: null,
  set: (food) => set({ food }),
}));

export function setFoodDraft(food: Food | null): void {
  useFoodDraft.getState().set(food);
}
