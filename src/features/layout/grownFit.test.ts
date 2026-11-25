import { describe, expect, it } from 'vitest';

import { besideFits, cellsFit, factColumn, keepsDesign, mostCells, ownCellsFit, tileRows } from './grownFit';

describe('cellsFit', () => {
  it('is null until the words and the room are measured', () => {
    expect(cellsFit(0, 4, 300)).toBeNull();
    expect(cellsFit(60, 4, 0)).toBeNull();
    expect(cellsFit(Number.NaN, 4, 300)).toBeNull();
  });
  it('fits while the widest words, a whole pixel spare and the cell extras fit an equal share', () => {
    // The meal choice at 381 and 130%: a 309 px row, four 77.25 px cells, 2 px each side.
    // 72 + 1 + 4 = 77 fits; 73 does not.
    expect(cellsFit(72, 4, 309, 0, 4)).toBe(true);
    expect(cellsFit(73, 4, 309, 0, 4)).toBe(false);
    // Food search's tiles: 8 px apart, 2 px padding and a 1 px edge each side.
    // (309 - 24) / 4 = 71.25: 64 + 1 + 6 = 71 fits, 65 does not.
    expect(cellsFit(64, 4, 309, 8, 6)).toBe(true);
    expect(cellsFit(65, 4, 309, 8, 6)).toBe(false);
  });
});

describe('mostCells', () => {
  it('is null until measured, and the most that fit otherwise, never fewer than one', () => {
    expect(mostCells(0, 300, 4)).toBeNull();
    // Profile's looks: 285 px, 8 px apart. 4: 65.25 each; 3: 89.67; 2: 138.5.
    expect(mostCells(64, 285, 4, 8)).toBe(4);
    expect(mostCells(65, 285, 4, 8)).toBe(3);
    expect(mostCells(100, 285, 4, 8)).toBe(2);
    expect(mostCells(400, 285, 4, 8)).toBe(1);
  });
});

describe('ownCellsFit', () => {
  it('is null until measured', () => {
    expect(ownCellsFit(0, 4, 300)).toBeNull();
    expect(ownCellsFit(250, 4, 0)).toBeNull();
  });
  it('fits while the cells as drawn, a whole pixel spare each, fit the row', () => {
    // The meal choice at 360 and 130% in a card: four words with their padding, 282 px, in 288.
    expect(ownCellsFit(282, 4, 288)).toBe(true);
    expect(ownCellsFit(285, 4, 288)).toBe(false);
  });
});

describe('besideFits', () => {
  it('is null until every part is measured', () => {
    expect(besideFits([120, 0], 300, 12)).toBeNull();
    expect(besideFits([120, 80], 0, 12)).toBeNull();
    expect(besideFits([], 300)).toBeNull();
  });
  it('counts each part as drawn with a whole pixel spare, and the gaps between them', () => {
    // Food detail: "227 kcal" 140 px and its portion 156 px, 12 apart: 140 + 1 + 12 + 156 + 1 = 310.
    expect(besideFits([140, 156], 310, 12)).toBe(true);
    expect(besideFits([140, 156], 309, 12)).toBe(false);
    // Weight's history: the widest words, the value and the chevron, 12 apart.
    expect(besideFits([150, 60, 18], 3 + 150 + 60 + 18 + 24, 12)).toBe(true);
  });
});

describe('keepsDesign', () => {
  it('keeps the designed shape until a part is measured and found not to fit', () => {
    expect(keepsDesign(null)).toBe(true);
    expect(keepsDesign(true)).toBe(true);
    expect(keepsDesign(false)).toBe(false);
  });
});

describe('tileRows', () => {
  it('keeps the designed four and three for seven looks four a row', () => {
    expect(tileRows(7, 4)).toEqual([
      [0, 1, 2, 3],
      [4, 5, 6],
    ]);
  });
  it('never leaves a look alone when three a row: 3, 2, 2', () => {
    expect(tileRows(7, 3)).toEqual([[0, 1, 2], [3, 4], [5, 6]]);
  });
  it('is as even as it can be where one must stand alone (seven two a row)', () => {
    expect(tileRows(7, 2).map((r) => r.length)).toEqual([2, 2, 2, 1]);
    expect(tileRows(7, 1).map((r) => r.length)).toEqual([1, 1, 1, 1, 1, 1, 1]);
  });
  it('keeps every tile once, in order', () => {
    for (let per = 1; per <= 8; per++) expect(tileRows(7, per).flat()).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(tileRows(0, 3)).toEqual([]);
  });
});

describe('factColumn', () => {
  it('is the designed width until measured and while the words fit it', () => {
    expect(factColumn(84, 0, 8)).toBe(84);
    expect(factColumn(84, 70, 8)).toBe(84);
  });
  it('grows to the widest words with their room where they need more', () => {
    // "This portion" at 130%, about 82 px: 82 + 1 + 8 = 91.
    expect(factColumn(84, 82, 8)).toBe(91);
  });
});
