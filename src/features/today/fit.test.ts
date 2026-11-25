import { describe, expect, it } from 'vitest';

import { cupHeightFor, fitsRoom } from './fit';

describe('measured fits (fit.ts)', () => {
  it('fits until both the words and the room are measured', () => {
    expect(fitsRoom(null, 200)).toBe(true);
    expect(fitsRoom(120, 0)).toBe(true);
    expect(fitsRoom(undefined, undefined)).toBe(true);
  });

  it('gives way only where the words are wider than their room', () => {
    expect(fitsRoom(150, 150)).toBe(true);
    expect(fitsRoom(151, 150)).toBe(false);
  });

  it("keeps the designed cup with the designed boxes (Today's 22, 56 and 22 px labels, 8 apart, in a 124 px cup)", () => {
    expect(cupHeightFor(124, [22, 56, 22], 8)).toBe(124);
    expect(cupHeightFor(100, [20, 42, 20], 4)).toBe(100);
  });

  it('grows the cup to hold labels grown with their text, never shrinks it', () => {
    expect(cupHeightFor(124, [28, 61, 28], 8)).toBe(133);
    expect(cupHeightFor(124, [28.2, 61], 8)).toBe(124);
    expect(cupHeightFor(124, [], 8)).toBe(124);
  });
});
