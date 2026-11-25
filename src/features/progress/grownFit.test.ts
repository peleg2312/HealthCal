import { describe, expect, it } from 'vitest';

import { MEASURE_SLACK } from '@/features/drinks/grownFit';

import { NBSP, WJ } from '@/lib/text';

import { allFit, besideRoom, breakRuns, keepsShape, lineFits, milestoneRoom, tileRoom, wrapFits } from './grownFit';

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
  // The widest unbreakable run, measured on one line: "budget 2,171 kcal" at 115% is about 118 px.
  const word = 118;
  it('is unknown until the words, a line, the widest run and the room are measured', () => {
    expect(wrapFits({ width: 0, height: 0, lineHeight: 17, room, maxLines: 3, word })).toBeNull();
    expect(wrapFits({ width: 120, height: 34, lineHeight: 0, room, maxLines: 3, word })).toBeNull();
    expect(wrapFits({ width: 120, height: 34, lineHeight: 17, room, maxLines: 3, word: 0 })).toBeNull();
  });
  it('fits in its lines with no word wider than the room', () => {
    // "a day · budget 2,171 kcal" at 130%: two lines of 22 px.
    expect(wrapFits({ width: 136, height: 44, lineHeight: 22, room, maxLines: 3, word })).toBe(true);
    expect(wrapFits({ width: 138, height: 66, lineHeight: 22, room, maxLines: 3, word: room })).toBe(true);
  });
  it('does not fit where a word is wider than the room or the lines are too many', () => {
    // A browser: "budget 2,171 kcal" held together and wider than the tile widens the box.
    expect(wrapFits({ width: 152, height: 44, lineHeight: 22, room, maxLines: 3, word: 152 })).toBe(false);
    expect(wrapFits({ width: 130, height: 88, lineHeight: 22, room, maxLines: 3, word })).toBe(false);
    // A line box a pixel off its line height still counts as its lines.
    expect(wrapFits({ width: 130, height: 67, lineHeight: 22, room, maxLines: 3, word })).toBe(true);
  });
  it('a phone splits a word too wide for its room inside the box ("kc / al"): the widest run, measured on one line, tells it', () => {
    // The box reports the room and the split word still takes three lines or fewer; the run is 4 px wider than the room.
    expect(wrapFits({ width: room, height: 66, lineHeight: 22, room, maxLines: 3, word: room + 4 })).toBe(false);
    expect(wrapFits({ width: room, height: 66, lineHeight: 22, room, maxLines: 3, word: room + 1 })).toBe(false);
  });
});

describe('breakRuns (where a line can break, as the kit Text draws the words)', () => {
  it('splits at spaces and keeps what Text holds together', () => {
    // The Calories tile: "budget 2,171 kcal" joined by no-break spaces stays one run.
    expect(breakRuns(`a day · ${['budget', '2,171', 'kcal'].join(NBSP)}`)).toEqual(['a', 'day', '·', `budget${NBSP}2,171${NBSP}kcal`]);
    // A number with its unit (keepTogether): "98 g" is one run.
    expect(breakRuns('a day · goal 98 g')).toEqual(['a', 'day', '·', 'goal', `98${NBSP}g`]);
    expect(breakRuns('First 5 kg of trend change')).toEqual(['First', `5${NBSP}kg`, 'of', 'trend', 'change']);
  });
  it('breaks after a free hyphen, never inside a number joined by one', () => {
    expect(breakRuns('10 weigh-ins')).toEqual([`10${NBSP}weigh-`, 'ins']);
    expect(breakRuns('a 7-day streak')).toEqual(['a', `7${WJ}-${WJ}day`, 'streak']);
  });
  it('has no empty run', () => {
    expect(breakRuns('  two  words ')).toEqual(['two', 'words']);
    expect(breakRuns('')).toEqual([]);
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
