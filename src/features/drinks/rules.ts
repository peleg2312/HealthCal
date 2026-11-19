/**
 * Drinks with calories on the water screen: the pure rules (no React, no store), tested in
 * rules.test.ts. One act, two effects: a drink whose choice has a food writes a water record (the
 * water) and a diary entry (the calories) that belong together; `planDrink` returns the whole log
 * as data, words included, and `logDrink` (@/features/food/log) writes it.
 *
 * - Calories are the reference food's per 100 g times the drink's grams: ml times `gramsPerMl`, read
 *   from the food's first serving that names a volume (ml, then fl oz, then cup). Never a guess the
 *   person cannot see: the screen shows `plan.line` and `plan.tile` before the tap.
 * - The meal is `drinkMeal(now)`: mealForTime at the moment of the log, for today and a back-filled
 *   day alike. The words name the day when it is not today (mealOnDay).
 * - The one link is the water record's `foodEntryId`; the entry carries `via: 'water'` (origin only,
 *   never used to find the partner: `waterPointingAt` scans the water records).
 * - Deleting on Water removes both (the store's cascade, one stamp); deleting in the diary removes the
 *   calories and keeps the water; an edit of the entry's amount or day moves the water record
 *   (`waterForEntryEdit`, applied by followEntry in ./pair.ts).
 * - Nothing is linked silently: a same food already in the diary within 3 h (`sameDrinkInDiary`) is
 *   shown before the tap (`noticeLine`) with a "Water only" chip, off by default.
 * - Alcohol stays out of the water screen (`isAlcohol`, by id and by name).
 * - A paired entry stays true to its water: no edit moves it to a future day or past 10,000 ml of
 *   the drink (`pairEditProblem`, said beside the control in food detail, refused with the reason
 *   by every write path).
 * - Calories left without their drink are accepted when they cannot be prevented, and stay visible
 *   (an ordinary diary row, without "also in Water"), counted and deletable; `via` stays 'water', so
 *   they are still not "food logged". Two ways in: an app from before this change deletes the water
 *   record only; and two phones race, one deleting on Water while the other deletes the entry in
 *   the diary and taps Undo (restore('foodEntries') never touches water, so the entry's newer stamp
 *   wins). Tested in pair.test.ts, "two phones".
 *
 * The mirror, a drink logged as food in the diary (./diary.ts, `diaryDrink`): its water record carries
 * `fromEntryId` (never `foodEntryId`) and the id `waterIdFromEntry(entry.id)`, so no path on any phone
 * makes two. The diary entry leads: deleting it removes the water and its Undo brings back only water
 * the same act removed (the store's cascade, one stamp); deleting the water on Water leaves the entry,
 * an ordinary entry from then on; an edit of the entry recomputes the water from the entry
 * (`diaryDrinkMl`, followEntry in ./pair.ts) and is never refused because of it. Look a pair up by
 * origin: `waterPointingAt` (logged on Water), `waterFromEntry` (logged in the diary), `waterFor` (either,
 * for display). Known and accepted, as for the pair above, while an older app is still in use:
 * - an older app deleting the entry leaves the water as a plain Water row (visible, counted once,
 *   deletable);
 * - an older app's edit of the entry does not move the water; it heals on the next edit here, because
 *   the water is recomputed from the entry, never scaled from its old volume;
 * - an older app's Water notice does not know the link and may offer "Water only" once more.
 */
import { BUILTIN_FOODS } from '@/data/foods';
import { mealOnDay } from '@/features/food/addedTo';
import { buildEntry } from '@/features/food/build';
import { QUICK_KCAL_LIMIT, sourceInfo } from '@/features/food/helpers';
import { isolateRtl } from '@/lib/bidi';
import { formatShortDate, weekdayShort } from '@/lib/dates';
import { BEVERAGE_LABELS } from '@/lib/hydration';
import { MEAL_LABEL, mealForTime } from '@/lib/nutrition';
import { formatNumber, formatVolume } from '@/lib/units';
import type { Beverage, Food, FoodEntry, ISODate, MealType, UnitSystem, WaterEntry } from '@/types';

import { ENTERED, PICKED, canPick, choiceById, choicesFor, defaultChoiceId, type DrinkChoice } from './choices';

export { isWaterDrinkEntry } from './via';

const FL_OZ_ML = 29.5735;
const CUP_ML = 236.588;
/** Densities outside this are a typo in a serving, not a drink. */
const G_PER_ML_MIN = 0.8;
const G_PER_ML_MAX = 1.3;
/** A same food logged this long before now on the same day is "already in your diary". */
export const SAME_DRINK_WINDOW_MS = 3 * 60 * 60 * 1000;
/** The water screen's largest single drink, and the store's validator's limit for a record. */
const MAX_ML = 10000;

const BUILTIN_BY_ID = new Map(BUILTIN_FOODS.map((f) => [f.id, f]));

/** A bundled food by id (the reference foods behind the choices). */
export function builtinFood(id: string): Food | null {
  return BUILTIN_BY_ID.get(id) ?? null;
}

// ---------------------------------------------------------------- grams per ml

/** A number in a label: "500", "1.5", or with a decimal comma "1,5" (Open Food Facts' European labels). */
const NUM = '(\\d+(?:[.,]\\d+)?)';

/** "1,5" is 1.5; "1,000" before ml is a thousands comma (1000 ml). */
function num(text: string, unit: 'ml' | 'other'): number {
  if (unit === 'ml' && /^\d{1,3},\d{3}$/.test(text)) return Number(text.replace(',', ''));
  return Number(text.replace(',', '.'));
}

/**
 * The volume in ml a serving label names, or null; `cups` false leaves "cup" unread. In this order:
 * "N ml" (also "(N ml)"), else "N cl", else "N L", else "N fl oz", else "cup" / "N cups" / "1/2 cup".
 * A decimal comma is read as a point ("0,5 l" is 500 ml, "1,5 L" 1500 ml).
 */
export function readLabelMl(label: string, cups: boolean): number | null {
  const ml = label.match(new RegExp(`${NUM}\\s*ml\\b`, 'i'));
  if (ml) return num(ml[1], 'ml');
  const cl = label.match(new RegExp(`${NUM}\\s*cl\\b`, 'i'));
  if (cl) return num(cl[1], 'other') * 10;
  const litre = label.match(new RegExp(`${NUM}\\s*(?:l|litres?|liters?)\\b`, 'i'));
  if (litre) return num(litre[1], 'other') * 1000;
  const oz = label.match(new RegExp(`${NUM}\\s*fl\\.?\\s*oz\\b`, 'i'));
  if (oz) return num(oz[1], 'other') * FL_OZ_ML;
  if (!cups) return null;
  const cup = label.match(/(?:(\d+(?:\.\d+)?)(?:\/(\d+))?\s+)?cups?\b/i);
  if (cup) {
    const n = cup[1] ? Number(cup[1]) / (cup[2] ? Number(cup[2]) : 1) : 1;
    return n > 0 ? n * CUP_ML : null;
  }
  return null;
}

/**
 * The volume in ml a serving label names, or null. In this order: "N ml" (also "(N ml)"), "N cl",
 * "N L", else "N fl oz", else "cup" / "N cups" / "1/2 cup" only when none of the others is there.
 * A decimal comma reads as a point.
 */
export function labelMl(label: string): number | null {
  return readLabelMl(label, true);
}

/** Whether `grams` for `ml` is a density a drink can have (0.8 to 1.3 g per ml), the band gramsPerMl keeps to. */
export function plausibleDensity(grams: number, ml: number): boolean {
  if (!(grams > 0) || !(ml > 0)) return false;
  const d = grams / ml;
  return d >= G_PER_ML_MIN && d <= G_PER_ML_MAX;
}

/**
 * How many grams one ml of a food weighs: the first serving whose label names a volume decides
 * (grams / ml, kept within 0.8..1.3). A food with no volume serving is taken as 1 g per ml, and
 * `assumed` says so (the drink sheet then shows "taken as 250 g").
 */
export function gramsPerMl(food: Pick<Food, 'servings'>): { gPerMl: number; assumed: boolean } {
  for (const s of food.servings) {
    const ml = labelMl(s.label);
    if (ml && ml > 0 && s.grams > 0) return { gPerMl: Math.min(G_PER_ML_MAX, Math.max(G_PER_ML_MIN, s.grams / ml)), assumed: false };
  }
  return { gPerMl: 1, assumed: true };
}

/**
 * The grams logged for `ml` of a food (to 0.1 g, so the diary's calories equal the tile's). Food
 * detail shows a volume portion's grams as whole grams ("258 g"); that is display only.
 */
export function drinkGrams(food: Pick<Food, 'servings'>, ml: number): number {
  return Math.round(ml * gramsPerMl(food).gPerMl * 10) / 10;
}

/** Whole kcal that `ml` of a food adds: per 100 g times the drink's grams. */
export function drinkKcal(food: Pick<Food, 'servings' | 'per100g'>, ml: number): number {
  return Math.round((food.per100g.kcal * drinkGrams(food, ml)) / 100);
}

// ---------------------------------------------------------------- alcohol

const ALCOHOL_IDS = new Set(['b_beer', 'b_beer_light', 'b_wine_red', 'b_wine_white', 'b_spirits']);
const ALCOHOL_WORDS =
  /\b(beer|lager|stout|ipa|wine|prosecco|champagne|cider|vodka|gin|rum|whisk(e)?y|bourbon|tequila|brandy|liqueur|cocktail|margarita|mojito|sangria|hard seltzer|spirits?)\b/i;
const NOT_ALCOHOL = /\b(root beer|ginger beer|non-alcoholic|alcohol-free|juice cocktail)\b|\b0\.0\s*%?|ללא אלכוהול|נטול אלכוהול/i;
/** A Hebrew letter, for whole-word matches (\b does not see Hebrew letters as word characters). */
const HE = '\u05D0-\u05EA';
/** Hebrew words for alcohol, each a whole word, with one of the prefix letters ה ו ב ל מ ש כ allowed before it. */
const ALCOHOL_WORDS_HE = new RegExp(`(?:^|[^${HE}'\u05F3])[הובלמשכ]?(?:בירה|יין|וודקה|ערק|ויסקי|ליקר|קוניאק|ג['\u05F3]ין|סיידר)(?=$|[^${HE}'\u05F3])`);

/**
 * Alcohol stays out of Water (the water screen, and a drink logged in the diary): the five bundled
 * drinks, or a name with a common word for one, in English or in Hebrew (בירה, יין, וודקה, ערק, ויסקי,
 * ליקר, קוניאק, ג'ין, סיידר, each a whole word), unless it also says root beer, ginger beer,
 * non-alcoholic, alcohol-free, juice cocktail ("Cranberry juice cocktail" is juice), ללא אלכוהול,
 * נטול אלכוהול or 0.0. A name filter cannot catch everything ("Aperol spritz"); that is accepted.
 */
export function isAlcohol(food: Pick<Food, 'id' | 'name'>): boolean {
  if (ALCOHOL_IDS.has(food.id)) return true;
  return (ALCOHOL_WORDS.test(food.name) || ALCOHOL_WORDS_HE.test(food.name)) && !NOT_ALCOHOL.test(food.name);
}

export function withoutAlcohol<T extends Pick<Food, 'id' | 'name'>>(foods: readonly T[]): T[] {
  return foods.filter((f) => !isAlcohol(f));
}

/**
 * Bundled foods outside the 'drinks' category that are drinks: the seven milks, shoko, kefir,
 * buttermilk and the ready-to-drink protein shake. Leben, eshel, yogurts, creams, condensed milk, canned
 * coconut milk, soups and the ice pop are not (they are eaten, with a spoon or as a meal).
 */
export const BUNDLED_DRINK_IDS: ReadonlySet<string> = new Set([
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
  'b_protein_shake_rtd',
]);

/**
 * Whether a bundled food is a drink: category 'drinks' or one of BUNDLED_DRINK_IDS, and not alcohol.
 * The one list behind the water screen's drink sheet (`sheetDrinks`) and a drink logged in the diary
 * (./diary.ts), so the two screens agree. Only for bundled foods: an online product or an own food
 * says it with `beverage`.
 */
export function isBundledDrink(food: Pick<Food, 'id' | 'name' | 'category'>): boolean {
  return (food.category === 'drinks' || BUNDLED_DRINK_IDS.has(food.id)) && !isAlcohol(food);
}

/** The drink sheet with an empty search: every bundled drink (`isBundledDrink`), by name. */
export function sheetDrinks(): Food[] {
  return BUILTIN_FOODS.filter(isBundledDrink).sort((a, b) => a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------- choices and memory

/** What the next tap logs for a kind: a choice id (or 'food' / 'kcal') and the food behind it (null: no calories). */
export interface SelectedDrink {
  id: string;
  food: Food | null;
}

/** The food behind a fixed choice (null for a no-calorie choice). */
export function choiceFood(choice: DrinkChoice): Food | null {
  return choice.foodId ? builtinFood(choice.foodId) : null;
}

export function selectChoice(choice: DrinkChoice): SelectedDrink {
  return { id: choice.id, food: choiceFood(choice) };
}

/** A food picked in the drink sheet. */
export function selectFood(food: Food): SelectedDrink {
  return { id: PICKED, food };
}

/** What is remembered on this device per kind (healthcal.drinkChoice; ./memory.ts). */
export type DrinkMemory = Partial<Record<Beverage, { id: string; food?: Food }>>;

/**
 * The kind's selected drink on arrival: the remembered one when it still makes sense, else the
 * default. A remembered picked food goes through `resolveFood` (an own food deleted since, or one
 * now read as alcohol, falls back to the default). Water: null (no choices).
 */
export function rememberedChoice(memory: DrinkMemory | null | undefined, kind: Beverage, resolveFood: (f: Food) => Food | null = (f) => f): SelectedDrink | null {
  const fallback = defaultChoiceId(kind);
  if (!fallback) return null;
  const stored = memory?.[kind];
  if (stored?.id === PICKED && stored.food && canPick(kind)) {
    const food = resolveFood(stored.food);
    if (food && !isAlcohol(food)) return selectFood(food);
  }
  const choice = choiceById(stored?.id);
  if (choice && choice.kind === kind) return selectChoice(choice);
  return selectChoice(choiceById(fallback)!);
}

/** The remembered picked food a kind's row shows as a chip of its own (`water-choice-food`), if any. */
export function pickedFood(selected: SelectedDrink | null, memory: DrinkMemory | null | undefined, kind: Beverage, resolveFood: (f: Food) => Food | null = (f) => f): Food | null {
  if (!canPick(kind)) return null;
  if (selected?.id === PICKED && selected.food) return selected.food;
  const stored = memory?.[kind];
  if (stored?.id !== PICKED || !stored.food) return null;
  const food = resolveFood(stored.food);
  return food && !isAlcohol(food) ? food : null;
}

/** The memory after a choice tap or a pick in the sheet (never on a log, never for "Water only"). */
export function remember(memory: DrinkMemory, kind: Beverage, selected: SelectedDrink): DrinkMemory {
  if (selected.id === ENTERED) return memory;
  const value = selected.id === PICKED && selected.food ? { id: PICKED, food: selected.food } : { id: selected.id };
  return { ...memory, [kind]: value };
}

// ---------------------------------------------------------------- words

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/**
 * "milk", "sports drink", "soft drink", "other drink": the drink in a toast. The kind, except a fixed
 * Other choice (its own name) and calories typed in ("other drink", as the diary names that entry).
 */
function noun(kind: Beverage, drinkId: string | null | undefined): string {
  if (drinkId === ENTERED) return 'other drink';
  if (kind !== 'other') return BEVERAGE_LABELS[kind].label.toLowerCase();
  const choice = choiceById(drinkId);
  return choice?.foodId ? choice.name : 'other drink';
}

/**
 * A water row's title: the kind as always ("250 ml milk", "250 ml coffee"), except under Other: a
 * known food choice reads with the drink's own noun as its toast does ("330 ml soft drink"), and
 * anything else under Other (no calories, picked in the sheet, entered, logged in the diary, or from
 * before choices) reads "473 ml drink", never "473 ml other".
 */
export function waterRowTitle(water: Pick<WaterEntry, 'ml' | 'beverage' | 'drink'>, units: UnitSystem): string {
  if (water.beverage !== 'other') return `${formatVolume(water.ml, units)} ${BEVERAGE_LABELS[water.beverage].label.toLowerCase()}`;
  const choice = choiceById(water.drink);
  const name = choice?.foodId && choice.kind === 'other' ? choice.name : 'drink';
  return `${formatVolume(water.ml, units)} ${name}`;
}

/** How the drink is named in the drink line: the choice's name or the picked food's own. */
export function drinkName(selected: SelectedDrink | null, kind: Beverage): string {
  if (!selected) return BEVERAGE_LABELS[kind].label.toLowerCase();
  if (selected.id === ENTERED) return 'other drink';
  const choice = choiceById(selected.id);
  if (choice) return choice.name;
  return selected.food?.name ?? 'drink';
}

/** A choice chip's spoken label: "Whole, 157 kcal per 250 ml" or "Black, no calories". */
export function choiceA11y(label: string, food: Food | null, glassMl: number, units: UnitSystem): string {
  return food ? `${label}, ${formatNumber(drinkKcal(food, glassMl))} kcal per ${formatVolume(glassMl, units)}` : `${label}, no calories`;
}

/** A row in the drink sheet: "51 kcal per 250 ml · Reference", or "45 kcal per 250 ml, taken as 250 g · Your food". */
export function pickCaption(food: Food, glassMl: number, units: UnitSystem): string {
  const { assumed } = gramsPerMl(food);
  const per = `${formatNumber(drinkKcal(food, glassMl))} kcal per ${formatVolume(glassMl, units)}`;
  const taken = assumed ? `, taken as ${formatNumber(drinkGrams(food, glassMl))} g` : '';
  return `${per}${taken} · ${sourceInfo(food.source).short}`;
}

// ---------------------------------------------------------------- calories typed in

/**
 * The calories field's error, or null when the number can be added. The same limit as the quick-add
 * screen (`QUICK_KCAL_LIMIT`: under 10,000 kcal), said in neutral words.
 */
export function enteredKcalError(kcal: number | null): string | null {
  if (kcal === null) return null;
  if (!(kcal > 0)) return 'Enter the calories';
  if (kcal >= QUICK_KCAL_LIMIT) return `Up to ${formatNumber(QUICK_KCAL_LIMIT - 1)} kcal`;
  return null;
}

/** The toast after a drink is picked in the sheet: nothing is logged until a glass is tapped. A Hebrew or Arabic name is isolated (drawn text; the toast announces it without the marks). */
export function pickedToast(food: Pick<Food, 'name'>): string {
  return `${isolateRtl(food.name)} chosen. Tap a glass to add it.`;
}

// ---------------------------------------------------------------- the meal

/** The meal a drink's calories go to: the meal of the clock at the log (mealForTime), whatever the day. */
export function drinkMeal(now: Date): MealType {
  return mealForTime(now);
}

// ---------------------------------------------------------------- the plan

export interface PlanDrinkInput {
  kind: Beverage;
  /** The selected drink; null for Water (and treated as plain water for any kind without choices). */
  drink: SelectedDrink | null;
  ml: number;
  date: ISODate;
  /** The moment of the log (an event handler) or of the render that shows the words (useNow()). */
  now: Date;
  /** useToday() on screen, today() in a handler: names the day in the words when `date` is not today. */
  today: ISODate;
  units: UnitSystem;
  /** The "Water only" chip is on: the water record only, whatever the drink. */
  waterOnly?: boolean;
  /** For an entered drink (`drink.id === 'kcal'`): the calories typed in. */
  kcal?: number;
  /** 'custom': the amount came from the Other amount field (the line then names the amount). */
  amount?: 'glass' | 'custom';
}

export type DrinkWater = Omit<WaterEntry, 'id' | 'updatedAt' | 'deleted'>;
export type DrinkEntry = Omit<FoodEntry, 'id' | 'updatedAt' | 'deleted'>;

export interface DrinkPlan {
  /** The water record (logDrink adds `foodEntryId` once the entry has its id). */
  water: DrinkWater;
  /** The diary entry with the calories, or null: nothing goes to the diary. */
  entry: DrinkEntry | null;
  /** Whole kcal the log adds (0 without an entry). */
  kcal: number;
  meal: MealType;
  /** The toast after the log (one, tinted 'water', with Undo). */
  toast: string;
  /** `water-drink-line`: what the next tap logs ('' for plain water, which shows no line). */
  line: string;
  /** A tile's subtitle: "129 kcal", "No calories" with the chip on, or null (the tile as before). */
  tile: string | null;
  /** A tile's accessibilityLabel. */
  label: string;
}

/**
 * The whole log of one drink as data: the screen shows `line`, `tile` and `label` before the tap
 * and `logDrink` writes `water` and `entry` and shows `toast` after it. Plain water (and a
 * no-calorie choice) gives the record and words the water screen always wrote; a no-calorie choice
 * only adds `drink` to the record.
 */
export function planDrink(input: PlanDrinkInput): DrinkPlan {
  const { kind, drink, date, now, today, units } = input;
  const ml = Math.round(input.ml);
  const vol = formatVolume(ml, units);
  const loggedAt = now.toISOString();
  const meal = drinkMeal(now);
  const where = mealOnDay(meal, date, today);
  const custom = input.amount === 'custom';
  const kindLower = BEVERAGE_LABELS[kind].label.toLowerCase();

  const choices = kind === 'water' ? null : drink;
  const water: DrinkWater = { date, ml, beverage: kind, loggedAt, ...(choices ? { drink: choices.id } : null) };
  const plain = (line: string): DrinkPlan => ({
    water,
    entry: null,
    kcal: 0,
    meal,
    toast: kind === 'water' ? `Added ${vol}` : `Added ${vol} of ${kindLower}`,
    line,
    tile: null,
    label: `Add ${vol} of ${kindLower}`,
  });
  if (!choices) return plain('');

  const name = drinkName(choices, kind);
  let entry: DrinkEntry | null = null;
  if (choices.id === ENTERED) {
    const kcal = Math.round(input.kcal ?? 0);
    if (kcal > 0) {
      entry = {
        date,
        meal,
        name: 'Other drink',
        emoji: '🫗',
        source: 'quick',
        verified: false,
        servingLabel: vol,
        quantity: 1,
        grams: 0,
        nutrients: { kcal, protein: 0, carbs: 0, fat: 0 },
        loggedAt,
        via: 'water',
      };
    }
  } else if (choices.food) {
    const grams = drinkGrams(choices.food, ml);
    entry = { ...buildEntry({ food: choices.food, serving: { label: vol, grams }, quantity: 1, meal, date }), loggedAt, via: 'water' };
  }

  // `line` is drawn (a Hebrew or Arabic name isolated, `isolateRtl`); `label` is for screen readers and keeps the raw name.
  const shown = isolateRtl(cap(name));
  if (!entry) return plain(`${shown}: no calories added`);

  if (input.waterOnly) {
    return {
      water,
      entry: null,
      kcal: 0,
      meal,
      toast: `Added ${vol} of ${noun(kind, choices.id)}, for water only`,
      line: `${shown}: for water only, no calories added`,
      tile: 'No calories',
      label: `Add ${vol} of ${name}, for water only`,
    };
  }

  const kcal = Math.round(entry.nutrients.kcal);
  const k = `${formatNumber(kcal)} kcal`;
  return {
    water,
    entry,
    kcal,
    meal,
    toast: `Added ${vol} of ${noun(kind, choices.id)}, ${k} to ${where}`,
    line: custom ? `${vol} ${isolateRtl(name)}: ${k}, to ${where}` : `${shown}: ${k} per ${vol}, to ${where}`,
    tile: k,
    label: `Add ${vol} of ${name}, ${k} to ${where}`,
  };
}

// ---------------------------------------------------------------- already in the diary

function liveRecords<T extends { deleted?: boolean }>(records: Iterable<T> | Record<string, T>): T[] {
  const list = Symbol.iterator in (records as object) ? [...(records as Iterable<T>)] : Object.values(records as Record<string, T>);
  return list.filter((r) => !r.deleted);
}

/**
 * The foods that count as "the same drink" for the notice: the selected food and every food behind
 * the kind's own choices (any milk for Milk, any juice choice for Juice, any coffee with calories for
 * Coffee), so whole milk from the diary's search is named before semi-skimmed is added on Water.
 */
export function sameDrinkFoodIds(kind: Beverage, selected: SelectedDrink | null): string[] {
  if (!selected?.food) return [];
  const ids = new Set<string>([selected.food.id]);
  for (const c of choicesFor(kind)) if (c.foodId) ids.add(c.foodId);
  return [...ids];
}

/**
 * The same drink already in the diary: the latest live entry of one of `foodIds` (one id, or the
 * kind's set from `sameDrinkFoodIds`) on `date`, logged within the 3 hours before `nowIso`, that no
 * live water record points at (`foodEntryId`). The water screen then says so before the tap
 * (`noticeLine`) and offers "Water only"; nothing is linked or dropped by itself. An entry logged in
 * the diary that already has its water (`fromEntryId`) is still found: ask `waterFromEntry` (or
 * `waterOnlyOffered`), and the notice says it is already in Water and offers no "Water only".
 */
export function sameDrinkInDiary(
  entries: Iterable<FoodEntry> | Record<string, FoodEntry>,
  water: Iterable<WaterEntry> | Record<string, WaterEntry>,
  foodIds: string | readonly string[] | null | undefined,
  date: ISODate,
  nowIso: string,
): FoodEntry | null {
  const ids = new Set(typeof foodIds === 'string' ? [foodIds] : (foodIds ?? []));
  if (ids.size === 0) return null;
  const now = Date.parse(nowIso);
  const linked = new Set(liveRecords(water).map((w) => w.foodEntryId).filter(Boolean));
  let best: FoodEntry | null = null;
  for (const e of liveRecords(entries)) {
    if (!e.foodId || !ids.has(e.foodId) || e.date !== date || linked.has(e.id)) continue;
    const at = Date.parse(e.loggedAt);
    if (!(at <= now && now - at <= SAME_DRINK_WINDOW_MS)) continue;
    if (!best || e.loggedAt > best.loggedAt) best = e;
  }
  return best;
}

function clock(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * "Orange juice is already in breakfast (08:10)." When the entry is the selected choice's own food,
 * it is named as the drink line above names it ("Semi-skimmed milk is already in ..."); any other
 * food (whole milk from the search, a picked drink) by the entry's own name.
 *
 * `inWater`: the entry is a drink logged in the diary that already has its water (`waterFromEntry`):
 * "Latte from breakfast (08:10) is already in Water." The screen then does not offer "Water only"
 * (it would add the same water again); a plain tap stays allowed (a second latte is real).
 */
export function noticeLine(entry: Pick<FoodEntry, 'name' | 'meal' | 'loggedAt' | 'foodId'>, selected?: SelectedDrink | null, kind?: Beverage, inWater = false): string {
  const choice = choiceById(selected?.id);
  const name = choice && kind && choice.foodId && choice.foodId === entry.foodId ? cap(choice.name) : entry.name;
  // Drawn text: a Hebrew or Arabic name is isolated, so the sentence still starts at the left.
  if (inWater) return `${isolateRtl(name)} from ${MEAL_LABEL[entry.meal].toLowerCase()} (${clock(entry.loggedAt)}) is already in Water.`;
  return `${isolateRtl(name)} is already in ${MEAL_LABEL[entry.meal].toLowerCase()} (${clock(entry.loggedAt)}).`;
}

/**
 * Whether the water screen offers "Water only" for the same drink found in the diary: not when that
 * entry already has its water from the diary (the chip would count the same water twice).
 */
export function waterOnlyOffered(entry: Pick<FoodEntry, 'id'> | null, water: Iterable<WaterEntry> | Record<string, WaterEntry>): boolean {
  return !!entry && !waterFromEntry(water, entry.id);
}

// ---------------------------------------------------------------- the pair

/** The id of the diary entry holding a water record's calories, or null. */
export function partnerEntryId(water: Pick<WaterEntry, 'foodEntryId'>): string | null {
  return water.foodEntryId ?? null;
}

/** A water record's live partner entry, or null (none, deleted, or not on this device). */
export function livePartner(water: Pick<WaterEntry, 'foodEntryId' | 'deleted'>, entries: Record<string, FoodEntry>): FoodEntry | null {
  const id = partnerEntryId(water);
  const e = id ? entries[id] : undefined;
  return e && !e.deleted ? e : null;
}

/**
 * The live water record of a drink logged on Water whose calories are this diary entry (`foodEntryId`),
 * or null. Only that origin: it drives the edit refusals (`pairEditBlocked`) and the "water stays"
 * delete toast. For a drink logged in the diary use `waterFromEntry`; for display, `waterFor`.
 */
export function waterPointingAt(water: Iterable<WaterEntry> | Record<string, WaterEntry>, entryId: string): WaterEntry | null {
  let best: WaterEntry | null = null;
  for (const w of liveRecords(water)) if (w.foodEntryId === entryId && (!best || w.loggedAt > best.loggedAt)) best = w;
  return best;
}

/** The live water record a drink logged in the diary added (`fromEntryId`), or null (none, deleted on Water, or the switch was off). */
export function waterFromEntry(water: Iterable<WaterEntry> | Record<string, WaterEntry>, entryId: string): WaterEntry | null {
  let best: WaterEntry | null = null;
  for (const w of liveRecords(water)) if (w.fromEntryId === entryId && !w.foodEntryId && (!best || w.loggedAt > best.loggedAt)) best = w;
  return best;
}

/** Where a diary entry's water came from: 'water' (logged on Water, the entry holds its calories) or 'diary' (logged as food, the water follows it). */
export type PairOrigin = 'water' | 'diary';

/**
 * A diary entry's live water record of either origin, for display only (the diary's "also in Water",
 * food detail's note, the Water row): a Water-origin pair first, else the diary's own water. Never use
 * it to refuse an edit or word a delete; those differ by origin.
 */
export function waterFor(water: Iterable<WaterEntry> | Record<string, WaterEntry>, entryId: string): { water: WaterEntry; origin: PairOrigin } | null {
  const own = waterPointingAt(water, entryId);
  if (own) return { water: own, origin: 'water' };
  const from = waterFromEntry(water, entryId);
  return from ? { water: from, origin: 'diary' } : null;
}

/**
 * A water record's live diary entry of either origin (the Water row's caption and open, removeDrink's
 * toast): the entry holding its calories ('water', `foodEntryId`) or the entry it came from ('diary',
 * `fromEntryId`); null when there is none, it is deleted, or it is not on this device.
 */
export function entryFor(water: Pick<WaterEntry, 'foodEntryId' | 'fromEntryId' | 'deleted'>, entries: Record<string, FoodEntry>): { entry: FoodEntry; origin: PairOrigin } | null {
  if (water.foodEntryId) {
    const e = livePartner(water, entries);
    return e ? { entry: e, origin: 'water' } : null;
  }
  const e = water.fromEntryId ? entries[water.fromEntryId] : undefined;
  return e && !e.deleted ? { entry: e, origin: 'diary' } : null;
}

/**
 * How a water record follows an edit of its entry: the amount scales with the grams (1 to 10,000 ml)
 * when both are above zero and differ, and the day follows the entry's new day when that is not in
 * the future (the water screen cannot show a future day). Null: nothing to change.
 */
export function waterForEntryEdit(
  water: Pick<WaterEntry, 'ml' | 'date'>,
  before: Pick<FoodEntry, 'grams' | 'date'>,
  after: Pick<FoodEntry, 'grams' | 'date'>,
  today: ISODate,
): { date?: ISODate; ml?: number } | null {
  const out: { date?: ISODate; ml?: number } = {};
  if (before.grams > 0 && after.grams > 0 && Math.abs(after.grams - before.grams) > 1e-9) {
    const ml = Math.min(MAX_ML, Math.max(1, Math.round((water.ml * after.grams) / before.grams)));
    if (ml !== water.ml) out.ml = ml;
  }
  if (after.date !== before.date && after.date <= today && after.date !== water.date) out.date = after.date;
  return out.ml !== undefined || out.date !== undefined ? out : null;
}

/** Why an edit of a paired entry cannot be saved, and which control it is about. */
export interface PairEditProblem {
  /** 'day': the day control; 'amount': the amount. The screen shows `text` beside that control. */
  field: 'day' | 'amount';
  text: string;
}

/**
 * Why an edit of a paired entry cannot be saved, or null. The pair stays true (both records with
 * matching numbers): the water screen cannot show a future day, and one water record holds at most
 * 10,000 ml, so a paired drink is not moved past today nor made larger than that. Every write path
 * asks this (followEntry's callers through pairEditBlocked) and food detail shows it before Save.
 */
export function pairEditProblem(
  water: Pick<WaterEntry, 'ml'>,
  before: Pick<FoodEntry, 'grams' | 'date'>,
  after: Pick<FoodEntry, 'grams' | 'date'>,
  today: ISODate,
  units: UnitSystem,
): PairEditProblem | null {
  // Only a move to a future day: an entry left where it is (even one an older app moved ahead) can still be edited.
  if (after.date > today && after.date !== before.date) return { field: 'day', text: 'A drink also counted in Water stays on today or an earlier day.' };
  if (before.grams > 0 && after.grams > 0 && (water.ml * after.grams) / before.grams > MAX_ML + 0.5) {
    return { field: 'amount', text: `A drink also counted in Water is at most ${formatVolume(MAX_ML, units)}.` };
  }
  return null;
}

// ---------------------------------------------------------------- words for the pair

/** The diary row's mark for an entry a live water record points at: "250 ml · also in Water · Reference". */
export const ALSO_IN_WATER = 'also in Water';

/** Caption line 2 of a paired water row: "Milk, reduced fat (2%) · 129 kcal in breakfast" (", Fri Nov 20" when the entry's day differs). */
export function waterRowCaption(entry: Pick<FoodEntry, 'name' | 'meal' | 'date' | 'nutrients'>, waterDate: ISODate): string {
  const day = entry.date !== waterDate ? `, ${weekdayShort(entry.date)} ${formatShortDate(entry.date)}` : '';
  return `${entry.name} · ${formatNumber(Math.round(entry.nutrients.kcal))} kcal in ${MEAL_LABEL[entry.meal].toLowerCase()}${day}`;
}

/**
 * The toast after deleting a water record: "Removed 250 ml of milk and its 129 kcal", or "Removed 250
 * ml" without calories. A drink logged in the diary (`fromEntryId`) whose entry is live (`partner`,
 * from `entryFor`): only the water goes, "Removed 370 ml. The drink stays in lunch."; Undo restores the
 * water and its link.
 */
export function removedWaterToast(
  water: Pick<WaterEntry, 'ml' | 'beverage' | 'drink'> & Partial<Pick<WaterEntry, 'fromEntryId' | 'foodEntryId'>>,
  partner: (Pick<FoodEntry, 'nutrients'> & Partial<Pick<FoodEntry, 'meal'>>) | null,
  units: UnitSystem,
): string {
  const vol = formatVolume(water.ml, units);
  if (!partner) return `Removed ${vol}`;
  if (water.fromEntryId && !water.foodEntryId && partner.meal) return `Removed ${vol}. The drink stays in ${MEAL_LABEL[partner.meal].toLowerCase()}.`;
  return `Removed ${vol} of ${noun(water.beverage, water.drink)} and its ${formatNumber(Math.round(partner.nutrients.kcal))} kcal`;
}

/**
 * The toast after deleting, in the diary, an entry that has water. A drink logged on Water: "Removed
 * Milk. The 250 ml stays in Water." A drink logged in the diary (`fromEntryId`): its water goes with
 * it, "Removed Cola, regular and its 370 ml from Water" (Undo restores both: the store's cascade).
 * `name` is drawn text (isolateRtl'd by the caller, as before).
 */
export function removedEntryToast(name: string, water: Pick<WaterEntry, 'ml'> & Partial<Pick<WaterEntry, 'fromEntryId' | 'foodEntryId'>>, units: UnitSystem): string {
  if (water.fromEntryId && !water.foodEntryId) return `Removed ${name} and its ${formatVolume(water.ml, units)} from Water`;
  return `Removed ${name}. The ${formatVolume(water.ml, units)} stays in Water.`;
}

/**
 * `detail-drink-note` on a paired entry's detail. An entry with an amount (a reference food) moves
 * its water with the amount and the day. One whose calories were typed in (grams 0) has no amount
 * the water could follow: its calories never change the water, only its day moves it. A drink logged
 * in the diary (`fromEntryId`): "Also counted in Water as 500 ml. It changes with this entry and is
 * removed with it."
 */
export function detailDrinkNote(water: Pick<WaterEntry, 'ml'> & Partial<Pick<WaterEntry, 'fromEntryId' | 'foodEntryId'>>, units: UnitSystem, hasAmount = true): string {
  const vol = formatVolume(water.ml, units);
  if (water.fromEntryId && !water.foodEntryId) return `Also counted in Water as ${vol}. It changes with this entry and is removed with it.`;
  return hasAmount
    ? `Also counted in Water as ${vol}. Changing the amount here changes it there; deleting here keeps the water.`
    : `Also counted in Water as ${vol}. The calories here do not change it; changing the day moves it there, and deleting here keeps the water.`;
}

/** saveMeal's toast when every entry was a drink from Water. */
export const DRINKS_NOT_SAVED = 'Drinks from Water are not saved in meals';
/** copyEntries' toast when every entry was a drink from Water. */
export const DRINKS_NOT_COPIED = 'Drinks from Water are not copied';
