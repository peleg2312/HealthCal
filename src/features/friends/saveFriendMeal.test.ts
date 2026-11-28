import { describe, expect, it } from 'vitest';

import { BUILTIN_FOODS } from '@/data/foods';
import type { SharedMealItem } from '@/types';

import { friendMealToSaved } from './saveFriendMeal';

const salad = BUILTIN_FOODS.find((f) => f.id === 'b_israeli_salad')!;

const items: SharedMealItem[] = [
  { name: salad.name, emoji: '🥗', portion: '1 large serving · 150 g', source: 'builtin', foodId: salad.id, serving: '1 large serving', quantity: 1, grams: 150, kcal: 999 },
  { name: 'Maya’s tahini dressing', portion: '2 tbsp', serving: '2 tbsp', quantity: 1, grams: 30, source: 'custom' },
];

describe('Save to my meals', () => {
  it('saves the bundled foods with this phone’s numbers and lists the rest for Find', () => {
    const { draft, leftOut } = friendMealToSaved({ items, name: '  Maya’s   lunch ' });
    expect(draft?.name).toBe('Maya’s lunch');
    expect(draft?.items).toHaveLength(1);
    expect(draft?.items[0]).toMatchObject({ name: salad.name, grams: 150, source: 'builtin' });
    expect(draft?.items[0].nutrients.kcal).toBeCloseTo((salad.per100g.kcal * 150) / 100, 5);
    expect(leftOut.map((i) => i.name)).toEqual(['Maya’s tahini dressing']);
    expect(draft).not.toHaveProperty('id');
  });

  it('saves nothing when no food can be copied, and keeps a recipe’s servings only when every food came over', () => {
    expect(friendMealToSaved({ items: [items[1]], name: 'x' }).draft).toBeNull();
    expect(friendMealToSaved({ items: [items[0]], name: 'x', servings: 4 }).draft?.servings).toBe(4);
    expect(friendMealToSaved({ items, name: 'x', servings: 4 }).draft).not.toHaveProperty('servings');
  });
});
