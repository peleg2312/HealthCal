/**
 * The widget's layout at the sizes launchers give a 4 x 2 widget, and at larger font scales: what
 * does not fit is left out in a fixed order, and the halves always fit the height they are given.
 */
import { describe, expect, it } from 'vitest';

import { cupBox } from './cup';
import { TYPE, widgetLayout } from './layout';
import { untilMidnight } from './midnight';

const used = (L: ReturnType<typeof widgetLayout>) => 2 * L.pad + L.calH + (L.divider ? 2 * L.gap + 1 : L.gap) + L.waterH;

describe('widgetLayout', () => {
  it('a roomy 4 x 2 (Pixel, about 380 x 180): every part', () => {
    const L = widgetLayout(380, 180, 1, { eatenChars: 20 });
    expect(L).toMatchObject({ date: true, eaten: true, divider: true, pad: 14 });
    expect(used(L)).toBeLessThanOrEqual(180);
  });

  it('gives up the hairline, then the "eaten of" line, then the date, as the height shrinks', () => {
    expect(widgetLayout(320, 150, 1, { eatenChars: 20 })).toMatchObject({ date: true, eaten: true, divider: false });
    expect(widgetLayout(320, 128, 1, { eatenChars: 20 })).toMatchObject({ date: true, eaten: false, divider: false });
    expect(widgetLayout(300, 110, 1, { eatenChars: 20 })).toMatchObject({ date: false, eaten: false, divider: false });
  });

  it('fits the height it is given from the 110 dp minimum up', () => {
    for (const h of [110, 120, 130, 140, 150, 160, 180, 220]) {
      for (const w of [250, 300, 360, 400]) {
        const L = widgetLayout(w, h, 1, { eatenChars: 20 });
        expect(used(L), `${w} x ${h}`).toBeLessThanOrEqual(h);
        expect(L.glassH).toBeGreaterThanOrEqual(40);
        // The cups stand inside their halves.
        expect(cupBox(L.calCup.width, L.calCup.height).height, `${w} x ${h}`).toBeLessThanOrEqual(L.calH);
        expect(cupBox(L.waterCup.width, L.waterCup.height).height, `${w} x ${h}`).toBeLessThanOrEqual(L.waterH);
      }
    }
  });

  it('larger text: the small text grows, so less is shown, and the buttons grow with their words', () => {
    const at1 = widgetLayout(360, 160, 1, { eatenChars: 20 });
    const at13 = widgetLayout(360, 160, 1.3, { eatenChars: 20 });
    const at2 = widgetLayout(360, 160, 2, { eatenChars: 20 });
    expect(at1.eaten).toBe(true);
    expect(at13.divider).toBe(false);
    expect(at2.date).toBe(false);
    expect(at2.glassH).toBeGreaterThanOrEqual(Math.ceil(TYPE.button.line * 2));
  });

  it('the "eaten of" line keeps its words whole: left out where it would not fit beside the cup and the Undo', () => {
    expect(widgetLayout(380, 180, 1, { eatenChars: 20, undo: true }).eaten).toBe(true);
    expect(widgetLayout(250, 180, 1, { eatenChars: 24, undo: true }).eaten).toBe(false);
    expect(widgetLayout(250, 180, 1, { eatenChars: 24, undo: false }).eaten).toBe(true);
  });
});

describe('untilMidnight', () => {
  it('waits until a second past the next local midnight', () => {
    const now = new Date(2026, 10, 25, 23, 59, 0);
    expect(untilMidnight(now)).toBe(61_000);
    expect(untilMidnight(new Date(2026, 10, 25, 12, 0, 0))).toBe(12 * 3600_000 + 1000);
  });
});
