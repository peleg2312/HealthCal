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
import { Platform, useWindowDimensions, type TextStyle } from 'react-native';

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

/**
 * Large text, the one rule every screen shares: how much reading text has grown on this device is the app's
 * size times the phone's own setting as far as `phoneCapFor` lets it add (the browser leaves the phone's
 * setting to its own zoom, so the web counts the app's size only); measured on reading text, which grows by
 * exactly the app's size. Past `LARGE_TEXT` (the sizes 130% and up, or a phone set to 1.3 and up at 100%), a
 * layout measured at the designed size gives way: a side-by-side row becomes rows, tiles stack or wrap, a strip
 * scrolls. Text is never drawn smaller for it, and at 100% nothing changes.
 */
export const LARGE_TEXT = 1.2;

/** Reading text's growth for an app size and the phone's font scale: 1 at the designed size, 2 at 200%. Pure. */
export function textGrowth(appSize: number, phoneScale = 1): number {
  const phone = Number.isFinite(phoneScale) && phoneScale > 0 ? Math.max(1, phoneScale) : 1;
  const app = scaledFontSize(15, appSize) / 15;
  return Math.round(app * Math.min(phone, phoneCapFor(appSize)) * 100) / 100;
}

/** `textGrowth` now, live. */
export function useTextGrowth(): number {
  const size = useTextSize();
  const { fontScale } = useWindowDimensions();
  return textGrowth(size, Platform.OS === 'web' ? 1 : fontScale);
}

/** True while text is large (`LARGE_TEXT`), live. */
export function useLargeText(): boolean {
  return useTextGrowth() > LARGE_TEXT;
}

/**
 * Very large text: past the phone's common text steps. A layout drawn to grow with its text, whose boxes are
 * measured from the text drawn in them rather than fixed at the designed size (Today and its tab header, the diary,
 * the + sheet), keeps its designed shape, with larger text and no room wasted, through Android's 1.15 and 1.3, iOS's
 * sizes up to xxxLarge (1.35) and the app's 115% and 130%; only a part whose words, measured as drawn, are wider than
 * its room gives way before then (a 320 px phone). Past `VERY_LARGE_TEXT` (Android's 1.5 and up, iOS's accessibility
 * sizes, the app's 150% and up) such a layout gives way as a `LARGE_TEXT` one does. Every other screen keeps
 * `LARGE_TEXT`.
 */
export const VERY_LARGE_TEXT = 1.4;

/** True while text is very large (`VERY_LARGE_TEXT`), live. */
export function useVeryLargeText(): boolean {
  return useTextGrowth() > VERY_LARGE_TEXT;
}

/**
 * The size a designed font size is drawn at, for the app's text size and the phone's font scale (on the web pass 1:
 * the browser's zoom is its own). Pure. The phone's part is counted in full, as iOS draws it (Android 14 grows large
 * text less), so a line chosen to fit by it fits on either phone.
 */
export function drawnFontSize(size: number, appSize: number, phoneScale = 1): number {
  const phone = Number.isFinite(phoneScale) && phoneScale > 0 ? Math.max(1, phoneScale) : 1;
  return Math.round(scaledFontSize(size, appSize) * Math.min(phone, phoneCapFor(appSize)) * 10) / 10;
}

/** `drawnFontSize` on this device, live: from a designed size to the size it is drawn at. */
export function useDrawnFontSize(): (size: number) => number {
  const size = useTextSize();
  const { fontScale } = useWindowDimensions();
  const phone = Platform.OS === 'web' ? 1 : fontScale;
  return (designed: number) => drawnFontSize(designed, size, phone);
}

/** Choose a text size: drawn at once and kept on this device. */
export function setTextSize(next: number): void {
  const v = normaliseTextSize(next);
  if (v === size) return;
  size = v;
  emit();
  AsyncStorage.setItem(TEXT_SIZE_KEY, String(v)).catch(() => {});
}
