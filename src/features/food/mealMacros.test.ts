import { describe, expect, it } from 'vitest';

import { mealMacroLine, mealMacroSpoken } from './mealMacros';

describe('mealMacroLine', () => {
  it('gives protein, carbs and fat in whole grams, in that order', () => {
    expect(mealMacroLine({ protein: 30.6, carbs: 52.2, fat: 17.5 })).toBe('P 31 g · C 52 g · F 18 g');
  });

  it('keeps a macro that is zero when the others are not', () => {
    expect(mealMacroLine({ protein: 0, carbs: 27, fat: 0.3 })).toBe('P 0 g · C 27 g · F 0 g');
  });

  it('is left out for a meal with no macros at all (calories typed in alone)', () => {
    expect(mealMacroLine({ protein: 0, carbs: 0.2, fat: 0 })).toBeNull();
    expect(mealMacroLine({ protein: Number.NaN, carbs: 0, fat: 0 })).toBeNull();
  });

  it('groups thousands, as every figure does', () => {
    expect(mealMacroLine({ protein: 1204, carbs: 2, fat: 3 })).toBe('P 1,204 g · C 2 g · F 3 g');
  });

  it('is heard with each macro named and its unit in full', () => {
    expect(mealMacroSpoken({ protein: 31, carbs: 52, fat: 18 })).toBe('protein 31 grams, carbs 52 grams, fat 18 grams');
    expect(mealMacroSpoken({ protein: 0, carbs: 0, fat: 0 })).toBeNull();
  });
});
