/**
 * Pure helpers shared by the food screens: route params, number formatting,
 * data-source labels and the "last portion" used for one-tap re-logging.
 */
import { NATIONAL_LABELS, NATIONAL_RECIPES } from '@/data/foods';
import { hasRtl, isolateRtl } from '@/lib/bidi';
import { formatDayLabel, today } from '@/lib/dates';
import { defaultServing, formatMacro, mealForTime, servingsFor } from '@/lib/nutrition';
import { formatNumber } from '@/lib/units';
import { isWaterDrinkEntry } from '@/features/drinks/via';
import type { ThemeColors } from '@/theme';
import type { Food, FoodEntry, FoodSource, ISODate, MealType, Serving } from '@/types';

const MEAL_IDS: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export function parseMeal(v: string | string[] | undefined): MealType {
  const s = first(v);
  return MEAL_IDS.includes(s as MealType) ? (s as MealType) : mealForTime();
}

/** The date in a route parameter, or `fallback` (pass `useToday()` from a component) when it is absent or malformed. */
export function parseDate(v: string | string[] | undefined, fallback: ISODate = today()): ISODate {
  const s = first(v);
  return s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : fallback;
}

export function param(v: string | string[] | undefined): string | undefined {
  const s = first(v);
  return s ? s : undefined;
}

/** Build a route with query params, skipping empty values. */
export function href(path: string, params: Record<string, string | number | undefined | null>): string {
  const q = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join('&');
  return q ? `${path}?${q}` : path;
}

export const kcal = (n: number) => formatNumber(Math.round(n));
/** Calories typed in for one entry stay under this (quick add, a drink's "Or enter calories"). */
export const QUICK_KCAL_LIMIT = 10000;
export const grams = (n: number) => `${formatMacro(n)} g`;

/** "1.5" not "1.50", "0.25" kept. */
export function formatQty(q: number): string {
  return String(Math.round(q * 100) / 100);
}

/**
 * The words of a serving label as drawn inside an app line (display only, never stored): a label
 * written in Hebrew or Arabic is isolated (`isolateRtl`), and a trailing amount in brackets stays
 * outside the isolate, so "גביע (250 g)" keeps "(250 g)" in the line's left-to-right order.
 */
function servingWords(words: string): string {
  if (!hasRtl(words)) return words;
  const tail = words.match(/^(.*?\S)(\s*\([^()]*\))$/);
  return tail && !hasRtl(tail[2]) ? `${isolateRtl(tail[1])}${tail[2]}` : isolateRtl(words);
}

/**
 * A serving label as drawn in an app line ("1 גביע" reads 1, then the word, like "1 cup"). English
 * labels come back unchanged. Display only: never store or compare the result.
 */
export function servingText(label: string): string {
  if (!hasRtl(label)) return label;
  const counted = label.match(/^(\d+(?:\.\d+)?)\s+(.+)$/);
  return counted ? `${counted[1]} ${servingWords(counted[2])}` : servingWords(label);
}

/**
 * "1 large" or "2 × 1 large" or "150 g", for display. A serving label written in Hebrew or Arabic
 * is isolated (`servingText`); the number and the grams never are. Never store the result.
 */
export function portionLabel(servingLabel: string, quantity: number): string {
  if (servingLabel === '1 g') return `${formatQty(quantity)} g`;
  if (servingLabel === '100 g' && quantity !== 1) return `${formatQty(quantity * 100)} g`;
  if (quantity === 1) return servingText(servingLabel);
  // "1 pita" taken 1.5 times is "1.5 pita"; "2 tbsp" taken 3 times is "6 tbsp". Anything else keeps the multiplier.
  const counted = servingLabel.match(/^(\d+(?:\.\d+)?)\s+(.+)$/);
  if (counted) return `${formatQty(Number(counted[1]) * quantity)} ${servingWords(counted[2])}`;
  return `${formatQty(quantity)} × ${servingWords(servingLabel)}`;
}

/** Step size for an amount: 10 g in gram mode, 0.5 servings otherwise. */
export function amountStep(servingLabel: string): number {
  if (servingLabel === '1 g') return 10;
  if (servingLabel === '100 g') return 0.1;
  return 0.5;
}

/**
 * One tap of a compact amount stepper. Steps snap to the step grid (1.2 + 0.5
 * gives 1.5, 15 g − 10 g gives 10 g), and stepping down from the smallest
 * step returns 0, which the caller treats as "remove".
 */
export function stepAmount(quantity: number, servingLabel: string, dir: 1 | -1): number {
  const step = amountStep(servingLabel);
  const units = quantity / step;
  const snapped = Math.abs(units - Math.round(units)) < 1e-6 ? Math.round(units) + dir : dir > 0 ? Math.ceil(units) : Math.floor(units);
  return Math.max(0, Math.round(snapped * step * 1000) / 1000);
}

/** Short amount for a compact stepper: "1.5 ×" or "150 g". */
export function amountLabel(servingLabel: string, quantity: number): string {
  if (servingLabel === '1 g') return `${formatQty(quantity)} g`;
  if (servingLabel === '100 g') return `${formatQty(quantity * 100)} g`;
  return `${formatQty(quantity)} ×`;
}

// ------------------------------------------------------------- data source

export interface SourceInfo {
  /** Badge text, e.g. "Reference data". */
  label: string;
  /** Short tag for list rows. */
  short: string;
  color: keyof ThemeColors;
  /** One line on where the numbers come from. */
  explain: string;
}

/**
 * Where a bundled food's numbers come from, in one sentence (the detail page, behind the badge): the
 * record it names (`fdcId` for USDA, `ilCode` for Israel's national nutrition database, which marks
 * its recipe records in NATIONAL_RECIPES and its packaged products in NATIONAL_LABELS), or none.
 */
export function referenceExplain(food: Pick<Food, 'fdcId' | 'ilCode'>): string {
  const lead = 'From the bundled reference list.';
  if (food.fdcId !== undefined) return `${lead} Values from USDA FoodData Central.`;
  if (food.ilCode !== undefined) {
    if (NATIONAL_RECIPES.has(food.ilCode)) return `${lead} Values for a typical home recipe, computed by the Israeli Ministry of Health (national nutrition database).`;
    if (NATIONAL_LABELS.has(food.ilCode))
      return `${lead} Values from the Israeli Ministry of Health's national nutrition database, from the product's label as recorded there (database updated October 2022).`;
    return `${lead} Values from the Israeli Ministry of Health's national nutrition database (database updated October 2022).`;
  }
  return `${lead} An estimate from a typical label or recipe, not a measured record.`;
}

/** A data source's names and colour; with the food, a bundled food's `explain` names its own record (`referenceExplain`). */
export function sourceInfo(source: FoodSource, food?: Pick<Food, 'fdcId' | 'ilCode'>): SourceInfo {
  switch (source) {
    case 'builtin':
    case 'usda':
      return {
        label: 'Reference data',
        short: 'Reference',
        color: 'success',
        explain: source === 'builtin' && food ? referenceExplain(food) : 'From the bundled reference database (USDA-based values).',
      };
    case 'openfoodfacts':
      return {
        label: 'Community data',
        short: 'Community',
        color: 'warning',
        explain: 'From Open Food Facts, entered by volunteers. Worth a glance against the label.',
      };
    case 'custom':
      return { label: 'Your food', short: 'Your food', color: 'primary', explain: 'Numbers you entered yourself.' };
    case 'ai':
      return { label: 'AI estimate', short: 'AI estimate', color: 'textSecondary', explain: 'Estimated from a photo or description. Treat it as a range.' };
    case 'quick':
    default:
      return { label: 'Quick add', short: 'Quick add', color: 'textSecondary', explain: 'Calories you entered directly.' };
  }
}

// --------------------------------------------------------- last portion

export interface Portion {
  serving: Serving;
  quantity: number;
}

/** "80 g" for a remembered amount whose label now names another weight (`matchServing`). */
export function gramsServing(gramsPerUnit: number): Serving {
  return { label: `${formatQty(Math.round(gramsPerUnit * 10) / 10)} g`, grams: gramsPerUnit };
}

/**
 * The serving of `food` for a logged label and gram amount, so a remembered portion is logged as it
 * was eaten and priced: the grams always win. The label is kept when the food still names it at that
 * weight; else a serving of the same weight; else, when the food now names that label at another
 * weight (a corrected bundled food: "1 piece" was 80 g, is 50 g now), the amount in grams ("80 g"),
 * never the stale label; else the remembered label as it was. A label alone (no usable grams) still
 * finds its serving.
 */
export function matchServing(food: Food, label: string, gramsPerUnit: number): Serving {
  const options = servingsFor(food);
  const byLabel = options.find((s) => s.label === label);
  if (!(gramsPerUnit > 0) || !Number.isFinite(gramsPerUnit)) return byLabel ?? { label, grams: gramsPerUnit };
  const sameWeight = (s: Serving) => Math.abs(s.grams - gramsPerUnit) < 0.5;
  if (byLabel && sameWeight(byLabel)) return byLabel;
  const byGrams = options.find(sameWeight);
  if (byGrams) return byGrams;
  return byLabel ? gramsServing(gramsPerUnit) : { label, grams: gramsPerUnit };
}

/** Map foodId -> most recent entry of it, so re-logging repeats the amount last eaten. A glass from the water screen (an ml amount) is left out. */
export function lastPortions(entries: FoodEntry[]): Map<string, FoodEntry> {
  const out = new Map<string, FoodEntry>();
  for (const e of entries) {
    if (!e.foodId || e.quantity <= 0 || e.grams <= 0 || isWaterDrinkEntry(e)) continue;
    const prev = out.get(e.foodId);
    if (!prev || e.loggedAt > prev.loggedAt) out.set(e.foodId, e);
  }
  return out;
}

export function portionFor(food: Food, last: Map<string, FoodEntry>): Portion {
  const e = last.get(food.id);
  if (e) return { serving: matchServing(food, e.servingLabel, e.grams / e.quantity), quantity: e.quantity };
  return { serving: defaultServing(food), quantity: 1 };
}

export function portionKcal(food: Food, p: Portion): number {
  return (food.per100g.kcal * p.serving.grams * p.quantity) / 100;
}

/** Convert label values to per-100 g. */
export function toPer100(value: number, servingGrams: number): number {
  return servingGrams > 0 ? (value * 100) / servingGrams : value;
}

/** "today", "yesterday", "tomorrow" or "Wed, Nov 11", for use inside a sentence. */
export function dayPhrase(date: ISODate): string {
  const label = formatDayLabel(date);
  return ['Today', 'Yesterday', 'Tomorrow'].includes(label) ? label.toLowerCase() : label;
}
