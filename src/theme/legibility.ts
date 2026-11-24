/**
 * The system's legibility settings, followed live: more contrast, bold text and forced colours.
 *
 * - More contrast: iOS Increase Contrast (`isDarkerSystemColorsEnabled`), Android High contrast text
 *   (`isHighTextContrastEnabled`) and `prefers-contrast: more` on the web. The active look is drawn with
 *   `moreContrastColors` (./contrastMore.ts): secondary text at 7:1, outlines at 4.5:1, bar tints stronger.
 * - Bold text: iOS Bold Text (`isBoldTextEnabled`). Every kit `Text` steps its family one weight up
 *   (`bolder` in ./textSize.ts). Android and the web have no such signal for a custom font.
 * - Forced colours: `forced-colors: active` on the web (Windows contrast themes). The browser would paint
 *   every background as the page, so cups, bars and the + button vanished. Instead the app reads the
 *   system's own colours (Canvas, CanvasText, Highlight, ...) and draws with them (`forcedColors` in
 *   ./contrastMore.ts), with `forced-color-adjust: none` on the page so the browser keeps them: the person's
 *   colours, and every fill still drawn.
 *
 * An automated browser can ask for a setting the web has no query for, before the app loads (a state's
 * `flags`): `window.__healthcalBoldText = true`, and likewise `__healthcalMoreContrast`.
 */
import { useSyncExternalStore } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

export interface Legibility {
  moreContrast: boolean;
  boldText: boolean;
  forcedColors: boolean;
}

declare global {
  interface Window {
    __healthcalBoldText?: boolean;
    __healthcalMoreContrast?: boolean;
  }
}

const NONE: Legibility = { moreContrast: false, boldText: false, forcedColors: false };

let state: Legibility = NONE;
let started = false;
const listeners = new Set<() => void>();

function set(patch: Partial<Legibility>) {
  const next = { ...state, ...patch };
  if (next.moreContrast === state.moreContrast && next.boldText === state.boldText && next.forcedColors === state.forcedColors) return;
  state = next;
  for (const l of listeners) l();
}

/** What a test asked for with a window flag (only ever turns a setting on). */
function asked(): Partial<Legibility> {
  if (typeof window === 'undefined') return {};
  return { ...(window.__healthcalBoldText === true ? { boldText: true } : null), ...(window.__healthcalMoreContrast === true ? { moreContrast: true } : null) };
}

function startWeb() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
  const more = window.matchMedia('(prefers-contrast: more)');
  const colors = window.matchMedia('(forced-colors: active)');
  const read = () => set({ moreContrast: more.matches, forcedColors: colors.matches, ...asked() });
  read();
  more.addEventListener?.('change', read);
  colors.addEventListener?.('change', read);
}

function startNative() {
  const flag = (p: Promise<boolean> | undefined, key: keyof Legibility) => {
    p?.then((v) => set({ [key]: v === true })).catch(() => {});
  };
  if (Platform.OS === 'ios') {
    flag(AccessibilityInfo.isDarkerSystemColorsEnabled?.(), 'moreContrast');
    flag(AccessibilityInfo.isBoldTextEnabled?.(), 'boldText');
    AccessibilityInfo.addEventListener?.('darkerSystemColorsChanged', (v: boolean) => set({ moreContrast: v === true }));
    AccessibilityInfo.addEventListener?.('boldTextChanged', (v: boolean) => set({ boldText: v === true }));
  } else if (Platform.OS === 'android') {
    flag(AccessibilityInfo.isHighTextContrastEnabled?.(), 'moreContrast');
    AccessibilityInfo.addEventListener?.('highTextContrastChanged', (v: boolean) => set({ moreContrast: v === true }));
  }
}

function start() {
  if (started) return;
  started = true;
  try {
    if (Platform.OS === 'web') startWeb();
    else startNative();
  } catch {
    // A platform without these settings keeps the plain looks.
  }
}

function subscribe(l: () => void) {
  start();
  listeners.add(l);
  return () => listeners.delete(l);
}

function snapshot(): Legibility {
  start();
  return state;
}

/** The system's legibility settings, live. */
export function useLegibility(): Legibility {
  return useSyncExternalStore(subscribe, snapshot, () => NONE);
}

/** The same outside React (read at the moment of the call). */
export function legibility(): Legibility {
  return snapshot();
}
