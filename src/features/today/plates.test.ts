import { describe, expect, it } from 'vitest';

import { BUILTIN_FOODS } from '@/data/foods';
import { isAlcohol } from '@/features/drinks/rules';
import type { Food, MealType } from '@/types';

import { PLATES, platesFor } from './plates';

const byId = new Map(BUILTIN_FOODS.map((f) => [f.id, f]));
const food = (id: string): Food => {
  const f = byId.get(id);
  if (!f) throw new Error(`no bundled food ${id}`);
  return f;
};

const MEAT = new Set(['meat', 'poultry']);
const FISH = new Set(['seafood']);
const DAIRY = new Set(['dairy', 'cheese']);
const NEVER_CATEGORY = new Set(['oils_fats', 'sauces', 'sweeteners']);
const PORK = /\b(pork|bacon|ham|salami|sausage|lard|prosciutto|chorizo)\b/i;
const SHELLFISH = /\b(shrimp|prawns?|crab|lobster|mussels?|clams?|oysters?|scallops?|squid|calamari|octopus)\b/i;
const NOT_ON_A_PLATE = /\b(oil|sauce|mayonnaise|margarine|butter|ghee|dressing|syrup|raw\b.*\b(chicken|beef)|dry)\b/i;

describe('plates', () => {
  it('uses only bundled foods at one of their own servings, in whole servings', () => {
    for (const pl of PLATES)
      for (const it of pl.items) {
        const f = food(it.foodId);
        expect(f.servings.map((s) => s.label), `${pl.id} ${it.foodId}`).toContain(it.serving);
        expect(Number.isInteger(it.quantity) && it.quantity >= 1, `${pl.id} ${it.foodId}`).toBe(true);
      }
  });

  it('holds no alcohol, oil, fat, sauce, sweetener, pork or shellfish', () => {
    for (const pl of PLATES)
      for (const it of pl.items) {
        const f = food(it.foodId);
        const where = `${pl.id}: ${f.name}`;
        expect(isAlcohol(f), where).toBe(false);
        expect(NEVER_CATEGORY.has(f.category ?? ''), where).toBe(false);
        expect(PORK.test(f.name), where).toBe(false);
        expect(SHELLFISH.test(f.name), where).toBe(false);
        expect(NOT_ON_A_PLATE.test(f.name), where).toBe(false);
      }
  });

  it('never puts meat or poultry with a dairy food or cheese, and says truly whether it holds meat or fish', () => {
    for (const pl of PLATES) {
      const cats = pl.items.map((it) => food(it.foodId).category ?? '');
      const meat = cats.some((c) => MEAT.has(c));
      expect(meat && cats.some((c) => DAIRY.has(c)), pl.id).toBe(false);
      expect(pl.meatOrFish, pl.id).toBe(meat || cats.some((c) => FISH.has(c)));
    }
  });

  it('gives every meal about four plates, one or more without meat or fish', () => {
    for (const meal of ['breakfast', 'lunch', 'dinner', 'snack'] as MealType[]) {
      const list = platesFor(meal);
      expect(list.length, meal).toBeGreaterThanOrEqual(3);
      expect(list.length, meal).toBeLessThanOrEqual(5);
      expect(list.some((pl) => !pl.meatOrFish), meal).toBe(true);
    }
    expect(new Set(PLATES.map((pl) => pl.id)).size).toBe(PLATES.length);
  });

  it('sizes each plate as a meal or a snack, from what the foods give today', () => {
    for (const pl of PLATES) {
      const kcal = pl.items.reduce((s, it) => s + (food(it.foodId).per100g.kcal * food(it.foodId).servings.find((x) => x.label === it.serving)!.grams * it.quantity) / 100, 0);
      const protein = pl.items.reduce((s, it) => s + (food(it.foodId).per100g.protein * food(it.foodId).servings.find((x) => x.label === it.serving)!.grams * it.quantity) / 100, 0);
      if (pl.meal === 'snack') expect(kcal, pl.id).toBeGreaterThan(120);
      else expect(kcal, pl.id).toBeGreaterThan(250);
      expect(kcal, pl.id).toBeLessThan(650);
      expect(protein, pl.id).toBeGreaterThan(5);
    }
  });
});
