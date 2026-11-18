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
 */
import { BUILTIN_FOODS } from '@/data/foods';
import { mealOnDay } from '@/features/food/addedTo';
import { buildEntry } from '@/features/food/build';
import { sourceInfo } from '@/features/food/helpers';
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

const NUM = '(\\d+(?:\\.\\d+)?)';

/**
 * The volume in ml a serving label names, or null. In this order: "N ml" (also "(N ml)", and
 * "N L"), else "N fl oz", else "cup" / "N cups" / "1/2 cup" only when neither of the others is there.
 */
export function labelMl(label: string): number | null {
  const ml = label.match(new RegExp(`${NUM}\\s*ml\\b`, 'i'));
  if (ml) return Number(ml[1]);
  const litre = label.match(new RegExp(`${NUM}\\s*(?:l|litres?|liters?)\\b`, 'i'));
  if (litre) return Number(litre[1]) * 1000;
  const oz = label.match(new RegExp(`${NUM}\\s*fl\\.?\\s*oz\\b`, 'i'));
  if (oz) return Number(oz[1]) * FL_OZ_ML;
  const cup = label.match(/(?:(\d+(?:\.\d+)?)(?:\/(\d+))?\s+)?cups?\b/i);
  if (cup) {
    const n = cup[1] ? Number(cup[1]) / (cup[2] ? Number(cup[2]) : 1) : 1;
    return n > 0 ? n * CUP_ML : null;
  }
  return null;
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

/** The grams logged for `ml` of a food (to 0.1 g, so the diary's calories equal the tile's). */
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
const NOT_ALCOHOL = /\b(root beer|ginger beer|non-alcoholic|alcohol-free)\b|\b0\.0\s*%?/i;

/**
 * Alcohol stays out of the water screen: the five bundled drinks, or a name with a common word for
 * one (unless it also says root beer, ginger beer, non-alcoholic, alcohol-free or 0.0). A name filter
 * cannot catch everything ("Aperol spritz"); that is accepted.
 */
export function isAlcohol(food: Pick<Food, 'id' | 'name'>): boolean {
  if (ALCOHOL_IDS.has(food.id)) return true;
  return ALCOHOL_WORDS.test(food.name) && !NOT_ALCOHOL.test(food.name);
}

export function withoutAlcohol<T extends Pick<Food, 'id' | 'name'>>(foods: readonly T[]): T[] {
  return foods.filter((f) => !isAlcohol(f));
}

/** The drink sheet with an empty search: every bundled non-alcoholic drink and the milks of the Milk row, by name. */
export function sheetDrinks(): Food[] {
  const milkIds = new Set(choicesFor('milk').map((x) => x.foodId));
  return BUILTIN_FOODS.filter((f) => (f.category === 'drinks' || milkIds.has(f.id)) && !isAlcohol(f)).sort((a, b) => a.name.localeCompare(b.name));
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

/** "milk", "sports drink", "soft drink": the drink in the toast (the kind, or a fixed Other choice's name). */
function noun(kind: Beverage, drinkId: string | null | undefined): string {
  if (kind !== 'other') return BEVERAGE_LABELS[kind].label.toLowerCase();
  const choice = choiceById(drinkId);
  return choice?.foodId ? choice.name : 'other drink';
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

  if (!entry) return plain(`${cap(name)}: no calories added`);

  if (input.waterOnly) {
    return {
      water,
      entry: null,
      kcal: 0,
      meal,
      toast: `Added ${vol} ${noun(kind, choices.id)}, for water only`,
      line: `${cap(name)}: for water only, no calories added`,
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
    toast: `Added ${vol} ${noun(kind, choices.id)}, ${k} to ${where}`,
    line: custom ? `${vol} ${name}: ${k}, to ${where}` : `${cap(name)}: ${k} per ${vol}, to ${where}`,
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
 * The same food already in the diary: the latest live entry of `foodId` on `date`, logged within
 * the 3 hours before `nowIso`, that no live water record points at. The water screen then says so
 * before the tap (`noticeLine`) and offers "Water only"; nothing is linked or dropped by itself.
 */
export function sameDrinkInDiary(
  entries: Iterable<FoodEntry> | Record<string, FoodEntry>,
  water: Iterable<WaterEntry> | Record<string, WaterEntry>,
  foodId: string | null | undefined,
  date: ISODate,
  nowIso: string,
): FoodEntry | null {
  if (!foodId) return null;
  const now = Date.parse(nowIso);
  const linked = new Set(liveRecords(water).map((w) => w.foodEntryId).filter(Boolean));
  let best: FoodEntry | null = null;
  for (const e of liveRecords(entries)) {
    if (e.foodId !== foodId || e.date !== date || linked.has(e.id)) continue;
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

/** "Orange juice is already in breakfast (08:10)." */
export function noticeLine(entry: Pick<FoodEntry, 'name' | 'meal' | 'loggedAt'>): string {
  return `${entry.name} is already in ${MEAL_LABEL[entry.meal].toLowerCase()} (${clock(entry.loggedAt)}).`;
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

/** The live water record that points at a diary entry, or null (the diary's "also in Water"). */
export function waterPointingAt(water: Iterable<WaterEntry> | Record<string, WaterEntry>, entryId: string): WaterEntry | null {
  let best: WaterEntry | null = null;
  for (const w of liveRecords(water)) if (w.foodEntryId === entryId && (!best || w.loggedAt > best.loggedAt)) best = w;
  return best;
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

// ---------------------------------------------------------------- words for the pair

/** The diary row's mark for an entry a live water record points at: "250 ml · also in Water · Reference". */
export const ALSO_IN_WATER = 'also in Water';

/** Caption line 2 of a paired water row: "Milk, reduced fat (2%) · 129 kcal in breakfast" (", Fri Nov 20" when the entry's day differs). */
export function waterRowCaption(entry: Pick<FoodEntry, 'name' | 'meal' | 'date' | 'nutrients'>, waterDate: ISODate): string {
  const day = entry.date !== waterDate ? `, ${weekdayShort(entry.date)} ${formatShortDate(entry.date)}` : '';
  return `${entry.name} · ${formatNumber(Math.round(entry.nutrients.kcal))} kcal in ${MEAL_LABEL[entry.meal].toLowerCase()}${day}`;
}

/** The toast after deleting a water record: "Removed 250 ml milk and its 129 kcal", or "Removed 250 ml" without calories. */
export function removedWaterToast(water: Pick<WaterEntry, 'ml' | 'beverage' | 'drink'>, partner: Pick<FoodEntry, 'nutrients'> | null, units: UnitSystem): string {
  const vol = formatVolume(water.ml, units);
  if (!partner) return `Removed ${vol}`;
  return `Removed ${vol} ${noun(water.beverage, water.drink)} and its ${formatNumber(Math.round(partner.nutrients.kcal))} kcal`;
}

/** The toast after deleting, in the diary, an entry a water record points at. */
export function removedEntryToast(name: string, water: Pick<WaterEntry, 'ml'>, units: UnitSystem): string {
  return `Removed ${name}. The ${formatVolume(water.ml, units)} stays in Water.`;
}

/** `detail-drink-note` on a paired entry's detail. */
export function detailDrinkNote(water: Pick<WaterEntry, 'ml'>, units: UnitSystem): string {
  return `Also counted in Water as ${formatVolume(water.ml, units)}. Changing the amount here changes it there; deleting here keeps the water.`;
}

/** saveMeal's toast when every entry was a drink from Water. */
export const DRINKS_NOT_SAVED = 'Drinks from Water are not saved in meals';
/** copyEntries' toast when every entry was a drink from Water. */
export const DRINKS_NOT_COPIED = 'Drinks from Water are not copied';
