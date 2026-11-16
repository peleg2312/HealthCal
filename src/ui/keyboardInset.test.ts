import { describe, expect, it } from 'vitest';

import { KEYBOARD_MIN, keyboardCover, revealDelta } from './keyboardInset';

describe('keyboardCover', () => {
  it('is what the keyboard takes from the bottom of the page', () => {
    expect(keyboardCover({ layoutHeight: 740, viewportHeight: 440 })).toBe(300);
    expect(keyboardCover({ layoutHeight: 844, viewportHeight: 508.4, scale: 1 })).toBe(336);
  });
  it('is 0 with no keyboard, or a URL bar sliding away', () => {
    expect(keyboardCover({ layoutHeight: 740, viewportHeight: 740 })).toBe(0);
    expect(keyboardCover({ layoutHeight: 740, viewportHeight: 740 - KEYBOARD_MIN + 1 })).toBe(0);
    expect(keyboardCover({ layoutHeight: 740, viewportHeight: 740 - KEYBOARD_MIN })).toBe(KEYBOARD_MIN);
  });
  it('is 0 when the browser already shrinks the layout for the keyboard', () => {
    expect(keyboardCover({ layoutHeight: 440, viewportHeight: 440 })).toBe(0);
  });
  it('is 0 while the page is pinch-zoomed', () => {
    expect(keyboardCover({ layoutHeight: 740, viewportHeight: 370, scale: 2 })).toBe(0);
  });
  it('is 0 for nonsense sizes', () => {
    expect(keyboardCover({ layoutHeight: 0, viewportHeight: 0 })).toBe(0);
    expect(keyboardCover({ layoutHeight: Number.NaN, viewportHeight: 300 })).toBe(0);
  });
});

describe('revealDelta', () => {
  const view = { top: 100, bottom: 400 };
  it('leaves a field that is already in view', () => {
    expect(revealDelta({ top: 200, bottom: 250 }, view)).toBe(0);
  });
  it('scrolls down to bring a field under the visible part up, with room to spare', () => {
    expect(revealDelta({ top: 500, bottom: 568 }, view)).toBe(184);
  });
  it('scrolls up to a field above the visible part', () => {
    expect(revealDelta({ top: 40, bottom: 108 }, view)).toBe(-76);
  });
  it('keeps the top of a field taller than the space in view', () => {
    expect(revealDelta({ top: 300, bottom: 800 }, view)).toBe(184);
  });
});
