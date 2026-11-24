import { describe, expect, it } from 'vitest';

import { KEYBOARD_MIN, keyboardCover, revealDelta, TOAST_GAP, toastBottom, toastBottomAmong, toastReachTop, toastSpot } from './keyboardInset';

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

describe('toastSpot', () => {
  // Today at 360 x 740: the toast (309 x 44) would rest at top 612, over the three water-card cells.
  const cells = [
    { top: 610, bottom: 703, left: 37, right: 116 },
    { top: 610, bottom: 703, left: 141, right: 204 },
    { top: 610, bottom: 703, left: 229, right: 323 },
  ];
  const waterRow = [
    { top: 519, bottom: 563, left: 37, right: 181 },
    { top: 519, bottom: 555, left: 233, right: 323 },
  ];
  const ideas = [{ top: 368, bottom: 398, left: 139, right: 265 }];
  const base = { lowest: 612, highest: toastReachTop(740, 44), height: 44, left: 25, right: 334 };
  it('keeps the usual place when nothing is under it', () => {
    expect(toastSpot({ ...base, controls: [{ top: 100, bottom: 140, left: 25, right: 334 }] })).toBe(612);
  });
  it('rises to the lowest band clear of every control, never over one', () => {
    const top = toastSpot({ ...base, controls: [...cells, ...waterRow, ...ideas] });
    expect(top).toBe(519 - 4 - 44);
    for (const c of [...cells, ...waterRow, ...ideas]) expect(top! + 44 <= c.top - 4 || top! >= c.bottom + 4).toBe(true);
  });
  it('ignores controls it does not cross sideways', () => {
    expect(toastSpot({ ...base, left: 130, right: 210, controls: [cells[0], cells[2]] })).toBe(612);
  });
  it('keeps the action in thumb reach: no clear band in the lower 60% is null', () => {
    const wall = [{ top: 250, bottom: 700, left: 0, right: 360 }];
    expect(toastSpot({ ...base, controls: wall })).toBeNull();
    expect(toastReachTop(740, 44)).toBe(274);
  });
  it('with no clear band in thumb reach, takes the lowest clear band higher up when it may (`above`), never a control', () => {
    // Today at 360 x 740 with text at 200%: a 132 px toast, the water card's link, its "+ 250 ml" and the activity cell.
    const big = [
      { top: 322, bottom: 401, left: 37, right: 323 },
      { top: 413, bottom: 459, left: 37, right: 172 },
      { top: 506, bottom: 634, left: 37, right: 323 },
    ];
    const v = { lowest: 524, highest: toastReachTop(740, 132), height: 132, left: 25, right: 334, controls: big };
    expect(toastSpot(v)).toBeNull();
    const top = toastSpot({ ...v, above: 0 })!;
    expect(top).toBe(322 - 4 - 132);
    for (const c of big) expect(top + 132 <= c.top - 4 || top >= c.bottom + 4).toBe(true);
    // Nothing clear even up there: null, it rests where it always rests.
    expect(toastSpot({ ...v, above: 0, controls: [...big, { top: 40, bottom: 320, left: 0, right: 360 }] })).toBeNull();
  });
  it('never goes lower than its lowest place', () => {
    expect(toastSpot({ ...base, controls: [{ top: 560, bottom: 600, left: 0, right: 360 }] })).toBe(612);
  });
  it('is null for a toast not measured yet', () => {
    expect(toastSpot({ ...base, height: 0, controls: [] })).toBeNull();
  });
});

describe('toastBottomAmong (phones: the same rule from measured window boxes)', () => {
  // Today at 360 x 740 on a phone: the toast (309 x 44, x 25) rests 84 px above the bottom (12 over the tab bar).
  const toast = { x: 25, y: 0, width: 309, height: 44 };
  const box = (c: { top: number; bottom: number; left: number; right: number }) => ({ x: c.left, y: c.top, width: c.right - c.left, height: c.bottom - c.top });
  const cells = [
    { top: 610, bottom: 703, left: 37, right: 116 },
    { top: 610, bottom: 703, left: 141, right: 204 },
    { top: 610, bottom: 703, left: 229, right: 323 },
  ].map(box);
  const waterRow = [{ top: 519, bottom: 563, left: 37, right: 181 }].map(box);
  it('rests where it always rests when nothing is under it (null)', () => {
    expect(toastBottomAmong({ windowBottom: 740, resting: 84, toast, controls: [box({ top: 100, bottom: 140, left: 25, right: 334 })] })).toBeNull();
  });
  it('rises to the lowest band clear of every control, as a distance from the bottom', () => {
    const bottom = toastBottomAmong({ windowBottom: 740, resting: 84, toast, controls: [...cells, ...waterRow] });
    // Top 519 - 4 - 44 = 471: its bottom edge 740 - 515 = 225 px above the bottom of the window.
    expect(bottom).toBe(740 - (519 - 4));
    const top = 740 - bottom! - 44;
    for (const c of [...cells, ...waterRow]) expect(top + 44 <= c.y - 4 || top >= c.y + c.height + 4).toBe(true);
  });
  it('keeps the action in thumb reach: with no clear band it stays where it rests', () => {
    expect(toastBottomAmong({ windowBottom: 740, resting: 84, toast, controls: [box({ top: 250, bottom: 700, left: 0, right: 360 })] })).toBeNull();
  });
  it('ignores what it does not cross sideways, and boxes a phone could not measure', () => {
    expect(toastBottomAmong({ windowBottom: 740, resting: 84, toast: { ...toast, x: 130, width: 80 }, controls: [cells[0], cells[2]] })).toBeNull();
    expect(toastBottomAmong({ windowBottom: 740, resting: 84, toast, controls: [{ x: Number.NaN, y: 610, width: 80, height: 93 }] })).toBeNull();
  });
  it('with `above`, rises past thumb reach rather than lie over a control', () => {
    const tall = { x: 25, y: 0, width: 309, height: 168 };
    // 320 x 640 at 200%: the water card's link, "+ 250 ml", the activity cell; the toast rests 84 px up.
    const controls = [
      { x: 37, y: 272, width: 246, height: 79 },
      { x: 37, y: 363, width: 135, height: 46 },
      { x: 33, y: 456, width: 254, height: 128 },
    ];
    expect(toastBottomAmong({ windowBottom: 640, resting: 84, toast: tall, controls })).toBeNull();
    expect(toastBottomAmong({ windowBottom: 640, resting: 84, toast: tall, controls, above: 24 })).toBe(640 - (272 - 4));
  });
  it('is null before the toast or the window is measured', () => {
    expect(toastBottomAmong({ windowBottom: 740, resting: 84, toast: { ...toast, height: 0 }, controls: cells })).toBeNull();
    expect(toastBottomAmong({ windowBottom: 0, resting: 84, toast, controls: cells })).toBeNull();
  });
});
