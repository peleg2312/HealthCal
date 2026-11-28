import { describe, expect, it } from 'vitest';

import { KEYBOARD_MIN, keyboardCover, revealDelta, scrollGivesUp, sheetToastPlace, TOAST_GAP, toastBand, toastBottom, toastCovers, toastCoversAmong, toastGesture } from './keyboardInset';

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

describe('toastCovers (the toast rests in one place; a control under it makes the scroll area give way)', () => {
  // Today at 360 x 740: the toast (309 x 44) rests at top 612, 12 px over the tab bar.
  const base = { top: 612, height: 44, left: 25, right: 334 };
  it('is false when nothing lies under or within 8 px of the toast', () => {
    expect(toastCovers({ ...base, controls: [{ top: 100, bottom: 140, left: 25, right: 334 }] })).toBe(false);
    expect(toastCovers({ ...base, controls: [{ top: 560, bottom: 603, left: 0, right: 360 }] })).toBe(false);
    expect(toastCovers({ ...base, controls: [] })).toBe(false);
  });
  it('is true for a control under it, or within 8 px above or below it', () => {
    expect(toastCovers({ ...base, controls: [{ top: 620, bottom: 650, left: 30, right: 80 }] })).toBe(true);
    expect(toastCovers({ ...base, controls: [{ top: 560, bottom: 606, left: 0, right: 360 }] })).toBe(true);
    expect(toastCovers({ ...base, controls: [{ top: 662, bottom: 700, left: 0, right: 360 }] })).toBe(true);
  });
  it('counts only controls it would cross sideways, and none that are not drawn', () => {
    expect(toastCovers({ ...base, controls: [{ top: 620, bottom: 650, left: 0, right: 24 }] })).toBe(false);
    expect(toastCovers({ ...base, controls: [{ top: 620, bottom: 621, left: 30, right: 300 }] })).toBe(false);
  });
  it('is false for a toast not measured yet', () => {
    expect(toastCovers({ ...base, height: 0, controls: [{ top: 620, bottom: 650, left: 30, right: 80 }] })).toBe(false);
  });
});

describe('toastCoversAmong (phones: the same rule from measured window boxes)', () => {
  const toast = { x: 25, y: 0, width: 309, height: 44 };
  const box = (c: { top: number; bottom: number; left: number; right: number }) => ({ x: c.left, y: c.top, width: c.right - c.left, height: c.bottom - c.top });
  it('measures from where the toast rests, 84 px up a 740 px window', () => {
    expect(toastCoversAmong({ windowBottom: 740, resting: 84, toast, controls: [box({ top: 100, bottom: 140, left: 25, right: 334 })] })).toBe(false);
    expect(toastCoversAmong({ windowBottom: 740, resting: 84, toast, controls: [box({ top: 610, bottom: 703, left: 20, right: 120 })] })).toBe(true);
  });
  it('skips a box a phone could not measure, and is false before anything is measured', () => {
    expect(toastCoversAmong({ windowBottom: 740, resting: 84, toast, controls: [{ x: Number.NaN, y: 610, width: 80, height: 93 }] })).toBe(false);
    expect(toastCoversAmong({ windowBottom: 740, resting: 84, toast: { ...toast, height: 0 }, controls: [box({ top: 610, bottom: 703, left: 20, right: 120 })] })).toBe(false);
    expect(toastCoversAmong({ windowBottom: 0, resting: 84, toast, controls: [box({ top: 610, bottom: 703, left: 20, right: 120 })] })).toBe(false);
  });
});

describe('the band a screen makes under the toast (toastBand, scrollGivesUp)', () => {
  // The diary at 360 x 740 after a delete: every row is a control.
  const toast = { x: 35, y: 0, width: 290, height: 44 };
  const rows = [
    [0, 60], [68, 214], [236, 296], [329, 580], [612, 700],
  ].map(([top, bottom]) => ({ x: 20, y: top + 8, width: 320, height: bottom - top - 16 }));
  it('the diary rows lie under the toast where it rests', () => {
    expect(toastCoversAmong({ windowBottom: 740, resting: 84, toast, controls: rows })).toBe(true);
  });
  it('the band reaches from the bottom to 8 px above the toast where it rests', () => {
    // Rests 84 px up (12 over the tab bar), 44 tall, 8 clear: the scroll area ends 136 px above the bottom.
    expect(toastBand(84, 44)).toBe(136);
    expect(toastBand(84, 0)).toBe(0);
  });
  it('the scroll area gives up the band less what already lies under it', () => {
    // A tab screen scrolls to the window's bottom (the tab bar lies over it): it gives up the whole band.
    expect(scrollGivesUp(136, 0)).toBe(136);
    // A screen with a 90 px pinned footer: the toast rests 12 over it, so the scroll area gives up 12 + 44 + 8.
    expect(scrollGivesUp(toastBand(90 + 12, 44), 90)).toBe(64);
    expect(scrollGivesUp(0, 90)).toBe(0);
  });
  it('once the scroll area has given it up, nothing that shows lies under the toast', () => {
    const end = 740 - scrollGivesUp(toastBand(84, 44), 0);
    // What the scroll area shows of each row: nothing below its new end.
    const seen = rows.map((r) => ({ ...r, height: Math.min(r.y + r.height, end) - r.y })).filter((r) => r.height > 0);
    expect(toastCoversAmong({ windowBottom: 740, resting: 84, toast, controls: seen })).toBe(false);
  });
});

describe("sheetToastPlace (a sheet's toast: over its top edge, or at its bottom when that edge is high)", () => {
  it('stands 12 px over a low sheet', () => {
    // 360 x 740, a 300 px sheet: its toast's centre at 418, in the lower 60%.
    expect(sheetToastPlace({ windowHeight: 740, sheetTop: 440, sheetHeight: 300, toastHeight: 44, lift: 90 })).toEqual({ sink: null, band: 0 });
  });
  it('rests at the bottom of a tall sheet, over its footer, and the body gives way above it', () => {
    // An 88% sheet (651 px): its top at 89. The toast rests 90 px above the sheet's bottom (its footer and padding).
    const at = sheetToastPlace({ windowHeight: 740, sheetTop: 89, sheetHeight: 651, toastHeight: 44, lift: 90 });
    expect(at.sink).toBe(651 - 90);
    expect(at.band).toBe(90 + 44 + 8);
  });
  it('waits for the toast to be measured, above the sheet', () => {
    expect(sheetToastPlace({ windowHeight: 740, sheetTop: 89, sheetHeight: 651, toastHeight: 0, lift: 90 }).sink).toBeNull();
  });
});

describe('toastGesture (a finger on the toast: tap, flick away or settle back)', () => {
  const w = 309;
  it('a tap on its words dismisses it', () => {
    expect(toastGesture({ dx: 2, dy: 3, vx: 0, vy: 0 }, w)).toBe('tap');
  });
  it('a drag down 24 px, a fast flick down or sideways, or a long sideways drag dismisses it', () => {
    expect(toastGesture({ dx: 0, dy: 24, vx: 0, vy: 0.1 }, w)).toBe('dismiss');
    expect(toastGesture({ dx: 0, dy: 12, vx: 0, vy: 0.8 }, w)).toBe('dismiss');
    expect(toastGesture({ dx: -30, dy: 2, vx: -0.9, vy: 0 }, w)).toBe('dismiss');
    expect(toastGesture({ dx: 80, dy: 4, vx: 0.1, vy: 0 }, w)).toBe('dismiss');
    // A narrow toast: 30% of its width is enough.
    expect(toastGesture({ dx: 40, dy: 0, vx: 0.1, vy: 0 }, 120)).toBe('dismiss');
  });
  it('too small or upward settles back', () => {
    expect(toastGesture({ dx: 30, dy: 4, vx: 0.2, vy: 0 }, w)).toBe('back');
    expect(toastGesture({ dx: 0, dy: 14, vx: 0, vy: 0.2 }, w)).toBe('back');
    expect(toastGesture({ dx: 0, dy: -60, vx: 0, vy: -1.2 }, w)).toBe('back');
  });
});
