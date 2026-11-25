import { describe, expect, it } from 'vitest';

import { MEASURE_SLACK } from '@/features/drinks/grownFit';

import { allFit, besideRoom, keepsShape, lineFits, milestoneRoom, tileRoom, wrapFits } from './grownFit';

describe('lineFits (a line at its natural width)', () => {
  it('is unknown until both are measured', () => {
    expect(lineFits(0, 140)).toBeNull();
    expect(lineFits(120, 0)).toBeNull();
  });
  it('counts one pixel more for a width read in whole pixels', () => {
    expect(lineFits(140 - MEASURE_SLACK, 140)).toBe(true);
    expect(lineFits(140, 140)).toBe(false);
  });
});

describe('wrapFits (words wrapped in a room)', () => {
  const room = 138;
  it('is unknown until the words, a line and the room are measured', () => {
    expect(wrapFits({ width: 0, height: 0, lineHeight: 17, room, maxLines: 3 })).toBeNull();
    expect(wrapFits({ width: 120, height: 34, lineHeight: 0, room, maxLines: 3 })).toBeNull();
  });
  it('fits in its lines with no word wider than the room', () => {
    // "a day · budget 2,171 kcal" at 130%: two lines of 22 px.
    expect(wrapFits({ width: 136, height: 44, lineHeight: 22, room, maxLines: 3 })).toBe(true);
    expect(wrapFits({ width: 138, height: 66, lineHeight: 22, room, maxLines: 3 })).toBe(true);
  });
  it('does not fit where a word is wider than the room or the lines are too many', () => {
    // "budget 2,171 kcal" held together and wider than the tile.
    expect(wrapFits({ width: 152, height: 44, lineHeight: 22, room, maxLines: 3 })).toBe(false);
    expect(wrapFits({ width: 130, height: 88, lineHeight: 22, room, maxLines: 3 })).toBe(false);
    // A line box a pixel off its line height still counts as its lines.
    expect(wrapFits({ width: 130, height: 67, lineHeight: 22, room, maxLines: 3 })).toBe(true);
  });
});

describe('allFit and keepsShape', () => {
  it('a part fits only when every line of it does, and is unknown while one is', () => {
    expect(allFit([true, true, true])).toBe(true);
    expect(allFit([true, null, true])).toBeNull();
    expect(allFit([true, null, false])).toBe(false);
  });
  it('keeps the designed shape until a part does not fit, and while parts are measured', () => {
    expect(keepsShape([])).toBe(true);
    expect(keepsShape([true, null, undefined])).toBe(true);
    expect(keepsShape([true, true, false, true])).toBe(false);
  });
});

describe('rooms', () => {
  it("a tile two a row: half the card, less the hairline and 16 px each side (381 dp: a 339 px card)", () => {
    expect(tileRoom(339, 16)).toBe(136);
    expect(tileRoom(0, 16)).toBe(0);
  });
  it("a reached milestone's title two a row: half the row, less 12 px, the hairline, the cup and 12 px", () => {
    expect(milestoneRoom(307, 22, 12)).toBe(106);
    expect(milestoneRoom(0, 22, 12)).toBe(0);
  });
  it("an 'Up next' title beside its share: the row less the cup, the share and 12 px between each", () => {
    expect(besideRoom(307, 22, 44, 12)).toBe(307 - 22 - 12 - 44 - MEASURE_SLACK - 12);
    expect(besideRoom(307, 22, 0, 12)).toBe(0);
  });
});
