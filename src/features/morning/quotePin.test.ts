import AsyncStorage from '@react-native-async-storage/async-storage';
import { beforeEach, describe, expect, it } from 'vitest';

import { useStore } from '@/store';

import { loadQuotePin, pinQuote, QUOTE_PIN_KEY, quotePinLoaded, readQuotePin } from './quotePin';
import { quoteFor, quoteOnDay } from './quotes';

describe('readQuotePin', () => {
  it('a day key and an id, else nothing', () => {
    expect(readQuotePin('{"day":"2026-11-17","id":"thoreau-dawns"}')).toEqual({ day: '2026-11-17', id: 'thoreau-dawns' });
    expect(readQuotePin(null)).toBeUndefined();
    expect(readQuotePin('')).toBeUndefined();
    expect(readQuotePin('thoreau-dawns')).toBeUndefined();
    expect(readQuotePin('{"day":"today","id":"thoreau-dawns"}')).toBeUndefined();
    expect(readQuotePin('{"day":"2026-11-17"}')).toBeUndefined();
    expect(readQuotePin('{"day":"2026-11-17","id":"<script>"}')).toBeUndefined();
    expect(readQuotePin('[1,2]')).toBeUndefined();
  });
});

describe('the pin on this device', () => {
  beforeEach(() => useStore.getState().resetAll());

  it('is kept under its own key and is not a store write', async () => {
    const day = '2026-11-17';
    const q = quoteFor(day, 'onward');
    await AsyncStorage.setItem(QUOTE_PIN_KEY, JSON.stringify({ day: '2026-11-16', id: 'x' }));
    expect(quotePinLoaded()).toBe(false);
    const first = loadQuotePin();
    expect(quotePinLoaded()).toBe(false);
    await first;
    expect(quotePinLoaded()).toBe(true);
    expect(await loadQuotePin()).toEqual({ day: '2026-11-16', id: 'x' });
    const before = useStore.getState();
    pinQuote(day, q.id);
    expect(await loadQuotePin()).toEqual({ day, id: q.id });
    await Promise.resolve();
    expect(readQuotePin(await AsyncStorage.getItem(QUOTE_PIN_KEY))).toEqual({ day, id: q.id });
    expect(useStore.getState().settings).toBe(before.settings);
    expect(useStore.getState().settingsDirty).toBe(before.settingsDirty);
  });

  it('a pinned quote stands only on its own day', () => {
    const day = '2026-11-17';
    const q = quoteFor(day, 'again');
    expect(quoteOnDay(day, q.id)).toEqual(q);
    expect(quoteOnDay('2026-11-18', q.id)).toBeUndefined();
  });
});
