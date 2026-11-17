/**
 * What the morning page needs to know about how this run of the app began, taken once when the
 * app starts (the root layout imports this module, so it is read before the router draws a
 * screen or rewrites the address):
 *
 * - `at`: when the app started (ms).
 * - `webAddress`: on web, the path and query the page was loaded with. Read from the address
 *   itself, never from the browser's navigation timing, so a real browser, an automated one with
 *   a fixed clock and the hosted preview (which sets its address to '/' before the app runs) all
 *   take the same path. Null natively (the launch link comes from Linking) and for a page with
 *   no address of its own (about:srcdoc).
 * - `onboarded`: whether setup was finished in what the device held when the store loaded. False
 *   when the person signed in or set up during this run: their Today then appears long after the
 *   start, and the page must not rise over the first look at an account just pulled down.
 */
import { Platform } from 'react-native';

import { useStore } from '@/store';
import { useHydration } from '@/store/persistence';

function readWebAddress(): string | null {
  try {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || !window.location) return null;
    const { protocol, pathname, search } = window.location;
    if (protocol !== 'http:' && protocol !== 'https:' && protocol !== 'file:') return null;
    return `${pathname || '/'}${search || ''}`;
  } catch {
    return null;
  }
}

export const launch: { at: number; webAddress: string | null; onboarded: boolean | null } = {
  at: Date.now(),
  webAddress: readWebAddress(),
  onboarded: null,
};

function take(): boolean {
  if (launch.onboarded !== null) return true;
  if (useHydration.getState().status !== 'ready') return false;
  launch.onboarded = !!useStore.getState().profile?.onboardedAt;
  return true;
}

try {
  if (!take()) {
    const stop = useHydration.subscribe(() => {
      if (take()) stop();
    });
  }
} catch {
  // Unknown stays null: the cold look is then skipped, never shown by mistake.
}
