import { describe, expect, it } from 'vitest';

import { BUILTIN_FOODS } from '@/data/foods';
import type { Food } from '@/types';

import { editDistance, rankOnline, searchLocal, stem, withinOneEdit } from './foodSearch';

const food = (id: string, name: string, extra: Partial<Food> = {}): Food => ({
  id,
  name,
  per100g: { kcal: 100, protein: 1, carbs: 1, fat: 1 },
  servings: [],
  source: 'builtin',
  verified: false,
  ...extra,
});

const names = (hits: { food: Food }[]) => hits.map((h) => h.food.name);
const rank = (hits: { food: Food }[], id: string) => hits.findIndex((h) => h.food.id === id);

describe('text helpers', () => {
  it('singularises common plurals', () => {
    expect(stem('apples')).toBe('apple');
    expect(stem('berries')).toBe('berry');
    expect(stem('tomatoes')).toBe('tomato');
    expect(stem('dishes')).toBe('dish');
    expect(stem('hummus')).toBe('hummus');
    expect(stem('glass')).toBe('glass');
  });

  it('counts transpositions as one edit', () => {
    expect(editDistance('chiken', 'chicken')).toBe(1);
    expect(editDistance('brest', 'breast')).toBe(1);
    expect(editDistance('cihcken', 'chicken')).toBe(1);
    expect(editDistance('banana', 'chicken', 2)).toBeGreaterThan(2);
  });

  it('withinOneEdit agrees with editDistance(a, b, 1) <= 1', () => {
    const letters = ['a', 'b', 'c', 'ח', 'ו'];
    let seed = 7;
    const rand = (n: number) => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed % n;
    };
    const word = () => Array.from({ length: rand(6) }, () => letters[rand(letters.length)]).join('');
    for (let n = 0; n < 20000; n++) {
      const a = word();
      // Half the time b is a with one random edit, so the near cases are well covered.
      let b = word();
      if (n % 2) {
        const i = rand(a.length + 1);
        const op = rand(4);
        const ch = letters[rand(letters.length)];
        b = op === 0 ? a.slice(0, i) + ch + a.slice(i) : op === 1 ? a.slice(0, i) + a.slice(i + 1) : op === 2 ? a.slice(0, i) + ch + a.slice(i + 1) : a.slice(0, i) + a.slice(i + 1, i + 2) + a.slice(i, i + 1) + a.slice(i + 2);
      }
      expect(withinOneEdit(a, b), `${a} ${b}`).toBe(editDistance(a, b, 1) <= 1);
    }
  });
});

describe('searchLocal ranking', () => {
  const corpus = [
    food('veggie', 'Veggie burger'),
    food('eggplant', 'Eggplant, raw'),
    food('egg', 'Egg, hard-boiled'),
    food('fried_rice', 'Fried rice'),
    food('rice', 'Rice, white, cooked'),
    food('licorice', 'Licorice candy'),
  ];

  it('returns nothing for an empty query', () => {
    expect(searchLocal('   ', { foods: corpus })).toEqual([]);
  });

  it('ranks whole words above prefixes above substrings', () => {
    const hits = searchLocal('egg', { foods: corpus });
    expect(names(hits).slice(0, 3)).toEqual(['Egg, hard-boiled', 'Eggplant, raw', 'Veggie burger']);
  });

  it('prefers foods whose name starts with the word over ones that merely contain it', () => {
    const hits = searchLocal('rice', { foods: corpus });
    expect(rank(hits, 'rice')).toBe(0);
    expect(rank(hits, 'fried_rice')).toBe(1);
    // "licorice" only contains "rice" inside a word.
    expect(rank(hits, 'licorice')).toBe(2);
  });

  it('matches multi-word queries in any order', () => {
    const hits = searchLocal('breast chicken', {});
    expect(hits[0].food.name.toLowerCase()).toContain('chicken breast');
  });

  it('handles plural and singular both ways', () => {
    expect(searchLocal('apples', {})[0].food.id).toBe('b_apple');
    expect(names(searchLocal('strawberry', {}))).toContain('Strawberries, raw');
    expect(searchLocal('eggs', {})[0].food.name.startsWith('Egg')).toBe(true);
  });

  it('tolerates typos: "chiken breast" finds chicken breast', () => {
    const hits = searchLocal('chiken breast', {});
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].food.name.toLowerCase()).toContain('chicken breast');
  });

  it('tolerates a typo in a word still being typed', () => {
    expect(searchLocal('banan', {})[0].food.id).toBe('b_banana');
    expect(searchLocal('chik', {}).some((h) => h.food.name.toLowerCase().includes('chicken'))).toBe(true);
  });

  it('does not use typo tolerance when the word matches directly', () => {
    // "pasta" matches pasta; "paste" (tomato paste) must not come along as a typo.
    const hits = searchLocal('pasta', {});
    expect(hits.every((h) => /pasta/i.test(h.food.name))).toBe(true);
  });

  it('requires every query word to match', () => {
    expect(searchLocal('chicken banana', {})).toEqual([]);
  });

  it('floats recents, favourites and custom foods above equally relevant reference foods', () => {
    const corpus2 = [food('b1', 'Chicken breast, roasted'), food('b2', 'Chicken breast, grilled')];
    const recent = food('b2', 'Chicken breast, grilled');
    const hits = searchLocal('chicken breast', { foods: corpus2, recentFoods: [recent] });
    expect(hits[0].food.id).toBe('b2');
    expect(hits[0].origin).toBe('recent');

    const fav = searchLocal('chicken breast', { foods: corpus2, favoriteIds: ['b1'] });
    expect(fav[0].food.id).toBe('b1');
    expect(fav[0].origin).toBe('favorite');

    const mine = food('c1', 'Chicken breast, mum style', { source: 'custom' });
    const withCustom = searchLocal('chicken breast', { foods: corpus2, customFoods: [mine] });
    expect(withCustom[0].food.id).toBe('c1');
    expect(withCustom[0].origin).toBe('custom');
  });

  it('keeps relevance ahead of history: a recent food that only matches inside a word does not beat an exact match', () => {
    const corpus3 = [food('egg', 'Egg, boiled'), food('veg', 'Veggie burger')];
    const hits = searchLocal('egg', { foods: corpus3, recentFoods: [corpus3[1]] });
    expect(hits[0].food.id).toBe('egg');
  });

  it('ranks bundled reference foods above community products', () => {
    const corpus4 = [
      food('off_1', 'Peanut butter', { source: 'openfoodfacts', brand: 'Acme' }),
      food('b_pb', 'Peanut butter', { source: 'builtin' }),
    ];
    const hits = searchLocal('peanut butter', { foods: corpus4 });
    expect(hits.map((h) => h.food.id)).toEqual(['b_pb', 'off_1']);
  });

  it('uses the edited custom food over a stale recent copy with the same id', () => {
    const stale = food('c1', 'Granola bar', { source: 'custom' });
    const edited = food('c1', 'Granola bar, homemade', { source: 'custom' });
    const hits = searchLocal('granola', { foods: [], recentFoods: [stale], customFoods: [edited] });
    expect(hits).toHaveLength(1);
    expect(hits[0].food.name).toBe('Granola bar, homemade');
  });

  it('searches the brand too', () => {
    const corpus5 = [food('off_2', 'Chocolate spread', { source: 'openfoodfacts', brand: 'Nutella' })];
    expect(searchLocal('nutella', { foods: corpus5 })).toHaveLength(1);
  });

  it('stays fast over the bundled database', () => {
    const t0 = performance.now();
    for (let i = 0; i < 20; i++) searchLocal(['chi', 'chiken brest', 'greek yogurt', 'apples'][i % 4], {});
    expect((performance.now() - t0) / 20).toBeLessThan(16);
    expect(BUILTIN_FOODS.length).toBeGreaterThan(300);
  });
});

describe('rankOnline', () => {
  it('puts matching products first, keeps the rest, and drops ones already shown', () => {
    const products = [
      food('off_a', 'Fromage blanc', { source: 'openfoodfacts' }),
      food('off_b', 'Skyr natural yogurt', { source: 'openfoodfacts' }),
      food('off_c', 'Greek yogurt', { source: 'openfoodfacts' }),
    ];
    const out = rankOnline('greek yogurt', products, ['off_b']);
    expect(out.map((f) => f.id)).toEqual(['off_c', 'off_a']);
  });

  it('ranks Hebrew product names by the same rules: every word first, then the service order', () => {
    const off = (id: string, name: string, brand?: string) => food(id, name, { source: 'openfoodfacts', brand });
    const products = [
      off('off_1', 'Chocolate milk', 'תנובה'),
      off('off_2', 'קוטג\u05f3 3% שומן', 'טרה'),
      off('off_3', "קוטג' 5% שומן", 'תנובה'),
      off('off_4', 'גבינה לבנה 5%', 'תנובה'),
      off('off_5', 'חומוס אחלה עם טחינה', 'אחלה'),
    ];
    // Geresh in any form, the number and the brand word.
    expect(rankOnline('קוטג 5', products).map((f) => f.id).slice(0, 1)).toEqual(['off_3']);
    expect(rankOnline('קוטג\u05f3', products).map((f) => f.id).slice(0, 2).sort()).toEqual(['off_2', 'off_3']);
    expect(rankOnline('תנובה קוטג', products)[0].id).toBe('off_3');
    // A word with a prefix finds the product as typed; nothing is dropped.
    expect(rankOnline('חומוס בטחינה', products)).toHaveLength(5);
    expect(rankOnline('חומוס', products)[0].id).toBe('off_5');
    // No product matches: the service's order stays.
    expect(rankOnline('שוקולד', products).map((f) => f.id)).toEqual(['off_1', 'off_2', 'off_3', 'off_4', 'off_5']);
    // A Latin query keeps today's order rules over Hebrew names.
    expect(rankOnline('chocolate', products)[0].id).toBe('off_1');
  });
});
