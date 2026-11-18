/**
 * The quote first shown today on this device, kept for the rest of the day: the pick depends on
 * how yesterday went and on last night's sleep (quoteTheme), so a night logged at noon would
 * otherwise change the quote under the person's eyes. Kept on the device under its own key, the
 * pattern of ./seen.ts: never in the store, never synced, never a settings write.
 *
 * A pin is honoured only for an id at today's place in the cycle (quoteOnDay), so it can never
 * bring a quote back within 30 days.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { ISODate } from '@/types';

export const QUOTE_PIN_KEY = 'healthcal-morning/quote';

export interface QuotePin {
  day: ISODate;
  id: string;
}

/** A stored pin, else undefined (missing, unreadable, or not a day key and an id). */
export function readQuotePin(raw: string | null | undefined): QuotePin | undefined {
  if (typeof raw !== 'string') return undefined;
  try {
    const v = JSON.parse(raw) as unknown;
    if (!v || typeof v !== 'object') return undefined;
    const { day, id } = v as { day?: unknown; id?: unknown };
    if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return undefined;
    if (typeof id !== 'string' || !/^[a-z0-9-]{1,80}$/.test(id)) return undefined;
    return { day: day as ISODate, id };
  } catch {
    return undefined;
  }
}

let pin: QuotePin | undefined;
let loading: Promise<QuotePin | undefined> | null = null;
let loaded = false;

/** The pin kept on this device (read once per run); undefined when none or unreadable. */
export function loadQuotePin(): Promise<QuotePin | undefined> {
  if (!loading) {
    loading = (async () => {
      try {
        const stored = readQuotePin(await AsyncStorage.getItem(QUOTE_PIN_KEY));
        // A pin set while the read was in flight is newer than what was stored.
        if (pin === undefined) pin = stored;
      } catch {
        // Unreadable: no pin; the day's quote is picked afresh.
      }
      loaded = true;
      return pin;
    })();
  }
  return loading.then(() => pin);
}

/** The pin already read in this run, without waiting (undefined before the first load ends). */
export function currentQuotePin(): QuotePin | undefined {
  return pin;
}

/** Whether the device's pin has been read in this run (until then the page does not draw a quote, so the first one drawn is the final one). */
export function quotePinLoaded(): boolean {
  return loaded;
}

/** Keeps `id` as `day`'s quote on this device: at once for this run, then in storage (a failed write is only logged). */
export function pinQuote(day: ISODate, id: string): void {
  pin = { day, id };
  AsyncStorage.setItem(QUOTE_PIN_KEY, JSON.stringify(pin)).catch((e: unknown) => {
    if (typeof __DEV__ !== 'undefined' && __DEV__) console.warn('[morning] could not keep the quote', e);
  });
}
