import { describe, expect, it } from 'vitest';

import { balancedLines, chipWidth } from './chipLines';

describe('balancedLines', () => {
  it('keeps one line when everything fits', () => {
    expect(balancedLines([60, 60, 60], 320)).toEqual([[0, 1, 2]]);
  });
  it('keeps a plain wrap that leaves no chip alone', () => {
    const w = ['Semi-skimmed (2%)', 'Whole', 'Skimmed', 'Oat', 'Soy', 'Almond'].map((l) => chipWidth(l));
    expect(balancedLines(w, 320)).toEqual([[0, 1, 2], [3, 4, 5]]);
  });
  it('balances a wrap that would leave one chip alone', () => {
    const w = ['Plain', 'Splash of milk', 'Splash and sugar', 'With sugar'].map((l) => chipWidth(l));
    expect(balancedLines(w, 320)).toEqual([[0, 1], [2, 3]]);
  });
  it('never makes a line wider than the plain wrap would', () => {
    const w = [150, 90, 200, 80, 60, 120, 70];
    const lines = balancedLines(w, 320);
    for (const line of lines) expect(line.reduce((s, i) => s + w[i], 0) + 8 * (line.length - 1)).toBeLessThanOrEqual(320);
    expect(lines.flat()).toEqual(w.map((_, i) => i));
    expect(lines[lines.length - 1].length).toBeGreaterThan(1);
  });
  it('leaves a single chip wider than the room on a line of its own', () => {
    expect(balancedLines([400], 320)).toEqual([[0]]);
  });
});
