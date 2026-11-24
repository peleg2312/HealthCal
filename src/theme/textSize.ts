/**
 * The app's own text size (Profile > Appearance, "Text size"): 100% to 200%, kept on this device only
 * (a per-device convenience under its own key, never the store, never synced, never in the backup).
 *
 * Every kit `Text` draws its size and line height times this scale (`scaleTextStyle`), on every platform,
 * so text reaches 200% without the phone's setting and without browser zoom (WCAG 1.4.4). The phone's own
 * text-size setting still applies on top, capped so the two together stay at 2x (`phoneCapFor`): at 100%
 * here the phone may scale the kit's type up to 2x (`MAX_TEXT_GROWTH`), at 200% here not at all.
 *
 * The stored size is read before the first screen on the web (localStorage, synchronously) and at the
 * start on a phone. A browser test sets `window.__healthcalTextSize = 2` before loading (a state's `flags`).
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
    __healthcalTextSize?: number;
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
 * A flattened text style at the app's text size, and one weight heavier under Bold Text: the size, the line
 * height and the letter spacing grow together, so a line keeps its proportions.
 */
export function scaleTextStyle(style: TextStyle, scale: number, bold: boolean): TextStyle {
  if (scale === 1 && !bold) return style;
  const grow = (v: number | undefined, step: number) => (typeof v === 'number' && scale !== 1 ? Math.round(v * scale * step) / step : v);
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
  if (typeof window.__healthcalTextSize === 'number') return normaliseTextSize(window.__healthcalTextSize);
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
