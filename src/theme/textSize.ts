/**
 * The app's own text size (Profile > Appearance, "Text size"): 100% to 200%, kept on this device only
 * (a per-device convenience under its own key, never the store, never synced, never in the backup).
 *
 * Every kit `Text` draws its size and line height through this scale (`scaleTextStyle`), on every platform,
 * so reading text reaches 200% without the phone's setting and without browser zoom (WCAG 1.4.4); text
 * that is already large grows less, as Android 14's nonlinear font scaling does (`scaledFontSize`). The phone's own
 * text-size setting still applies on top, capped so the two together stay at 2x (`phoneCapFor`): at 100%
 * here the phone may scale the kit's type up to 2x (`MAX_TEXT_GROWTH`), at 200% here not at all.
 *
 * The stored size is read before the first screen on the web (localStorage, synchronously) and at the
 * start on a phone. A browser test sets `window.__healthcalTextSize = true` (200%) or a number before
 * loading (a state's `flags`).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { Platform, type TextStyle } from 'react-native';

import { fonts } from './tokens';

/** The sizes offered, as scales of the designed type. */
export const TEXT_SIZES = [1, 1.15, 1.3, 1.5, 1.75, 2] as const;
export type TextSize = (typeof TEXT_SIZES)[number];

/** The most the kit's type grows, the app's size and the phone's setting together. */
export const MAX_TEXT_GROWTH = 2;

export const TEXT_SIZE_KEY = 'healthcal.textSize';

declare global {
  interface Window {
    __healthcalTextSize?: number | boolean;
  }
}

/** A stored or passed value as one of the offered sizes (the nearest one); 1 for anything unreadable. */
export function normaliseTextSize(v: unknown): TextSize {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN;
  if (!Number.isFinite(n) || n <= 0) return 1;
  let best: TextSize = 1;
  for (const s of TEXT_SIZES) if (Math.abs(s - n) < Math.abs(best - n)) best = s;
  return best;
}

/** How far the phone's own text-size setting may scale the kit's type on top of the app's size. */
export function phoneCapFor(scale: number): number {
  return Math.max(1, Math.round((MAX_TEXT_GROWTH / Math.max(1, scale)) * 100) / 100);
}

/** "150%": how a size is named on screen and read aloud. */
export function textSizeLabel(scale: number): string {
  return `${Math.round(scale * 100)}%`;
}

/** One weight up for Bold Text: each Hanken and Bricolage weight to the next one the app loads. */
const BOLDER: Record<string, string> = {
  [fonts.regular]: fonts.semibold,
  [fonts.medium]: fonts.semibold,
  [fonts.semibold]: fonts.bold,
  [fonts.displaySemibold]: fonts.display,
  [fonts.display]: fonts.extrabold,
};

/** A font family one weight heavier (the same family when it is already the heaviest). */
export function bolder(family: string | undefined): string | undefined {
  return family ? (BOLDER[family] ?? family) : family;
}

/**
 * Nonlinear font scaling at 200%, after Android 14's (its FontScaleConverter table): every reading size up
 * to 16 px (body 15, title 16) doubles exactly, and text that is already large grows less (a 30 px number
 * to 50, a 100 px one not at all), so headings and big figures stay on their lines. Pairs of [designed
 * size, size at 200%].
 */
const AT_200: [number, number][] = [
  [8, 16],
  [10, 20],
  [12, 24],
  [14, 28],
  [16, 32],
  [18, 33],
  [20, 35],
  [24, 40],
  [30, 50],
  [100, 100],
];

/** A designed font size at the app's text size: twice a reading size at 200%, less for large text (`AT_200`). */
export function scaledFontSize(size: number, scale: number): number {
  if (scale === 1 || size <= 0) return size;
  let doubled = size * 2;
  if (size >= AT_200[AT_200.length - 1][0]) doubled = size;
  else if (size > AT_200[0][0]) {
    const j = AT_200.findIndex(([from]) => from >= size);
    const [a, ta] = AT_200[j - 1];
    const [b, tb] = AT_200[j];
    doubled = ta + ((size - a) / (b - a)) * (tb - ta);
  }
  // Between 100% and 200%, the same share of the way.
  return Math.round((size + (doubled - size) * Math.min(1, Math.max(0, scale - 1))) * 10) / 10;
}

/**
 * A flattened text style at the app's text size, and one weight heavier under Bold Text: the size grows by
 * `scaledFontSize`, and the line height and the letter spacing by the same ratio, so a line keeps its proportions.
 */
export function scaleTextStyle(style: TextStyle, scale: number, bold: boolean): TextStyle {
  if (scale === 1 && !bold) return style;
  const ratio = typeof style.fontSize === 'number' && style.fontSize > 0 ? scaledFontSize(style.fontSize, scale) / style.fontSize : scale;
  const grow = (v: number | undefined, step: number) => (typeof v === 'number' && scale !== 1 ? Math.round(v * ratio * step) / step : v);
  return {
    ...style,
    fontSize: grow(style.fontSize, 10),
    lineHeight: grow(style.lineHeight, 10),
    letterSpacing: grow(style.letterSpacing, 100),
    fontFamily: bold ? bolder(style.fontFamily) : style.fontFamily,
  };
}

function initial(): TextSize {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return 1;
  const asked = window.__healthcalTextSize;
  if (asked === true) return 2;
  if (typeof asked === 'number') return normaliseTextSize(asked);
  try {
    return normaliseTextSize(window.localStorage?.getItem(TEXT_SIZE_KEY));
  } catch {
    return 1;
  }
}

let size: TextSize = initial();
let loaded = Platform.OS === 'web';
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function load() {
  if (loaded) return;
  loaded = true;
  AsyncStorage.getItem(TEXT_SIZE_KEY)
    .then((v) => {
      const next = normaliseTextSize(v);
      if (next !== size) {
        size = next;
        emit();
      }
    })
    .catch(() => {});
}
load();

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** The app's text size, live. */
export function useTextSize(): TextSize {
  return useSyncExternalStore(subscribe, () => size, () => size);
}

/** The app's text size now (outside React). */
export function textSize(): TextSize {
  return size;
}

/** Choose a text size: drawn at once and kept on this device. */
export function setTextSize(next: number): void {
  const v = normaliseTextSize(next);
  if (v === size) return;
  size = v;
  emit();
  AsyncStorage.setItem(TEXT_SIZE_KEY, String(v)).catch(() => {});
}
