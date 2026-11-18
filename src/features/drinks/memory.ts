/**
 * The drink chosen last per kind, on this device only (AsyncStorage `healthcal.drinkChoice`), so the
 * next log of the same kind is as fast as before: a milk drinker who prefers whole milk taps Whole
 * once and it stays selected. Never synced (settings sync as one last-writer-wins object, and this
 * changes on every choice tap), never in the backup, never a store write.
 *
 * Written on a choice tap or a pick in the drink sheet (`rememberDrinkChoice`), never on a log and
 * never for "Water only". Read once into a small store (`useDrinkMemory`); until it is read the
 * defaults show. Every read and write is in try/catch: unreadable storage means "defaults".
 * The rule for what is selected on arrival is the pure `rememberedChoice` (./rules.ts).
 *
 * Per device, like the quote pin and the spread hint: the key is outside the store's `healthcal/`
 * prefix, so neither sign-out nor the recovery screen's wipe clears it, and the next account on the
 * same phone starts on the last choice made there. Accepted: it holds a choice (and for a picked
 * drink, that food), nothing synced, and an own food that is no longer there falls back to the default.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import { isFood } from '@/features/settings/exportFormat';
import type { Beverage } from '@/types';

import { ENTERED } from './choices';
import { remember, type DrinkMemory, type SelectedDrink } from './rules';

export const DRINK_CHOICE_KEY = 'healthcal.drinkChoice';

const KINDS: Beverage[] = ['tea', 'coffee', 'juice', 'milk', 'sports', 'other'];

/** What was stored, kept only where it has the right shape (a kind with a choice id, and a valid food for a pick). */
export function parseDrinkMemory(raw: string | null | undefined): DrinkMemory {
  if (!raw) return {};
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
  const out: DrinkMemory = {};
  for (const kind of KINDS) {
    const v = (data as Record<string, unknown>)[kind];
    if (!v || typeof v !== 'object') continue;
    const { id, food } = v as { id?: unknown; food?: unknown };
    if (typeof id !== 'string' || !id || id === ENTERED) continue;
    if (food !== undefined && !isFood(food)) continue;
    out[kind] = food !== undefined ? { id, food } : { id };
  }
  return out;
}

interface DrinkMemoryState {
  memory: DrinkMemory;
  loaded: boolean;
}

export const useDrinkMemory = create<DrinkMemoryState>()(() => ({ memory: {}, loaded: false }));

let loading: Promise<void> | null = null;

/** Read the stored choices once (call from the water screen's effect); later calls return the same promise. */
export function loadDrinkMemory(): Promise<void> {
  if (!loading) {
    loading = (async () => {
      let stored: DrinkMemory = {};
      try {
        stored = parseDrinkMemory(await AsyncStorage.getItem(DRINK_CHOICE_KEY));
      } catch {
        // Unreadable: the defaults.
      }
      // A tap while the read was in flight is newer than what was stored.
      useDrinkMemory.setState((s) => ({ memory: { ...stored, ...s.memory }, loaded: true }));
    })();
  }
  return loading;
}

/** A choice tap or a pick in the drink sheet: keep it for the kind, on this device. */
export function rememberDrinkChoice(kind: Beverage, selected: SelectedDrink): void {
  if (kind === 'water') return;
  const memory = remember(useDrinkMemory.getState().memory, kind, selected);
  useDrinkMemory.setState({ memory });
  try {
    AsyncStorage.setItem(DRINK_CHOICE_KEY, JSON.stringify(memory)).catch((e: unknown) => {
      if (typeof __DEV__ !== 'undefined' && __DEV__) console.warn('[drinks] could not keep the choice', e);
    });
  } catch (e) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) console.warn('[drinks] could not keep the choice', e);
  }
}

/** For tests: forget what was read. */
export function resetDrinkMemoryForTests(): void {
  loading = null;
  useDrinkMemory.setState({ memory: {}, loaded: false });
}
