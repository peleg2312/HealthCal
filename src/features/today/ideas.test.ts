import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { BUILTIN_FOODS } from '@/data/foods';
import { currentValues } from '@/features/food/usuals';
import type { Food, FoodEntry, ISODate, MealType, SavedMeal } from '@/types';

import {
  IDEAS_TITLE,
  PLATE_NOTE,
  ideaLine,
  ideaRow,
  mealIdeas,
  overLine,
  pastMealName,
  plateIdeas,
  usualMealKcal,
  type MealIdeasInput,
} from './ideas';
import { PLATES } from './plates';

// Monday 23 November 2026.
const TODAY: ISODate = '2026-11-23';
const byId = new Map(BUILTIN_FOODS.map((f) => [f.id, f]));
const B = (id: string): Food => byId.get(`b_${id}`)!;

let n = 0;
function entry(f: Food, servingLabel: string, quantity: number, date: ISODate, meal: MealType = 'dinner', extra: Partial<FoodEntry> = {}): FoodEntry {
  const grams = f.servings.find((s) => s.label === servingLabel)!.grams * quantity;
  const k = grams / 100;
  n += 1;
  return {
    id: `e${n}`,
    date,
    meal,
    name: f.name,
    emoji: f.emoji,
    foodId: f.id,
    food: f,
    source: f.source,
    verified: f.verified,
    servingLabel,
    quantity,
    grams,
    nutrients: { kcal: f.per100g.kcal * k, protein: f.per100g.protein * k, carbs: f.per100g.carbs * k, fat: f.per100g.fat * k },
    loggedAt: `${date}T18:${String(n % 60).padStart(2, '0')}:00.000Z`,
    updatedAt: `${date}T18:00:00.000Z`,
    ...extra,
  };
}

/** Chicken breast + white rice: 284 + 205 = 489 kcal, 58 g protein. */
const chickenRice = (date: ISODate, meal: MealType = 'dinner') => [entry(B('chicken_breast_cooked'), '1 breast', 1, date, meal), entry(B('rice_white_cooked'), '1 cup cooked', 1, date, meal)];
/** Pasta + salmon: 221 + 367 = 588 kcal. */
const pastaSalmon = (date: ISODate) => [entry(B('pasta_cooked'), '1 cup cooked', 1, date), entry(B('salmon_cooked'), '1/2 fillet', 1, date)];

const base = (over: Partial<MealIdeasInput>): MealIdeasInput => ({ entries: [], savedMeals: [], meal: 'dinner', date: TODAY, today: TODAY, kcalLeft: 700, ...over });
const own = (r: ReturnType<typeof mealIdeas>) => r.ideas.filter((i) => i.kind !== 'plate');

describe('pastMealName', () => {
  it('names the day from the entry date and the today passed in', () => {
    expect(pastMealName('dinner', '2026-11-22', TODAY)).toBe("yesterday's dinner");
    expect(pastMealName('dinner', '2026-11-17', TODAY)).toBe("Tuesday's dinner");
    expect(pastMealName('lunch', '2026-11-19', TODAY)).toBe("Thursday's lunch");
    expect(pastMealName('dinner', '2026-11-10', TODAY)).toBe('dinner from Nov 10');
    // Seen from another day, the same date has another name.
    expect(pastMealName('dinner', '2026-11-17', '2026-11-18')).toBe("yesterday's dinner");
  });
});

describe('mealIdeas: own past meals', () => {
  it('offers one idea per set of foods, named for the newest day it was eaten, whole when it fits', () => {
    const entries = [...chickenRice('2026-11-10'), ...chickenRice('2026-11-17'), ...pastaSalmon('2026-11-19')];
    const r = mealIdeas(base({ entries, kcalLeft: 900 }));
    expect(r.state).toBe('ideas');
    const names = own(r).map((i) => i.name);
    expect(names).toHaveLength(2);
    expect(names).toContain("Tuesday's dinner");
    expect(names).toContain("Thursday's dinner");
    const cr = own(r).find((i) => i.name === "Tuesday's dinner")!;
    expect(cr.share).toBe(1);
    expect(Math.round(cr.kcal)).toBe(489);
    expect(cr.foods).toEqual(['Chicken breast, skinless, COOKED (roasted)', 'White rice, long-grain, COOKED']);
  });

  it('needs two foods or more, reads only the 30 days before the day, never today, and only that meal', () => {
    const entries = [
      entry(B('pasta_cooked'), '1 cup cooked', 2, '2026-11-20'), // one food
      ...chickenRice('2026-10-20'), // 34 days ago
      ...chickenRice(TODAY), // today
      ...chickenRice('2026-11-20', 'lunch'), // another meal
    ];
    expect(own(mealIdeas(base({ entries })))).toEqual([]);
  });

  it('never offers a meal that held alcohol, and leaves drinks logged on Water out', () => {
    const wine = { ...entry(B('rice_white_cooked'), '1 cup cooked', 1, '2026-11-20'), name: 'Red wine', foodId: 'b_wine_red', food: undefined };
    const withWine = [...chickenRice('2026-11-20'), wine];
    expect(own(mealIdeas(base({ entries: withWine })))).toEqual([]);
    // A meal of bread and a milk from Water is one food, so it is no meal idea.
    const viaWater = [entry(B('bread_wholewheat'), '2 slices', 1, '2026-11-21'), entry(B('milk_2pct'), '1 cup', 1, '2026-11-21', 'dinner', { via: 'water' })];
    expect(own(mealIdeas(base({ entries: viaWater })))).toEqual([]);
    const withWaterMilk = [...chickenRice('2026-11-21'), entry(B('milk_2pct'), '1 cup', 1, '2026-11-21', 'dinner', { via: 'water' })];
    expect(own(mealIdeas(base({ entries: withWaterMilk })))[0].foods).toHaveLength(2);
  });

  it("prices a bundled food at today's values, and logs exactly what it shows", () => {
    const old = chickenRice('2026-11-20').map((e) => ({ ...e, nutrients: { ...e.nutrients, kcal: 999 } }));
    const idea = own(mealIdeas(base({ entries: old, kcalLeft: 1000 })))[0];
    expect(Math.round(idea.kcal)).toBe(489);
    // logItems runs every item through currentValues again: the same numbers.
    expect(idea.items.map(currentValues).reduce((s, it) => s + it.nutrients.kcal, 0)).toBeCloseTo(idea.kcal, 6);
  });

  it('offers three quarters or a half when the whole does not fit, never a part under 150 kcal', () => {
    const entries = chickenRice('2026-11-17'); // 489 kcal
    const threeQ = own(mealIdeas(base({ entries, kcalLeft: 400 })))[0];
    expect(threeQ.share).toBe(0.75);
    expect(threeQ.name).toBe("Three quarters of Tuesday's dinner");
    expect(Math.round(threeQ.kcal)).toBe(367);
    expect(threeQ.items[0].quantity).toBe(0.75);
    const half = own(mealIdeas(base({ entries, kcalLeft: 300 })))[0];
    expect(half.name).toBe("Half of Tuesday's dinner");
    expect(Math.round(half.kcal)).toBe(245);
    expect(half.items.map(currentValues).reduce((s, it) => s + it.nutrients.kcal, 0)).toBeCloseTo(half.kcal, 6);
    // Half is 245; with 200 left nothing of it fits.
    expect(own(mealIdeas(base({ entries, kcalLeft: 200 })))).toEqual([]);
    // A meal of 239 kcal at 170 left: three quarters (179) is more, half (120) is under 150, so nothing.
    const small = [entry(B('bread_wholewheat'), '2 slices', 1, '2026-11-18'), entry(B('egg_boiled'), '1 large', 1, '2026-11-18')];
    expect(own(mealIdeas(base({ entries: small, kcalLeft: 170 })))).toEqual([]);
    expect(own(mealIdeas(base({ entries: small, kcalLeft: 200 })))[0].share).toBe(0.75);
  });

  it('scales a quick add and an estimate by their numbers, keeping the range', () => {
    const quick = { ...entry(B('rice_white_cooked'), '1 cup cooked', 1, '2026-11-20'), name: 'Soup', foodId: undefined, food: undefined, source: 'quick' as const, grams: 0, servingLabel: 'quick add', nutrients: { kcal: 300, protein: 10, carbs: 30, fat: 10 } };
    const ai = { ...entry(B('pasta_cooked'), '1 cup cooked', 1, '2026-11-20'), source: 'ai' as const, foodId: 'ai_x', food: { ...B('pasta_cooked'), id: 'ai_x', source: 'ai' as const }, kcalRange: [180, 260] as [number, number], confidence: 0.6 };
    const idea = own(mealIdeas(base({ entries: [quick, ai], kcalLeft: 300 })))[0];
    expect(idea.share).toBe(0.5);
    expect(Math.round(idea.items[0].nutrients.kcal)).toBe(150);
    expect(idea.items[1].kcalRange).toEqual([90, 130]);
  });

  it('ranks by closeness to the usual size of the meal, then by protein when protein is the gap', () => {
    // Usual dinner about 500: chicken and rice (489) beats pasta and salmon (588).
    const entries = [...chickenRice('2026-11-17'), ...pastaSalmon('2026-11-19'), ...chickenRice('2026-11-12'), ...chickenRice('2026-11-05')];
    expect(usualMealKcal(entries, 'dinner', TODAY)).toBeCloseTo(489, 0);
    expect(own(mealIdeas(base({ entries, kcalLeft: 1000 }))).map((i) => i.name)).toEqual(["Tuesday's dinner", "Thursday's dinner"]);
    // Two of about the same size: protein first only when protein is the gap.
    const a = [entry(B('pasta_cooked'), '1 cup cooked', 2, '2026-11-20'), entry(B('tomato'), '1 medium', 1, '2026-11-20')]; // 464, 18 g
    const b = [entry(B('chicken_breast_cooked'), '1 breast', 1, '2026-11-18'), entry(B('potato_baked'), '1 medium', 1, '2026-11-18')]; // 445, 58 g
    expect(own(mealIdeas(base({ entries: [...a, ...b], kcalLeft: 460 + 10 }))).map((i) => i.name)).toEqual(["Friday's dinner", "Wednesday's dinner"]);
    expect(own(mealIdeas(base({ entries: [...a, ...b], kcalLeft: 470, proteinGap: true }))).map((i) => i.name)).toEqual(["Wednesday's dinner", "Friday's dinner"]);
  });

  it('adds saved meals that fit, never one with alcohol, at a share when needed', () => {
    const items = chickenRice('2026-11-01').map(({ id: _i, date: _d, meal: _m, loggedAt: _l, updatedAt: _u, ...rest }) => rest);
    const saved: SavedMeal[] = [
      { id: 's1', name: 'Chicken bowl', items, updatedAt: '2026-11-01T00:00:00.000Z' },
      { id: 's2', name: 'Pasta night', items: [...items, { ...items[0], name: 'Red wine', food: undefined }], updatedAt: '2026-11-01T00:00:00.000Z' },
    ];
    const r = own(mealIdeas(base({ savedMeals: saved, kcalLeft: 300 })));
    expect(r.map((i) => i.name)).toEqual(['Half of Chicken bowl']);
    expect(r[0].kind).toBe('saved');
  });
});

describe('mealIdeas: one idea per set of foods, saved meals included', () => {
  it('a saved meal with the same foods as a past dinner is offered once, under the past meal', () => {
    const items = chickenRice('2026-11-01').map(({ id: _i, date: _d, meal: _m, loggedAt: _l, updatedAt: _u, ...rest }) => rest);
    const saved: SavedMeal[] = [{ id: 's1', name: 'Chicken and rice', items, updatedAt: '2026-11-01T00:00:00.000Z' }];
    const r = own(mealIdeas(base({ entries: chickenRice('2026-11-22'), savedMeals: saved, kcalLeft: 1500 })));
    expect(r.map((i) => i.name)).toEqual(["Yesterday's dinner"]);
  });
  it('a halved plate keeps the capital of a word that always has one', () => {
    const names = plateIdeas('snack', TODAY, 150, 4).map((i) => i.name);
    expect(names).toContain('Half of Greek yogurt and an apple');
    expect(names.some((x) => /^Half of [A-Z]/.test(x) && !/^Half of Greek/.test(x))).toBe(false);
  });
});

describe('mealIdeas: plates', () => {
  it('gives a person with no history three plates for the meal', () => {
    const r = mealIdeas(base({ kcalLeft: 700 }));
    expect(r.state).toBe('ideas');
    expect(r.ideas).toHaveLength(3);
    expect(r.ideas.every((i) => i.kind === 'plate')).toBe(true);
    expect(r.state === 'ideas' && r.plates).toBe(true);
  });

  it('fills up to three after the own meals', () => {
    const r = mealIdeas(base({ entries: chickenRice('2026-11-17'), kcalLeft: 700 }));
    expect(r.ideas.map((i) => i.kind)).toEqual(['past', 'plate', 'plate']);
  });

  it('keeps a plate only at 85% of what is left, halving it when the whole is more', () => {
    for (const left of [200, 300, 400, 500, 600, 700, 900]) {
      for (const meal of ['breakfast', 'lunch', 'dinner', 'snack'] as MealType[]) {
        for (const idea of plateIdeas(meal, TODAY, left, 3)) {
          expect(idea.kcal).toBeLessThanOrEqual(left * 0.85 + 1e-9);
          expect([1, 0.5]).toContain(idea.share);
          if (idea.share === 0.5) {
            expect(idea.name.startsWith('Half of ')).toBe(true);
            expect(idea.items.every((it) => it.quantity === 0.5)).toBe(true);
          }
        }
      }
    }
    // Salmon, quinoa and green beans is about 546 kcal: whole at 700 left (595 room), halved at 400.
    const at700 = plateIdeas('dinner', TODAY, 700, 4).find((i) => i.key === 'plate:salmon-quinoa')!;
    expect(at700.share).toBe(1);
    const at400 = plateIdeas('dinner', TODAY, 400, 4).find((i) => i.key === 'plate:salmon-quinoa')!;
    expect(at400.name).toBe('Half of salmon, quinoa and green beans');
  });

  it('rotates which plates show by the day and always shows one without meat or fish', () => {
    const seen = new Set<string>();
    for (let d = 0; d < 8; d++) {
      const date = `2026-11-${String(10 + d).padStart(2, '0')}` as ISODate;
      for (const meal of ['breakfast', 'lunch', 'dinner', 'snack'] as MealType[]) {
        const shown = plateIdeas(meal, date, 900, 3);
        expect(shown).toHaveLength(3);
        const ids = shown.map((i) => i.key.slice('plate:'.length));
        expect(ids.some((id) => !PLATES.find((p) => p.id === id)!.meatOrFish), `${meal} ${date}`).toBe(true);
        if (meal === 'dinner') seen.add(ids[0]);
      }
    }
    expect(seen.size).toBeGreaterThan(1);
    // The same day gives the same plates.
    expect(plateIdeas('lunch', TODAY, 900, 3)).toEqual(plateIdeas('lunch', TODAY, 900, 3));
  });
});

describe('mealIdeas: little or nothing left', () => {
  it('has no meal ideas under 150 kcal left, and none at all over the budget', () => {
    const entries = chickenRice('2026-11-17');
    expect(mealIdeas(base({ entries, kcalLeft: 149 }))).toEqual({ state: 'few', ideas: [] });
    expect(mealIdeas(base({ entries, kcalLeft: 0 }))).toEqual({ state: 'few', ideas: [] });
    expect(mealIdeas(base({ entries, kcalLeft: -180 }))).toEqual({ state: 'over', ideas: [], overBy: 180 });
    expect(mealIdeas(base({ entries, kcalLeft: 150 })).state).toBe('ideas');
  });

  it('says the over amount in one neutral line', () => {
    expect(overLine(180, true)).toBe("Today is 180 kcal above the budget. One day does not move the week's trend much.");
    expect(overLine(1240, false)).toBe("That day is 1,240 kcal above the budget. One day does not move the week's trend much.");
  });
});

describe('ideaRow: after an add, rows stay where they are', () => {
  it('ticks the added one and dims one that no longer fits, with a neutral caption', () => {
    expect(ideaRow(480, false, 600)).toEqual({ kind: 'open' });
    expect(ideaRow(480, true, 120)).toEqual({ kind: 'added' });
    expect(ideaRow(300, false, 120)).toEqual({ kind: 'dim', caption: '180 kcal more than what is left' });
    expect(ideaRow(300, false, -50)).toEqual({ kind: 'dim', caption: '350 kcal more than what is left' });
    expect(ideaRow(300.4, false, 300)).toEqual({ kind: 'open' });
  });

  it('keeps every row in place once an idea is logged (the list is read at the budget the sheet opened with)', () => {
    const entries = [...chickenRice('2026-11-17'), ...pastaSalmon('2026-11-19')];
    const before = mealIdeas(base({ entries, kcalLeft: 1100 }));
    // Logging the first idea writes entries on today, which the list never reads.
    const logged = before.ideas[0].items.map((it, i) => ({ ...entry(B('rice_white_cooked'), '1 cup cooked', 1, TODAY), ...it, id: `t${i}`, date: TODAY, meal: 'dinner' as const }));
    const after = mealIdeas(base({ entries: [...entries, ...logged], kcalLeft: 1100 }));
    expect(after.ideas.map((i) => i.key)).toEqual(before.ideas.map((i) => i.key));
  });
});

describe('words', () => {
  it('pass the morning page banned-words list', () => {
    const src = readFileSync(path.resolve(__dirname, '../morning/words.test.ts'), 'utf8');
    const m = /const BANNED =\s*\/(.+)\/i;/.exec(src);
    expect(m).not.toBeNull();
    const BANNED = new RegExp(m![1], 'i');
    const entries = [...chickenRice('2026-11-17'), ...pastaSalmon('2026-11-19'), ...chickenRice('2026-11-22', 'lunch')];
    const strings = new Set<string>([IDEAS_TITLE, PLATE_NOTE]);
    for (const left of [-1240, -180, 0, 149, 150, 300, 400, 700, 1200])
      for (const meal of ['breakfast', 'lunch', 'dinner', 'snack'] as MealType[]) {
        const r = mealIdeas(base({ entries, meal, kcalLeft: left }));
        if (r.state === 'over') strings.add(overLine(r.overBy, true)).add(overLine(r.overBy, false));
        for (const i of r.ideas) strings.add(i.name).add(ideaLine(i));
        for (const i of r.ideas) for (const l of [0, 100, 600]) {
          const row = ideaRow(i.kcal, false, l);
          if (row.kind === 'dim') strings.add(row.caption);
        }
      }
    for (const p of PLATES) strings.add(p.name);
    const bad = [...strings].filter((s) => BANNED.test(s) || s.includes('!'));
    expect(bad).toEqual([]);
    expect(strings.size).toBeGreaterThan(30);
  });
});
