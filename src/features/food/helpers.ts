/**
 * Pure helpers shared by the food screens: route params, number formatting,
 * data-source labels and the "last portion" used for one-tap re-logging.
 */
import { formatDayLabel, today } from '@/lib/dates';
import { defaultServing, formatMacro, mealForTime, servingsFor } from '@/lib/nutrition';
import { formatNumber } from '@/lib/units';
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
export const grams = (n: number) => `${formatMacro(n)} g`;

/** "1.5" not "1.50", "0.25" kept. */
export function formatQty(q: number): string {
  return String(Math.round(q * 100) / 100);
}

/** "1 large" or "2 × 1 large" or "150 g". */
export function portionLabel(servingLabel: string, quantity: number): string {
  if (servingLabel === '1 g') return `${formatQty(quantity)} g`;
  if (servingLabel === '100 g' && quantity !== 1) return `${formatQty(quantity * 100)} g`;
  return quantity === 1 ? servingLabel : `${formatQty(quantity)} × ${servingLabel}`;
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

export function sourceInfo(source: FoodSource): SourceInfo {
  switch (source) {
    case 'builtin':
    case 'usda':
      return { label: 'Reference data', short: 'Reference', color: 'success', explain: 'From the bundled reference database (USDA-based values).' };
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

/** Find a serving of `food` that matches a logged label or gram amount. */
export function matchServing(food: Food, label: string, gramsPerUnit: number): Serving {
  const options = servingsFor(food);
  return (
    options.find((s) => s.label === label) ??
    options.find((s) => Math.abs(s.grams - gramsPerUnit) < 0.5) ?? { label, grams: gramsPerUnit }
  );
}

/** Map foodId -> most recent entry of it, so re-logging repeats the amount last eaten. */
export function lastPortions(entries: FoodEntry[]): Map<string, FoodEntry> {
  const out = new Map<string, FoodEntry>();
  for (const e of entries) {
    if (!e.foodId || e.quantity <= 0 || e.grams <= 0) continue;
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
