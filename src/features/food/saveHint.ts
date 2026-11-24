/**
 * The diary's one-time hint "Save lunch as a meal": one quiet line on one meal card, which teaches
 * that a diary meal can be kept as one of my meals (the meal menu's "Save as a meal" behind the "···"
 * is otherwise unlabelled). A tap opens the save sheet; "Not now" hides it for good on this device.
 *
 * Which meal shows it is one pure rule, `saveHintMeal`: a meal of the day shown with 2 or more different
 * foods (drinks logged on Water left out, as the save leaves them out) whose set of foods is not already a
 * live saved meal (`sameFoodsAsSaved`, the food key What fits dedupes by), so a lunch just saved from
 * the AI review or logged from a saved meal never shows it; the meal the diary was opened for
 * (`?meal=`) first when it qualifies, else the first in the day's order. At most one card.
 *
 * Whether it was dealt with is kept on this device under its own key (a per-device convenience, never
 * synced, never a store write, like the spread hint): marked only by its own "Not now" or by a save of
 * a diary meal (`saveMeal`: the menu, the hint, or Saved meals' "Save lunch as a meal" row), never by
 * an AI save. Null until read, so it never flashes; unreadable storage means show.
 *
 * In an automated browser or a test build it shows only when the page sets
 * `window.__healthcalSaveHint = true` before the app loads (a state's `flags`), so no scripted run meets
 * it unasked. A phone-test Release build has neither, so the phone flows see it after two lunch foods.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

import { isWaterDrinkEntry } from '@/features/drinks/via';
import type { FoodEntry, MealType, SavedMeal } from '@/types';

import { distinctFoodCount, sameFoodsAsSaved } from './favorites';

export const SAVE_HINT_KEY = 'healthcal.saveMealHintDone';

declare global {
  interface Window {
    /** Tests: true lets the diary's save hint show in an automated browser or a test build. */
    __healthcalSaveHint?: boolean;
  }
}

/** How many foods a meal needs before saving it is offered (one food is logged again from Recent). */
export const SAVE_MIN_FOODS = 2;

/**
 * Whether a meal's entries are worth offering as a new saved meal: 2 or more different foods (by the
 * food key `sameFoodsAsSaved` compares, so a banana logged twice is one food; drinks logged on Water
 * left out) and not already a live saved meal with the same foods. The same count as Saved meals'
 * permanent "Save lunch as a meal" row (`mealToSave`).
 */
export function canOfferSave(entries: readonly FoodEntry[], saved: readonly SavedMeal[]): boolean {
  const food = entries.filter((e) => !isWaterDrinkEntry(e) && !e.deleted);
  return distinctFoodCount(food) >= SAVE_MIN_FOODS && !sameFoodsAsSaved(food, saved);
}

/**
 * The one meal card that shows the hint, or null. `byMeal` in the day's order (breakfast first);
 * `done` null while the device's answer is unread (nothing shows), `prefer` the meal the diary was
 * opened for.
 */
export function saveHintMeal(
  byMeal: readonly { meal: MealType; entries: readonly FoodEntry[] }[],
  o: { done: boolean | null; allowed: boolean; saved: readonly SavedMeal[]; prefer?: MealType | null },
): MealType | null {
  if (o.done !== false || !o.allowed) return null;
  const fits = byMeal.filter((m) => canOfferSave(m.entries, o.saved)).map((m) => m.meal);
  if (o.prefer && fits.includes(o.prefer)) return o.prefer;
  return fits[0] ?? null;
}

function automated(): boolean {
  const driven = Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.webdriver === true;
  // Written out in full: Expo inlines EXPO_PUBLIC_ values only where they appear literally.
  return driven || process.env.EXPO_PUBLIC_E2E === '1';
}

/** Whether the hint may show here at all (the test-hook gate). Never throws. */
export function saveHintAllowed(): boolean {
  try {
    if (!automated()) return true;
    return typeof window !== 'undefined' && window.__healthcalSaveHint === true;
  } catch {
    return false;
  }
}

/** null until read: nothing is drawn before the stored answer is known. */
let done: boolean | null = null;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function load(): Promise<void> {
  if (!loading) {
    loading = (async () => {
      let stored = false;
      try {
        stored = (await AsyncStorage.getItem(SAVE_HINT_KEY)) === '1';
      } catch {
        // Unreadable: show the hint.
      }
      // A dismiss or a save while the read was in flight is newer than what was stored.
      if (done === null) done = stored;
      emit();
    })();
  }
  return loading;
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** "Not now", or a diary meal was saved: the hint never shows again on this device. */
export function markSaveHintDone(): void {
  done = true;
  emit();
  try {
    AsyncStorage.setItem(SAVE_HINT_KEY, '1').catch((e: unknown) => {
      if (typeof __DEV__ !== 'undefined' && __DEV__) console.warn('[save hint] could not keep the answer', e);
    });
  } catch {
    // Storage is not there (a private window): it shows again next time, which is harmless.
  }
}

/** Tests only: forget the answer, as on a fresh device. */
export function resetSaveHintForTests(value: boolean | null = null): void {
  done = value;
  loading = null;
}

/** The device's answer: null until read, then whether the hint was dealt with. */
export function useSaveHintDone(): boolean | null {
  const isDone = useSyncExternalStore(subscribe, () => done, () => done);
  useEffect(() => {
    void load();
  }, []);
  return isDone;
}
