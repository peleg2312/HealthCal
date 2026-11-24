import { describe, expect, it } from 'vitest';

import { addDays } from '@/lib/dates';
import { volumeToMl } from '@/lib/units';
import type { Food, FoodEntry, WaterEntry } from '@/types';

import { choiceById } from './choices';
import {
  builtinFood,
  choiceA11y,
  detailDrinkNote,
  drinkGrams,
  drinkKcal,
  drinkMeal,
  enteredKcalError,
  gramsPerMl,
  isAlcohol,
  isWaterDrinkEntry,
  labelMl,
  livePartner,
  noticeLine,
  pairEditProblem,
  pickCaption,
  pickedFood,
  pickedToast,
  planDrink,
  remember,
  rememberedChoice,
  removedEntryToast,
  removedWaterToast,
  sameDrinkFoodIds,
  sameDrinkInDiary,
  selectChoice,
  selectFood,
  sheetDrinks,
  entryFor,
  waterFor,
  waterFromEntry,
  waterOnlyOffered,
  waterAfter,
  waterForEntryEdit,
  waterPointingAt,
  waterRowCaption,
  waterRowTitle,
  withoutAlcohol,
  type PlanDrinkInput,
} from './rules';

const B = (id: string) => builtinFood(id)!;
const near = (got: number, want: number) => expect(Math.abs(got - want) / want).toBeLessThan(0.005);

const TODAY = '2026-11-18';
const at = (h: number, m = 0, date = TODAY) => {
  const [y, mo, d] = date.split('-').map(Number);
  return new Date(y, mo - 1, d, h, m);
};
const sel = (id: string) => selectChoice(choiceById(id)!);
const base = (over: Partial<PlanDrinkInput> = {}): PlanDrinkInput => ({
  kind: 'milk',
  drink: sel('milk_semi'),
  ml: 250,
  date: TODAY,
  now: at(13, 10),
  today: TODAY,
  units: 'metric',
  ...over,
});

const own = (over: Partial<Food> = {}): Food => ({
  id: 'own-1',
  name: 'Homemade lemonade',
  per100g: { kcal: 18, protein: 0, carbs: 4.5, fat: 0 },
  servings: [{ label: '1 serving', grams: 300 }],
  source: 'custom',
  verified: false,
  ...over,
});

describe('gramsPerMl', () => {
  it('reads the first serving that names a volume, for every listed drink', () => {
    const want: Record<string, number> = {
      b_milk_2pct: 1.031,
      b_milk_whole: 1.031,
      b_milk_skim: 1.036,
      b_soy_milk: 1.027,
      b_oat_milk: 1.014,
      b_almond_milk: 1.014,
      b_orange_juice: 1.048,
      b_apple_juice: 1.048,
      b_sports_drink: 1.048,
      b_lemonade: 1.048,
      b_cola: 1.043,
      b_latte: 1.014,
      b_cappuccino: 1.014,
      b_coffee_black: 1.002,
      b_tea_brewed: 1.002,
      b_coffee_milk: 1.004,
      b_tea_milk_sugar: 1.02,
      b_sports_drink_low: 1.014,
    };
    for (const [id, g] of Object.entries(want)) {
      const r = gramsPerMl(B(id));
      expect(r.assumed, id).toBe(false);
      near(r.gPerMl, g);
    }
  });

  it('fl oz beats cup in the same label (cappuccino, 6 fl oz) and ml beats cup (the composites)', () => {
    expect(B('b_cappuccino').servings[0].label).toBe('1 cup (6 fl oz)');
    near(gramsPerMl(B('b_cappuccino')).gPerMl, 180 / (6 * 29.5735));
    expect(labelMl('1 cup (250 ml)')).toBe(250);
    near(gramsPerMl(B('b_coffee_milk')).gPerMl, 1.004);
  });

  it('reads "(200 ml)", "12 fl oz", "1 cup", "2 cups", "1/2 cup" and litres; a weight in oz is not a volume', () => {
    expect(labelMl('1 glass (200 ml)')).toBe(200);
    near(labelMl('1 glass (12 fl oz)')!, 354.882);
    near(labelMl('1 cup')!, 236.588);
    near(labelMl('2 cups')!, 473.176);
    near(labelMl('1/2 cup')!, 118.294);
    expect(labelMl('1 bottle (1.5 L)')).toBe(1500);
    expect(labelMl('1 oz')).toBeNull();
    expect(labelMl('1 large')).toBeNull();
    // Open Food Facts' European labels: a decimal comma, centilitres (specification 3e).
    expect(labelMl('1 serving (0,5 l)')).toBe(500);
    expect(labelMl('1 bottle (1,5 L)')).toBe(1500);
    expect(labelMl('1,5l')).toBe(1500);
    expect(labelMl('1 can (33 cl)')).toBe(330);
    expect(labelMl('25cl')).toBe(250);
    expect(labelMl('0,33 L')).toBe(330);
    expect(labelMl('1 carton (1,000 ml)')).toBe(1000);
    expect(labelMl('1 tbsp (15 ml)')).toBe(15);
    expect(labelMl('1 serving (12 oz)')).toBeNull();
    near(gramsPerMl({ servings: [{ label: '1 glass (200 ml)', grams: 206 }] }).gPerMl, 1.03);
  });

  it('with no volume serving it is 1 g per ml, marked assumed; a typo is kept within 0.8..1.3', () => {
    expect(gramsPerMl(own())).toEqual({ gPerMl: 1, assumed: true });
    expect(gramsPerMl({ servings: [{ label: '1 cup', grams: 500 }] }).gPerMl).toBe(1.3);
    expect(gramsPerMl({ servings: [{ label: '1 cup', grams: 50 }] }).gPerMl).toBe(0.8);
    // The first volume serving decides, even when a later one disagrees.
    expect(gramsPerMl({ servings: [{ label: '1 bar', grams: 40 }, { label: '1 cup', grams: 236.588 }, { label: '100 ml', grams: 120 }] }).gPerMl).toBeCloseTo(1, 6);
  });
});

describe('drinkKcal', () => {
  it('metric and imperial', () => {
    expect(drinkKcal(B('b_milk_2pct'), 250)).toBe(129);
    // 8 fl oz of semi-skimmed milk, as the water screen stores it (whole ml).
    expect(drinkKcal(B('b_milk_2pct'), Math.round(volumeToMl(8, 'imperial')))).toBe(122);
    expect(drinkKcal(B('b_coffee_black'), 250)).toBe(3);
  });
});

describe('drinkMeal', () => {
  it('is the meal of the clock at the log', () => {
    expect([8, 11, 13, 16, 19, 23].map((h) => drinkMeal(at(h)))).toEqual(['breakfast', 'snack', 'lunch', 'snack', 'dinner', 'snack']);
  });
});

describe('planDrink', () => {
  it('a calorie choice today: one water record, one entry, the words', () => {
    const p = planDrink(base());
    expect(p.water).toEqual({ date: TODAY, ml: 250, beverage: 'milk', loggedAt: at(13, 10).toISOString(), drink: 'milk_semi' });
    expect(p.entry).toMatchObject({ date: TODAY, meal: 'lunch', name: 'Milk, reduced fat (2%)', foodId: 'b_milk_2pct', source: 'builtin', servingLabel: '250 ml', quantity: 1, via: 'water', loggedAt: at(13, 10).toISOString() });
    expect(p.entry!.grams).toBeCloseTo(257.8, 1);
    expect(Math.round(p.entry!.nutrients.kcal)).toBe(129);
    expect(p.kcal).toBe(129);
    expect(p.toast).toBe('Milk, 129 kcal, added to lunch and 250 ml to Water');
    expect(p.line).toBe('Semi-skimmed milk: 129 kcal per 250 ml, to lunch');
    expect(p.tile).toBe('129 kcal');
    expect(p.label).toBe('Add 250 ml of semi-skimmed milk, 129 kcal to lunch');
  });

  it('names the day when it is not today', () => {
    const y = planDrink(base({ date: addDays(TODAY, -1) }));
    expect(y.toast).toBe("Milk, 129 kcal, added to yesterday's lunch and 250 ml to Water");
    expect(y.line).toBe("Semi-skimmed milk: 129 kcal per 250 ml, to yesterday's lunch");
    expect(y.entry!.date).toBe('2026-11-17');
    const week = planDrink(base({ date: '2026-11-11', now: at(8, 5) }));
    expect(week.toast).toBe('Milk, 129 kcal, added to breakfast, Wed Nov 11, and 250 ml to Water');
    expect(week.water.date).toBe('2026-11-11');
  });

  it('a custom amount names the amount in the line', () => {
    expect(planDrink(base({ ml: 330, amount: 'custom' })).line).toBe('330 ml semi-skimmed milk: 170 kcal, to lunch');
  });

  it('a no-calorie choice writes the water record only, with the words the screen always had', () => {
    const p = planDrink(base({ kind: 'coffee', drink: sel('coffee_black') }));
    expect(p.entry).toBeNull();
    expect(p.kcal).toBe(0);
    expect(p.water).toEqual({ date: TODAY, ml: 250, beverage: 'coffee', loggedAt: at(13, 10).toISOString(), drink: 'coffee_black' });
    expect(p.toast).toBe('250 ml of coffee added to Water');
    expect(p.label).toBe('Add 250 ml of coffee');
    expect(p.line).toBe('Black coffee: no calories added');
    expect(p.tile).toBeNull();
  });

  it('plain water is exactly the record and toast of the screen before drinks had choices', () => {
    const p = planDrink(base({ kind: 'water', drink: null, ml: 249.6 }));
    // The old screen: upsert('water', { date, ml: Math.round(ml), beverage, loggedAt: nowISO() }); the toast is a glass on Today's.
    expect(p.water).toEqual({ date: TODAY, ml: 250, beverage: 'water', loggedAt: at(13, 10).toISOString() });
    expect('drink' in p.water).toBe(false);
    expect(p.entry).toBeNull();
    expect(p.toast).toBe('250 ml added to Water');
    expect(planDrink(base({ kind: 'water', drink: null, date: addDays(TODAY, -1) })).toast).toBe('250 ml added to Water for yesterday');
    expect(p.line).toBe('');
    expect(p.tile).toBeNull();
    // A selection passed for Water is ignored.
    expect(planDrink(base({ kind: 'water' })).entry).toBeNull();
  });

  it("'kcal': calories entered for an other drink", () => {
    const p = planDrink(base({ kind: 'other', drink: { id: 'kcal', food: null }, ml: 330, kcal: 140 }));
    expect(p.water).toMatchObject({ beverage: 'other', drink: 'kcal', ml: 330 });
    expect(p.entry).toMatchObject({ name: 'Other drink', emoji: '🫗', source: 'quick', servingLabel: '330 ml', quantity: 1, grams: 0, nutrients: { kcal: 140, protein: 0, carbs: 0, fat: 0 }, via: 'water', meal: 'lunch' });
    expect(p.toast).toBe('Other drink, 140 kcal, added to lunch and 330 ml to Water');
    expect(planDrink(base({ kind: 'other', drink: { id: 'kcal', food: null }, kcal: 0 })).entry).toBeNull();
  });

  it('Water only: the record only (drink set, no entry), and the words say so', () => {
    const p = planDrink(base({ kind: 'juice', drink: sel('juice_orange'), waterOnly: true }));
    expect(p.entry).toBeNull();
    expect(p.water.drink).toBe('juice_orange');
    expect(p.toast).toBe('250 ml of juice added to Water only');
    expect(p.tile).toBe('No calories');
    // On a no-calorie choice the chip changes nothing.
    expect(planDrink(base({ kind: 'tea', drink: sel('tea_plain'), waterOnly: true })).toast).toBe('250 ml of tea added to Water');
  });

  it('a soft drink under Other and a picked food', () => {
    expect(planDrink(base({ kind: 'other', drink: sel('soft_regular'), ml: 330 })).toast).toBe('Soft drink, 145 kcal, added to lunch and 330 ml to Water');
    const p = planDrink(base({ kind: 'juice', drink: selectFood(B('b_grape_juice')) }));
    expect(p.water.drink).toBe('food');
    expect(p.entry!.foodId).toBe('b_grape_juice');
    expect(p.line).toBe('Grape juice: 160 kcal per 250 ml, to lunch');
  });

  it('imperial glasses', () => {
    const p = planDrink(base({ ml: 237, units: 'imperial' }));
    expect(p.toast).toBe('Milk, 122 kcal, added to lunch and 8 fl oz to Water');
    expect(p.entry!.servingLabel).toBe('8 fl oz');
  });

  it("every toast names the day's new total, as a glass on Today does, when the tap knows it", () => {
    const plain = (s: string) => s.replace(/\u00A0/g, ' ');
    // 1.23 L before, a 3.3 L goal: plain water counts whole.
    const water = waterAfter(1230, 3300, 250, 'water', 'metric');
    expect(water).toEqual({ total: '1.48 of 3.3 L', reaches: false });
    expect(plain(planDrink(base({ kind: 'water', drink: null, after: water })).toast)).toBe('250 ml added to Water · 1.48 of 3.3 L');
    // A drink with calories: the same ending after its words.
    // Held to two lines at 320 px: the calories and the amount are on the tile just tapped.
    expect(plain(planDrink(base({ after: water })).toast)).toBe('Milk added to lunch and Water · 1.48 of 3.3 L');
    expect(plain(planDrink(base({ kind: 'juice', drink: sel('juice_orange'), waterOnly: true, after: water })).toast)).toBe('250 ml of juice added to Water only · 1.48 of 3.3 L');
    // The glass that reaches the goal says so once.
    const reach = waterAfter(3100, 3300, 250, 'water', 'metric');
    expect(reach.reaches).toBe(true);
    expect(plain(planDrink(base({ kind: 'water', drink: null, after: reach })).toast)).toBe('250 ml added to Water · 3.35 of 3.3 L, goal reached');
    // Counted as the day counts it: each drink by its hydration factor, so the total agrees with the water row.
    expect(waterAfter(1000, 3300, 250, 'coffee', 'metric').total).toBe('1.23 of 3.3 L');
    // No goal, no total; the toast is as before.
    expect(waterAfter(1000, 0, 250, 'water', 'metric')).toEqual({ reaches: false });
    expect(planDrink(base({ kind: 'water', drink: null, after: { reaches: false } })).toast).toBe('250 ml added to Water');
  });
});

const entry = (over: Partial<FoodEntry>): FoodEntry => ({
  id: 'e1',
  updatedAt: '2026-11-18T08:10:00.000Z',
  date: TODAY,
  meal: 'breakfast',
  name: 'Orange juice',
  foodId: 'b_orange_juice',
  source: 'builtin',
  verified: true,
  servingLabel: '1 cup',
  quantity: 1,
  grams: 248,
  nutrients: { kcal: 121.5, protein: 1.7, carbs: 28.5, fat: 0.2 },
  loggedAt: at(8, 10).toISOString(),
  ...over,
});
const water = (over: Partial<WaterEntry>): WaterEntry => ({ id: 'w1', updatedAt: 'x', date: TODAY, ml: 250, beverage: 'juice', loggedAt: at(9).toISOString(), ...over });

describe('sameDrinkInDiary', () => {
  const now = at(9, 0).toISOString();
  it('finds the same food logged on the day within 3 h', () => {
    expect(sameDrinkInDiary([entry({})], [], 'b_orange_juice', TODAY, now)?.id).toBe('e1');
    expect(noticeLine(entry({}))).toBe('Orange juice is already in breakfast (08:10).');
  });
  it('not another food, another day, a deleted entry, or one a live water record points at', () => {
    expect(sameDrinkInDiary([entry({})], [], 'b_apple_juice', TODAY, now)).toBeNull();
    expect(sameDrinkInDiary([entry({ date: '2026-11-17' })], [], 'b_orange_juice', TODAY, now)).toBeNull();
    expect(sameDrinkInDiary([entry({ deleted: true })], [], 'b_orange_juice', TODAY, now)).toBeNull();
    expect(sameDrinkInDiary([entry({})], [water({ foodEntryId: 'e1' })], 'b_orange_juice', TODAY, now)).toBeNull();
    // A deleted water record no longer claims it.
    expect(sameDrinkInDiary([entry({})], [water({ foodEntryId: 'e1', deleted: true })], 'b_orange_juice', TODAY, now)?.id).toBe('e1');
    expect(sameDrinkInDiary([entry({})], [], null, TODAY, now)).toBeNull();
  });
  it('an entry logged in the diary that already has its water is found, said to be in Water, and gets no "Water only"', () => {
    const w = water({ id: 'w2', fromEntryId: 'e1', beverage: 'juice' });
    const found = sameDrinkInDiary([entry({})], [w], 'b_orange_juice', TODAY, now);
    expect(found?.id).toBe('e1');
    expect(noticeLine(found!, null, undefined, waterFromEntry([w], found!.id) !== null)).toBe('Orange juice from breakfast (08:10) is already in Water.');
    expect(noticeLine(found!, sel('juice_orange'), 'juice', true)).toBe('Orange juice from breakfast (08:10) is already in Water.');
    expect(waterOnlyOffered(found, [w])).toBe(false);
    // Its water deleted on Water: the notice is today's, and the chip is offered again.
    expect(waterOnlyOffered(found, [{ ...w, deleted: true }])).toBe(true);
    expect(waterOnlyOffered(entry({}), [])).toBe(true);
    expect(waterOnlyOffered(null, [])).toBe(false);
    expect(noticeLine(found!)).toBe('Orange juice is already in breakfast (08:10).');
  });
  it('the 3 hour edge: exactly 3 h counts, a minute more does not, a later log does not', () => {
    const e = entry({ loggedAt: at(6, 0).toISOString() });
    expect(sameDrinkInDiary([e], [], 'b_orange_juice', TODAY, now)?.id).toBe('e1');
    expect(sameDrinkInDiary([entry({ loggedAt: at(5, 59).toISOString() })], [], 'b_orange_juice', TODAY, now)).toBeNull();
    expect(sameDrinkInDiary([entry({ loggedAt: at(9, 5).toISOString() })], [], 'b_orange_juice', TODAY, now)).toBeNull();
  });
  it('the latest of several, from a map as well as a list', () => {
    const map = { a: entry({ id: 'a', loggedAt: at(7).toISOString() }), b: entry({ id: 'b', loggedAt: at(8, 30).toISOString() }) };
    expect(sameDrinkInDiary(map, {}, 'b_orange_juice', TODAY, now)?.id).toBe('b');
  });
  it('milk on cereal at 07:30, then a glass at 08:00: the notice shows, and off by default the glass adds its calories', () => {
    const cereal = entry({ id: 'cereal', name: 'Milk, reduced fat (2%)', foodId: 'b_milk_2pct', servingLabel: '1 cup', grams: 122, loggedAt: at(7, 30).toISOString() });
    const found = sameDrinkInDiary([cereal], [], 'b_milk_2pct', TODAY, at(8).toISOString());
    expect(found?.id).toBe('cereal');
    expect(noticeLine(found!)).toBe('Milk, reduced fat (2%) is already in breakfast (07:30).');
    // Named as the drink line above names it when it is the selected choice's own food.
    expect(noticeLine(found!, sel('milk_semi'), 'milk')).toBe('Semi-skimmed milk is already in breakfast (07:30).');
    expect(planDrink(base({ now: at(8) })).kcal).toBe(129);
  });
  it("another variant of the same kind counts too (any of the kind's choice foods), named by its own name", () => {
    const whole = entry({ id: 'whole', name: 'Milk, whole', foodId: 'b_milk_whole', grams: 244, loggedAt: at(7, 30).toISOString() });
    const ids = sameDrinkFoodIds('milk', sel('milk_semi'));
    expect(ids).toEqual(expect.arrayContaining(['b_milk_2pct', 'b_milk_whole', 'b_milk_skim']));
    const found = sameDrinkInDiary([whole], [], ids, TODAY, at(8).toISOString());
    expect(found?.id).toBe('whole');
    expect(noticeLine(found!, sel('milk_semi'), 'milk')).toBe('Milk, whole is already in breakfast (07:30).');
    // Never one already linked to a water record, never another kind's food, nothing for a no-calorie choice.
    expect(sameDrinkInDiary([whole], [water({ foodEntryId: 'whole' })], ids, TODAY, at(8).toISOString())).toBeNull();
    expect(sameDrinkInDiary([entry({ loggedAt: at(7, 30).toISOString() })], [], ids, TODAY, at(8).toISOString())).toBeNull();
    expect(sameDrinkFoodIds('coffee', sel('coffee_black'))).toEqual([]);
    // A picked food: itself and the kind's choice foods.
    expect(sameDrinkFoodIds('juice', selectFood(B('b_grape_juice')))).toEqual(expect.arrayContaining(['b_grape_juice', 'b_orange_juice', 'b_apple_juice']));
    expect(noticeLine(entry({ loggedAt: at(7, 30).toISOString() }), selectFood(B('b_grape_juice')), 'juice')).toBe('Orange juice is already in breakfast (07:30).');
  });
});

describe('a paired entry stays true to its water', () => {
  const w = { ml: 250 };
  it('never moved to a future day; an entry already there can still be edited', () => {
    expect(pairEditProblem(w, { grams: 258, date: TODAY }, { grams: 258, date: '2026-11-19' }, TODAY, 'metric')).toEqual({
      field: 'day',
      text: 'A drink also counted in Water stays on today or an earlier day.',
    });
    expect(pairEditProblem(w, { grams: 258, date: TODAY }, { grams: 258, date: '2026-11-17' }, TODAY, 'metric')).toBeNull();
    expect(pairEditProblem(w, { grams: 258, date: '2026-11-19' }, { grams: 300, date: '2026-11-19' }, TODAY, 'metric')).toBeNull();
  });
  it('never larger than 10,000 ml of the drink', () => {
    expect(pairEditProblem(w, { grams: 258, date: TODAY }, { grams: 258 * 40, date: TODAY }, TODAY, 'metric')).toBeNull();
    expect(pairEditProblem(w, { grams: 258, date: TODAY }, { grams: 258 * 41, date: TODAY }, TODAY, 'metric')).toEqual({
      field: 'amount',
      text: 'A drink also counted in Water is at most 10 L.',
    });
    expect(pairEditProblem(w, { grams: 258, date: TODAY }, { grams: 258 * 41, date: TODAY }, TODAY, 'imperial')?.text).toMatch(/^A drink also counted in Water is at most \d[\d,]* fl oz\.$/);
    // An entered drink (grams 0) has no amount the water follows.
    expect(pairEditProblem(w, { grams: 0, date: TODAY }, { grams: 0, date: TODAY }, TODAY, 'metric')).toBeNull();
  });
});

describe('calories typed in, a pick, a row title', () => {
  it("the quick-add screen's limit, in neutral words", () => {
    expect(enteredKcalError(null)).toBeNull();
    expect(enteredKcalError(140)).toBeNull();
    expect(enteredKcalError(9999)).toBeNull();
    expect(enteredKcalError(10000)).toBe('Up to 9,999 kcal');
    expect(enteredKcalError(15000)).toBe('Up to 9,999 kcal');
    expect(enteredKcalError(0)).toBe('Enter the calories');
  });
  it('a pick logs nothing and says so', () => {
    expect(pickedToast(B('b_apple_juice'))).toBe(`${B('b_apple_juice').name} chosen. Tap a glass to add it.`);
  });
  it("a row under Other with a known choice reads with the drink's own noun; any other under Other reads \"drink\", never \"other\"", () => {
    expect(waterRowTitle({ ml: 330, beverage: 'other', drink: 'soft_regular' }, 'metric')).toBe('330 ml soft drink');
    // Specification section 7: "473 ml drink" (not "473 ml other") for kind other without a fixed food choice, both origins.
    expect(waterRowTitle({ ml: 330, beverage: 'other', drink: 'kcal' }, 'metric')).toBe('330 ml drink');
    expect(waterRowTitle({ ml: 330, beverage: 'other', drink: 'food' }, 'metric')).toBe('330 ml drink');
    expect(waterRowTitle({ ml: 330, beverage: 'other' }, 'metric')).toBe('330 ml drink');
    expect(waterRowTitle({ ml: 330, beverage: 'other', drink: 'other_none' }, 'metric')).toBe('330 ml drink');
    expect(waterRowTitle({ ml: 473, beverage: 'other', drink: 'food', fromEntryId: 'e1' } as never, 'metric')).toBe('473 ml drink');
    expect(waterRowTitle({ ml: 250, beverage: 'milk', drink: 'milk_semi' }, 'metric')).toBe('250 ml milk');
    expect(waterRowTitle({ ml: 250, beverage: 'coffee', drink: 'latte' }, 'metric')).toBe('250 ml coffee');
  });
  it('grams keep their tenth (display rounds them in food detail)', () => {
    expect(drinkGrams(B('b_milk_2pct'), 250)).toBeCloseTo(257.8, 1);
  });
});

describe('the pair', () => {
  it('livePartner and waterPointingAt see live records only', () => {
    const entries = { e1: entry({}) };
    expect(livePartner(water({ foodEntryId: 'e1' }), entries)?.id).toBe('e1');
    expect(livePartner(water({ foodEntryId: 'e1' }), { e1: entry({ deleted: true }) })).toBeNull();
    expect(livePartner(water({}), entries)).toBeNull();
    expect(waterPointingAt([water({ foodEntryId: 'e1' })], 'e1')?.id).toBe('w1');
    expect(waterPointingAt({ w1: water({ foodEntryId: 'e1', deleted: true }) }, 'e1')).toBeNull();
    expect(waterPointingAt([water({})], 'e1')).toBeNull();
  });

  it('waterForEntryEdit: the amount follows the grams, the day follows unless it is in the future', () => {
    const w = { ml: 250, date: TODAY };
    expect(waterForEntryEdit(w, { grams: 258, date: TODAY }, { grams: 387, date: TODAY }, TODAY)).toEqual({ ml: 375 });
    expect(waterForEntryEdit(w, { grams: 258, date: TODAY }, { grams: 258, date: '2026-11-17' }, TODAY)).toEqual({ date: '2026-11-17' });
    expect(waterForEntryEdit(w, { grams: 258, date: TODAY }, { grams: 258, date: '2026-11-19' }, TODAY)).toBeNull();
    expect(waterForEntryEdit(w, { grams: 0, date: TODAY }, { grams: 0, date: '2026-11-16' }, TODAY)).toEqual({ date: '2026-11-16' });
    expect(waterForEntryEdit(w, { grams: 258, date: TODAY }, { grams: 0, date: TODAY }, TODAY)).toBeNull();
    expect(waterForEntryEdit(w, { grams: 1, date: TODAY }, { grams: 100, date: TODAY }, TODAY)).toEqual({ ml: 10000 });
    expect(waterForEntryEdit(w, { grams: 1000, date: TODAY }, { grams: 1, date: TODAY }, TODAY)).toEqual({ ml: 1 });
    expect(waterForEntryEdit(w, { grams: 258, date: TODAY }, { grams: 258, date: TODAY }, TODAY)).toBeNull();
  });

  it('words for the pair', () => {
    const milk = entry({ name: 'Milk, reduced fat (2%)', nutrients: { kcal: 128.9, protein: 8.5, carbs: 12.4, fat: 5.1 } });
    expect(waterRowCaption(milk, TODAY)).toBe('Milk, reduced fat (2%) · 129 kcal in breakfast');
    expect(waterRowCaption({ ...milk, date: '2026-11-20' }, TODAY)).toBe('Milk, reduced fat (2%) · 129 kcal in breakfast, Fri Nov 20');
    expect(removedWaterToast(water({ beverage: 'milk', drink: 'milk_semi' }), milk, 'metric')).toBe('Removed 250 ml of milk and its 129 kcal');
    expect(removedWaterToast(water({ beverage: 'milk' }), null, 'metric')).toBe('Removed 250 ml');
    expect(removedEntryToast('Milk, reduced fat (2%)', { ml: 250 }, 'metric')).toBe('Removed Milk, reduced fat (2%). The 250 ml stays in Water.');
    expect(detailDrinkNote({ ml: 250 }, 'metric')).toBe('Also counted in Water as 250 ml. Changing the amount here changes it there; deleting here keeps the water.');
    expect(detailDrinkNote({ ml: 330 }, 'metric', false)).toBe(
      'Also counted in Water as 330 ml. The calories here do not change it; changing the day moves it there, and deleting here keeps the water.',
    );
    expect(choiceA11y('Whole', B('b_milk_whole'), 250, 'metric')).toBe('Whole, 157 kilocalories per 250 millilitres');
    expect(choiceA11y('Black', null, 250, 'metric')).toBe('Black, no calories');
  });

  it('a drink logged in the diary: its own lookup; waterPointingAt keeps meaning the Water-origin pair', () => {
    const fromDiary = water({ id: 'w2', fromEntryId: 'e1', beverage: 'other' });
    expect(waterPointingAt([fromDiary], 'e1')).toBeNull();
    expect(waterFromEntry([fromDiary], 'e1')?.id).toBe('w2');
    expect(waterFromEntry({ w2: { ...fromDiary, deleted: true } }, 'e1')).toBeNull();
    expect(waterFromEntry([water({ foodEntryId: 'e1' })], 'e1')).toBeNull();
    expect(waterFor([fromDiary], 'e1')).toEqual({ water: fromDiary, origin: 'diary' });
    expect(waterFor([water({ foodEntryId: 'e1' })], 'e1')?.origin).toBe('water');
    expect(waterFor([], 'e1')).toBeNull();
    const entries = { e1: entry({}) };
    expect(entryFor(fromDiary, entries)).toEqual({ entry: entries.e1, origin: 'diary' });
    expect(entryFor(water({ foodEntryId: 'e1' }), entries)).toEqual({ entry: entries.e1, origin: 'water' });
    expect(entryFor(fromDiary, { e1: entry({ deleted: true }) })).toBeNull();
    expect(entryFor(water({}), entries)).toBeNull();
    // livePartner keeps reading only the Water-origin link.
    expect(livePartner(fromDiary, entries)).toBeNull();
  });

  it('words for a drink logged in the diary; the Water-origin words stay as they were', () => {
    const cola = entry({ name: 'Cola, regular', meal: 'lunch', nutrients: { kcal: 155, protein: 0, carbs: 39, fat: 0 } });
    const fromDiary = { ml: 370, beverage: 'other' as const, drink: 'soft_regular', fromEntryId: 'e1' };
    expect(removedEntryToast('Cola, regular', fromDiary, 'metric')).toBe('Removed Cola, regular and its 370 ml from Water');
    expect(removedWaterToast(fromDiary, cola, 'metric')).toBe('Removed 370 ml. The drink stays in lunch.');
    expect(removedWaterToast(fromDiary, null, 'metric')).toBe('Removed 370 ml');
    expect(detailDrinkNote({ ml: 500, fromEntryId: 'e1' }, 'metric')).toBe('Also counted in Water as 500 ml. It changes with this entry and is removed with it.');
    expect(detailDrinkNote({ ml: 500, fromEntryId: 'e1' }, 'imperial')).toBe('Also counted in Water as 17 fl oz. It changes with this entry and is removed with it.');
    // A record from Water reads as before even beside the new field's absence.
    expect(removedEntryToast('Milk', { ml: 250, foodEntryId: 'e9' }, 'metric')).toBe('Removed Milk. The 250 ml stays in Water.');
  });

  it('isWaterDrinkEntry', () => {
    expect(isWaterDrinkEntry({ via: 'water' })).toBe(true);
    expect(isWaterDrinkEntry({})).toBe(false);
  });
});

describe('isAlcohol', () => {
  it('the bundled alcohol and common names, not soft drinks that share a word', () => {
    for (const id of ['b_beer', 'b_beer_light', 'b_wine_red', 'b_wine_white', 'b_spirits']) expect(isAlcohol(B(id)), id).toBe(true);
    const n = (name: string) => isAlcohol({ id: 'x', name });
    expect(n('Craft IPA')).toBe(true);
    expect(n('Gin and tonic')).toBe(true);
    expect(n('Hard seltzer, lime')).toBe(true);
    expect(n('Whiskey sour')).toBe(true);
    expect(n('Ginger ale')).toBe(false);
    expect(n('Root beer')).toBe(false);
    expect(n('Ginger beer')).toBe(false);
    expect(n('Non-alcoholic beer')).toBe(false);
    expect(n('Lager 0.0%')).toBe(false);
    expect(n('Orange juice')).toBe(false);
    expect(n('Rumbling tummy tea')).toBe(false);
  });

  it('cranberry juice cocktail is juice; Hebrew names of alcohol are alcohol, as whole words', () => {
    const n = (name: string) => isAlcohol({ id: 'x', name });
    expect(isAlcohol(B('b_cranberry_juice'))).toBe(false);
    expect(n('Cranberry juice cocktail')).toBe(false);
    expect(n('Margarita cocktail')).toBe(true);
    for (const name of ['בירה גולדסטאר', 'יין אדום', 'היין של הבית', 'וודקה', 'ערק', 'ויסקי', 'ליקר קפה', 'קוניאק', "ג'ין טוניק", 'ג׳ין', 'סיידר תפוחים']) expect(n(name), name).toBe(true);
    // Not a whole word, or said to be without alcohol.
    for (const name of ['יינון', 'מיץ ענבים', 'בירה ללא אלכוהול', 'יין נטול אלכוהול', 'חלב', 'ציידר']) expect(n(name), name).toBe(false);
  });

  it('the drink sheet lists no alcohol and holds the milks', () => {
    const list = sheetDrinks();
    expect(list.some(isAlcohol)).toBe(false);
    expect(list.map((f) => f.id)).toEqual(expect.arrayContaining(['b_milk_2pct', 'b_milk_whole', 'b_milk_skim', 'b_oat_milk', 'b_soy_milk', 'b_almond_milk', 'b_cola', 'b_coffee_milk']));
    expect([...list].map((f) => f.name)).toEqual([...list].map((f) => f.name).sort((a, b) => a.localeCompare(b)));
    expect(withoutAlcohol([B('b_beer'), B('b_cola')]).map((f) => f.id)).toEqual(['b_cola']);
  });

  it('pickCaption names the source, and says when grams are taken as ml', () => {
    expect(pickCaption(B('b_lemonade'), 250, 'metric')).toBe('105 kcal per 250 ml · Reference');
    expect(pickCaption(own(), 250, 'metric')).toBe('45 kcal per 250 ml, taken as 250 g · Your food');
    // A food known to be a drink (an online product filed under beverages): the same number, no "taken as".
    expect(pickCaption(own({ beverage: true }), 250, 'metric')).toBe('45 kcal per 250 ml · Your food');
  });
});

describe('rememberedChoice', () => {
  const resolveAll = (f: Food) => f;
  it('the default when nothing is stored, none for Water', () => {
    expect(rememberedChoice({}, 'milk')).toEqual(sel('milk_semi'));
    expect(rememberedChoice(null, 'coffee')).toEqual({ id: 'coffee_black', food: null });
    expect(rememberedChoice({}, 'water')).toBeNull();
  });
  it('a stored choice of the kind; an unknown id or another kind falls back', () => {
    expect(rememberedChoice({ milk: { id: 'milk_whole' } }, 'milk')).toEqual(sel('milk_whole'));
    expect(rememberedChoice({ milk: { id: 'gone' } }, 'milk')).toEqual(sel('milk_semi'));
    expect(rememberedChoice({ milk: { id: 'latte' } }, 'milk')).toEqual(sel('milk_semi'));
  });
  it('a picked food while it resolves, under every kind but Water; a deleted own food or alcohol falls back', () => {
    const f = own();
    expect(rememberedChoice({ other: { id: 'food', food: f } }, 'other', resolveAll)).toEqual({ id: 'food', food: f });
    expect(rememberedChoice({ other: { id: 'food', food: f } }, 'other', () => null)).toEqual({ id: 'other_none', food: null });
    expect(rememberedChoice({ other: { id: 'food', food: B('b_beer') } }, 'other', resolveAll)).toEqual({ id: 'other_none', food: null });
    // Since the title row's search places a pick under its own kind (pick.ts), Milk holds one too (it fell back before).
    expect(rememberedChoice({ milk: { id: 'food', food: f } }, 'milk', resolveAll)).toEqual({ id: 'food', food: f });
    expect(rememberedChoice({ water: { id: 'food', food: f } }, 'water', resolveAll)).toBeNull();
  });
  it('remember keeps a pick with its food and a choice by id, never an entered drink', () => {
    const m = remember({}, 'other', selectFood(own()));
    expect(m.other).toEqual({ id: 'food', food: own() });
    expect(remember(m, 'milk', sel('milk_oat')).milk).toEqual({ id: 'milk_oat' });
    expect(remember(m, 'other', { id: 'kcal', food: null })).toBe(m);
    // The picked chip stays offered while another choice is selected.
    expect(pickedFood(sel('soft_regular'), m, 'other')?.id).toBe('own-1');
    expect(pickedFood(sel('soft_regular'), m, 'milk')).toBeNull();
  });
});

describe('a drink named in Hebrew in the drawn lines (lead\'s decision D3)', () => {
  const he = own({ name: 'לימונדה ביתית' });
  const iso = `‎⁨${he.name}⁩`;
  it('isolates the name in the "chosen" toast, the drink line and the notice', () => {
    expect(pickedToast(he)).toBe(`${iso} chosen. Tap a glass to add it.`);
    const p = planDrink(base({ kind: 'other', drink: selectFood(he) }));
    expect(p.line.startsWith(iso)).toBe(true);
    const custom = planDrink(base({ kind: 'other', drink: selectFood(he), ml: 330, amount: 'custom' }));
    expect(custom.line).toContain(`330 ml ${iso}:`);
    expect(noticeLine(entry({ name: he.name, foodId: he.id, loggedAt: at(7, 30).toISOString() }), selectFood(he), 'other')).toBe(`${iso} is already in breakfast (07:30).`);
  });
  it('keeps the raw name for screen readers and changes no English line', () => {
    const p = planDrink(base({ kind: 'other', drink: selectFood(he) }));
    expect(p.label).toContain(he.name);
    expect(p.label).not.toMatch(/[‎⁨⁩]/);
    expect(pickedToast(own())).toBe('Homemade lemonade chosen. Tap a glass to add it.');
    expect(planDrink(base()).line).not.toMatch(/[‎⁨⁩]/);
  });
});
