/**
 * The test-hook gate for the morning page. In a browser driven by automation (Playwright:
 * e2e, crawl, evidence, shot, check-routes) or in a build made with the test hooks
 * (EXPO_PUBLIC_E2E=1, the phone tests' e2e profile) the page never opens by itself unless
 * the test asks with `window.__healthcalMorning = true` before the app loads, so no scripted
 * run meets it unasked. A person's phone or browser is always allowed (the rule decides).
 */
import { Platform } from 'react-native';

declare global {
  interface Window {
    /** Tests: true lets the morning page open by itself in an automated browser or a test build. */
    __healthcalMorning?: boolean;
  }
}

function automated(): boolean {
  const driven = Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.webdriver === true;
  // Written out in full: Expo inlines EXPO_PUBLIC_ values only where they appear literally.
  return driven || process.env.EXPO_PUBLIC_E2E === '1';
}

/** Whether the morning page may open by itself here. Never throws. */
export function morningAllowed(): boolean {
  try {
    if (!automated()) return true;
    return typeof window !== 'undefined' && window.__healthcalMorning === true;
  } catch {
    return false;
  }
}
