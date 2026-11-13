import { describe, expect, it } from 'vitest';

import type { Food, FoodEntry } from '@/types';

import { fitCandidates, rankFits } from './fits';

const food = (id: string, kcal: number, protein: number, serving = 100): Food => ({
  id,
  name: id,
  per100g: { kcal, protein, carbs: 0, fat: 0 },
  servings: [{ label: 'portion', grams: serving }],
  source: 'builtin',
  verified: true,
});

const entry = (f: Food, quantity: number, gramsPerUnit: number): FoodEntry =>
  ({
    id: `e-${f.id}`,
    date: '2026-11-12',
    meal: 'dinner',
    name: f.name,
    foodId: f.id,
    food: f,
    source: 'builtin',
    verified: true,
    servingLabel: 'portion',
    quantity,
    grams: quantity * gramsPerUnit,
    nutrients: {
      kcal: (f.per100g.kcal * quantity * gramsPerUnit) / 100,
      protein: (f.per100g.protein * quantity * gramsPerUnit) / 100,
      carbs: 0,
      fat: 0,
    },
    loggedAt: '2026-11-12T18:00:00.000Z',
    updatedAt: '2026-11-12T18:00:00.000Z',
  }) as FoodEntry;

const chicken = food('chicken', 165, 31, 172); // 284 kcal, 53 g
const yogurt = food('yogurt', 73, 9.9, 170); // 124 kcal, 17 g
const pasta = food('pasta', 158, 5.8, 140); // 221 kcal, 8 g
const chocolate = food('chocolate', 546, 4.9, 20); // 109 kcal, 1 g
const cola = food('cola', 42, 0, 330); // 139 kcal, 0 g

describe('fitCandidates', () => {
  it('lists each food once, usuals first, and repeats the last portion of a recent', () => {
    const usual = [entry(pasta, 2, 140)];
    const last = new Map([['chicken', entry(chicken, 0.5, 172)]]);
    const out = fitCandidates({ usual, favourites: [chicken, pasta], recents: [yogurt, chicken], lastByFood: last });
    expect(out.map((c) => `${c.key}:${c.from}`)).toEqual(['pasta:usual', 'chicken:favourite', 'yogurt:recent']);
    expect(out[0].quantity).toBe(2);
    expect(Math.round(out[0].kcal)).toBe(442);
    expect(out[1].quantity).toBe(0.5);
    expect(Math.round(out[1].kcal)).toBe(142);
    expect(out[2].serving).toEqual({ label: 'portion', grams: 170 });
    expect(Math.round(out[2].kcal)).toBe(124);
  });
});

describe('rankFits', () => {
  const all = fitCandidates({ usual: [], favourites: [], recents: [pasta, chocolate, cola, chicken, yogurt], lastByFood: new Map() });

  it('keeps only portions inside the calories left', () => {
    expect(rankFits(all, { kcalLeft: 150, proteinFirst: false }).map((c) => c.key)).toEqual(['chocolate', 'cola', 'yogurt']);
    expect(rankFits(all, { kcalLeft: 0, proteinFirst: false })).toEqual([]);
    expect(rankFits(all, { kcalLeft: -200, proteinFirst: false })).toEqual([]);
  });

  it('puts the best protein per kcal first when protein is the gap, and drops foods without protein', () => {
    expect(rankFits(all, { kcalLeft: 600, proteinFirst: true }).map((c) => c.key)).toEqual(['chicken', 'yogurt', 'pasta']);
  });

  it('caps the list', () => {
    expect(rankFits(all, { kcalLeft: 2000, proteinFirst: false, limit: 2 })).toHaveLength(2);
  });
});
