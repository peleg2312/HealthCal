/**
 * The browser (and anything that is not a phone): there are no over-the-air updates, and
 * expo-updates is never loaded. Phones get ./platform.native.ts, which Metro picks by its extension.
 */
import type { UpdatesPort } from './port';

export function platformPort(): UpdatesPort | null {
  return null;
}
