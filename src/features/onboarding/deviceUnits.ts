import { getLocales } from 'expo-localization';

import type { UnitSystem } from '@/types';

/**
 * The measurement system the phone itself is set to. iOS and Android report it
 * apart from the language and region, so someone in the United States whose
 * phone is set to metric starts in kg and cm. "uk" (stones and miles on the
 * road, kilograms on the scales) starts metric: HealthCal has no stones.
 *
 * Null when the phone does not say, which is always the case in a browser:
 * the answers then keep their own guess from the region (`emptyDraft`).
 */
export function deviceUnits(): UnitSystem | null {
  try {
    const system = getLocales()[0]?.measurementSystem;
    if (system === 'us') return 'imperial';
    if (system === 'metric' || system === 'uk') return 'metric';
    return null;
  } catch {
    return null;
  }
}

let asked = false;

/**
 * `deviceUnits()` the first time it is asked for in a session and null after
 * that, so the units are preselected once and a correction made by hand on the
 * first question is never undone by coming back to it.
 */
export function deviceUnitsOnce(): UnitSystem | null {
  if (asked) return null;
  asked = true;
  return deviceUnits();
}
