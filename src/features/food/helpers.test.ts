import { describe, expect, it } from 'vitest';

import { BUILTIN_FOODS, NATIONAL_LABELS, NATIONAL_RECIPES } from '@/data/foods';

import { amountLabel, portionLabel, servingText, sourceInfo, stepAmount, toPer100 } from './helpers';

describe('stepAmount', () => {
  it('steps servings by a half', () => {
    expect(stepAmount(1, '1 cup', 1)).toBe(1.5);
    expect(stepAmount(1.5, '1 cup', -1)).toBe(1);
  });
  it('steps grams by 10 g', () => {
    expect(stepAmount(150, '1 g', 1)).toBe(160);
    expect(stepAmount(150, '1 g', -1)).toBe(140);
  });
  it('steps a 100 g serving by 10 g', () => {
    expect(stepAmount(1.5, '100 g', 1)).toBe(1.6);
  });
  it('snaps an off-grid amount to the grid instead of carrying the odd part', () => {
    expect(stepAmount(1.2, '1 cup', 1)).toBe(1.5);
    expect(stepAmount(1.2, '1 cup', -1)).toBe(1);
    expect(stepAmount(15, '1 g', -1)).toBe(10);
    expect(stepAmount(0.25, '1 cup', 1)).toBe(0.5);
  });
  it('reaches 0 (remove) from the smallest step and never goes negative', () => {
    expect(stepAmount(0.5, '1 cup', -1)).toBe(0);
    expect(stepAmount(0.25, '1 cup', -1)).toBe(0);
    expect(stepAmount(5, '1 g', -1)).toBe(0);
    expect(stepAmount(0, '1 cup', -1)).toBe(0);
  });
});

describe('amountLabel', () => {
  it('shows grams in gram mode and a multiplier otherwise', () => {
    expect(amountLabel('1 g', 150)).toBe('150 g');
    expect(amountLabel('100 g', 1.5)).toBe('150 g');
    expect(amountLabel('1 cup', 1.5)).toBe('1.5 ×');
  });
});

describe('toPer100', () => {
  it('keeps the precision a low-calorie drink needs (2 kcal per 500 ml is 0.4 per 100 g, not 0)', () => {
    expect(Math.round(toPer100(2, 500) * 100) / 100).toBe(0.4);
  });
});

describe('portionLabel', () => {
  it('reads a multiplied serving the way a person would say it', () => {
    expect(portionLabel('1 pita', 1.5)).toBe('1.5 pita');
    expect(portionLabel('2 tbsp', 3)).toBe('6 tbsp');
    expect(portionLabel('1 cup', 1)).toBe('1 cup');
    expect(portionLabel('1 g', 150)).toBe('150 g');
    expect(portionLabel('100 g', 1.5)).toBe('150 g');
  });
  it('keeps the multiplier where the label does not start with a count', () => {
    expect(portionLabel('1/2 cup', 1.5)).toBe('1.5 × 1/2 cup');
    expect(portionLabel('slice', 2)).toBe('2 × slice');
  });
});

describe('portionLabel with a serving label in Hebrew', () => {
  const LRM = '‎';
  const FSI = '⁨';
  const PDI = '⁩';
  it('isolates the words only, never the number', () => {
    expect(portionLabel('1 גביע', 1)).toBe(`1 ${LRM}${FSI}גביע${PDI}`);
    expect(portionLabel('1 גביע', 2)).toBe(`2 ${LRM}${FSI}גביע${PDI}`);
    expect(portionLabel('כף', 1.5)).toBe(`1.5 × ${LRM}${FSI}כף${PDI}`);
  });
  it('keeps an amount in brackets outside the isolate', () => {
    expect(portionLabel('1 גביע (250 g)', 1)).toBe(`1 ${LRM}${FSI}גביע${PDI} (250 g)`);
  });
  it('leaves every English label exactly as before', () => {
    expect(portionLabel('1 pita', 1)).toBe('1 pita');
    expect(portionLabel('1 cup (240 ml)', 1)).toBe('1 cup (240 ml)');
    expect(servingText('1  cup')).toBe('1  cup');
  });
});

describe('sourceInfo for a bundled food', () => {
  const recipe = [...NATIONAL_RECIPES][0] ?? 667;
  const label = [...NATIONAL_LABELS][0] ?? 381;
  const plain = 1;
  it('names the record the values come from', () => {
    expect(NATIONAL_RECIPES.has(plain) || NATIONAL_LABELS.has(plain)).toBe(false);
    expect(sourceInfo('builtin', { fdcId: 173944 }).explain).toBe('From the bundled reference list. Values from USDA FoodData Central.');
    expect(sourceInfo('builtin', { ilCode: plain }).explain).toBe(
      "From the bundled reference list. Values from the Israeli Ministry of Health's national nutrition database (database updated October 2022).",
    );
    expect(sourceInfo('builtin', { ilCode: label }).explain).toBe(
      "From the bundled reference list. Values from the Israeli Ministry of Health's national nutrition database, from the product's label as recorded there (database updated October 2022).",
    );
    expect(sourceInfo('builtin', { ilCode: recipe }).explain).toBe(
      "From the bundled reference list. Values for a typical home recipe, computed by Israel's Ministry of Health (national nutrition database).",
    );
    expect(sourceInfo('builtin', {}).explain).toBe('From the bundled reference list. An estimate from a typical recipe, not a measured record.');
  });
  it('keeps today\'s sentence without a food, and the badge words', () => {
    expect(sourceInfo('builtin').explain).toBe('From the bundled reference database (USDA-based values).');
    expect(sourceInfo('builtin', { ilCode: plain }).label).toBe('Reference data');
    expect(sourceInfo('builtin', { ilCode: plain }).short).toBe('Reference');
  });
  it('agrees with the bundled list: every food names at most one record', () => {
    for (const f of BUILTIN_FOODS) expect(f.fdcId !== undefined && f.ilCode !== undefined).toBe(false);
  });
});
