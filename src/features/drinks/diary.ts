/**
 * A drink logged as food in the diary also adds its volume to Water: the pure rules (no React, no
 * store), tested in diary.test.ts. The mirror of the water screen's drinks (./rules.ts, `planDrink`).
 *
 * One act, two effects, said once: the diary entry gets the calories, a water record gets the volume,
 * the one toast says both (`withWater`) and its Undo takes both back. The place a drink was logged
 * leads: this water lives and dies with its diary entry.
 *
 * - Which entries count: `diaryDrink` (null for everything else). It is asked BEFORE the entry exists
 *   (food detail's "Also adds 500 ml to Water.", following the amount) and when the entry is written
 *   (logFood for a new entry and logItems, the only two places that create this water). Its input is
 *   the entry-to-be: a food, the serving's label, the quantity, the total grams, and the entry's
 *   `via` and `source`.
 * - The record: `diaryWaterRecord` (id `waterIdFromEntry(entry.id)`, `fromEntryId`, the entry's day and
 *   moment), written in one act with its entry by the store's `upsertEntriesWithWater`.
 * - An edit recomputes the volume from the edited entry (`diaryDrinkMl`: floor 1 ml, cap 10,000 ml,
 *   never by scaling the old volume), and the water takes the entry's day, future days included;
 *   applied by followEntry in ./pair.ts, only when the amount, the serving or the day changed
 *   (`entryEditMovesWater`): a meal-only change leaves the water record untouched. The minimums apply
 *   at creation only.
 * - The record stores the poured volume; the day's total adds `effectiveMl(ml, kind)` like every
 *   other water record (coffee, milk and other 90%, juice 95%), and the words name the poured volume.
 * - Accepted: the same 240 g latte is 237 ml by its label ("1 cup (8 fl oz)") and 240 ml by its
 *   weight (a "1 g" serving, as a swapped AI row is, where a density within 3% of 1 is taken as 1).
 * - Delete and restore: the store's cascade (src/store/index.ts). Nothing here writes.
 */
import { MEAL_LABEL } from '@/lib/nutrition';
import { formatVolume } from '@/lib/units';
import type { Beverage, Food, FoodEntry, FoodSource, Profile, UnitSystem, WaterEntry } from '@/types';

import { PICKED, DRINK_CHOICES } from './choices';
import { gramsPerMl, isAlcohol, isBundledDrink, plausibleDensity, readLabelMl } from './rules';
import { waterIdFromEntry } from './via';

export { waterIdFromEntry } from './via';

/** One water record holds at most this (the backup validator's limit); the entry itself may hold more. */
export const DIARY_WATER_MAX_ML = 10000;
/** The smallest volume that adds water when a known drink is logged (one espresso, 30 ml, counts). */
export const KNOWN_DRINK_MIN_ML = 30;
/** The smallest volume for a food known only by a volume in its serving's label. */
export const LABEL_DRINK_MIN_ML = 100;
/** A food that is not bundled is a drink only at or under this many kcal per 100 ml (oil, cream, syrups and powders are far above). */
export const MAX_KCAL_PER_100ML = 150;
/** A density this close to 1 g per ml is taken as 1: a 500 g carton is 500 ml, not 493. */
const NEAR_ONE = 0.03;
/** kcal per 100 g at or under which a non-bundled drink named as water counts as kind 'water'. */
const WATER_KCAL_LINE = 2;

/** What a diary entry (or the entry about to be written) is, as far as this rule needs. */
export interface DiaryDrinkInput {
  /** The food behind the entry; none (a quick add) never counts. */
  food?: Food | null;
  /** The serving being logged ("1 can (500 ml)", "1 g" for an AI row swapped to a food). */
  servingLabel: string;
  quantity: number;
  /** The total grams logged (serving grams times quantity). */
  grams: number;
  /** 'water': written by the water screen, never counted again. */
  via?: 'water';
  /** The entry's source ('ai' for an unswapped estimate). */
  source?: FoodSource;
}

/** The water a diary drink adds: the poured volume (whole ml, at most 10,000), its kind and `drink` (a DRINK_CHOICES id, or 'food'). */
export interface DiaryDrink {
  ml: number;
  beverage: Beverage;
  drink: string;
}

// ---------------------------------------------------------------- what is a drink

/** Words that make a food with no drink flag not a drink, whatever its serving says (soups, sauces, oils, creams). */
const NOT_DRINK_WORDS = /\b(soups?|broths?|stocks?|bouillon|passata|sauces?|dressings?|syrups?|oils?|ice cream|creams?)\b/i;
const HE = '\u05D0-\u05EA';
/** Hebrew: מרק, רוטב, ציר as whole words (one prefix letter allowed, and a plural). */
const NOT_DRINK_WORDS_HE = new RegExp(`(?:^|[^${HE}])[הובלמשכ]?(?:מרק|רוטב|ציר)(?:ים|י|ות)?(?=$|[^${HE}])`);

/** Bundled kinds, by id (never guessed from a name). */
const KIND_BY_ID: ReadonlyMap<string, Beverage> = new Map<string, Beverage>([
  ...(['b_coffee_black', 'b_espresso', 'b_latte', 'b_cappuccino', 'b_mocha', 'b_coffee_milk', 'b_coffee_milk_sugar', 'b_coffee_sugar', 'b_turkish_coffee_sweet'].map((id) => [id, 'coffee']) as [string, Beverage][]),
  ...(['b_tea_brewed', 'b_tea_milk', 'b_tea_milk_sugar', 'b_tea_sugar', 'b_iced_tea_sweet'].map((id) => [id, 'tea']) as [string, Beverage][]),
  ...(['b_orange_juice', 'b_apple_juice', 'b_grape_juice', 'b_cranberry_juice', 'b_tomato_juice'].map((id) => [id, 'juice']) as [string, Beverage][]),
  ...([
    'b_milk_whole',
    'b_milk_2pct',
    'b_milk_skim',
    'b_milk_1pct',
    'b_almond_milk',
    'b_soy_milk',
    'b_oat_milk',
    'b_shoko',
    'b_kefir',
    'b_buttermilk',
    'b_hot_chocolate',
    'b_sachlab',
  ].map((id) => [id, 'milk']) as [string, Beverage][]),
  ...(['b_sports_drink', 'b_sports_drink_low'].map((id) => [id, 'sports']) as [string, Beverage][]),
]);

/** Every bundled id the kind table names (checked against the bundled foods in diary.test.ts). */
export const KIND_IDS: readonly string[] = [...KIND_BY_ID.keys()];

const WATER_NAME = /\b(water|mineral|sparkling|seltzer|soda water)\b/i;

/** Whether a food is one of the bundled foods (its rule is the list in `isBundledDrink`, never `beverage`). */
export function isBundled(food: Pick<Food, 'source'>): boolean {
  return food.source === 'builtin';
}

/**
 * The kind of water a drink adds: by id for a bundled food (coffee, tea, juice, milk, sports, else
 * other); for any other food 'water' when it has at most 2 kcal per 100 g and its name says water,
 * mineral, sparkling, seltzer or soda water, else 'other'.
 */
export function drinkKind(food: Pick<Food, 'id' | 'name' | 'source' | 'per100g'>): Beverage {
  if (isBundled(food)) return KIND_BY_ID.get(food.id) ?? 'other';
  if (food.per100g.kcal <= WATER_KCAL_LINE && WATER_NAME.test(food.name)) return 'water';
  return 'other';
}

/** `drink` on the record: the DRINK_CHOICES id whose food (or reference food) this is, else 'food'. */
export function drinkChoiceId(food: Pick<Food, 'id'>): string {
  return DRINK_CHOICES.find((c) => c.foodId === food.id || c.refId === food.id)?.id ?? PICKED;
}

/** kcal in 100 ml of a food: per 100 g times its grams per ml (1 when no serving names a volume). */
export function kcalPer100ml(food: Pick<Food, 'servings' | 'per100g'>): number {
  return food.per100g.kcal * gramsPerMl(food).gPerMl;
}

/** Whether a name says it is not a drink (soup, broth, sauce, syrup, oil, cream; מרק, רוטב, ציר). */
export function notADrinkByName(name: string): boolean {
  return NOT_DRINK_WORDS.test(name) || NOT_DRINK_WORDS_HE.test(name);
}

/** What a food is as a drink: 'drink' (known), 'maybe' (not known either way) or 'not'. */
export type DrinkStatus = 'drink' | 'maybe' | 'not';

/**
 * The one answer to "is this food a drink", for the diary (`diaryDrink`) and the water screen's drink
 * sheet (./pick.ts) alike. Pure; it looks at the food only, never at an amount.
 * - 'not': alcohol (`isAlcohol`), an AI estimate (source 'ai'), a recipe logged as one line (id
 *   `meal_...`), a bundled food that is not `isBundledDrink`, `beverage === false`, a food with no
 *   flag whose name says soup, sauce, oil, cream and the like (`notADrinkByName`), or any food that is
 *   not bundled above 150 kcal per 100 ml (`kcalPer100ml`: powders and wrong data).
 * - 'drink': a bundled drink, or `beverage === true`.
 * - 'maybe': an own food or a remembered product with no flag, not refused above, that has a serving
 *   the diary would count by its label (`countsByLabel`: ml, cl, L or fl oz, never "cup", at least
 *   100 ml); with no such serving it is 'not' (a salad, apple slices, a pudding).
 */
export function drinkStatus(food: Food): DrinkStatus {
  const status = foodStatus(food);
  if (status !== 'maybe') return status;
  return food.servings.some(countsByLabel) ? 'maybe' : 'not';
}

/**
 * `drinkStatus` before the serving test: what the food itself says (its source, id, name, flag and
 * calories). `diaryDrink` asks this, because the diary judges a food with no flag by the serving
 * actually logged (the entry's label, at least 100 ml), which is the same test `countsByLabel` runs
 * over the food's own servings.
 */
function foodStatus(food: Food): DrinkStatus {
  if (food.source === 'ai') return 'not';
  if (food.id.startsWith('meal_')) return 'not';
  if (isAlcohol(food)) return 'not';
  if (isBundled(food)) return isBundledDrink(food) ? 'drink' : 'not';
  if (food.beverage === false) return 'not';
  if (food.beverage !== true && notADrinkByName(food.name)) return 'not';
  if (kcalPer100ml(food) > MAX_KCAL_PER_100ML) return 'not';
  return food.beverage === true ? 'drink' : 'maybe';
}

/**
 * Whether one serving of a food with no drink flag could count as a drink in the diary: the diary's own
 * label test (`labelVolume`: a volume in ml, cl, L or fl oz, never "cup", that agrees with its grams)
 * for one serving, at least `LABEL_DRINK_MIN_ML`. A food with no such serving is 'not' (a salad, a
 * pudding, apple slices), so the sheet never offers what the diary would never count.
 */
function countsByLabel(s: Food['servings'][number]): boolean {
  const ml = labelVolume({ servingLabel: s.label, quantity: 1, grams: s.grams }, false);
  return ml !== null && Math.round(ml) >= LABEL_DRINK_MIN_ML;
}

// ---------------------------------------------------------------- the volume

/**
 * The volume logged by the serving's label, or null: the label's volume times the quantity, when the
 * label names one (ml, cl, L, fl oz; "cup" only for bundled foods) and that volume agrees with the
 * serving's grams (0.8 to 1.3 g per ml: "1,5 L" misread as 5 L is not believed).
 */
function labelVolume(entry: Pick<DiaryDrinkInput, 'servingLabel' | 'quantity' | 'grams'>, cups: boolean): number | null {
  const perServing = readLabelMl(entry.servingLabel, cups);
  if (!perServing || !(perServing > 0) || !(entry.quantity > 0)) return null;
  const servingGrams = entry.grams / entry.quantity;
  if (servingGrams > 0 && !plausibleDensity(servingGrams, perServing)) return null;
  return perServing * entry.quantity;
}

/**
 * Grams per ml for the grams route: the first serving whose label names a volume its grams agree
 * with (0.8 to 1.3 g per ml), else 1. Unlike `gramsPerMl`, a misread label ("1,5 L" over 300 g) is
 * skipped, not clamped, so it cannot bend the volume of every other amount of that food. It reads
 * "cup" on every food, own and online ones too (where the label route does not): an own drink with a
 * "1 cup" serving of 244 g logs 237 ml. Accepted: 237 ml is the real volume of a cup.
 */
function drinkDensity(food: Pick<Food, 'servings'>): number {
  for (const s of food.servings) {
    const ml = readLabelMl(s.label, true);
    if (ml && plausibleDensity(s.grams, ml)) return s.grams / ml;
  }
  return 1;
}

/** The volume from the grams: grams divided by the food's grams per ml, or the grams themselves when that is within 3% of 1. */
function gramsVolume(grams: number, food: Pick<Food, 'servings'> | null | undefined): number | null {
  if (!(grams > 0)) return null;
  const g = food ? drinkDensity(food) : 1;
  return Math.abs(g - 1) <= NEAR_ONE ? grams : grams / g;
}

const clampMl = (ml: number) => Math.min(DIARY_WATER_MAX_ML, Math.max(1, Math.round(ml)));

/**
 * The volume a paired diary entry holds now, for an edit: by its label (as above), else by its grams;
 * floor 1 ml, cap 10,000 ml. Never scaled from the water's old volume, so an entry an older app left
 * out of step heals on its next edit here. Null only for an entry with neither (no grams, no volume).
 */
export function diaryDrinkMl(entry: Pick<DiaryDrinkInput, 'food' | 'servingLabel' | 'quantity' | 'grams'>): number | null {
  const bundled = !!entry.food && isBundled(entry.food);
  const ml = labelVolume(entry, bundled) ?? gramsVolume(entry.grams, entry.food);
  return ml === null ? null : clampMl(ml);
}

/** What of a diary entry its water follows: the amount (quantity and grams), the serving and the day. */
export type EntryWaterFields = Pick<FoodEntry, 'quantity' | 'grams' | 'servingLabel' | 'date'>;

/**
 * Whether an edit from `before` to `after` changes what the entry's water holds: the amount, the
 * serving or the day. False for a change of the meal, the name or the calories alone, which leaves
 * the water record as it is (its words come from the entry, not from the record), so such an edit
 * never stamps the water again. A field missing on either side counts as changed.
 */
export function entryEditMovesWater(before: Partial<EntryWaterFields>, after: Partial<EntryWaterFields>): boolean {
  const keys: (keyof EntryWaterFields)[] = ['quantity', 'grams', 'servingLabel', 'date'];
  return keys.some((k) => before[k] === undefined || before[k] !== after[k]);
}

// ---------------------------------------------------------------- the rule

/**
 * The water a diary entry (or the entry about to be written) adds, or null. Null unless all hold:
 * a. the switch is on (`profile.diaryDrinksInWater !== false`);
 * b. there is a food; it is not an unswapped AI estimate (source 'ai'), not a recipe logged as one line
 *    (food id `meal_...`), and the entry is not itself from Water (`via: 'water'`);
 * c. it is not alcohol (`isAlcohol`);
 * d. it is a drink: a bundled food by `isBundledDrink`; any other food by `beverage` (true: a drink,
 *    false: never), and with `beverage` absent only when its serving names a volume (not "cup") and the
 *    name says nothing of soup, broth, sauce, syrup, oil or cream; every non-bundled food at most 150
 *    kcal per 100 ml;
 * e. the volume (`labelVolume`, else for a known drink the grams) is at least 30 ml for a known drink
 *    (bundled or `beverage` true) and 100 ml for one known only by its label. The record holds at most
 *    10,000 ml.
 */
export function diaryDrink(entry: DiaryDrinkInput, profile: Pick<Profile, 'diaryDrinksInWater'> | null | undefined): DiaryDrink | null {
  if (profile?.diaryDrinksInWater === false) return null;
  const food = entry.food;
  if (!food) return null;
  if (entry.via === 'water') return null;
  if (entry.source === 'ai') return null;
  // b to d for the food itself: one rule with the water screen's drink sheet (whose extra serving
  // test is e below, applied here to the serving actually logged).
  const status = foodStatus(food);
  if (status === 'not') return null;
  const known = status === 'drink';
  const bundled = isBundled(food);

  const fromLabel = labelVolume(entry, bundled);
  const ml = fromLabel ?? (known ? gramsVolume(entry.grams, food) : null);
  if (ml === null) return null;
  const rounded = Math.round(ml);
  if (rounded < (known ? KNOWN_DRINK_MIN_ML : LABEL_DRINK_MIN_ML)) return null;
  return { ml: Math.min(DIARY_WATER_MAX_ML, rounded), beverage: drinkKind(food), drink: drinkChoiceId(food) };
}

/** The fields of the water record a diary drink adds, without the store's own (`updatedAt`, `deleted`). */
export type DiaryWater = Omit<WaterEntry, 'updatedAt' | 'deleted'> & { id: string; fromEntryId: string };

/**
 * The water record for a written entry: `{ id: waterIdFromEntry(entry.id), date: entry.date, ml,
 * beverage, drink, loggedAt: entry.loggedAt, fromEntryId: entry.id }`. A future day is allowed (it
 * counts when that day comes, like the entry's planned calories).
 */
export function diaryWaterRecord(entry: Pick<FoodEntry, 'id' | 'date' | 'loggedAt'>, drink: DiaryDrink): DiaryWater {
  return {
    id: waterIdFromEntry(entry.id),
    date: entry.date,
    ml: clampMl(drink.ml),
    beverage: drink.beverage,
    drink: drink.drink,
    loggedAt: entry.loggedAt,
    fromEntryId: entry.id,
  };
}

// ---------------------------------------------------------------- words

/**
 * A log's toast with the water it added, said once. Zero ml (or none) adds nothing. After "Added to
 * <meal>" (one food): "Added to lunch and 500 ml to Water", or ", and ..." when the message already
 * has a comma ("Added to breakfast, Sat Nov 14, and 16.9 fl oz to Water"). After any other message
 * (several items, a saved meal, a copy, the reminder's Repeat): "3 items added to lunch, 750 ml to
 * Water". Used by logFood, logItems and copyEntries (which sums the water of every meal it copied).
 */
export function withWater(message: string, ml: number | null | undefined, units: UnitSystem): string {
  if (!ml || !(ml > 0)) return message;
  const vol = formatVolume(Math.round(ml), units);
  if (message.startsWith('Added to ')) return `${message}${message.includes(',') ? ', and' : ' and'} ${vol} to Water`;
  return `${message}, ${vol} to Water`;
}

/** `detail-water-adds`, under the amount before Add: "Also adds 500 ml to Water." Null for a non-drink (or the switch off). */
export function detailWaterAdds(drink: Pick<DiaryDrink, 'ml'> | null, units: UnitSystem): string | null {
  return drink && drink.ml > 0 ? `Also adds ${formatVolume(drink.ml, units)} to Water.` : null;
}

/**
 * The Water row's caption line for a drink logged in the diary: "Energy drink, sugared · from lunch"
 * (no kcal: "129 kcal in breakfast" is the shape of a drink logged on Water). The name is as given: the
 * screen draws it isolated (`{ ...entry, name: isolateRtl(entry.name) }`) as it does for waterRowCaption.
 */
export function diaryWaterCaption(entry: Pick<FoodEntry, 'name' | 'meal'>): string {
  return `${entry.name} · from ${MEAL_LABEL[entry.meal].toLowerCase()}`;
}

/** The Water row's open label for a drink from the diary: "473 ml drink, Energy drink, sugared, from lunch. Edit in diary" (raw name). */
export function diaryWaterOpenLabel(title: string, entry: Pick<FoodEntry, 'name' | 'meal'>): string {
  return `${title}, ${entry.name}, from ${MEAL_LABEL[entry.meal].toLowerCase()}. Edit in diary`;
}

/**
 * The Water row's delete label: "Delete 473 ml, 12:40" as always (`when` is the row's own time line),
 * and for a drink from the diary whose entry is live: "Delete 473 ml, 12:40. The drink stays in lunch".
 */
export function waterDeleteLabel(water: Pick<WaterEntry, 'ml'>, when: string, units: UnitSystem, fromDiary?: Pick<FoodEntry, 'meal'> | null): string {
  const base = `Delete ${formatVolume(water.ml, units)}, ${when}`;
  return fromDiary ? `${base}. The drink stays in ${MEAL_LABEL[fromDiary.meal].toLowerCase()}` : base;
}
