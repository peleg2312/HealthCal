/**
 * Today's big calorie figure: what is left of the day's budget (the default) or what was eaten, chosen with one
 * tap on the number and remembered on this device only (AsyncStorage `healthcal.calorieFigure`; never the store,
 * the synced settings, the backup or the export). The other figure is still said once, in the line at the cup's
 * level, so the card always holds both and the budget once.
 *
 * Read before the first draw: on the web the stored value is read from localStorage as this module loads, so the
 * first frame already shows the choice; on a phone the read starts as this module loads, and Today draws the number
 * only once it is back (`ready`), so the figure never flips after the page shows. Until it is read, or when it is
 * missing or unreadable, the figure is "left", as it always was. The key is outside the store's `healthcal/`
 * prefix, so sign-out does not clear it, like the other per-device conveniences.
 *
 * The words are pure functions (`figureWords`), tested in `calorieFigure.test.ts`; the screen only places them.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

import { formatNumber } from '@/lib/units';

export const CALORIE_FIGURE_KEY = 'healthcal.calorieFigure';

export type CalorieFigure = 'left' | 'eaten';

/** A stored value as a choice: only "eaten" picks eaten; anything else (missing, unreadable, unknown) is "left". */
export function parseCalorieFigure(raw: unknown): CalorieFigure {
  return raw === 'eaten' ? 'eaten' : 'left';
}

/** The other choice: what a tap on the number switches to. */
export function otherFigure(figure: CalorieFigure): CalorieFigure {
  return figure === 'left' ? 'eaten' : 'left';
}

/** How what is left relates to the budget, in the card's neutral words: never "over", never red. */
export type LeftWord = 'left' | 'above' | 'under';

export interface FigureWords {
  /** The big number: its value as it ticks (signed for "left", so it ticks through zero), its text, its unit word. */
  big: { value: number; text: string; word: LeftWord | 'eaten'; tone: 'caloriesInk' | 'warningInk'; testID: 'today-remaining' | 'today-eaten' };
  /** The line at the cup's level: the other figure, then the words before the budget ("eaten of", "left of", "above", "under"). */
  line: { value: number; text: string; words: string; testID: 'today-remaining' | 'today-eaten'; spoken: string };
  /** The number's own spoken name, units in full ("941 kilocalories left"). */
  bigSpoken: string;
  /** The control's name: the words it shows, then what a tap does ("941 kcal left. Switch to calories eaten"). */
  name: string;
}

/**
 * What the calorie card says for a choice. `remaining` is the budget minus what was eaten (negative above it);
 * `isToday` decides "left" (today) or "under" (a past day), as the card always has. Above the budget "left" reads
 * as the amount above ("130 kcal above"), in the warning ink only on the big figure, as before.
 */
export function figureWords(figure: CalorieFigure, { remaining, eaten, isToday }: { remaining: number; eaten: number; isToday: boolean }): FigureWords {
  const over = remaining < 0;
  const leftWord: LeftWord = over ? 'above' : isToday ? 'left' : 'under';
  const leftText = formatNumber(Math.abs(Math.round(remaining)));
  const eatenText = formatNumber(Math.round(eaten));
  // Said in full where the figure stands alone: "above the budget", "under the budget".
  const leftSpoken = `${leftText} kilocalories ${leftWord === 'left' ? 'left' : `${leftWord} the budget`}`;
  const eatenSpoken = `${eatenText} kilocalories eaten`;
  const leftName = `${leftText} kcal ${leftWord === 'above' ? 'above the budget' : leftWord}`;
  if (figure === 'eaten') {
    return {
      big: { value: eaten, text: eatenText, word: 'eaten', tone: 'caloriesInk', testID: 'today-eaten' },
      line: { value: remaining, text: leftText, words: leftWord === 'left' ? 'left of' : leftWord, testID: 'today-remaining', spoken: leftSpoken },
      bigSpoken: eatenSpoken,
      name: `${eatenText} kcal eaten. Switch to calories ${leftWord === 'left' ? 'left' : `${leftWord} the budget`}`,
    };
  }
  return {
    big: { value: remaining, text: leftText, word: leftWord, tone: over ? 'warningInk' : 'caloriesInk', testID: 'today-remaining' },
    line: { value: eaten, text: eatenText, words: 'eaten of', testID: 'today-eaten', spoken: eatenSpoken },
    bigSpoken: leftSpoken,
    name: `${leftName}. Switch to calories eaten`,
  };
}

// ------------------------------------------------------------------ memory

interface Snapshot {
  figure: CalorieFigure;
  /** The stored choice has been read (always on the web, where it is read as the module loads). */
  ready: boolean;
}

function initial(): Snapshot {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return { figure: 'left', ready: false };
  try {
    return { figure: parseCalorieFigure(window.localStorage?.getItem(CALORIE_FIGURE_KEY)), ready: true };
  } catch {
    return { figure: 'left', ready: true };
  }
}

let snap: Snapshot = initial();
/** A tap while the read was in flight is newer than what was stored. */
let tapped = false;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

/** Read the stored choice once (a phone; the web read it as the module loaded); later calls return the same promise. */
export function loadCalorieFigure(): Promise<void> {
  if (!loading) {
    loading = snap.ready
      ? Promise.resolve()
      : AsyncStorage.getItem(CALORIE_FIGURE_KEY)
          .then(parseCalorieFigure, () => 'left' as const)
          .then((stored) => {
            snap = { figure: tapped ? snap.figure : stored, ready: true };
            emit();
          });
  }
  return loading;
}
void loadCalorieFigure();

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** The figure chosen on this device, live, and whether it has been read yet. */
export function useCalorieFigure(): Snapshot {
  return useSyncExternalStore(subscribe, () => snap, () => snap);
}

/** The figure chosen on this device now, outside React. */
export function calorieFigureNow(): Snapshot {
  return snap;
}

/** A tap on the number: drawn at once and kept on this device. */
export function setCalorieFigure(next: CalorieFigure): void {
  tapped = true;
  if (snap.figure === next && snap.ready) return;
  snap = { figure: next, ready: true };
  emit();
  try {
    AsyncStorage.setItem(CALORIE_FIGURE_KEY, next).catch((e: unknown) => {
      if (typeof __DEV__ !== 'undefined' && __DEV__) console.warn('[today] could not keep the figure', e);
    });
  } catch (e) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) console.warn('[today] could not keep the figure', e);
  }
}

/** Tests only: forget what was read and tapped, as a fresh start of the app on a phone. */
export function resetCalorieFigureForTests(): void {
  snap = { figure: 'left', ready: false };
  tapped = false;
  loading = null;
}
