/**
 * The widget's layout at the sizes a launcher gives it on a 412 dp phone and at every font size the
 * phone offers: every line fits its box at the size it is drawn, a number never leaves its unit, the
 * halves fit the height, and what does not fit goes whole, in order.
 *
 * Sizes in dp for a 412 dp wide phone (a Pixel at its default display size, the launcher's 5 columns),
 * scaled from the owner's Pixel 10, whose screenshot shows a 4 x 2 widget drawn at 265 x 176 dp on a
 * 370 dp wide screen: a column is about 74 dp and a row about 98 dp, so 4 x 2 is 295 x 196. A Pixel
 * row (about 96 dp) is shorter than the widget's least height (minHeight 110 dp, which minResizeHeight
 * defaults to), so the launcher never makes it one row there; one row is 110 dp where a launcher's
 * rows allow it, and that is the 4 x 1 here. A 96 dp row is checked too, below the least size.
 */
import { describe, expect, it } from 'vitest';

import { defaultGlass, waterOfGoal } from '@/features/today/volume';
import { formatNumber } from '@/lib/units';
import type { UnitSystem } from '@/types';

import { cupBox } from './cup';
import { spToDp } from './fontScale';
import { textWidth } from './fonts';
import { FIGURE_SIZES, messageLayout, ROOM, TYPE, widgetLayout, type WidgetLayout, type WidgetTexts } from './layout';
import { addedCaption, eatenLine, glassLabel, kcalWord, NOT_SAVED_LINE, NOT_SAVED_TITLE, OPEN_LINE, OPEN_TITLE, SETUP_LINE, SETUP_TITLE, UNDO_WORD, waterCaption, widgetDate } from './words';

const SCALES = [0.85, 1, 1.15, 1.3, 1.5, 1.8, 2];

const SIZES: Record<string, [number, number]> = {
  '4x1': [295, 110],
  '4x2': [295, 196],
  '3x2': [219, 196],
  '5x2': [371, 196],
};
const MORE: Record<string, [number, number]> = {
  "4x2 as the owner's phone gave it": [265, 176],
  'the least size (250 x 110)': [250, 110],
};

/** The words for a day, built by the widget's own word functions. */
function texts(o: { remaining: number; eaten: number; budget: number; ml: number; goal: number; units?: UnitSystem; added?: boolean }): WidgetTexts {
  const units = o.units ?? 'metric';
  const glass = defaultGlass(units === 'metric' ? [150, 250, 500] : [237, 355, 473]);
  return {
    date: widgetDate('2026-11-25').toUpperCase(),
    figure: formatNumber(Math.abs(o.remaining)),
    word: kcalWord(o.remaining < 0),
    eaten: eatenLine(o.eaten, o.budget),
    water: waterOfGoal(o.ml, o.goal, units),
    caption: o.added ? addedCaption(glass, units) : waterCaption(o.ml >= o.goal),
    glass: glassLabel(glass, units),
    undo: o.added ? UNDO_WORD : null,
  };
}

/** The owner's screenshot: 2,239 kcal left, 782 eaten of 3,020, 213 ml of 2.9 L. */
const OWNER = texts({ remaining: 2239, eaten: 782, budget: 3020, ml: 213, goal: 2900 });
const DAYS: Record<string, WidgetTexts> = {
  owner: OWNER,
  'owner, a glass just added': texts({ remaining: 2239, eaten: 782, budget: 3020, ml: 463, goal: 2900, added: true }),
  'the demo day': texts({ remaining: 941, eaten: 1219, budget: 2160, ml: 1480, goal: 3300 }),
  'above the budget, water reached': texts({ remaining: -1130, eaten: 3290, budget: 2160, ml: 3380, goal: 3300 }),
  'long figures': texts({ remaining: -9320, eaten: 11480, budget: 2160, ml: 999, goal: 3350, added: true }),
  imperial: texts({ remaining: 941, eaten: 1219, budget: 2160, ml: 1183, goal: 3300, units: 'imperial', added: true }),
};

/** Every line the plan draws, with the room its place gives it: none may be wider. */
function checkFits(L: WidgetLayout, t: WidgetTexts, width: number, height: number) {
  const T = L.lines;
  const inner = width - 2 * (L.pad + ROOM.border);
  // The halves fit the height (the plan's sum, and the sum of its own parts).
  expect(L.fits).toBe(true);
  expect(L.used).toBeLessThanOrEqual(height);
  const calRow = L.undo === 'beside' ? Math.max(L.calH, L.undoH) : L.calH;
  expect(2 * (L.pad + ROOM.border) + calRow + (L.divider ? 2 * L.gap + 1 : L.gap) + L.waterH + ROOM.slack).toBeCloseTo(L.used, 6);
  expect(L.calH).toBeCloseTo((L.date ? T.date.height : 0) + L.figureH + (L.eaten ? T.eaten.height : 0), 6);
  expect(L.figureH).toBeGreaterThanOrEqual(T.figure.height);
  expect(L.waterTextH).toBeCloseTo(T.water.height + T.caption.height, 6);
  expect(L.waterH).toBeGreaterThanOrEqual(L.glass === 'beside' ? Math.max(L.waterTextH, L.glassH) : L.waterTextH + L.glassH);
  // The cups stand inside their halves.
  expect(cupBox(L.calCup.width, L.calCup.height).height).toBeLessThanOrEqual(L.calH + 1e-9);
  if (L.waterCup) expect(cupBox(L.waterCupSize.width, L.waterCupSize.height).height).toBeLessThanOrEqual(L.waterTextH + 1e-9);

  // The calorie column: beside the cup (and the Undo, when it is there).
  expect(L.calTextW).toBeCloseTo(inner - cupBox(ROOM.calCup, 40).width - ROOM.cupGap - (L.undo === 'beside' ? L.undoW + ROOM.buttonGap : 0), 6);
  const unitsW = L.units === 'inline' ? T.units.width : Math.max(T.kcal.width, T.word.width);
  expect(T.figure.width + ROOM.unitGap + unitsW).toBeLessThanOrEqual(L.calTextW);
  if (L.date) expect(T.date.width).toBeLessThanOrEqual(L.calTextW);
  if (L.eaten) expect(T.eaten.width).toBeLessThanOrEqual(L.calTextW);

  // The water figures and their label in their column; the glass (and the Undo) beside or under them.
  expect(Math.max(T.water.width, T.caption.width)).toBeLessThanOrEqual(L.waterTextW);
  const cupRoom = L.waterCup ? cupBox(ROOM.waterCup, 30).width + ROOM.cupGap : 0;
  expect(L.glassW).toBeCloseTo(T.glass.width + 2 * (L.glassPad + ROOM.glassBorder), 6);
  if (L.glass === 'beside') expect(cupRoom + L.waterTextW + ROOM.buttonGap + L.glassW).toBeCloseTo(inner, 6);
  else expect((L.undo === 'glass' ? L.undoW + ROOM.buttonGap : 0) + L.glassW).toBeLessThanOrEqual(inner);
  expect(L.glassH).toBeGreaterThanOrEqual(Math.max(ROOM.glassMinH, T.glass.height));
  if (T.undo) expect(L.undoH).toBeGreaterThanOrEqual(Math.max(ROOM.undoMinH, T.undo.height));

  // A number never leaves its unit: each of these is one line of its own, drawn whole.
  expect(T.water.text).toBe(t.water);
  expect(T.eaten.text).toBe(t.eaten);
  expect(T.glass.text).toBe(t.glass);
  expect(T.units.text).toBe(`kcal ${t.word}`);
  // The Undo stays while a glass can be undone (at every size from the least one up).
  expect(L.undo !== null).toBe(t.undo !== null);
}

describe('widgetLayout: every size on a 412 dp phone, every font size', () => {
  for (const [day, t] of Object.entries(DAYS)) {
    for (const [name, [w, h]] of Object.entries({ ...SIZES, ...MORE })) {
      it(`${day}, ${name}: no line is cut and none leaves its box`, () => {
        for (const s of SCALES) {
          const L = widgetLayout(w, h, s, t);
          checkFits(L, t, w, h);
          // Never smaller than the designed size (unless the phone's own size is), the figure from its own steps.
          expect(L.scale).toBeGreaterThanOrEqual(Math.min(1, s));
          expect(L.lines.water.size).toBe(Math.round(spToDp(TYPE.water, L.scale)));
          expect(FIGURE_SIZES).toContain(L.lines.figure.size as (typeof FIGURE_SIZES)[number]);
        }
      });
    }
  }

  it("keeps the phone's own font size on the 4 x 2, 3 x 2 and 5 x 2 at every step", () => {
    for (const [w, h] of [SIZES['4x2'], SIZES['3x2'], SIZES['5x2']]) {
      for (const s of SCALES) expect(widgetLayout(w, h, s, OWNER).scale).toBe(s);
    }
  });

  it('a short widget steps the figure and then the text down rather than cut anything', () => {
    const [w, h] = SIZES['4x1'];
    expect(widgetLayout(w, h, 1, OWNER)).toMatchObject({ scale: 1, date: false, eaten: false });
    expect(widgetLayout(w, h, 1.15, OWNER).lines.figure.size).toBeLessThan(30);
    expect(widgetLayout(w, h, 2, OWNER).scale).toBeLessThan(2);
  });
});

describe("the owner's widget (Pixel 10, font size a step or two up)", () => {
  it('at the size it was drawn, 265 x 176 at 1.15: every part but the hairline, at the phone’s size', () => {
    const L = widgetLayout(265, 176, 1.15, OWNER);
    expect(L).toMatchObject({ scale: 1.15, date: true, eaten: true, divider: false, units: 'inline' });
    expect(L.lines.figure.size).toBe(30);
    // The "eaten of" line, cut in half before, has its whole line box under the figure.
    expect(L.calH).toBeGreaterThanOrEqual(L.lines.date.height + L.lines.figure.height + L.lines.eaten.height);
    // "213 ml of 2.9 L" whole on one line beside the glass, "Water" under it.
    expect(L.glass).toBe('beside');
    expect(L.waterTextW).toBeGreaterThanOrEqual(textWidth('213 ml of 2.9 L', 'numbers', 18));
  });

  it('4 x 2 on a 412 dp phone at 1.15 and 1.3: every part, the hairline too', () => {
    for (const s of [1.15, 1.3]) {
      const L = widgetLayout(295, 196, s, OWNER);
      expect(L).toMatchObject({ scale: s, divider: true, date: true, eaten: true, units: 'inline', glass: 'beside' });
    }
  });

  it('uses the width: "kcal left" stands on the figure’s line and the water figures take the room the glass leaves', () => {
    const L = widgetLayout(295, 196, 1.15, OWNER);
    const inner = 295 - 2 * (L.pad + ROOM.border);
    expect(L.units).toBe('inline');
    // The water column is everything the cup and the glass leave, not a fixed share.
    expect(L.waterTextW + L.glassW + ROOM.buttonGap + (L.waterCup ? cupBox(ROOM.waterCup, 30).width + ROOM.cupGap : 0)).toBeCloseTo(inner, 6);
    // The glass is as wide as its words and padding, no wider.
    expect(L.glassW).toBeLessThan(inner / 3);
  });
});

describe('what goes first', () => {
  it('gives up the hairline, then the "eaten of" line, then the date, as the height shrinks', () => {
    for (const s of [1, 1.15, 1.3]) {
      const seen: string[] = [];
      for (let h = 240; h >= 110; h -= 1) {
        const L = widgetLayout(320, h, s, OWNER);
        const state = [L.divider && 'hairline', L.eaten && 'eaten', L.date && 'date'].filter(Boolean).join(' ');
        if (seen[seen.length - 1] !== state) seen.push(state);
      }
      expect(seen, `at ${s}`).toEqual(['hairline eaten date', 'eaten date', 'date', '']);
    }
  });

  it('never shows a later part without the earlier ones it outranks, for height', () => {
    for (const s of SCALES) {
      let last = 4;
      for (let h = 260; h >= 110; h -= 2) {
        const L = widgetLayout(371, h, s, OWNER);
        const rank = (L.divider ? 1 : 0) + (L.eaten ? 1 : 0) + (L.date ? 1 : 0) + (L.date && L.eaten && L.divider ? 1 : 0);
        expect(rank, `${h} dp at ${s}`).toBeLessThanOrEqual(last);
        last = rank;
        if (L.divider) expect(L.eaten && L.date).toBe(true);
        if (L.eaten && L.scale === s && L.lines.figure.size === 30) expect(L.date).toBe(true);
      }
    }
  });

  it('for width: "kcal left" moves under "kcal", the glass narrows, the water cup goes, then the glass moves under the figures', () => {
    expect(widgetLayout(371, 196, 1, OWNER)).toMatchObject({ units: 'inline', glass: 'beside', glassPad: 14, waterCup: true });
    expect(widgetLayout(295, 196, 1.15, OWNER)).toMatchObject({ glass: 'beside', glassPad: 8, waterCup: true });
    expect(widgetLayout(295, 196, 1.3, OWNER)).toMatchObject({ glass: 'beside', waterCup: false });
    expect(widgetLayout(219, 196, 1.15, OWNER)).toMatchObject({ glass: 'under' });
  });

  it('puts the Undo beside the calorie half where the figure still fits, else beside the glass under the figures', () => {
    const added = DAYS['owner, a glass just added'];
    expect(widgetLayout(295, 196, 1, added).undo).toBe('beside');
    expect(widgetLayout(219, 196, 1.15, added)).toMatchObject({ undo: 'glass', glass: 'under' });
  });

  it('below the least size, leaves the Undo out before anything is cut', () => {
    const L = widgetLayout(295, 96, 1.3, DAYS['owner, a glass just added']);
    expect(L.fits).toBe(true);
    expect(L.undo).toBeNull();
    expect(L.used).toBeLessThanOrEqual(96);
  });

  it('marks a size no plan fits (far below the least size) as not fitting', () => {
    expect(widgetLayout(150, 60, 1, OWNER).fits).toBe(false);
  });
});

describe('messageLayout', () => {
  const messages: [string, string][] = [
    [SETUP_TITLE, SETUP_LINE],
    [OPEN_TITLE, OPEN_LINE],
    [NOT_SAVED_TITLE, NOT_SAVED_LINE],
  ];

  it('breaks each message into lines that fit, at every size and font size', () => {
    for (const [title, line] of messages) {
      for (const [w, h] of [...Object.values(SIZES), ...Object.values(MORE)]) {
        for (const s of SCALES) {
          const M = messageLayout(w, h, s, title, line);
          expect(M.fits, `${title} ${w}x${h} at ${s}`).toBe(true);
          for (const b of [...M.title, ...M.line]) expect(b.width).toBeLessThanOrEqual(M.textW);
          expect(M.title.map((b) => b.text).join(' ')).toBe(title);
          expect(M.line.map((b) => b.text).join(' ')).toBe(line);
          expect(M.scale).toBeGreaterThanOrEqual(Math.min(1, s));
        }
      }
    }
  });
});
