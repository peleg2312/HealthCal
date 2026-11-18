import { useEffect, useState } from 'react';

import type { ISODate } from '@/types';

import { currentQuotePin, loadQuotePin, pinQuote, quotePinLoaded, type QuotePin } from './quotePin';
import { quoteById, quoteFor, quoteOnDay, type Quote, type QuoteTheme } from './quotes';

/** Test-hook builds only (a development build, or EXPO_PUBLIC_E2E, as ?updatesDemo= in About): `?quote=<id>` shows that quote. Release bundles never read it. */
const QUOTE_HOOK = (typeof __DEV__ !== 'undefined' && __DEV__) || process.env.EXPO_PUBLIC_E2E === '1';

/**
 * Today's quote: the one first shown today on this device when there is one (quotePin.ts),
 * else the pick for today and how yesterday went (quoteFor), which is then pinned for the day.
 * `forced` is the test hook's `?quote=` id (ignored outside test-hook builds, and never pinned).
 *
 * `ready` is false until the device's pin has been read in this run (a local read, a few
 * milliseconds): until then the page draws no words, so the first quote drawn is the final one
 * and never swaps under the person's eyes after a restart.
 *
 * The quote is fixed per device. Two devices pick the same one from the same data (the date and
 * how yesterday went); a device that has not yet pulled a late entry or last night's sleep can
 * pick another from the same day's set, and each keeps its own for the day.
 */
export function useDayQuote(today: ISODate, theme: QuoteTheme, forced?: string): { quote: Quote; ready: boolean } {
  const [pin, setPin] = useState<QuotePin | undefined>(() => currentQuotePin());
  const [loaded, setLoaded] = useState(() => quotePinLoaded());
  const forcedQuote = QUOTE_HOOK && forced ? quoteById(forced) : undefined;
  const pinned = pin && pin.day === today ? quoteOnDay(today, pin.id) : undefined;
  const quote = forcedQuote ?? pinned ?? quoteFor(today, theme);
  const hooked = !!forcedQuote;

  // Once the device's pin is known: keep it when it is today's, else pin today's pick for the rest of the day.
  useEffect(() => {
    let live = true;
    loadQuotePin().then((p) => {
      if (!live) return;
      setLoaded(true);
      if (hooked || (p && p.day === today && quoteOnDay(today, p.id))) {
        setPin(p);
        return;
      }
      const id = quoteFor(today, theme).id;
      pinQuote(today, id);
      setPin({ day: today, id });
    });
    return () => {
      live = false;
    };
  }, [today, theme, hooked]);

  return { quote, ready: hooked || loaded };
}
