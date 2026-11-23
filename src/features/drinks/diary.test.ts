/**
 * A drink logged as food in the diary also adds its volume to Water: which entries count (the
 * classification table, read from the real bundled foods, real Open Food Facts products and own
 * foods), the volume, the kind, the record, the edit volume and every word (specification sections 3,
 * 6 and 7; the store's cascade is in src/store/diaryWater.test.ts, the edits in pair.test.ts).
 */
import { describe, expect, it } from 'vitest';

import { BUILTIN_FOODS } from '@/data/foods';
import { stableId } from '@/lib/hash';
import type { Beverage, Food, FoodSource } from '@/types';

import {
  diaryDrink,
  diaryDrinkMl,
  diaryWaterCaption,
  diaryWaterOpenLabel,
  diaryWaterRecord,
  drinkStatus,
  detailWaterAdds,
  drinkChoiceId,
  drinkKind,
  entryEditMovesWater,
  KIND_IDS,
  waterDeleteLabel,
  waterIdFromEntry,
  withWater,
  type DiaryDrinkInput,
} from './diary';
import { BUNDLED_DRINK_IDS, builtinFood, isAlcohol, isBundledDrink, sheetDrinks } from './rules';

const B = (id: string): Food => {
  const f = builtinFood(id);
  if (!f) throw new Error(`no bundled food ${id}`);
  return f;
};

/** Log `quantity` of a food's serving `label` (a bundled serving by its label, or a given one). */
function logOf(food: Food, label: string, quantity = 1, grams?: number, extra: Partial<DiaryDrinkInput> = {}): DiaryDrinkInput {
  const serving = food.servings.find((s) => s.label === label);
  const g = grams ?? (serving ? serving.grams : label === '1 g' ? 1 : label === '100 g' ? 100 : NaN);
  if (!Number.isFinite(g)) throw new Error(`no serving ${label} on ${food.id}`);
  return { food, servingLabel: label, quantity, grams: g * quantity, source: food.source, ...extra };
}

/** A food that is not bundled: an online product or an own food. */
const product = (name: string, kcal: number, over: Partial<Food> = {}, source: FoodSource = 'openfoodfacts'): Food => ({
  id: `off-${name.toLowerCase().replace(/[^a-z0-9\u05D0-\u05EA]+/g, '-')}`,
  name,
  per100g: { kcal, protein: 0, carbs: 0, fat: 0 },
  servings: [],
  source,
  verified: false,
  ...over,
});
const own = (name: string, kcal: number, over: Partial<Food> = {}) => product(name, kcal, { id: `own-${name.length}`, ...over }, 'custom');

const ON = { diaryDrinksInWater: true };

type Row = [label: string, input: DiaryDrinkInput, want: { ml: number; beverage: Beverage; drink?: string } | null];

// ---------------------------------------------------------------- the classification table

/** Every bundled drink, with the serving a person taps first, and what it adds. */
const BUNDLED_DRINKS: Row[] = [
  ['whole milk, 1 cup', logOf(B('b_milk_whole'), '1 cup'), { ml: 237, beverage: 'milk', drink: 'milk_whole' }],
  ['2% milk, 1 glass (200 ml)', logOf(B('b_milk_2pct'), '1 glass (200 ml)'), { ml: 200, beverage: 'milk', drink: 'milk_semi' }],
  ['skim milk, 1 glass', logOf(B('b_milk_skim'), '1 glass (200 ml)'), { ml: 200, beverage: 'milk', drink: 'milk_skim' }],
  ['1% milk, 1 cup (added)', logOf(B('b_milk_1pct'), '1 cup'), { ml: 237, beverage: 'milk', drink: 'food' }],
  ['almond milk', logOf(B('b_almond_milk'), '1 glass (200 ml)'), { ml: 200, beverage: 'milk', drink: 'milk_almond' }],
  ['soy milk', logOf(B('b_soy_milk'), '1 glass (200 ml)'), { ml: 200, beverage: 'milk', drink: 'milk_soy' }],
  ['oat milk', logOf(B('b_oat_milk'), '1 cup'), { ml: 237, beverage: 'milk', drink: 'milk_oat' }],
  ['shoko, 1 bag (added)', logOf(B('b_shoko'), '1 bag'), { ml: 225, beverage: 'milk', drink: 'food' }],
  ['shoko, 1 carton: 500 g is 500 ml, not 493 (3% rule)', logOf(B('b_shoko'), '1 carton'), { ml: 500, beverage: 'milk', drink: 'food' }],
  ['kefir (added)', logOf(B('b_kefir'), '1 cup'), { ml: 237, beverage: 'milk', drink: 'food' }],
  ['buttermilk (added)', logOf(B('b_buttermilk'), '1 cup'), { ml: 237, beverage: 'milk', drink: 'food' }],
  ['protein shake, ready to drink (added)', logOf(B('b_protein_shake_rtd'), '1 bottle (11 fl oz)'), { ml: 325, beverage: 'other', drink: 'food' }],
  ['cranberry juice cocktail (added: not alcohol)', logOf(B('b_cranberry_juice'), '1 cup'), { ml: 237, beverage: 'juice', drink: 'food' }],
  ['black coffee, 1 mug', logOf(B('b_coffee_black'), '1 mug (12 fl oz)'), { ml: 355, beverage: 'coffee', drink: 'coffee_black' }],
  ['espresso, 1 shot: 30 ml counts (inclusive)', logOf(B('b_espresso'), '1 shot'), { ml: 30, beverage: 'coffee', drink: 'food' }],
  ['latte, grande', logOf(B('b_latte'), 'grande (16 fl oz)'), { ml: 473, beverage: 'coffee', drink: 'latte' }],
  ['cappuccino', logOf(B('b_cappuccino'), '1 cup (6 fl oz)'), { ml: 177, beverage: 'coffee', drink: 'cappuccino' }],
  ['mocha', logOf(B('b_mocha'), '12 fl oz'), { ml: 355, beverage: 'coffee', drink: 'food' }],
  ['coffee with milk', logOf(B('b_coffee_milk'), '1 cup (250 ml)'), { ml: 250, beverage: 'coffee', drink: 'coffee_milk' }],
  ['coffee with milk and sugar', logOf(B('b_coffee_milk_sugar'), '1 mug (350 ml)'), { ml: 350, beverage: 'coffee', drink: 'coffee_milk_sugar' }],
  ['coffee with sugar', logOf(B('b_coffee_sugar'), '1 cup (250 ml)'), { ml: 250, beverage: 'coffee', drink: 'coffee_sugar' }],
  ['Turkish coffee', logOf(B('b_turkish_coffee_sweet'), '1 small cup (75 ml)'), { ml: 75, beverage: 'coffee', drink: 'food' }],
  ['tea, 1 mug (no volume: grams over 1.0017 g/ml, within 3%)', logOf(B('b_tea_brewed'), '1 mug'), { ml: 355, beverage: 'tea', drink: 'tea_plain' }],
  ['tea with milk', logOf(B('b_tea_milk'), '1 cup (250 ml)'), { ml: 250, beverage: 'tea', drink: 'tea_milk' }],
  ['tea with milk and sugar', logOf(B('b_tea_milk_sugar'), '1 cup (250 ml)'), { ml: 250, beverage: 'tea', drink: 'tea_milk_sugar' }],
  ['tea with sugar', logOf(B('b_tea_sugar'), '1 mug (350 ml)'), { ml: 350, beverage: 'tea', drink: 'tea_sugar' }],
  ['iced tea', logOf(B('b_iced_tea_sweet'), '1 bottle (16.9 fl oz)'), { ml: 500, beverage: 'tea', drink: 'food' }],
  ['orange juice', logOf(B('b_orange_juice'), '1 small glass (6 fl oz)'), { ml: 177, beverage: 'juice', drink: 'juice_orange' }],
  ['apple juice', logOf(B('b_apple_juice'), '1 cup'), { ml: 237, beverage: 'juice', drink: 'juice_apple' }],
  ['grape juice', logOf(B('b_grape_juice'), '1 cup'), { ml: 237, beverage: 'juice', drink: 'food' }],
  ['tomato juice, small can (no volume, 3% rule)', logOf(B('b_tomato_juice'), '1 small can (5.5 oz)'), { ml: 163, beverage: 'juice', drink: 'food' }],
  ['lemonade', logOf(B('b_lemonade'), '1 glass (12 fl oz)'), { ml: 355, beverage: 'other', drink: 'food' }],
  ['coconut water', logOf(B('b_coconut_water'), '1 carton (11 fl oz)'), { ml: 325, beverage: 'other', drink: 'food' }],
  ['cola, 1 can', logOf(B('b_cola'), '1 can (12 fl oz)'), { ml: 355, beverage: 'other', drink: 'soft_regular' }],
  ['diet cola', logOf(B('b_cola_diet'), '1 bottle (20 fl oz)'), { ml: 591, beverage: 'other', drink: 'food' }],
  ['lemon-lime soda', logOf(B('b_lemon_lime_soda'), '1 can (12 fl oz)'), { ml: 355, beverage: 'other', drink: 'food' }],
  ['ginger ale', logOf(B('b_ginger_ale'), '1 can (12 fl oz)'), { ml: 355, beverage: 'other', drink: 'food' }],
  ['energy drink, 8.4 fl oz can', logOf(B('b_energy_drink'), '1 can (8.4 fl oz)'), { ml: 248, beverage: 'other', drink: 'food' }],
  ['energy drink, 16 fl oz can', logOf(B('b_energy_drink'), '1 can (16 fl oz)'), { ml: 473, beverage: 'other', drink: 'food' }],
  ['sports drink', logOf(B('b_sports_drink'), '1 bottle (20 fl oz)'), { ml: 591, beverage: 'sports', drink: 'sports_regular' }],
  ['sports drink, low calorie', logOf(B('b_sports_drink_low'), '1 cup'), { ml: 237, beverage: 'sports', drink: 'sports_low' }],
  ['fruit smoothie', logOf(B('b_smoothie_fruit'), '16 fl oz'), { ml: 473, beverage: 'other', drink: 'food' }],
  ['vanilla milkshake', logOf(B('b_milkshake_vanilla'), 'small (12 fl oz)'), { ml: 355, beverage: 'other', drink: 'food' }],
  ['hot chocolate', logOf(B('b_hot_chocolate'), '1 mug (12 fl oz)'), { ml: 355, beverage: 'milk', drink: 'food' }],
  ['sachlab', logOf(B('b_sachlab'), '1 serving (140 ml)'), { ml: 140, beverage: 'milk', drink: 'food' }],
  ['limonana', logOf(B('b_limonana'), '1 cup (240 ml)'), { ml: 240, beverage: 'other', drink: 'food' }],
];

/** Bundled foods that must never move Water, by id. */
const BUNDLED_NOT: [id: string, label: string][] = [
  ['b_chicken_soup', '1 bowl'],
  ['b_lentil_soup', '1 bowl'],
  ['b_split_pea_soup', '1 bowl'],
  ['b_vegetable_soup', '1 bowl'],
  ['b_pumpkin_soup', '1 bowl'],
  ['b_yogurt_plain_whole', '1 cup'],
  ['b_yogurt_plain_lowfat', '1 cup'],
  ['b_greek_yogurt_nonfat', '1 cup'],
  ['b_yogurt_fruit', '1 tub'],
  ['b_yogurt_high_protein', '1 tub'],
  ['b_leben', '1 tub'],
  ['b_eshel', '1 tub'],
  ['b_cream_heavy', '1 cup'],
  ['b_half_and_half', '1 cup'],
  ['b_cooking_cream', '1 carton'],
  ['b_sour_cream_15pct', '1 tub'],
  ['b_condensed_milk', '2 tbsp'],
  ['b_coconut_milk_canned', '1 cup'],
  ['b_marinara', '1 cup'],
  ['b_tomato_sauce', '1 cup'],
  ['b_soy_sauce', '1 tbsp'],
  ['b_olive_oil', '1 tbsp'],
  ['b_canola_oil', '1 tbsp'],
  ['b_maple_syrup', '1/4 cup'],
  ['b_silan', '1 tbsp'],
  ['b_ice_cream_vanilla', '1 cup'],
  ['b_ice_pop', '1 ice pop'],
  ['b_beer', '1 half-litre'],
  ['b_beer_light', '1 pint (16 fl oz)'],
  ['b_wine_red', '1 glass (5 fl oz)'],
  ['b_wine_white', '1 large glass (8 fl oz)'],
  ['b_spirits', '1 shot (1.5 fl oz)'],
];

/**
 * Twenty real Open Food Facts products (scratchpad drinkclass/products.tsv, measured 19 Nov 2026), with
 * their real names, quantities and kcal per 100 g, and `beverage` as section 4's tag rule sets it
 * from their real tags. A product found by search has no serving of its own: a drink whose quantity is
 * one volume of at most 750 ml gets "<n> ml"; anything else is logged by weight.
 */
const PRODUCTS: Row[] = [
  // en:beverages, en:energy-drinks; "473 ml, 16 fl oz", 2.11 kcal
  ['Monster Zero Ultra, 473 ml serving', logOf(product('Monster Energy Drink, Zero Sugar, Ultra Straw', 2.11, { beverage: true, servings: [{ label: '473 ml', grams: 473 }] }), '473 ml'), { ml: 473, beverage: 'other', drink: 'food' }],
  // en:beverages, en:energy-drinks; "355ml", 47 kcal
  ['Monster energy, 355 ml serving', logOf(product('Monster energy', 47, { beverage: true, servings: [{ label: '355 ml', grams: 355 }] }), '355 ml'), { ml: 355, beverage: 'other', drink: 'food' }],
  // en:beverages, en:energy-drinks; "0,5 l": the decimal comma gives a 500 ml serving
  ['Monster Energy, 0,5 l, logged as 500 ml', logOf(product('Monster Energy', 47, { beverage: true, servings: [{ label: '500 ml', grams: 500 }] }), '500 ml'), { ml: 500, beverage: 'other', drink: 'food' }],
  // en:beverages, en:carbonated-drinks, en:energy-drinks; quantity "1": no serving, logged by weight
  ['monster energy, no serving, 5 x 100 g', logOf(product('monster energy', 49.2, { beverage: true }), '100 g', 5), { ml: 500, beverage: 'other', drink: 'food' }],
  // no tags at all: by weight it cannot be told from a food (accepted miss, section 9)
  ['Monster Energy, untagged, 5 x 100 g', logOf(product('Monster Energy', 47.9), '100 g', 5), null],
  // a barcode scan of an untagged can: the serving names a volume, so the fallback counts it
  ['Monster Energy, untagged, scanned "1 serving (500 ml)"', logOf(product('Monster Energy', 47, { servings: [{ label: '1 serving (500 ml)', grams: 500 }] }), '1 serving (500 ml)'), { ml: 500, beverage: 'other', drink: 'food' }],
  ['Coca-Cola, 500ml', logOf(product('Coca-Cola', 42, { beverage: true, servings: [{ label: '500 ml', grams: 500 }] }), '500 ml'), { ml: 500, beverage: 'other', drink: 'food' }],
  ['Coca Cola Plus, 0 kcal, 330 ml (no "water" in the name: other)', logOf(product('Coca Cola Plus', 0, { beverage: true, servings: [{ label: '330 ml', grams: 330 }] }), '330 ml'), { ml: 330, beverage: 'other', drink: 'food' }],
  // en:soft-drinks only
  ['Coca-Cola Zero Sugar Kofeiiniton (en:soft-drinks)', logOf(product('Coca-Cola Zero Sugar Kofeiiniton', 0.3, { beverage: true, servings: [{ label: '330 ml', grams: 330 }] }), '330 ml'), { ml: 330, beverage: 'other', drink: 'food' }],
  // 1.5 L: no serving (over 750 ml), logged by weight
  ['Coca-Cola 1.5 L, logged as 250 g', logOf(product('Coca-Cola Cachere- 1.5L- Klp -22', 42, { beverage: true }), '1 g', 250), { ml: 250, beverage: 'other', drink: 'food' }],
  ['Iced coffee, 180 ml', logOf(product('Iced coffee', 22.2, { beverage: true, servings: [{ label: '180 ml', grams: 180 }] }), '180 ml'), { ml: 180, beverage: 'other', drink: 'food' }],
  ['Iced Coffee Espresso, 750 ml (en:milks)', logOf(product('Iced Coffee Espresso', 81.5, { beverage: true, servings: [{ label: '750 ml', grams: 750 }] }), '750 ml'), { ml: 750, beverage: 'other', drink: 'food' }],
  // en:beverages, en:dairy-drinks; "375 g": no volume, logged by weight
  ['Kefir, 250 g', logOf(product('Kefir', 68, { beverage: true }), '1 g', 250), { ml: 250, beverage: 'other', drink: 'food' }],
  // untagged Israeli milk, "1 Liter", logged by weight: accepted miss
  ['חלב טרי, untagged, 2 x 100 g', logOf(product('חלב טרי', 43), '100 g', 2), null],
  // en:dairies only: tags but none of a drink
  ['מעדן חלבון סויה (en:dairies)', logOf(product('מעדן חלבון סויה (תות)', 95, { beverage: false }), '100 g', 2), null],
  ['Protein shake powder (en:protein-powders)', logOf(product('Vanilla flavour vegan protein shake', 382, { beverage: false }), '1 g', 30), null],
  ['Tomato Soup (en:soups)', logOf(product('Tomato Soup', 63, { beverage: false, servings: [{ label: '1 serving (250 ml)', grams: 250 }] }), '1 serving (250 ml)'), null],
  ['Passata (en:plant-based-foods-and-beverages only)', logOf(product('Passata', 30, { beverage: false, servings: [{ label: '1 serving (250 ml)', grams: 250 }] }), '1 serving (250 ml)'), null],
  ['Olive oil, 0.75 l (en:vegetable-oils)', logOf(product('Extra Virgin Olive Oil', 828, { beverage: false }), '1 g', 14), null],
  ['Soy sauce, 150 ml (en:sauces)', logOf(product('Soy Sauce', 27, { beverage: false, servings: [{ label: '1 tbsp (15 ml)', grams: 16 }] }), '1 tbsp (15 ml)'), null],
  ['Dark soy sauce, 143 kcal (en:sauces)', logOf(product('Dark soy sauce', 143, { beverage: false }), '1 g', 15), null],
  ['Ice cream (en:ice-creams)', logOf(product('Ice cream', 244, { beverage: false }), '100 g', 1), null],
  ['Raspberry syrup (en:beverages + en:syrups)', logOf(product('Rasperry with Lemon Syrup', 311, { beverage: false }), '1 g', 40), null],
  ['Instant coffee (en:beverages + en:coffees)', logOf(product('Instant Coffee', 0.588, { beverage: false }), '1 g', 2), null],
  // tagged a beverage but logged as 2 g of granules: under the 30 ml minimum
  ['Instant coffee granules, 2 g (en:hot-beverages)', logOf(product('Instant Coffee', 0, { beverage: true }), '1 g', 2), null],
  // Isagenix, tagged only en:protein-shakes, 403 kcal per 100 g: the 150 kcal cap keeps the powder out
  ['Isagenix powder (en:protein-shakes, 403 kcal)', logOf(product('Isagenix', 403, { beverage: true }), '1 g', 60), null],
  ['Sparkling mineral water, 0 kcal: kind water', logOf(product('Sparkling mineral water', 0, { beverage: true, servings: [{ label: '500 ml', grams: 500 }] }), '500 ml'), { ml: 500, beverage: 'water', drink: 'food' }],
  // the decimal comma in a scanned label: 1,5 L with 150 g is not believed (density 0.1)
  ['Untagged scan "1 bottle (1,5 L)" at 150 g: not believed', logOf(product('Cola', 42, { servings: [{ label: '1 bottle (1,5 L)', grams: 150 }] }), '1 bottle (1,5 L)'), null],
  ['Untagged scan "1 bottle (1,5 L)" at 1500 g', logOf(product('Cola', 42, { servings: [{ label: '1 bottle (1,5 L)', grams: 1500 }] }), '1 bottle (1,5 L)'), { ml: 1500, beverage: 'other', drink: 'food' }],
  ['Untagged scan "1 can (33 cl)"', logOf(product('Lemon soda', 38, { servings: [{ label: '1 can (33 cl)', grams: 330 }] }), '1 can (33 cl)'), { ml: 330, beverage: 'other', drink: 'food' }],
  ['Untagged scan "1 cup (240 ml)" of soup: the name keeps it out', logOf(product('Chicken broth', 6, { servings: [{ label: '1 cup (240 ml)', grams: 240 }] }), '1 cup (240 ml)'), null],
  ['Untagged scan "2 tbsp (30 ml)": under the 100 ml fallback minimum', logOf(product('Lime cordial', 110, { servings: [{ label: '2 tbsp (30 ml)', grams: 30 }] }), '2 tbsp (30 ml)'), null],
  ['Untagged "1 cup": a cup is read for bundled foods only', logOf(product('Horchata', 54, { servings: [{ label: '1 cup', grams: 240 }] }), '1 cup'), null],
];

const OWN: Row[] = [
  ['own shake, switch on, "1 glass" 350 g', logOf(own('Home protein shake', 70, { beverage: true, servings: [{ label: '1 glass', grams: 350 }] }), '1 glass'), { ml: 350, beverage: 'other', drink: 'food' }],
  ['own latte, switch off, "1 cup (300 ml)"', logOf(own('Cafe latte', 50, { beverage: false, servings: [{ label: '1 cup (300 ml)', grams: 300 }] }), '1 cup (300 ml)'), null],
  ['own food before this work (no flag), "1 bottle (500 ml)"', logOf(own('Iced tea, homemade', 20, { servings: [{ label: '1 bottle (500 ml)', grams: 500 }] }), '1 bottle (500 ml)'), { ml: 500, beverage: 'other', drink: 'food' }],
  ['own food, no flag, "1 serving" 300 g: no volume, not a drink', logOf(own('Smoothie bowl', 90, { servings: [{ label: '1 serving', grams: 300 }] }), '1 serving'), null],
  ['own soup in Hebrew, no flag, "250 ml": the name keeps it out', logOf(own('מרק עוף', 40, { servings: [{ label: '250 ml', grams: 250 }] }), '250 ml'), null],
  ['own sauce in Hebrew with a prefix, "200 ml"', logOf(own('הרוטב של סבתא', 60, { servings: [{ label: '200 ml', grams: 200 }] }), '200 ml'), null],
  ['own food, switch on, 400 kcal per 100 g: over the 150 kcal cap', logOf(own('Mass gainer', 400, { beverage: true, servings: [{ label: '1 scoop', grams: 100 }] }), '1 scoop'), null],
  ['own beer in Hebrew, switch on: alcohol', logOf(own('בירה גולדסטאר', 43, { beverage: true, servings: [{ label: '1 bottle (330 ml)', grams: 330 }] }), '1 bottle (330 ml)'), null],
  ['own wine in Hebrew, switch on: alcohol', logOf(own('יין אדום', 85, { beverage: true, servings: [{ label: '1 glass (150 ml)', grams: 150 }] }), '1 glass (150 ml)'), null],
  ['own non-alcoholic beer in Hebrew', logOf(own('בירה ללא אלכוהול', 20, { beverage: true, servings: [{ label: '1 bottle (330 ml)', grams: 330 }] }), '1 bottle (330 ml)'), { ml: 330, beverage: 'other', drink: 'food' }],
];

const ai = (food: Food, grams: number): DiaryDrinkInput => ({ food, servingLabel: '1 g', quantity: grams, grams, source: food.source });
const OTHER: Row[] = [
  ['AI row swapped for the bundled latte, 240 g', ai(B('b_latte'), 240), { ml: 240, beverage: 'coffee', drink: 'latte' }],
  ['AI row swapped for the bundled energy drink, 500 g', ai(B('b_energy_drink'), 500), { ml: 500, beverage: 'other', drink: 'food' }],
  [
    'unswapped AI estimate of an energy drink (source ai)',
    { food: { id: 'ai_1', name: 'Energy drink', per100g: { kcal: 45, protein: 0, carbs: 11, fat: 0 }, servings: [{ label: '500 g', grams: 500 }], source: 'ai', verified: false }, servingLabel: '500 g', quantity: 1, grams: 500, source: 'ai' },
    null,
  ],
  [
    'unswapped AI estimate even with a volume label',
    { food: { id: 'ai_2', name: 'Latte', per100g: { kcal: 55, protein: 3, carbs: 5, fat: 3 }, servings: [{ label: '1 cup (240 ml)', grams: 240 }], source: 'ai', verified: false }, servingLabel: '1 cup (240 ml)', quantity: 1, grams: 240, source: 'ai' },
    null,
  ],
  [
    'a recipe logged as one line (meal_...)',
    { food: { id: 'meal_abc', name: 'Morning shake', per100g: { kcal: 60, protein: 4, carbs: 8, fat: 1 }, servings: [{ label: '1 serving', grams: 400 }], source: 'custom', verified: false, beverage: true }, servingLabel: '1 serving', quantity: 1, grams: 400, source: 'custom' },
    null,
  ],
  ['a quick add (no food)', { food: undefined, servingLabel: '1 serving', quantity: 1, grams: 0, source: 'quick' }, null],
  ['an entry from Water (via water)', logOf(B('b_milk_2pct'), '1 glass (200 ml)', 1, undefined, { via: 'water' }), null],
  ['milk by the tablespoon: 10 ml, under the 30 ml minimum', logOf(B('b_milk_1pct'), '1 tbsp'), null],
  ['two cans of cola', logOf(B('b_cola'), '1 can (12 fl oz)', 2), { ml: 710, beverage: 'other', drink: 'soft_regular' }],
];

describe('which diary entries add water: the classification table', () => {
  const all = [...BUNDLED_DRINKS, ...PRODUCTS, ...OWN, ...OTHER];
  it('holds at least 60 rows besides the bundled foods that must not count', () => {
    expect(all.length + BUNDLED_NOT.length).toBeGreaterThanOrEqual(60);
    expect(PRODUCTS.length).toBeGreaterThanOrEqual(20);
  });
  it.each(all)('%s', (_label, input, want) => {
    const got = diaryDrink(input, ON);
    if (want === null) expect(got).toBeNull();
    else expect(got).toEqual({ drink: 'food', ...want });
  });
  it.each(BUNDLED_NOT)('never %s (%s)', (id, label) => {
    expect(diaryDrink(logOf(B(id), label), ON)).toBeNull();
    // and by no serving or amount
    for (const s of B(id).servings) for (const q of [1, 3]) expect(diaryDrink(logOf(B(id), s.label, q), ON), `${id} ${s.label} x${q}`).toBeNull();
  });
  it('the switch off adds nothing, absent is on', () => {
    const cola = logOf(B('b_cola'), '1 can (12 fl oz)');
    expect(diaryDrink(cola, { diaryDrinksInWater: false })).toBeNull();
    expect(diaryDrink(cola, {})?.ml).toBe(355);
    expect(diaryDrink(cola, null)?.ml).toBe(355);
  });
});

describe('the bundled list', () => {
  it('every id the rule names exists among the bundled foods', () => {
    const ids = new Set(BUILTIN_FOODS.map((f) => f.id));
    expect([...BUNDLED_DRINK_IDS].filter((id) => !ids.has(id))).toEqual([]);
    expect(KIND_IDS.filter((id) => !ids.has(id))).toEqual([]);
    for (const [id] of BUNDLED_NOT) expect(ids.has(id), id).toBe(true);
  });
  it('exactly the bundled drinks count, with some serving: 44 foods, the table above holds every one', () => {
    const counting = BUILTIN_FOODS.filter((f) => f.servings.some((s) => diaryDrink(logOf(f, s.label), ON))).map((f) => f.id);
    const drinks = BUILTIN_FOODS.filter(isBundledDrink).map((f) => f.id);
    expect(counting.sort()).toEqual([...drinks].sort());
    expect(drinks).toHaveLength(44);
    const inTable = new Set(BUNDLED_DRINKS.map(([, input]) => input.food!.id));
    expect(drinks.filter((id) => !inTable.has(id))).toEqual([]);
  });
  it('the Water screen offers the same foods: the six added ones are in the drink sheet, alcohol is not', () => {
    const sheet = sheetDrinks().map((f) => f.id);
    expect(sheet.sort()).toEqual(BUILTIN_FOODS.filter(isBundledDrink).map((f) => f.id).sort());
    for (const id of ['b_milk_1pct', 'b_shoko', 'b_kefir', 'b_buttermilk', 'b_protein_shake_rtd', 'b_cranberry_juice']) expect(sheet, id).toContain(id);
    expect(sheet.some((id) => isAlcohol(B(id)))).toBe(false);
  });
});

describe('the volume', () => {
  const cola = (label: string, grams: number) => product('Cola', 42, { beverage: true, servings: [{ label, grams }] });
  it('reads ml, cl, L with a decimal comma, and fl oz, times the quantity', () => {
    expect(diaryDrink(logOf(cola('0,5 l', 500), '0,5 l'), ON)?.ml).toBe(500);
    expect(diaryDrink(logOf(cola('1 can (33 cl)', 330), '1 can (33 cl)', 2), ON)?.ml).toBe(660);
    expect(diaryDrink(logOf(cola('1 bottle (1,5 L)', 1500), '1 bottle (1,5 L)'), ON)?.ml).toBe(1500);
    expect(diaryDrink(logOf(cola('1 can (12 fl oz)', 370), '1 can (12 fl oz)'), ON)?.ml).toBe(355);
    expect(diaryDrink(logOf(cola('1 can (16.9 fl. oz)', 500), '1 can (16.9 fl. oz)'), ON)?.ml).toBe(500);
  });
  it('a volume that disagrees with the grams by more than 0.8 to 1.3 g per ml is not believed; a known drink then goes by its grams', () => {
    // "1,5 L" over 300 g reads as 1500 ml: 0.2 g per ml is not a drink. The grams decide (300 ml).
    expect(diaryDrink(logOf(cola('1 bottle (1,5 L)', 300), '1 bottle (1,5 L)'), ON)?.ml).toBe(300);
    // An untagged food has no grams route: not believed means nothing.
    expect(diaryDrink(logOf(product('Cola', 42, { servings: [{ label: '1 bottle (1,5 L)', grams: 300 }] }), '1 bottle (1,5 L)'), ON)).toBeNull();
  });
  it('a "cup" is read only for bundled foods', () => {
    expect(diaryDrink(logOf(B('b_orange_juice'), '1 cup'), ON)?.ml).toBe(237);
    // A drink-flagged product logged by "1 cup": by its grams (240 g, assumed 1 g per ml).
    expect(diaryDrink(logOf(product('Horchata', 54, { beverage: true, servings: [{ label: '1 cup', grams: 240 }] }), '1 cup'), ON)?.ml).toBe(240);
  });
  it('by grams: divided by the density, or taken as ml within 3% of 1 g per ml', () => {
    // b_milkshake_vanilla is 330 g per 12 fl oz (0.93 g per ml): 300 g is 323 ml.
    expect(diaryDrink(ai(B('b_milkshake_vanilla'), 300), ON)?.ml).toBe(323);
    // b_cola is 370 g per 12 fl oz (1.042, outside 3%): 500 g is 480 ml.
    expect(diaryDrink(ai(B('b_cola'), 500), ON)?.ml).toBe(480);
    // b_shoko is 240 g per cup (1.014, within 3%): 500 g is 500 ml.
    expect(diaryDrink(ai(B('b_shoko'), 500), ON)?.ml).toBe(500);
  });
  it('minimums at creation: 30 ml for a known drink (inclusive), 100 ml for a label-only food', () => {
    expect(diaryDrink(ai(B('b_espresso'), 30), ON)?.ml).toBe(30);
    expect(diaryDrink(ai(B('b_espresso'), 29), ON)).toBeNull();
    const untagged = (ml: number) => logOf(product('Mystery drink', 20, { servings: [{ label: `${ml} ml`, grams: ml }] }), `${ml} ml`);
    expect(diaryDrink(untagged(100), ON)?.ml).toBe(100);
    expect(diaryDrink(untagged(99), ON)).toBeNull();
  });
  it('the water record holds at most 10,000 ml (the entry may hold more)', () => {
    expect(diaryDrink(logOf(B('b_cola'), '1 bottle (20 fl oz)', 20), ON)?.ml).toBe(10000);
    expect(diaryWaterRecord({ id: 'e', date: '2026-11-19', loggedAt: 'x' }, { ml: 12000, beverage: 'other', drink: 'food' }).ml).toBe(10000);
  });
});

describe('the kind', () => {
  it('by id for bundled foods, never from a name', () => {
    expect(drinkKind(B('b_turkish_coffee_sweet'))).toBe('coffee');
    expect(drinkKind(B('b_iced_tea_sweet'))).toBe('tea');
    expect(drinkKind(B('b_tomato_juice'))).toBe('juice');
    expect(drinkKind(B('b_sachlab'))).toBe('milk');
    expect(drinkKind(B('b_sports_drink_low'))).toBe('sports');
    // "Coconut water" is bundled: other, not water.
    expect(drinkKind(B('b_coconut_water'))).toBe('other');
    expect(drinkKind(B('b_energy_drink'))).toBe('other');
  });
  it("another food: 'water' only at or under 2 kcal per 100 g with a water word in its name", () => {
    expect(drinkKind(product('Sparkling water, lemon', 0))).toBe('water');
    expect(drinkKind(product('San Pellegrino mineral', 0))).toBe('water');
    expect(drinkKind(product('Seltzer', 1))).toBe('water');
    expect(drinkKind(product('Coconut water', 18))).toBe('other');
    expect(drinkKind(product('Monster Zero', 2.11))).toBe('other');
  });
  it("`drink` is the choice whose food or reference food this is, else 'food'", () => {
    expect(drinkChoiceId(B('b_milk_2pct'))).toBe('milk_semi');
    expect(drinkChoiceId(B('b_coffee_black'))).toBe('coffee_black');
    expect(drinkChoiceId(B('b_tea_brewed'))).toBe('tea_plain');
    expect(drinkChoiceId(B('b_cola'))).toBe('soft_regular');
    expect(drinkChoiceId(B('b_energy_drink'))).toBe('food');
  });
});

describe('the record and its id', () => {
  it('is deterministic per entry, UUID-shaped, and carries the entry\'s day and moment', () => {
    const entry = { id: '0b6f3c1e-8f0a-4c49-9d3e-1a2b3c4d5e6f', date: '2026-11-20', loggedAt: '2026-11-19T12:40:00.000Z' };
    const w = diaryWaterRecord(entry, { ml: 500, beverage: 'other', drink: 'food' });
    expect(w).toEqual({ id: stableId('waterFromEntry', entry.id), date: '2026-11-20', ml: 500, beverage: 'other', drink: 'food', loggedAt: entry.loggedAt, fromEntryId: entry.id });
    expect(waterIdFromEntry(entry.id)).toBe(w.id);
    expect(diaryWaterRecord(entry, { ml: 330, beverage: 'other', drink: 'food' }).id).toBe(w.id);
    expect(w.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(waterIdFromEntry('other-entry')).not.toBe(w.id);
  });
});

describe('the volume after an edit (diaryDrinkMl)', () => {
  it('recomputes from the entry: label times quantity, else grams; floor 1, cap 10,000; never from the old water', () => {
    const can = B('b_energy_drink');
    expect(diaryDrinkMl(logOf(can, '1 can (500 ml)', 2))).toBe(1000);
    expect(diaryDrinkMl(logOf(can, '1 can (8.4 fl oz)', 0.5))).toBe(124);
    // Switched to grams: 100 g of a 1.006 g per ml drink is 100 ml.
    expect(diaryDrinkMl({ food: can, servingLabel: '100 g', quantity: 1, grams: 100 })).toBe(100);
    // No minimum on an edit: down to 1 ml.
    expect(diaryDrinkMl({ food: can, servingLabel: '1 g', quantity: 0.2, grams: 0.2 })).toBe(1);
    expect(diaryDrinkMl(logOf(can, '1 can (500 ml)', 40))).toBe(10000);
    // A food the classification would refuse now (a fallback food logged by weight) still follows.
    expect(diaryDrinkMl({ food: product('Mystery drink', 20), servingLabel: '100 g', quantity: 3, grams: 300 })).toBe(300);
    expect(diaryDrinkMl({ food: null, servingLabel: '1 serving', quantity: 1, grams: 0 })).toBeNull();
  });
});

describe('an edit moves the water only when the amount, the serving or the day changed', () => {
  const before = { quantity: 1, grams: 503, servingLabel: '1 can (500 ml)', date: '2026-11-19' };
  it('a meal, name or calories change (the four fields the same) does not', () => {
    expect(entryEditMovesWater(before, { ...before })).toBe(false);
    expect(entryEditMovesWater(before, { ...before, meal: 'dinner', name: 'Monster' } as typeof before)).toBe(false);
  });
  it('the quantity, the grams, the serving or the day does', () => {
    expect(entryEditMovesWater(before, { ...before, quantity: 2, grams: 1006 })).toBe(true);
    expect(entryEditMovesWater(before, { ...before, grams: 480 })).toBe(true);
    expect(entryEditMovesWater(before, { ...before, servingLabel: '1 can (16 fl oz)' })).toBe(true);
    expect(entryEditMovesWater(before, { ...before, date: '2026-11-18' })).toBe(true);
  });
  it('a field missing on either side counts as changed', () => {
    expect(entryEditMovesWater({ grams: 503, date: '2026-11-19' }, before)).toBe(true);
    expect(entryEditMovesWater(before, { grams: 503, date: '2026-11-19' })).toBe(true);
  });
});

describe('words', () => {
  it('withWater: one drink, a message with a comma, several items, a copy, nothing', () => {
    expect(withWater('Added to lunch', 500, 'metric')).toBe('Added to lunch and 500 ml to Water');
    // formatVolume rounds 10 fl oz and above to whole fl oz (500 ml is "17 fl oz"); 250 ml is "8.5 fl oz".
    expect(withWater("Added to yesterday's breakfast", 500, 'imperial')).toBe("Added to yesterday's breakfast and 17 fl oz to Water");
    expect(withWater('Added to breakfast, Sat Nov 14', 250, 'imperial')).toBe('Added to breakfast, Sat Nov 14, and 8.5 fl oz to Water');
    expect(withWater('3 items added to lunch', 750, 'metric')).toBe('3 items added to lunch, 750 ml to Water');
    expect(withWater('Copied lunch from yesterday', 750, 'metric')).toBe('Copied lunch from yesterday, 750 ml to Water');
    expect(withWater("Yesterday's lunch added", 330, 'metric')).toBe("Yesterday's lunch added, 330 ml to Water");
    expect(withWater('Morning shake added to lunch', 330, 'metric')).toBe('Morning shake added to lunch, 330 ml to Water');
    expect(withWater('Added to lunch', 0, 'metric')).toBe('Added to lunch');
    expect(withWater('Added to lunch', null, 'metric')).toBe('Added to lunch');
  });
  it('food detail before Add follows the amount; nothing for a non-drink', () => {
    const can = B('b_energy_drink');
    expect(detailWaterAdds(diaryDrink(logOf(can, '1 can (500 ml)'), ON), 'metric')).toBe('Also adds 500 ml to Water.');
    expect(detailWaterAdds(diaryDrink(logOf(can, '1 can (500 ml)', 2), ON), 'metric')).toBe('Also adds 1 L to Water.');
    expect(detailWaterAdds(diaryDrink(logOf(can, '1 can (500 ml)'), ON), 'imperial')).toBe('Also adds 17 fl oz to Water.');
    expect(detailWaterAdds(diaryDrink(logOf(B('b_chicken_soup'), '1 bowl'), ON), 'metric')).toBeNull();
    expect(detailWaterAdds(diaryDrink(logOf(can, '1 can (500 ml)'), { diaryDrinksInWater: false }), 'metric')).toBeNull();
  });
  it('the Water row for a drink from the diary: caption, open label, delete label', () => {
    const entry = { name: 'Energy drink, sugared', meal: 'lunch' as const };
    expect(diaryWaterCaption(entry)).toBe('Energy drink, sugared · from lunch');
    expect(diaryWaterOpenLabel('473 ml drink', entry)).toBe('473 ml drink, Energy drink, sugared, from lunch. Edit in diary');
    expect(waterDeleteLabel({ ml: 473 }, '12:40', 'metric', entry)).toBe('Delete 473 ml, 12:40. The drink stays in lunch');
    // The old label, byte for byte, for every other row.
    expect(waterDeleteLabel({ ml: 473 }, '12:40', 'metric')).toBe('Delete 473 ml, 12:40');
    expect(waterDeleteLabel({ ml: 473 }, 'Added later', 'metric', null)).toBe('Delete 473 ml, Added later');
  });
});

describe('drinkStatus and the diary: the sheet offers a food with no flag only when one of its servings would count', () => {
  const untagged = (servings: Food['servings']): Food => ({ id: 'own-x', name: 'Iced hibiscus', per100g: { kcal: 30, protein: 0, carbs: 7, fat: 0 }, servings, source: 'custom', verified: false });

  it('a serving that names at least 100 ml (never "cup") makes it a maybe; otherwise not', () => {
    expect(drinkStatus(untagged([{ label: '1 bottle (330 ml)', grams: 330 }]))).toBe('maybe');
    expect(drinkStatus(untagged([{ label: '1 glass', grams: 250 }]))).toBe('not');
    expect(drinkStatus(untagged([{ label: '1 cup (8 fl oz)', grams: 240 }]))).toBe('maybe'); // fl oz is read, "cup" is not
    expect(drinkStatus(untagged([{ label: '1 cup', grams: 240 }]))).toBe('not');
    expect(drinkStatus(untagged([{ label: '1 shot (40 ml)', grams: 40 }]))).toBe('not');
  });

  it('diaryDrink still judges the serving actually logged, as before', () => {
    const f = untagged([{ label: '1 glass', grams: 250 }]);
    expect(diaryDrink({ food: f, servingLabel: '1 glass', quantity: 1, grams: 250 }, null)).toBeNull();
    expect(diaryDrink({ food: f, servingLabel: '330 ml', quantity: 1, grams: 330 }, null)).toEqual({ ml: 330, beverage: 'other', drink: 'food' });
  });
});
