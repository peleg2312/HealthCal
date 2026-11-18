import { describe, expect, it } from 'vitest';

import { BUILTIN_FOODS, NATIONAL_LABELS, NATIONAL_RECIPES } from '@/data/foods';

import { fitCandidates } from '@/features/today/fits';
import { scaleNutrients } from '@/lib/nutrition';
import { formatNumber } from '@/lib/units';
import type { Food, FoodEntry } from '@/types';

import { buildEntry } from './build';
import { amountLabel, formatQty, lastPortions, matchServing, portionFor, portionKcal, portionLabel, servingText, sourceInfo, stepAmount, toPer100, valuesUpdated, labelGrams } from './helpers';
import { resolveUsuals, usualFoods, usualLabel } from './usuals';

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

describe('a serving that is a weight ("50 g", ruling G4)', () => {
  it('reads as the total weight at every amount, never "1 × 50 g" or "50 g · 50 g"', () => {
    expect(portionLabel('50 g', 1)).toBe('50 g');
    expect(portionLabel('50 g', 1.5)).toBe('75 g');
    expect(portionLabel('50 g', 2)).toBe('100 g');
    expect(amountLabel('50 g', 1)).toBe('50 g');
    expect(amountLabel('50 g', 1.5)).toBe('75 g');
    expect(amountLabel('50 g', 2)).toBe('100 g');
    expect(amountLabel('1 piece', 2)).toBe('2 ×');
    expect(labelGrams('50 g')).toBe(50);
    expect(labelGrams('1 piece (50 g)')).toBeNull();
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
      "From the bundled reference list. Values for a typical home recipe, computed by the Israeli Ministry of Health (national nutrition database).",
    );
    expect(sourceInfo('builtin', {}).explain).toBe('From the bundled reference list. An estimate from a typical label or recipe, not a measured record.');
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

// ------------------------------------------- a remembered portion (lead's decision D1)

describe('a remembered portion is logged as it is shown', () => {
  // A diary entry keeps a copy of the food as it was. Cheese bourekas before this job (3fa7914) was
  // "1 piece" 80 g at 335 kcal per 100 g; the bundled food may since name "1 piece" at another weight.
  // Built from the live food's own first serving, so the case holds whatever the list says today.
  const OLD_PER100: Record<string, Food['per100g']> = {
    b_bourekas_cheese: { kcal: 335, protein: 9, carbs: 28, fat: 21, fiber: 1, sugar: 1.5, satFat: 9, sodium: 600 },
    b_halloumi: { kcal: 321, protein: 21, carbs: 2.2, fat: 25, fiber: 0, sugar: 1.5, satFat: 16, sodium: 1200 },
    b_schnitzel_chicken: { kcal: 255, protein: 20, carbs: 12, fat: 14, fiber: 0.8, sugar: 0.8, satFat: 2.5, sodium: 450 },
  };
  const live = (id: string): Food => {
    const f = BUILTIN_FOODS.find((x) => x.id === id);
    if (!f) throw new Error(`missing ${id}`);
    return f;
  };
  /** The live food's first label at a weight 30 g away from today's (80 g for bourekas when today's is 50 g). */
  const staleCopy = (id: string) => {
    const now = live(id);
    const label = now.servings[0].label;
    const oldGrams = id === 'b_bourekas_cheese' && now.servings[0].grams !== 80 ? 80 : now.servings[0].grams + 30;
    const copy: Food = { ...now, verified: false, per100g: OLD_PER100[id], servings: [{ label, grams: oldGrams }] };
    return { copy, label, oldGrams, now };
  };
  let n = 0;
  const stored = (copy: Food, label: string, gramsPerUnit: number, date: string, quantity = 1): FoodEntry => ({
    id: `old-${n++}`,
    updatedAt: `${date}T12:00:00.000Z`,
    date,
    meal: 'lunch',
    name: copy.name,
    foodId: copy.id,
    food: copy,
    source: 'builtin',
    verified: false,
    servingLabel: label,
    quantity,
    grams: gramsPerUnit * quantity,
    nutrients: scaleNutrients(copy.per100g, gramsPerUnit * quantity),
    loggedAt: `${date}T12:00:00.000Z`,
  });
  const TODAY = '2026-11-18';
  const DAYS = ['2026-11-15', '2026-11-16', '2026-11-17'];

  for (const id of Object.keys(OLD_PER100)) {
    it(`${id}: a label that now names another weight is matched by grams, shown and stored in grams`, () => {
      const { copy, label, oldGrams, now } = staleCopy(id);
      expect(now.servings.find((s) => s.label === label)?.grams).not.toBe(oldGrams);
      const s = matchServing(now, label, oldGrams);
      expect(s.grams).toBe(oldGrams);
      expect(s.label).toBe(`${oldGrams} g`);
      // The same label at the same weight is still that label.
      expect(matchServing(now, label, now.servings[0].grams)).toEqual(now.servings[0]);
      // Search, the meal picker and food detail open on the remembered amount.
      const p = portionFor(now, lastPortions([stored(copy, label, oldGrams, DAYS[2])]));
      expect(p.serving.grams * p.quantity).toBe(oldGrams);
      expect(portionLabel(p.serving.label, p.quantity)).toBe(`${oldGrams} g`);
    });

    it(`${id}: the + sheet's chip logs the calories it shows`, () => {
      const { copy, label, oldGrams } = staleCopy(id);
      const entries = DAYS.map((d) => stored(copy, label, oldGrams, d));
      const [u] = resolveUsuals(usualFoods(entries, 'lunch', TODAY), new Map());
      const shownKcal = Math.round(u.last.nutrients.kcal);
      expect(usualLabel(u)).toBe(`${oldGrams} g, ${formatNumber(shownKcal)} kcal`);
      // QuickLogSheet.logUsual
      const e = u.last;
      const logged = buildEntry({ food: e.food!, serving: matchServing(e.food!, e.servingLabel, e.grams / e.quantity), quantity: e.quantity, meal: 'lunch', date: TODAY });
      expect(logged.grams).toBe(oldGrams);
      expect(Math.round(logged.nutrients.kcal)).toBe(shownKcal);
      expect(logged.servingLabel).toBe(`${oldGrams} g`);
    });

    it(`${id}: a "What fits" row logs the calories it shows, from a usual, a favourite or a recent`, () => {
      const { copy, label, oldGrams, now } = staleCopy(id);
      const entries = DAYS.map((d) => stored(copy, label, oldGrams, d));
      const usual = resolveUsuals(usualFoods(entries, 'lunch', TODAY, { withFood: true }), new Map()).map((u) => u.last);
      for (const src of [
        { usual, favourites: [], recents: [] },
        { usual: [], favourites: [now], recents: [] },
        { usual: [], favourites: [], recents: [now] },
      ]) {
        const [fit] = fitCandidates({ ...src, lastByFood: lastPortions(entries) });
        // FitsSheet.add
        const logged = buildEntry({ food: fit.food, serving: fit.serving, quantity: fit.quantity, meal: 'lunch', date: TODAY });
        expect(fit.serving.label).toBe(`${oldGrams} g`);
        expect(logged.grams).toBe(oldGrams);
        expect(Math.round(logged.nutrients.kcal)).toBe(Math.round(fit.kcal));
        expect(logged.nutrients.protein).toBeCloseTo(fit.protein, 6);
        expect(Math.round(fit.kcal)).toBe(Math.round((now.per100g.kcal * oldGrams) / 100));
      }
    });
  }

  it('two pieces at the old weight are 160 g, and a label the food no longer has keeps its words', () => {
    const { copy, label, oldGrams, now } = staleCopy('b_bourekas_cheese');
    const [u] = resolveUsuals(usualFoods(DAYS.map((d) => stored(copy, label, oldGrams, d, 2)), 'lunch', TODAY), new Map());
    expect(usualLabel(u)).toBe(`${oldGrams * 2} g, ${formatNumber(Math.round((now.per100g.kcal * oldGrams * 2) / 100))} kcal`);
    const gone = matchServing(now, '1 enormous', 110);
    expect(gone).toEqual({ label: '1 enormous', grams: 110 });
  });
});

// ------------------------------------------- after a reload (lead's decision H1)

describe('a remembered portion after a reload: the stored shape', () => {
  // On the device a bundled food's entry is saved without its food copy and today's bundled food is attached
  // again on load (src/store/persistence.ts), so an entry logged before the food's values changed holds today's
  // food while its label, grams and nutrients are the old ones. The rows of 3fa7914, as they were logged:
  const OLD: Record<string, { per100: Food['per100g']; label: string; gramsPerUnit: number; quantity: number }> = {
    b_bourekas_cheese: { per100: { kcal: 335, protein: 9, carbs: 28, fat: 21 }, label: '1 piece', gramsPerUnit: 80, quantity: 1 },
    b_halloumi: { per100: { kcal: 321, protein: 21, carbs: 2.2, fat: 25 }, label: '1 slice', gramsPerUnit: 30, quantity: 2 },
    b_schnitzel_chicken: { per100: { kcal: 255, protein: 20, carbs: 12, fat: 14 }, label: '1 piece', gramsPerUnit: 130, quantity: 1 },
  };
  const live = (id: string): Food => BUILTIN_FOODS.find((x) => x.id === id)!;
  let k = 0;
  /** What persistence.ts gives back for an entry of `id` logged at 3fa7914: JSON without the food, today's food attached. */
  const reloaded = (id: string, date: string): FoodEntry => {
    const o = OLD[id];
    const grams = o.gramsPerUnit * o.quantity;
    const saved = JSON.parse(
      JSON.stringify({
        id: `r-${k++}`, updatedAt: `${date}T12:00:00.000Z`, date, meal: 'lunch', name: live(id).name, foodId: id, source: 'builtin', verified: false,
        servingLabel: o.label, quantity: o.quantity, grams, nutrients: scaleNutrients(o.per100, grams), loggedAt: `${date}T12:00:00.000Z`,
      }),
    ) as FoodEntry;
    return { ...saved, food: live(id) };
  };
  const TODAY = '2026-11-18';
  const DAYS = ['2026-11-15', '2026-11-16', '2026-11-17'];
  const EXPECT: Record<string, string> = {
    b_bourekas_cheese: '80 g, 298 kcal',
    b_halloumi: '60 g, 175 kcal',
    b_schnitzel_chicken: '130 g, 351 kcal',
  };

  for (const id of Object.keys(OLD)) {
    const entries = () => DAYS.map((d) => reloaded(id, d));

    it(`${id}: the + sheet's tile shows what a tap stores`, () => {
      const [u] = resolveUsuals(usualFoods(entries(), 'lunch', TODAY), new Map());
      expect(usualLabel(u)).toBe(EXPECT[id]);
      // QuickLogSheet.logUsual
      const e = u.last;
      const logged = buildEntry({ food: e.food!, serving: matchServing(e.food!, e.servingLabel, e.grams / e.quantity), quantity: e.quantity, meal: 'lunch', date: TODAY });
      expect(`${formatQty(logged.grams)} g, ${formatNumber(Math.round(logged.nutrients.kcal))} kcal`).toBe(EXPECT[id]);
    });

    it(`${id}: What fits, food search (Usual, recents, favourites) and the first-day chips show what a tap stores`, () => {
      const es = entries();
      const now = live(id);
      const usual = resolveUsuals(usualFoods(es, 'lunch', TODAY, { withFood: true }), new Map()).map((u) => u.last);
      for (const src of [
        { usual, favourites: [], recents: [] },
        { usual: [], favourites: [now], recents: [] },
        { usual: [], favourites: [], recents: [now] },
      ]) {
        const [fit] = fitCandidates({ ...src, lastByFood: lastPortions(es) });
        const logged = buildEntry({ food: fit.food, serving: fit.serving, quantity: fit.quantity, meal: 'lunch', date: TODAY });
        expect(`${formatQty(logged.grams)} g, ${formatNumber(Math.round(fit.kcal))} kcal`).toBe(EXPECT[id]);
        expect(Math.round(logged.nutrients.kcal)).toBe(Math.round(fit.kcal));
      }
      // food search and the meal picker: portionFor + portionKcal for the row, logFood with the same portion
      const p = portionFor(now, lastPortions(es));
      const logged = buildEntry({ food: now, serving: p.serving, quantity: p.quantity, meal: 'lunch', date: TODAY });
      expect(Math.round(logged.nutrients.kcal)).toBe(Math.round(portionKcal(now, p)));
      expect(`${formatQty(logged.grams)} g, ${formatNumber(Math.round(portionKcal(now, p)))} kcal`).toBe(EXPECT[id]);
    });
  }

  it('food detail says the values were updated only for an entry whose calories now differ', () => {
    for (const id of Object.keys(OLD)) {
      const old = reloaded(id, DAYS[0]);
      expect(valuesUpdated(old.food!, old)).toBe(true);
      // The same food logged today agrees with its entry.
      const now = live(id);
      const fresh = buildEntry({ food: now, serving: now.servings[0], quantity: 1, meal: 'lunch', date: TODAY });
      expect(valuesUpdated(now, fresh)).toBe(false);
      // A new food being added (no entry).
      expect(valuesUpdated(now, undefined)).toBe(false);
    }
    // Rounding: 268.4 stored, 268.0 now is the same number on the screen.
    const f: Food = { id: 'b_x', name: 'x', per100g: { kcal: 335, protein: 0, carbs: 0, fat: 0 }, servings: [], source: 'builtin', verified: true };
    expect(valuesUpdated(f, { grams: 80, nutrients: { kcal: 268.4, protein: 0, carbs: 0, fat: 0 } })).toBe(false);
    // A person's own food: never, even when the numbers differ.
    expect(valuesUpdated({ ...f, source: 'custom' }, { grams: 80, nutrients: { kcal: 300, protein: 0, carbs: 0, fat: 0 } })).toBe(false);
  });

  it('an online product and a bundled food whose values did not change keep the stored portion as it is', () => {
    const off: Food = { id: 'off_123', name: 'Snack bar', per100g: { kcal: 400, protein: 5, carbs: 60, fat: 15 }, servings: [{ label: '1 bar', grams: 40 }], source: 'openfoodfacts', verified: false };
    const offEntries = DAYS.map((d, i): FoodEntry => ({
      id: `off-${i}`, updatedAt: '', date: d, meal: 'snack', name: off.name, foodId: off.id, food: off, source: 'openfoodfacts', verified: false,
      servingLabel: '1 bar', quantity: 1, grams: 40, nutrients: { kcal: 150, protein: 2, carbs: 22, fat: 6 }, loggedAt: `${d}T15:00:00.000Z`,
    }));
    const [u] = resolveUsuals(usualFoods(offEntries, 'snack', TODAY), new Map());
    expect(usualLabel(u)).toBe('1 bar, 150 kcal');
    expect(u.last).toBe(offEntries[2]);

    const rice = BUILTIN_FOODS[0];
    const s = rice.servings[0] ?? { label: '100 g', grams: 100 };
    const riceEntries = DAYS.map((d, i): FoodEntry => ({
      id: `rice-${i}`, updatedAt: '', date: d, meal: 'dinner', name: rice.name, foodId: rice.id, food: rice, source: 'builtin', verified: true,
      servingLabel: s.label, quantity: 1, grams: s.grams, nutrients: scaleNutrients(rice.per100g, s.grams), loggedAt: `${d}T19:00:00.000Z`,
    }));
    const [r] = resolveUsuals(usualFoods(riceEntries, 'dinner', TODAY), new Map());
    expect(r.last.servingLabel).toBe(s.label);
    expect(Math.round(r.last.nutrients.kcal)).toBe(Math.round(riceEntries[2].nutrients.kcal));
  });

  it('a person\'s own food shows and logs its live values', () => {
    const mine: Food = { id: 'c_1', name: 'My granola', per100g: { kcal: 450, protein: 10, carbs: 60, fat: 18 }, servings: [{ label: '1 bowl', grams: 60 }], source: 'custom', verified: false };
    const edited: Food = { ...mine, per100g: { ...mine.per100g, kcal: 500 } };
    const es = DAYS.map((d, i): FoodEntry => ({
      id: `c-${i}`, updatedAt: '', date: d, meal: 'breakfast', name: mine.name, foodId: mine.id, food: mine, source: 'custom', verified: false,
      servingLabel: '1 bowl', quantity: 1, grams: 60, nutrients: scaleNutrients(mine.per100g, 60), loggedAt: `${d}T08:00:00.000Z`,
    }));
    expect(usualLabel(resolveUsuals(usualFoods(es, 'breakfast', TODAY), new Map([[mine.id, mine]]))[0])).toBe('1 bowl, 270 kcal');
    expect(usualLabel(resolveUsuals(usualFoods(es, 'breakfast', TODAY), new Map([[mine.id, edited]]))[0])).toBe('1 bowl, 300 kcal');
  });
});
