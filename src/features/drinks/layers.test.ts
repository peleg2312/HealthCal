import { describe, expect, it } from 'vitest';

import { blossomColors } from '@/theme/tokens';
import type { Beverage } from '@/types';

import { DRINK_LAYER_COLOR, drinkKey, drinkKeySpoken, drinkKeyText, drinkLayers, showDrinkKey } from './layers';

const drink = (id: string, ml: number, beverage: Beverage) => ({ id, ml, beverage });

describe('drinkLayers', () => {
  it('pours the drinks in the order logged, newest on top, one layer per run of a kind', () => {
    const layers = drinkLayers([drink('a', 500, 'water'), drink('b', 250, 'water'), drink('c', 250, 'coffee'), drink('d', 500, 'water')], 3000);
    expect(layers.map((l) => [l.key, l.kind])).toEqual([
      ['a', 'water'],
      ['c', 'coffee'],
      ['d', 'water'],
    ]);
    // Coffee counts at 90%, as the total does.
    expect(layers[1].ml).toBeCloseTo(225);
    expect(layers[0].from).toBe(0);
    expect(layers[0].to).toBeCloseTo(750 / 3000);
    expect(layers[1].from).toBeCloseTo(layers[0].to);
    expect(layers[2].to).toBeCloseTo((750 + 225 + 500) / 3000);
  });

  it('keeps a layer stable as drinks are added on top (its key is its first drink)', () => {
    const before = drinkLayers([drink('a', 500, 'water'), drink('b', 250, 'tea')], 3000);
    const after = drinkLayers([drink('a', 500, 'water'), drink('b', 250, 'tea'), drink('c', 250, 'tea')], 3000);
    expect(after.map((l) => l.key)).toEqual(before.map((l) => l.key));
    expect(after[0]).toEqual(before[0]);
  });

  it('fills the cup to the brim past the goal, each layer keeping its share, the newest still on top', () => {
    const layers = drinkLayers([drink('a', 3000, 'water'), drink('b', 1000, 'juice')], 3000);
    expect(layers[1].to).toBe(1);
    expect(layers[1].from).toBeCloseTo(3000 / (3000 + 950));
  });

  it('pours nothing without a goal or without anything to count', () => {
    expect(drinkLayers([drink('a', 250, 'water')], 0)).toEqual([]);
    expect(drinkLayers([], 3000)).toEqual([]);
    expect(drinkLayers([drink('a', 0, 'water')], 3000)).toEqual([]);
  });
});

describe('the key', () => {
  const day = [drink('a', 500, 'water'), drink('b', 250, 'coffee'), drink('c', 250, 'milk'), drink('d', 750, 'water')];

  it('names each kind with what it counts, largest first, the first poured first on a tie', () => {
    expect(drinkKey(day)).toEqual([
      { kind: 'water', ml: 1250 },
      { kind: 'coffee', ml: 225 },
      { kind: 'milk', ml: 225 },
    ]);
  });

  it('shows only with two kinds or more', () => {
    expect(showDrinkKey(drinkKey(day))).toBe(true);
    expect(showDrinkKey(drinkKey([drink('a', 500, 'water'), drink('b', 250, 'water')]))).toBe(false);
    expect(showDrinkKey([])).toBe(false);
  });

  it('adds up to what the cup shows', () => {
    const total = drinkKey(day).reduce((n, k) => n + k.ml, 0);
    expect(total).toBe(1700);
  });

  it('says each item as drawn and the whole key in full words', () => {
    expect(drinkKeyText({ kind: 'sports', ml: 330 }, 'metric')).toBe('Sports drink 330 ml');
    expect(drinkKeyText({ kind: 'water', ml: 1250 }, 'metric')).toBe('Water 1.25 L');
    expect(drinkKeyText({ kind: 'tea', ml: 236 }, 'imperial')).toBe('Tea 8 fl oz');
    expect(drinkKeySpoken(drinkKey(day), 'metric')).toBe('In the cup: water 1.25 litres, coffee 225 millilitres, milk 225 millilitres.');
  });
});

describe('the colours', () => {
  it('gives every kind a colour of the theme, plain water its own', () => {
    expect(DRINK_LAYER_COLOR.water).toBe('water');
    const tokens = Object.values(DRINK_LAYER_COLOR);
    expect(new Set(tokens).size).toBe(tokens.length);
    for (const t of tokens) expect(blossomColors[t]).toMatch(/^#[0-9A-F]{6}$/i);
  });
});
