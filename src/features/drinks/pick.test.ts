/**
 * A search for any drink on the Water screen (the specification's sections 3 to 5 and 7): one answer to
 * "is this a drink" (`drinkStatus`) over every bundled food and real Open Food Facts products
 * (__fixtures__/off-drinks.json), "Your drinks", the sheet's list for real queries, the online filter and
 * its lines, where a pick goes, what is selected after it, and the words.
 */
import { readFileSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

import { BUILTIN_FOODS } from '@/data/foods';
import { rankOnline, searchLocal } from '@/services/foodSearch';
import { offToFood, toFoods } from '@/services/openFoodFacts';
import type { Beverage, Food, FoodEntry } from '@/types';

import { DRINK_CHOICES, PICK_CHIP, canPick, choiceById } from './choices';
import { diaryDrink, drinkStatus, kcalPer100ml, MAX_KCAL_PER_100ML } from './diary';
import {
  ALCOHOL_LINE,
  FIXED_CHOICE_FOOD_IDS,
  ONLINE_FAILED_ALONE,
  ONLINE_WORDS,
  WATER_CHOSEN,
  brandAndPack,
  foodsOnlyLine,
  localDrinkHits,
  matchPlace,
  noMatchLine,
  onlineLine,
  onlineDrinks,
  packVolume,
  pickDetail,
  pickToast,
  placePick,
  recentChips,
  sheetList,
  yourDrinks,
  type OnlineAnswer,
  type SheetItem,
  type SheetListInput,
  type SheetMessage,
  type SheetRow,
} from './pick';
import { builtinFood, isAlcohol, isBundledDrink, pickCaption, pickedFood, remember, rememberedChoice, selectChoice, selectFood, sheetDrinks } from './rules';

const B = (id: string): Food => {
  const f = builtinFood(id);
  if (!f) throw new Error(`no bundled food ${id}`);
  return f;
};

// ---------------------------------------------------------------- the real products

interface Answer {
  query: string;
  hits: Parameters<typeof offToFood>[0][];
}
const FIXTURE: { answers: Answer[] } = JSON.parse(readFileSync(path.join(__dirname, '__fixtures__', 'off-drinks.json'), 'utf8'));
const BY_CODE = new Map<string, Parameters<typeof offToFood>[0]>();
for (const a of FIXTURE.answers) for (const h of a.hits) if (h.code) BY_CODE.set(h.code, h);
/** A product of the fixture as the app maps it. */
const P = (code: string): Food => {
  const raw = BY_CODE.get(code);
  const f = raw ? offToFood(raw) : null;
  if (!f) throw new Error(`no product ${code}`);
  return f;
};
/** An answer's foods as `searchOnlineWithStatus` returns them: mapped and one per name and brand by the service's own `toFoods`, ranked by `rankOnline`. */
function answerFoods(query: string): Food[] {
  const a = FIXTURE.answers.find((x) => x.query === query);
  if (!a) throw new Error(`no answer for ${query}`);
  return rankOnline(query, toFoods(a.hits));
}

const own = (over: Partial<Food> = {}): Food => ({
  id: 'own-lemonade',
  name: 'Homemade lemonade',
  per100g: { kcal: 18, protein: 0, carbs: 4.5, fat: 0 },
  servings: [{ label: '1 glass (300 ml)', grams: 300 }],
  source: 'custom',
  verified: false,
  ...over,
});

describe('drinkStatus: one answer to "is this a drink"', () => {
  it('over all 467 bundled foods: exactly the 44 drinks are a drink, the rest not', () => {
    expect(BUILTIN_FOODS.length).toBe(467);
    const drinks = BUILTIN_FOODS.filter((f) => drinkStatus(f) === 'drink');
    expect(drinks.length).toBe(44);
    expect(BUILTIN_FOODS.filter((f) => drinkStatus(f) === 'maybe')).toEqual([]);
    for (const f of BUILTIN_FOODS) expect(drinkStatus(f) === 'drink', f.id).toBe(isBundledDrink(f));
    expect(drinks.map((f) => f.id).sort()).toEqual(sheetDrinks().map((f) => f.id).sort());
    for (const id of ['b_beer', 'b_wine_red', 'b_spirits', 'b_watermelon', 'b_lentil_soup', 'b_milk_chocolate'].filter((x) => builtinFood(x))) expect(drinkStatus(B(id)), id).toBe('not');
  });

  it('the fixture holds real answers: at least 30 products, every case the specification names', () => {
    expect(BY_CODE.size).toBeGreaterThanOrEqual(30);
    // The powder at 403 kcal, filed under beverages.
    const powder = P('0000390204071');
    expect(powder.beverage).toBe(true);
    expect(powder.per100g.kcal).toBe(403);
    // A 1.5 L bottle, a multipack and an untagged milk.
    expect(BY_CODE.get('5449000298157')!.quantity).toBe('1.5 L');
    expect(BY_CODE.get('5060639127580')!.quantity).toBe('4 x 500 ml');
    expect(P('7290000042435').name).toBe('חלב טרי');
    expect(P('7290000042435').beverage).toBeUndefined();
  });

  it('over the real products: a drink only when filed under beverages, at most 150 kcal per 100 ml and no alcohol', () => {
    const counts = { drink: 0, maybe: 0, not: 0 };
    for (const raw of BY_CODE.values()) {
      const f = offToFood(raw);
      if (!f) continue;
      const s = drinkStatus(f);
      counts[s]++;
      const fits = kcalPer100ml(f) <= MAX_KCAL_PER_100ML;
      if (f.beverage === true) expect(s, f.name).toBe(fits && !isAlcohol(f) ? 'drink' : 'not');
      if (f.beverage === false) expect(s, f.name).toBe('not');
      if (f.beverage === undefined) expect(s, f.name).not.toBe('drink');
      if (!fits) expect(s, `${f.name} ${f.per100g.kcal}`).toBe('not');
    }
    // 225 products (235 hits, 10 seen twice), 161 the app can show. None with no flag has a serving
    // that names a volume, so none is 'maybe' (the 23 that were, an untagged milk among them, are not).
    expect(counts).toEqual({ drink: 57, maybe: 0, not: 104 });
  });

  it('the named cases', () => {
    expect(drinkStatus(P('0000390204071'))).toBe('not'); // Isagenix powder, 403 kcal, beverage true
    expect(drinkStatus(P('5060896622507'))).toBe('not'); // a "Monster" at 172 kcal, beverage true
    expect(drinkStatus(P('0075355112586'))).toBe('not'); // an "Iced Coffee" at 178 kcal, beverage true
    expect(drinkStatus(P('0085239156759'))).toBe('not'); // a "Monster" at 486 kcal, no categories
    expect(drinkStatus(P('5449000298157'))).toBe('drink'); // Coca-Cola Zero, 1.5 L
    expect(drinkStatus(P('5060639127580'))).toBe('drink'); // Monster, 4 x 500 ml
    expect(drinkStatus(P('7290102398560'))).toBe('drink'); // שוקו by טרה, 1.5 l
    expect(drinkStatus(P('7290000042435'))).toBe('not'); // חלב טרי, no categories and no serving that names a volume
    expect(drinkStatus(P('4779039730276'))).toBe('not'); // Tomato soup
    expect(drinkStatus(P('25185003'))).toBe('not'); // olive oil, 750ml
    expect(drinkStatus(P('0810688010389'))).toBe('not'); // instant coffee
    expect(drinkStatus(P('5900397737679'))).toBe('not'); // a syrup, 400ml
  });

  it('own foods, AI estimates, recipes', () => {
    expect(drinkStatus(own())).toBe('maybe');
    expect(drinkStatus(own({ beverage: true }))).toBe('drink');
    expect(drinkStatus(own({ beverage: false }))).toBe('not');
    expect(drinkStatus(own({ name: 'Chicken soup' }))).toBe('not');
    expect(drinkStatus(own({ name: 'Chicken soup', beverage: true }))).toBe('drink');
    expect(drinkStatus(own({ per100g: { kcal: 400, protein: 80, carbs: 10, fat: 5 } }))).toBe('not');
    expect(drinkStatus(own({ name: 'Craft beer' }))).toBe('not');
    expect(drinkStatus(own({ source: 'ai' }))).toBe('not');
    expect(drinkStatus(own({ id: 'meal_123' }))).toBe('not');
  });

  it('the diary agrees: a known drink adds water by a "250 ml" serving; a food the sheet does not offer adds none by any serving of its own', () => {
    const log = (f: Food, label: string, grams: number) => diaryDrink({ food: f, servingLabel: label, quantity: 1, grams, source: f.source }, { diaryDrinksInWater: true });
    const foods = [...[...BY_CODE.values()].map((raw) => offToFood(raw)).filter((f): f is Food => !!f), own(), own({ servings: [{ label: '1 bowl', grams: 300 }] }), own({ servings: [{ label: '1 can (330 ml)', grams: 330 }] })];
    for (const f of foods) {
      const s = drinkStatus(f);
      if (s === 'drink') expect(log(f, '250 ml', 250), f.name).not.toBeNull();
      if (s === 'not') for (const sv of f.servings) expect(log(f, sv.label, sv.grams), `${f.name} ${sv.label}`).toBeNull();
      if (s === 'maybe') expect(f.servings.some((sv) => log(f, sv.label, sv.grams) !== null), f.name).toBe(true);
    }
  });
});

// ---------------------------------------------------------------- your drinks

let n = 0;
const entry = (food: Food | null, loggedAt: string, over: Partial<FoodEntry> = {}): FoodEntry => ({
  id: `e${++n}`,
  updatedAt: loggedAt,
  date: loggedAt.slice(0, 10),
  meal: 'lunch',
  name: food?.name ?? 'Other drink',
  ...(food ? { foodId: food.id, food } : {}),
  source: food?.source ?? 'quick',
  verified: false,
  servingLabel: '250 ml',
  quantity: 1,
  grams: 250,
  nutrients: { kcal: 100, protein: 0, carbs: 0, fat: 0 },
  loggedAt,
  ...over,
});

describe('yourDrinks', () => {
  const monster = P('5060896623368'); // Monster, 500 ml, 36 kcal, beverage true
  const ownDrink = own({ id: 'own-kombucha', name: 'Kombucha', beverage: true });
  const customById = new Map<string, Food>([[ownDrink.id, ownDrink]]);

  it('newest first, one per food, drinks only, no fixed choices, no quick entries, no deleted entries', () => {
    const entries = [
      entry(B('b_mocha'), '2026-11-20T08:00:00.000Z'), // in the diary
      entry(monster, '2026-11-22T15:00:00.000Z', { via: 'water' }), // on Water
      entry(B('b_mocha'), '2026-11-23T08:00:00.000Z'), // the same food again, newer
      entry(B('b_latte'), '2026-11-23T09:00:00.000Z', { via: 'water' }), // a fixed choice (Coffee's Latte)
      entry(B('b_milk_2pct'), '2026-11-23T09:30:00.000Z'), // a fixed choice (Milk's semi-skimmed)
      entry(null, '2026-11-23T10:00:00.000Z', { via: 'water' }), // calories typed in
      entry(B('b_shoko'), '2026-11-23T11:00:00.000Z', { deleted: true }), // deleted
      entry(builtinFood('b_lentil_soup') ?? B('b_milk_chocolate'), '2026-11-23T12:00:00.000Z'), // a food
      entry(ownDrink, '2026-11-21T12:00:00.000Z'),
      entry(B('b_beer'), '2026-11-23T13:00:00.000Z'), // alcohol
    ];
    expect(yourDrinks(entries, customById).map((f) => f.id)).toEqual(['b_mocha', monster.id, ownDrink.id]);
    // A record map, as the store holds it.
    expect(yourDrinks(Object.fromEntries(entries.map((e) => [e.id, e])), customById).map((f) => f.id)).toEqual(['b_mocha', monster.id, ownDrink.id]);
  });

  it('an own drink deleted since is dropped; a bundled food is today\'s; the limit holds (5 by default)', () => {
    expect(yourDrinks([entry(ownDrink, '2026-11-21T12:00:00.000Z')], new Map())).toEqual([]);
    const stale = { ...B('b_shoko'), per100g: { ...B('b_shoko').per100g, kcal: 1 } };
    expect(yourDrinks([entry(stale, '2026-11-21T12:00:00.000Z')], new Map())[0]).toBe(B('b_shoko'));
    // An entry with only a bundled food id (no snapshot) still resolves.
    expect(yourDrinks([{ ...entry(B('b_kefir'), '2026-11-21T12:00:00.000Z'), food: undefined }], new Map()).map((f) => f.id)).toEqual(['b_kefir']);
    const many = ['b_mocha', 'b_shoko', 'b_kefir', 'b_lemonade', 'b_ginger_ale', 'b_coconut_water', 'b_energy_drink'].map((id, i) => entry(B(id), `2026-11-2${i}T12:00:00.000Z`));
    expect(yourDrinks(many, new Map()).map((f) => f.id)).toEqual(['b_energy_drink', 'b_coconut_water', 'b_ginger_ale', 'b_lemonade', 'b_kefir']);
    expect(yourDrinks(many, new Map(), 2).length).toBe(2);
    expect(yourDrinks([], new Map())).toEqual([]);
  });

  it('the fixed choices\' foods are the 19 foods and the 2 no-calorie references', () => {
    expect(FIXED_CHOICE_FOOD_IDS.size).toBe(DRINK_CHOICES.filter((c) => c.foodId).length + DRINK_CHOICES.filter((c) => c.refId).length);
    expect(FIXED_CHOICE_FOOD_IDS.has('b_coffee_black')).toBe(true);
    expect(FIXED_CHOICE_FOOD_IDS.has('b_mocha')).toBe(false);
  });
});

// ---------------------------------------------------------------- the sheet's list

const base = (over: Partial<SheetListInput> = {}): SheetListInput => ({ query: '', local: [], yours: [], online: null, showAll: false, glassMl: 250, units: 'metric', ...over });
const forQuery = (q: string, over: Partial<SheetListInput> = {}) => sheetList(base({ query: q, local: searchLocal(q, {}, 30), ...over }));
const rows = (items: SheetItem[]) => items.filter((i): i is SheetRow => i.type === 'row');
const ids = (items: SheetItem[]) => rows(items).map((r) => r.food.id);
const kinds = (items: SheetItem[]) => items.map((i) => (i.type === 'row' ? `row:${i.section}` : i.testID));
const message = (items: SheetItem[], testID: string) => items.find((i): i is SheetMessage => i.type === 'message' && i.testID === testID)?.text;

describe('sheetList with an empty query', () => {
  it('"All drinks" over every bundled drink by name; the hint shows; no "Your drinks" without any', () => {
    const l = sheetList(base());
    expect(l.hint).toBe(true);
    expect(l.searchOnline).toBe(false);
    expect(l.items[0]).toMatchObject({ type: 'heading', testID: 'water-pick-all', text: 'All drinks' });
    expect(ids(l.items)).toEqual(sheetDrinks().map((f) => f.id));
    expect(rows(l.items)[0].divider).toBe(false);
    expect(rows(l.items)[1].divider).toBe(true);
    expect(rows(l.items).every((r) => r.testID === `water-pick-${r.food.id}`)).toBe(true);
  });

  it('"Your drinks" first, up to what yourDrinks gave, with testIDs of their own', () => {
    const yours = [B('b_mocha'), P('5060896623368')];
    const l = sheetList(base({ yours }));
    expect(kinds(l.items).slice(0, 4)).toEqual(['water-pick-yours', 'row:yours', 'row:yours', 'water-pick-all']);
    const [mocha, monster] = rows(l.items);
    expect(mocha).toMatchObject({ testID: 'water-pick-yours-b_mocha', key: 'yours-b_mocha', divider: false, detail: '188 kcal per 250 ml · Reference' });
    expect(monster.testID).toBe('water-pick-yours-off_5060896623368');
    expect(monster.detail).toBe('500 ml · 90 kcal per 250 ml · Community');
    // The same mocha is still under "All drinks", with its own key and testID.
    expect(rows(l.items).filter((r) => r.food.id === 'b_mocha').map((r) => r.testID)).toEqual(['water-pick-yours-b_mocha', 'water-pick-b_mocha']);
    expect(new Set(l.items.map((i) => i.key)).size).toBe(l.items.length);
  });
});

describe('sheetList with a query: real local results', () => {
  const NOT_DRINKS = /steak|watermelon|soup|tuna|oatmeal|ice pop|mozzarella|spread|cake|croissant|bar|pudding|dark chocolate|milk chocolate|condensed|canned/i;

  it('never a food that is not a drink, for the eight queries', () => {
    for (const q of ['tea', 'cola', 'water', 'milk', 'soup', 'beer', 'monster', 'שוקו']) {
      const l = forQuery(q, { showAll: true });
      for (const r of rows(l.items)) {
        expect(drinkStatus(r.food), `${q}: ${r.food.name}`).not.toBe('not');
        expect(r.food.name, q).not.toMatch(NOT_DRINKS);
      }
      expect(l.hint, q).toBe(false);
    }
  });

  it('"tea": the five teas, three shown, then "Show all 5"; showAll shows the rest', () => {
    const l = forQuery('tea');
    expect(ids(l.items)).toEqual(['b_tea_brewed', 'b_tea_milk', 'b_tea_sugar']);
    expect(l.items[3]).toEqual({ type: 'more', key: 'more', testID: 'water-pick-more', text: 'Show all 5', label: 'Show all 5 drinks from the list', hidden: 2 });
    expect(l.exclude).toEqual(['b_tea_brewed', 'b_tea_milk', 'b_tea_sugar', 'b_tea_milk_sugar', 'b_iced_tea_sweet']);
    const all = forQuery('tea', { showAll: true });
    expect(ids(all.items)).toEqual(l.exclude);
    expect(all.items.some((i) => i.type === 'more')).toBe(false);
  });

  it('"cola": the colas only, never hot chocolate ("cola" is only inside "chocolate")', () => {
    const l = forQuery('cola', { showAll: true });
    expect(ids(l.items)).toEqual(['b_cola_diet', 'b_cola']);
    expect(l.exclude).toEqual(['b_cola_diet', 'b_cola']);
  });

  it('a match only inside a name word: left out when another hit starts a word, kept when none does', () => {
    expect(matchPlace({ food: B('b_hot_chocolate') }, 'cola')).toBe('inside');
    expect(matchPlace({ food: B('b_cola') }, 'cola')).toBe('start');
    expect(matchPlace({ food: B('b_hot_chocolate') }, 'choc')).toBe('start');
    // A Hebrew prefix on the query is not "inside" ("בקפה" for "קפה").
    expect(matchPlace({ food: B('b_coffee_black') }, 'בקפה')).toBe('start');
    expect(ids(forQuery('choc', { showAll: true }).items)).toEqual(['b_hot_chocolate', 'b_shoko']);
    expect(ids(forQuery('chocolate', { showAll: true }).items)).toEqual(['b_hot_chocolate', 'b_shoko']);
    // Only inside matches: the list stays as the search gave it.
    const inside = [{ food: B('b_hot_chocolate') }, { food: B('b_shoko') }];
    expect(localDrinkHits(inside, 'cola').map((h) => h.food.id)).toEqual(['b_hot_chocolate', 'b_shoko']);
    // A word-start match on a food that is not a drink does not remove the drinks.
    expect(localDrinkHits([{ food: own({ id: 'own-x', beverage: false, name: 'Cola chicken' }) }, ...inside], 'cola').map((h) => h.food.id)).toEqual(['b_hot_chocolate', 'b_shoko']);
  });

  it('the other queries list what they listed before the inside rule', () => {
    const was: Record<string, string> = {
      tea: 'b_tea_brewed b_tea_milk b_tea_sugar b_tea_milk_sugar b_iced_tea_sweet',
      milk: 'b_milk_whole b_milk_1pct b_milk_skim b_milk_2pct b_milkshake_vanilla b_oat_milk b_soy_milk b_almond_milk b_tea_milk b_coffee_milk b_tea_milk_sugar b_coffee_milk_sugar b_sachlab b_hot_chocolate b_latte b_cappuccino b_shoko',
      monster: 'b_energy_drink',
      water: 'b_coconut_water',
      juice: 'b_apple_juice b_grape_juice b_orange_juice b_tomato_juice b_cranberry_juice',
      coffee: 'b_coffee_black b_coffee_milk b_coffee_sugar b_coffee_milk_sugar b_turkish_coffee_sweet',
      mocha: 'b_mocha',
      קפה: 'b_coffee_black b_latte b_mocha b_coffee_milk b_coffee_sugar b_turkish_coffee_sweet b_coffee_milk_sugar',
      שוקו: 'b_shoko b_hot_chocolate',
    };
    for (const [q, list] of Object.entries(was)) expect(ids(forQuery(q, { showAll: true }).items).join(' '), q).toBe(list);
  });

  it('"water": coconut water only (no watermelon, no tuna in water)', () => {
    expect(ids(forQuery('water').items)).toEqual(['b_coconut_water']);
  });

  it('"milk": 17 drinks behind "Show all 17", the plain milks first', () => {
    const l = forQuery('milk');
    expect(ids(l.items)).toEqual(['b_milk_whole', 'b_milk_1pct', 'b_milk_skim']);
    expect(l.items.find((i) => i.type === 'more')).toMatchObject({ text: 'Show all 17' });
  });

  it('"soup" and "beer": their lines', () => {
    const soup = forQuery('soup');
    expect(rows(soup.items)).toEqual([]);
    expect(message(soup.items, 'water-pick-none')).toBe('No drink matches “soup”. Foods are added in the diary.');
    const beer = forQuery('beer');
    expect(rows(beer.items)).toEqual([]);
    expect(message(beer.items, 'water-pick-alcohol')).toBe(ALCOHOL_LINE);
    expect(message(beer.items, 'water-pick-none')).toBeUndefined();
    expect(message(forQuery('vodka').items, 'water-pick-alcohol')).toBe(ALCOHOL_LINE);
    // Nothing found at all, without product search: the words from before.
    expect(message(forQuery('zzqx', { onlineAvailable: false }).items, 'water-pick-none')).toBe('No drink matches “zzqx”. Try another word, or enter the calories above.');
    // One character: no online search follows, so the words from before.
    expect(message(sheetList(base({ query: 'q', local: [] })).items, 'water-pick-none')).toBe('No drink matches “q”. Try another word, or enter the calories above.');
    // With online products to follow: only the fact, no "enter the calories above".
    expect(message(forQuery('zzqx').items, 'water-pick-none')).toBe('No drink in the list matches “zzqx”.');
    expect(message(forQuery('zzqx', { online: { query: 'zzqx', status: 'unavailable', items: [] } }).items, 'water-pick-none')).toBe('No drink matches “zzqx”. Try another word, or enter the calories above.');
    // The foods-only and alcohol lines stay, online or not.
    expect(message(forQuery('soup', { onlineAvailable: false }).items, 'water-pick-none')).toBe('No drink matches “soup”. Foods are added in the diary.');
    expect(message(forQuery('beer', { onlineAvailable: false }).items, 'water-pick-alcohol')).toBe(ALCOHOL_LINE);
  });

  it('"monster": the bundled energy drink (its search names say monster)', () => {
    expect(ids(forQuery('monster').items)).toEqual(['b_energy_drink']);
  });

  it('"שוקו": shoko and hot chocolate, with the Hebrew name the query found, isolated', () => {
    const l = forQuery('שוקו');
    expect(ids(l.items)).toEqual(['b_shoko', 'b_hot_chocolate']);
    const shoko = rows(l.items)[0];
    expect(shoko.matched).toBeDefined();
    expect(shoko.matched!.startsWith('‎⁨')).toBe(true);
    expect(shoko.matchedTestID).toBe('water-pick-b_shoko-matched');
    expect(shoko.label).not.toMatch(/[‎⁨⁩]/);
  });

  it('drinks before maybes, each in the search order; one per id', () => {
    const maybe = own();
    const hits = [{ food: maybe }, { food: B('b_lentil_soup') ?? B('b_milk_chocolate') }, { food: B('b_lemonade') }, { food: B('b_lemonade') }, { food: B('b_beer') }, { food: own({ id: 'own-2', beverage: true, name: 'Lemon water' }) }];
    expect(localDrinkHits(hits).map((h) => h.food.id)).toEqual(['b_lemonade', 'own-2', 'own-lemonade']);
  });

  it('while the list lags behind the typing, no "no match" line', () => {
    const l = sheetList(base({ query: 'soupy', localQuery: 'sou', local: [] }));
    expect(l.items.filter((i) => i.type === 'message' && i.testID !== 'water-pick-online-empty')).toEqual([]);
  });

  it('one character: local only, no online section', () => {
    const l = forQuery('m');
    expect(l.searchOnline).toBe(false);
    expect(l.items.some((i) => i.type === 'heading')).toBe(false);
  });
});

describe('foods with no drink flag: offered only when the diary could count them', () => {
  const N = { protein: 3, carbs: 10, fat: 2 };
  /** A remembered product with no categories and no serving, as the checker found them offered. */
  const off = (id: string, name: string, kcal: number, servings: Food['servings'] = []): Food => ({ id, name, per100g: { kcal, ...N }, servings, source: 'openfoodfacts', verified: false });
  const pudding = off('off_pud', 'מעדן שוקולד', 79);
  const salad = off('off_sal', 'Greek salad', 90);
  const apple = off('off_app', 'Apple slices', 52);
  const bowl = own({ id: 'own-bowl', name: 'Green smoothie bowl', per100g: { kcal: 95, ...N }, servings: [{ label: '1 bowl', grams: 350 }] });
  const recents = [pudding, salad, apple, bowl];
  const sheet = (q: string, ctx: Parameters<typeof searchLocal>[1]) => sheetList(base({ query: q, local: searchLocal(q, ctx, 30), showAll: true }));

  it('drinkStatus: no serving with a volume of at least 100 ml is not a drink', () => {
    for (const f of recents) expect(drinkStatus(f), f.name).toBe('not');
    expect(drinkStatus(own({ servings: [{ label: '1 cup', grams: 240 }] }))).toBe('not'); // "cup" is never read for a food with no flag
    expect(drinkStatus(own({ servings: [{ label: '1 shot (50 ml)', grams: 50 }] }))).toBe('not'); // under 100 ml
    expect(drinkStatus(own({ servings: [{ label: '1 bottle (1,5 L)', grams: 300 }] }))).toBe('not'); // a label its grams do not agree with
    expect(drinkStatus(own({ servings: [{ label: '100 g', grams: 100 }, { label: '1 can (330 ml)', grams: 330 }] }))).toBe('maybe');
    expect(drinkStatus(own({ servings: [{ label: '1 bottle (16.9 fl oz)', grams: 500 }] }))).toBe('maybe');
    expect(drinkStatus(off('off_milk', 'חלב טרי', 60, [{ label: '1 serving (250 ml)', grams: 250 }]))).toBe('maybe');
  });

  it('the checker\'s four cases are not offered, and the sheet says foods are added in the diary', () => {
    const cases: [string, Food][] = [['salad', salad], ['apple', apple], ['שוקו', pudding], ['green', bowl]];
    for (const [q, food] of cases) {
      const l = sheet(q, { recentFoods: recents, customFoods: [bowl] });
      expect(ids(l.items), q).not.toContain(food.id);
      for (const r of rows(l.items)) expect(drinkStatus(r.food), `${q}: ${r.food.name}`).not.toBe('not');
    }
    for (const q of ['salad', 'green']) {
      const l = sheet(q, { recentFoods: recents, customFoods: [bowl] });
      expect(rows(l.items), q).toEqual([]);
      expect(message(l.items, 'water-pick-none'), q).toBe(`No drink matches “${q}”. Foods are added in the diary.`);
    }
    // "apple" and "שוקו" still list their bundled drinks, and nothing else.
    expect(ids(sheet('apple', { recentFoods: recents }).items)).toEqual(['b_apple_juice']);
    expect(ids(sheet('שוקו', { recentFoods: recents }).items)).toEqual(['b_shoko', 'b_hot_chocolate']);
  });

  it('an own drink with no flag and a "330 ml" serving is offered, after the flagged drinks', () => {
    const kombucha = own({ id: 'own-kombucha', name: 'Ginger kombucha', per100g: { kcal: 20, ...N }, servings: [{ label: '1 bottle (330 ml)', grams: 330 }] });
    const flagged = own({ id: 'own-kombucha-2', name: 'Kombucha light', per100g: { kcal: 10, ...N }, servings: [{ label: '1 g', grams: 1 }], beverage: true });
    expect(drinkStatus(kombucha)).toBe('maybe');
    const l = sheet('kombucha', { customFoods: [kombucha, flagged] });
    const got = ids(l.items);
    expect(got).toContain('own-kombucha');
    expect(got.indexOf('own-kombucha-2')).toBeGreaterThanOrEqual(0);
    expect(got.indexOf('own-kombucha-2')).toBeLessThan(got.indexOf('own-kombucha'));
  });

  it('"This is a drink" is offered whatever its serving; marked not a drink, never', () => {
    const marked = own({ id: 'own-marked', name: 'Morning tonic', servings: [{ label: '1 bowl', grams: 300 }], beverage: true });
    const notMarked = own({ id: 'own-not', name: 'Morning tonic mix', servings: [{ label: '1 glass (300 ml)', grams: 300 }], beverage: false });
    expect(drinkStatus(marked)).toBe('drink');
    expect(drinkStatus(notMarked)).toBe('not');
    const got = ids(sheet('tonic', { customFoods: [marked, notMarked] }).items);
    expect(got).toContain('own-marked');
    expect(got).not.toContain('own-not');
  });

  it('every list that offers drinks follows: online, "Your drinks" and the recent chips take only drinks', () => {
    expect(onlineDrinks([salad, apple, pudding, bowl])).toEqual([]);
    const entries = recents.map((f, i) => entry(f, `2026-11-2${i}T08:00:00.000Z`));
    expect(yourDrinks(entries, new Map([[bowl.id, bowl]]))).toEqual([]);
    expect(recentChips(yourDrinks(entries, new Map([[bowl.id, bowl]])), 250, 'metric', 320)).toEqual([]);
  });
});

describe('sheetList: the online section', () => {
  const answer = (query: string, status: OnlineAnswer['status'] = 'done', items: Food[] = answerFoods(query)): OnlineAnswer => ({ query, status, items });

  it('"Online products" with its caption after the local rows; its lines while searching, none, failed and without the backend', () => {
    const loading = forQuery('monster');
    expect(kinds(loading.items)).toEqual(['row:local', 'water-pick-online', 'water-pick-online-empty']);
    expect(loading.items[1]).toMatchObject({ text: 'Online products', caption: 'Community data from Open Food Facts' });
    expect(message(loading.items, 'water-pick-online-empty')).toBe('Searching Open Food Facts…');
    expect(loading.searchOnline).toBe(true);
    // An answer for another query is stale: still searching.
    expect(message(forQuery('monster', { online: answer('iced coffee') }).items, 'water-pick-online-empty')).toBe(ONLINE_WORDS.loading);
    expect(message(forQuery('monster', { online: { query: 'monster', status: 'loading', items: [] } }).items, 'water-pick-online-empty')).toBe(ONLINE_WORDS.loading);
    expect(message(forQuery('monster', { online: answer('monster', 'done', []) }).items, 'water-pick-online-empty')).toBe('No online drinks match that search.');
    expect(message(forQuery('monster', { online: answer('monster', 'failed', []) }).items, 'water-pick-online-empty')).toBe('Could not reach the online products. The drinks above still work.');
    // No local rows shown: nothing "above" to point to.
    expect(message(forQuery('zzqx', { online: answer('zzqx', 'failed', []) }).items, 'water-pick-online-empty')).toBe('Could not reach the online products.');
    expect(message(forQuery('soup', { online: answer('soup', 'failed', []) }).items, 'water-pick-online-empty')).toBe(ONLINE_FAILED_ALONE);
    expect(onlineLine('failed', true)).toBe(ONLINE_WORDS.failed);
    expect(onlineLine('none', false)).toBe(ONLINE_WORDS.none);
    expect(message(forQuery('monster', { online: answer('monster', 'unavailable', []) }).items, 'water-pick-online-empty')).toBe(ONLINE_WORDS.unavailable);
    expect(message(forQuery('monster', { onlineAvailable: false }).items, 'water-pick-online-empty')).toBe('Product search by name works in the phone app. Here, enter the calories above.');
  });

  it('only drinks, at most 12, none twice and none already listed locally, with brand and pack', () => {
    const l = forQuery('iced coffee', { online: answer('iced coffee') });
    const online = rows(l.items).filter((r) => r.section === 'online');
    expect(online.length).toBe(12);
    for (const r of online) {
      expect(drinkStatus(r.food)).toBe('drink');
      expect(r.testID).toBe(`water-pick-${r.food.id}`);
    }
    expect(online.map((r) => r.food.id)).not.toContain('off_0075355112586'); // 178 kcal per 100 ml
    const prew = online.find((r) => r.food.id === 'off_8850389301012')!;
    expect(prew.detail).toBe('Prew · 180 ml · 55 kcal per 250 ml · Community');
    expect(prew.label).toBe('Iced coffee, Prew · 180 ml · 55 kcal per 250 ml · Community');
    expect(online[0].divider).toBe(false); // first under its heading
    // Excluded: an online answer holding a food already listed locally.
    const withLocal = forQuery('monster', { online: answer('monster', 'done', [B('b_energy_drink'), P('5060896623368')]) });
    expect(ids(withLocal.items)).toEqual(['b_energy_drink', 'off_5060896623368']);
  });

  it('the online filter over real answers', () => {
    const got = (q: string) => onlineDrinks(answerFoods(q)).map((f) => f.id);
    expect(got('tomato soup')).toEqual([]);
    expect(got('olive oil')).toEqual([]);
    expect(got('instant coffee')).toEqual([]);
    expect(got('drinking yogurt')).toEqual([]); // no categories: maybe, never listed online
    expect(got('protein shake')).not.toContain('off_0000390204071'); // the powder
    expect(got('שוקו')).toEqual(['off_7290102398560']);
    expect(got('coca cola')).toContain('off_7290000284316'); // a 1.5 L bottle, listed with no pack
    expect(packVolume(P('7290000284316'), 'metric')).toBeNull();
    expect(onlineDrinks(answerFoods('iced coffee'), [], 3).length).toBe(3);
    expect(onlineDrinks(answerFoods('iced coffee'), ['off_8850389301012'])).not.toContainEqual(expect.objectContaining({ id: 'off_8850389301012' }));
  });

  it('"monster": an untagged product listed first no longer hides the tagged ones (the service keeps the one filed under beverages)', () => {
    const listed = onlineDrinks(answerFoods('monster'));
    expect(listed.filter((f) => /monster/i.test(f.name)).length).toBeGreaterThan(1);
    expect(listed.map((f) => f.id)).toEqual(['off_0070847000037', 'off_1007084703703']);
    expect(listed.every((f) => f.beverage === true)).toBe(true);
  });

  it('the stand-in backend\'s fixed answer for "iced coffee": five listed, the 178 kcal one and the instant coffee left out', () => {
    // The same seven products as scripts/dev/mock-backend.cjs FIXED_SEARCH_HITS, in its order.
    const codes = ['8850389301012', '9311336030069', '4000349860088', '0075355112586', '0041271004953', '0810688010389', '5449000298157'];
    const foods = rankOnline('iced coffee', codes.map(P));
    const kept = onlineDrinks(foods);
    expect(kept.map((f) => f.id)).toEqual(['off_8850389301012', 'off_4000349860088', 'off_9311336030069', 'off_0041271004953', 'off_5449000298157']);
    expect(kept.map((f) => pickDetail(f, 250, 'metric'))).toEqual([
      'Prew · 180 ml · 55 kcal per 250 ml · Community',
      'Jimmy · 98 kcal per 250 ml · Community',
      'Nippys · 500 ml · 160 kcal per 250 ml · Community',
      'International Delight · 115 kcal per 250 ml · Community',
      '0 kcal per 250 ml · Community',
    ]);
    const src = readFileSync(path.join(__dirname, '..', '..', '..', 'scripts', 'dev', 'mock-backend.cjs'), 'utf8');
    expect(src).toContain("const FIXED_SEARCH_QUERY = 'iced coffee';");
    for (const c of codes) expect(src).toContain(`code: '${c}'`);
    expect(src).toMatch(/quantity,categories_tags`/);
  });
});

describe('a row\'s second line', () => {
  it('pickCaption: no "taken as" for a food known to be a drink; still for one with no flag', () => {
    const bottle = P('5449000298157'); // 1.5 L: no pack serving
    expect(bottle.servings).toEqual([]);
    expect(pickCaption(bottle, 250, 'metric')).toBe('0 kcal per 250 ml · Community');
    expect(pickCaption(P('4000349860088'), 500, 'metric')).toBe('195 kcal per 500 ml · Community');
    expect(pickCaption(own({ servings: [] }), 250, 'metric')).toBe('45 kcal per 250 ml, taken as 250 g · Your food');
    expect(pickCaption(own({ servings: [], beverage: true }), 250, 'metric')).toBe('45 kcal per 250 ml · Your food');
  });

  it('brand and pack for an online product only; the brand left out when the name says it; units', () => {
    expect(brandAndPack(P('5060896623368'), 'metric')).toBe('500 ml'); // "Monster" by Monster
    expect(brandAndPack(P('57045399'), 'metric')).toBe('500 ml'); // "Coca-Cola" by "coca cola"
    expect(brandAndPack(P('9311336030069'), 'metric')).toBe('Nippys · 500 ml');
    expect(brandAndPack(P('9311336030069'), 'imperial')).toBe('Nippys · 17 fl oz');
    expect(brandAndPack(P('5060639127580'), 'metric')).toBe(''); // a multipack has no pack serving
    expect(packVolume(P('1007084703703'), 'metric')).toBe('473 ml');
    expect(brandAndPack(own({ brand: 'Mine' }), 'metric')).toBe('');
    expect(brandAndPack(B('b_cola'), 'metric')).toBe('');
    // A Hebrew brand is isolated when drawn and raw for a screen reader.
    const tara = P('7290102398560');
    expect(brandAndPack(tara, 'metric')).toBe('‎⁨טרה⁩');
    expect(pickDetail(tara, 250, 'metric', false)).toBe('טרה · 115 kcal per 250 ml · Community');
  });
});

// ---------------------------------------------------------------- picking

describe('placePick', () => {
  const sel = (id: string) => selectChoice(choiceById(id)!);

  it('a bundled drink goes to its own kind: a fixed choice selects that chip, any other is the kind\'s picked food', () => {
    expect(placePick(B('b_latte'), null)).toEqual({ kind: 'coffee', selected: sel('latte') });
    expect(placePick(B('b_cola'), null)).toEqual({ kind: 'other', selected: sel('soft_regular') });
    expect(placePick(B('b_mocha'), null)).toEqual({ kind: 'coffee', selected: selectFood(B('b_mocha')) });
    expect(placePick(B('b_smoothie_fruit'), null)).toEqual({ kind: 'other', selected: selectFood(B('b_smoothie_fruit')) });
    expect(placePick(B('b_milk_whole'), null)).toEqual({ kind: 'milk', selected: sel('milk_whole') });
    expect(placePick(B('b_coffee_black'), null)).toEqual({ kind: 'coffee', selected: sel('coffee_black') });
    expect(placePick(B('b_tea_brewed'), 'other')).toEqual({ kind: 'tea', selected: sel('tea_plain') });
    // From "Other juice", a latte still goes to Coffee (never logged as juice).
    expect(placePick(B('b_latte'), 'juice')).toEqual({ kind: 'coffee', selected: sel('latte') });
    expect(placePick(B('b_grape_juice'), 'juice')).toEqual({ kind: 'juice', selected: selectFood(B('b_grape_juice')) });
  });

  it('an online product or an own drink: where the sheet was opened from, else Other', () => {
    const monster = P('5060896623368');
    expect(placePick(monster, null)).toEqual({ kind: 'other', selected: selectFood(monster) });
    expect(placePick(monster, 'other')).toEqual({ kind: 'other', selected: selectFood(monster) });
    expect(placePick(monster, 'juice')).toEqual({ kind: 'juice', selected: selectFood(monster) });
    const kombucha = own({ id: 'own-k', name: 'Kombucha', beverage: true });
    expect(placePick(kombucha, null)).toEqual({ kind: 'other', selected: selectFood(kombucha) });
    // An online iced coffee is never guessed to be Coffee from its name.
    expect(placePick(P('8850389301012'), null).kind).toBe('other');
  });

  it('a bottled water selects the Water kind and nothing else', () => {
    const bottled = { ...P('5449000298157'), id: 'off_water', name: 'Natural mineral water', per100g: { kcal: 0, protein: 0, carbs: 0, fat: 0 } };
    expect(placePick(bottled, null)).toEqual({ kind: 'water', selected: null });
    expect(placePick(bottled, 'juice')).toEqual({ kind: 'water', selected: null });
  });

  it('every bundled drink lands on a kind that can hold it', () => {
    for (const f of sheetDrinks()) {
      const p = placePick(f, null);
      expect(p.selected, f.id).not.toBeNull();
      expect(canPick(p.kind) || p.selected!.id !== 'food', f.id).toBe(true);
    }
  });
});

describe('a pick is the selected drink on return, under every kind but Water', () => {
  const resolveAll = (f: Food) => f;
  it('canPick: every kind except Water; PICK_CHIP still opens the sheet from Juice and Other only', () => {
    for (const k of ['tea', 'coffee', 'juice', 'milk', 'sports', 'other'] as Beverage[]) expect(canPick(k), k).toBe(true);
    expect(canPick('water')).toBe(false);
    expect(Object.keys(PICK_CHIP).sort()).toEqual(['juice', 'other']);
  });

  it('coffee, tea, milk and sports keep their pick after remember and rememberedChoice, and show its chip', () => {
    const cases: [Beverage, Food][] = [
      ['coffee', B('b_mocha')],
      ['tea', B('b_iced_tea_sweet')],
      ['milk', B('b_shoko')],
      ['sports', P('5902198160403')],
    ];
    for (const [kind, food] of cases) {
      const memory = remember({}, kind, selectFood(food));
      const selected = rememberedChoice(memory, kind, resolveAll);
      expect(selected, kind).toEqual({ id: 'food', food });
      expect(pickedFood(selected, memory, kind, resolveAll), kind).toBe(food);
      // While another chip is selected on screen, the picked chip stays offered (one memory per kind, as before).
      expect(pickedFood(selectChoice(DRINK_CHOICES.find((c) => c.kind === kind && c.isDefault)!), memory, kind, resolveAll), kind).toBe(food);
    }
  });

  it('every bundled drink placed by placePick is selected again on return (the ten that fell back before included)', () => {
    for (const f of sheetDrinks()) {
      const { kind, selected } = placePick(f, null);
      const memory = remember({}, kind, selected!);
      expect(rememberedChoice(memory, kind, resolveAll), f.id).toEqual(selected);
    }
  });

  it('Water holds nothing', () => {
    expect(rememberedChoice({ water: { id: 'food', food: B('b_mocha') } }, 'water', resolveAll)).toBeNull();
    expect(pickedFood(selectFood(B('b_mocha')), {}, 'water')).toBeNull();
  });
});

// ---------------------------------------------------------------- the recent chips

describe('recentChips (the Water kind)', () => {
  it('up to 3 on one line, each a pick, with its spoken label', () => {
    const yours = [B('b_mocha'), B('b_shoko'), B('b_kefir'), B('b_lemonade')];
    const chips = recentChips(yours, 250, 'metric', 1000);
    expect(chips.map((c) => c.testID)).toEqual(['water-recent-b_mocha', 'water-recent-b_shoko', 'water-recent-b_kefir']);
    expect(chips[0].label).toBe('Cafe mocha, whole milk, 188 kcal per 250 ml, choose');
    expect(chips[0].text).toBe('Cafe mocha, whole milk');
    expect(recentChips(yours, 236.588, 'imperial', 1000)[0].label).toBe('Cafe mocha, whole milk, 178 kcal per 8 fl oz, choose');
  });

  it('a chip that does not fit is left out, the next one tried; none without your drinks', () => {
    const long = { ...B('b_mocha'), id: 'x-long', name: 'A very long drink name that runs on and on' };
    const chips = recentChips([B('b_kefir'), long, B('b_lemonade')], 250, 'metric', 250, 140);
    // Kefir (186 px, capped at 140) and Lemonade (87 px) fit in 250 with an 8 px gap; the long one (capped at 140) does not after kefir.
    expect(chips.map((c) => c.food.id)).toEqual(['b_kefir', 'b_lemonade']);
    const used = chips.reduce((s, c) => s + c.width, 0) + 8 * (chips.length - 1);
    expect(used).toBeLessThanOrEqual(250);
    expect(recentChips([], 250, 'metric', 320)).toEqual([]);
  });
});

// ---------------------------------------------------------------- words

describe('words', () => {
  it('the toast: unchanged when the kind stays, names the kind when it changed, and a water', () => {
    const mocha = B('b_mocha');
    expect(pickToast(mocha, placePick(mocha, null), 'coffee')).toBe('Cafe mocha, whole milk chosen. Tap a glass to add it.');
    expect(pickToast(mocha, placePick(mocha, null), 'water')).toBe('Cafe mocha, whole milk chosen, under Coffee. Tap a glass to add it.');
    const e = B('b_energy_drink');
    expect(pickToast(e, placePick(e, null), 'water')).toBe('Energy drink, sugared chosen, under Other. Tap a glass to add it.');
    expect(pickToast(B('b_sports_drink_low'), placePick(B('b_sports_drink_low'), null), 'tea')).toBe('Sports drink, low calorie chosen, under Sports drink. Tap a glass to add it.');
    expect(pickToast({ name: 'Mineral water' }, { kind: 'water', selected: null }, 'juice')).toBe(WATER_CHOSEN);
    expect(WATER_CHOSEN).toBe('Water chosen. Tap a glass to add it.');
    const he = P('7290102398560');
    expect(pickToast(he, placePick(he, null), 'water')).toBe('‎⁨שוקו⁩ chosen, under Other. Tap a glass to add it.');
  });

  it('no exclamation marks, no "should", "failed" or "bad", sentence case', () => {
    const words = [
      ...Object.values(ONLINE_WORDS),
      ALCOHOL_LINE,
      foodsOnlyLine('soup'),
      noMatchLine('x'),
      noMatchLine('x', true),
      ONLINE_FAILED_ALONE,
      WATER_CHOSEN,
      'Your drinks',
      'All drinks',
      'Online products',
      'Community data from Open Food Facts',
      'Show all 5',
      pickToast(B('b_mocha'), placePick(B('b_mocha'), null), 'water'),
    ];
    for (const w of words) {
      expect(w, w).not.toMatch(/!/);
      expect(w, w).not.toMatch(/\bshould\b|\bfailed\b|\bbad\b|\bcheat/i);
      expect(w[0], w).toBe(w[0].toUpperCase());
    }
  });
});
