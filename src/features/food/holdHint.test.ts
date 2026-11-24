/**
 * The empty Favourites tab's one-time tip about the long press: shown only while Favourites lists nothing,
 * only once the device's answer is read, never again once dealt with; kept on the device under its own key
 * (never the store); its words held to the house rules.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { beforeEach, describe, expect, it } from 'vitest';

import { FAVOURITES_EMPTY } from './favoriteWords';
import { FAVOURITES_EMPTY_WITH_HINT, HOLD_HINT, HOLD_HINT_KEY, markHoldHintDone, resetHoldHintForTests, showHoldHint } from './holdHint';

const BANNED = /\b(bad|fail|failed|cheat|should|great|amazing|oops|sorry|upgrade|unlock|premium)\b/i;

describe('the hold hint', () => {
  beforeEach(() => {
    resetHoldHintForTests();
  });

  it('shows only while Favourites is empty, once the answer is read, until it is dealt with', () => {
    expect(showHoldHint(false, true)).toBe(true);
    expect(showHoldHint(false, false)).toBe(false);
    expect(showHoldHint(null, true)).toBe(false);
    expect(showHoldHint(true, true)).toBe(false);
  });

  it('is kept on the device under its own key, outside the store', async () => {
    expect(HOLD_HINT_KEY.startsWith('healthcal/')).toBe(false);
    markHoldHintDone();
    await Promise.resolve();
    expect(await AsyncStorage.getItem(HOLD_HINT_KEY)).toBe('1');
  });

  it('is one short line in plain words, and the empty state under it names the long press only when the hint does not', () => {
    for (const w of [HOLD_HINT.text, HOLD_HINT.short, HOLD_HINT.done, HOLD_HINT.doneA11y, FAVOURITES_EMPTY_WITH_HINT]) {
      expect(BANNED.test(w), w).toBe(false);
      expect(w.includes('!'), w).toBe(false);
      expect(/^[A-Z]/.test(w), w).toBe(true);
    }
    expect(HOLD_HINT.text.length).toBeLessThanOrEqual(34);
    expect(HOLD_HINT.short.length).toBeLessThanOrEqual(24);
    expect(HOLD_HINT.short).toMatch(/hold/i);
    expect(HOLD_HINT.text).toMatch(/hold/i);
    expect(FAVOURITES_EMPTY_WITH_HINT).not.toMatch(/hold/i);
    expect(FAVOURITES_EMPTY.message).toMatch(/hold/i);
  });
});
