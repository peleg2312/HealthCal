/**
 * The wire rules for meals shown to friends: the same cleaning as the server's social_clean_meal
 * (supabase/tests/friends_meals.sql holds the server side of the same cases), and reading the
 * server's answers without trusting them.
 */
import { describe, expect, it } from 'vitest';

import { cleanMealSettings, cleanSharedMealItems, cleanWireText, mealCheerRef, mealItemsSignature, mealOfCheer, sharedMealRef, toFeed, toMyMeals } from './friendsWire';

const ALLOWED = ['name', 'emoji', 'portion', 'source', 'foodId', 'barcode', 'serving', 'quantity', 'grams', 'kcal', 'kcalLow', 'kcalHigh'];

describe('cleanSharedMealItems', () => {
  const sent = [
    {
      name: 'Chicken breast,\nroasted',
      emoji: '🍗',
      portion: '1 breast · 172 g',
      source: 'builtin',
      foodId: 'b_chicken_breast',
      serving: '1 breast',
      quantity: 1,
      grams: 172.04,
      kcal: 284,
      protein: 53,
      notes: 'after the gym',
      loggedAt: '2026-11-25T12:31:00Z',
      id: '8b552e86-b4b0-5c91-a9b5-0267052a9b4f',
      date: '2026-11-25',
      weightKg: 81,
      budget: 2100,
    },
    { name: "Robert'); drop table public.shared_meals; --", portion: '1 bowl', source: 'custom', foodId: '8b552e86-b4b0-5c91-a9b5-0267052a9b4f', barcode: '12ab', quantity: -2 },
    { name: 'Granola '.repeat(20), portion: '1 bar · 40 g', source: 'openfoodfacts', barcode: '7290000066318', kcalLow: 150, kcalHigh: 190 },
    { name: '', source: 'builtin' },
    { name: 'Mystery', source: 'secret' },
    'not an object',
    { name: { nested: true }, source: 'ai' },
  ];

  it('keeps only what friends may see, and no calories while they are off', () => {
    const items = cleanSharedMealItems(sent, false);
    expect(items).toHaveLength(3);
    for (const item of items) {
      expect(Object.keys(item).every((k) => ALLOWED.includes(k))).toBe(true);
      expect(item).not.toHaveProperty('kcal');
    }
    expect(items[0]).toEqual({ name: 'Chicken breast, roasted', emoji: '🍗', portion: '1 breast · 172 g', source: 'builtin', foodId: 'b_chicken_breast', serving: '1 breast', quantity: 1, grams: 172 });
    // Text is kept as text; a record id is never a food id; a bad barcode or amount goes.
    expect(items[1]).toEqual({ name: "Robert'); drop table public.shared_meals; --", emoji: '', portion: '1 bowl', source: 'custom' });
    expect(Array.from(items[2].name).length).toBeLessThanOrEqual(60);
    expect(items[2].barcode).toBe('7290000066318');
    expect(JSON.stringify(items)).not.toMatch(/budget|weightKg|protein|notes|loggedAt|8b552e86/);
  });

  it('keeps calories when they are on: whole kcal, an estimate range only when it is one, never below zero', () => {
    const items = cleanSharedMealItems(
      [
        { name: 'Pasta', portion: '1 plate', source: 'ai', kcal: 612.6, kcalLow: 480, kcalHigh: 760 },
        { name: 'Salad', portion: '1 bowl', source: 'typical', kcal: 90, kcalLow: 120, kcalHigh: 80 },
        { name: 'Water', portion: '1 glass', source: 'quick', kcal: -5 },
        { name: 'Huge', portion: '1', source: 'quick', kcal: 99999 },
      ],
      true,
    );
    expect(items.map((i) => [i.kcal, i.kcalLow, i.kcalHigh])).toEqual([
      [613, 480, 760],
      [90, undefined, undefined],
      [0, undefined, undefined],
      [20000, undefined, undefined],
    ]);
  });

  it('rounds and bounds amounts as the database does', () => {
    const [a, b] = cleanSharedMealItems(
      [
        { name: 'A', portion: '', source: 'builtin', quantity: 1.005, grams: 0.04 },
        { name: 'B', portion: '', source: 'builtin', quantity: 5000, grams: 12345.67 },
      ],
      false,
    );
    expect(a.quantity).toBe(1.01);
    expect(a.grams).toBe(0);
    expect(b.quantity).toBe(1000);
    expect(b.grams).toBe(10000);
  });

  it('a food id only for a bundled food, a barcode only of digits', () => {
    const items = cleanSharedMealItems(
      [
        { name: 'A', portion: '', source: 'typical', foodId: 'b_hummus' },
        { name: 'B', portion: '', source: 'usda', foodId: 'B_HUMMUS' },
        { name: 'C', portion: '', source: 'openfoodfacts', foodId: 'b_hummus', barcode: '12345' },
        { name: 'D', portion: '', source: 'openfoodfacts', barcode: '123456789012345' },
      ],
      false,
    );
    expect(items.map((i) => i.foodId ?? null)).toEqual(['b_hummus', null, null, null]);
    expect(items.map((i) => i.barcode ?? null)).toEqual([null, null, null, null]);
  });

  it('at most 15 foods, in the order sent', () => {
    const items = cleanSharedMealItems(
      Array.from({ length: 20 }, (_, i) => ({ name: `Food ${i}`, portion: '1', source: 'builtin' })),
      false,
    );
    expect(items).toHaveLength(15);
    expect(items[14].name).toBe('Food 14');
  });

  it('counts characters as the database does, so an emoji is never cut in half', () => {
    expect(cleanWireText('🍕'.repeat(10), 8)).toBe('🍕'.repeat(8));
    expect(cleanWireText('  a\tb\u0007  ', 40)).toBe('a b');
    expect(cleanWireText('   ', 40)).toBeUndefined();
    expect(cleanWireText(5, 40)).toBeUndefined();
  });

  it('cleaning twice changes nothing, and the signature ignores key order', () => {
    const once = cleanSharedMealItems(sent, true);
    expect(cleanSharedMealItems(once, true)).toEqual(once);
    const reordered = once.map((i) => Object.fromEntries(Object.entries(i).reverse()) as typeof i);
    expect(mealItemsSignature(reordered)).toBe(mealItemsSignature(once));
    expect(mealItemsSignature(cleanSharedMealItems(sent, false))).not.toBe(mealItemsSignature(once));
  });
});

describe('references', () => {
  it('matches the server: first 32 hex of sha256(key:meal:day:meal)', () => {
    // The same vector is checked in supabase/tests/friends_meals.sql.
    expect(sharedMealRef('k', '2026-11-25', 'lunch')).toBe('4ef5572e2d6b8d4103d52a3e8b6bf473');
  });
  it('a meal cheer carries meal:<ref>', () => {
    const ref = 'ab'.repeat(16);
    expect(mealOfCheer(mealCheerRef(ref))).toBe(ref);
    expect(mealOfCheer(ref)).toBeNull();
    expect(mealOfCheer('day:2026-11-25')).toBeNull();
    expect(mealOfCheer('meal:XYZ')).toBeNull();
  });
});

describe('reading the server', () => {
  const ref = 'ab'.repeat(16);
  const wref = 'cd'.repeat(16);
  it('keeps feed items of the expected shape, in order, and drops the rest', () => {
    const feed = toFeed([
      { kind: 'meal', ref, user_id: 'u1', display_name: 'Ana', avatar: '', day: '2026-11-25', meal: 'lunch', items: [{ name: 'Rice', portion: '1 cup', source: 'builtin', kcal: 200 }], show_kcal: false, cheered: true, shown_at: 'x' },
      { kind: 'workout', ref: wref, user_id: 'u1', display_name: 'Ana', avatar: '', day: '2026-11-24', name: '  ', emoji: 5, minutes: 30, distance_km: 5.2, cheered: false },
      { kind: 'meal', ref: 'not-a-ref', user_id: 'u1', day: '2026-11-25', meal: 'lunch', items: [] },
      { kind: 'meal', ref, user_id: 'u1', day: '2026-11-25', meal: 'brunch', items: [{ name: 'Rice', portion: '1', source: 'builtin' }] },
      { kind: 'meal', ref, user_id: 'u1', day: '2026-02-30', meal: 'lunch', items: [{ name: 'Rice', portion: '1', source: 'builtin' }] },
      { kind: 'meal', ref, user_id: 'u1', day: '2026-11-25', meal: 'lunch', items: [] },
      { kind: 'workout', ref: wref, user_id: 'u1', day: '2026-11-24', minutes: '30' },
      { kind: 'ad', ref, user_id: 'u1', day: '2026-11-25' },
      null,
    ]);
    expect(feed).toEqual([
      { kind: 'meal', ref, userId: 'u1', displayName: 'Ana', avatar: '', day: '2026-11-25', meal: 'lunch', items: [{ name: 'Rice', emoji: '', portion: '1 cup', source: 'builtin' }], showKcal: false, cheered: true },
      { kind: 'workout', ref: wref, userId: 'u1', displayName: 'Ana', avatar: '', day: '2026-11-24', name: 'Workout', emoji: '', minutes: 30, distanceKm: 5.2, cheered: false },
    ]);
    expect(toFeed('nope')).toEqual([]);
  });

  it('reads my meals with their viewers and cheers', () => {
    const mine = toMyMeals([
      {
        ref,
        day: '2026-11-25',
        meal: 'dinner',
        items: [{ name: 'Fish', portion: '1 fillet', source: 'builtin', kcal: 300 }],
        show_kcal: true,
        shown_at: '2026-11-25T18:00:00Z',
        expires_at: '2026-12-02T18:00:00Z',
        viewers: [{ user_id: 'u2', display_name: 'Ben', avatar: 'B' }, 'x', { display_name: 'No id' }],
        cheers: 2,
      },
      { ref, day: '2026-11-25', meal: 'brunch' },
    ]);
    expect(mine).toEqual([
      {
        ref,
        day: '2026-11-25',
        meal: 'dinner',
        items: [{ name: 'Fish', emoji: '', portion: '1 fillet', source: 'builtin', kcal: 300 }],
        showKcal: true,
        shownAt: '2026-11-25T18:00:00Z',
        expiresAt: '2026-12-02T18:00:00Z',
        viewers: [{ userId: 'u2', displayName: 'Ben', avatar: 'B' }],
        cheers: 2,
      },
    ]);
  });

  it('makes meal settings whole', () => {
    expect(cleanMealSettings(undefined)).toEqual({ auto: [], kcal: false, see: true });
    expect(cleanMealSettings({ auto: ['snack', 'brunch', 'lunch'], kcal: true, see: false })).toEqual({ auto: ['lunch', 'snack'], kcal: true, see: false });
    expect(cleanMealSettings({ kcal: 'yes', see: 0 })).toEqual({ auto: [], kcal: false, see: true });
  });
});
