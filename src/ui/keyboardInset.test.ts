import { describe, expect, it } from 'vitest';

import { KEYBOARD_MIN, keyboardCover, revealDelta, TOAST_GAP, toastBottom } from './keyboardInset';

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

describe('toastBottom', () => {
  // 390 x 844 phone, 34 px home indicator: the tab bar's dock is 34 + 58 + 14, a footer 73.
  const tabs = { dock: 106, ridesKeyboard: false };
  const footer = { dock: 73, ridesKeyboard: true };
  const bare = { dock: 34, ridesKeyboard: false };
  it.each([
    ['no keyboard, tab bar', { ...tabs, cover: 0 }, 118],
    ['no keyboard, footer', { ...footer, cover: 0 }, 85],
    ['no keyboard, neither (home indicator only)', { ...bare, cover: 0 }, 46],
    ['no keyboard, neither, no inset', { dock: 0, ridesKeyboard: false, cover: 0 }, 12],
    ['keyboard up, footer riding on it', { ...footer, cover: 336 }, 73 + 336 + 12],
    ['keyboard up, no footer: above the keyboard, the tab bar is behind it', { ...tabs, cover: 336 }, 336 + 12],
    ['keyboard up, no footer, home indicator behind it', { ...bare, cover: 300 }, 312],
    ['a hardware keyboard covers nothing', { ...footer, cover: 0 }, 85],
    ['a window that already resized: nothing covered, the chrome is drawn above the keyboard', { ...tabs, cover: 0 }, 118],
    ['a short accessory bar lower than the tab bar keeps the toast above the bar', { ...tabs, cover: 55 }, 118],
    ['a negative cover is no keyboard', { ...footer, cover: -4 }, 85],
  ])('%s', (_, v, want) => {
    expect(toastBottom(v)).toBe(want);
  });
  it('is 12 px above the chrome, exactly', () => {
    expect(TOAST_GAP).toBe(12);
  });
  describe('keeps clear of the focused field while the keyboard is up', () => {
    const v = { dock: 0, ridesKeyboard: false, cover: 300 };
    it('moves above a field it would cover', () => {
      // Field 316..366 px from the bottom, toast 44 tall at 312 would cover it: 12 px above the field.
      expect(toastBottom(v, { bottom: 316, top: 366, toastHeight: 44, limit: 800 })).toBe(378);
    });
    it('stays when the field is clear of it', () => {
      expect(toastBottom(v, { bottom: 400, top: 450, toastHeight: 44, limit: 800 })).toBe(312);
      expect(toastBottom({ dock: 73, ridesKeyboard: true, cover: 300 }, { bottom: 600, top: 650, toastHeight: 44, limit: 800 })).toBe(385);
    });
    it('stays when there is no room above the field', () => {
      expect(toastBottom(v, { bottom: 316, top: 760, toastHeight: 44, limit: 800 })).toBe(312);
    });
    it('is never read with the keyboard down', () => {
      expect(toastBottom({ dock: 0, ridesKeyboard: false, cover: 0 }, { bottom: 0, top: 50, toastHeight: 44, limit: 800 })).toBe(12);
    });
  });
});
