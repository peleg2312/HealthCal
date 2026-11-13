/**
 * Pure maths for reviewing an AI meal estimate: rescaling edited portions,
 * totals, an honest calorie range, and the added-fat item that covers what a
 * camera cannot see. No React, no storage, so it is unit-tested directly.
 */
import type { AiFoodItem, AiFoodResult } from '@/types';

export type AiTotals = Pick<AiFoodItem, 'kcal' | 'protein' | 'carbs' | 'fat' | 'fiber'>;

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Scale an item to a new weight. Always scale from the item as the model (or
 * the user) first described it, so repeated edits do not accumulate rounding.
 */
export function rescaleItem(origin: AiFoodItem, grams: number): AiFoodItem {
  const g = Math.max(0, Math.round(Number.isFinite(grams) ? grams : 0));
  if (origin.grams <= 0) return { ...origin, grams: g };
  const f = g / origin.grams;
  return {
    ...origin,
    grams: g,
    kcal: Math.round(origin.kcal * f),
    protein: round1(origin.protein * f),
    carbs: round1(origin.carbs * f),
    fat: round1(origin.fat * f),
    fiber: round1(origin.fiber * f),
  };
}

export function totals(items: AiFoodItem[]): AiTotals {
  const t = { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };
  for (const it of items) {
    t.kcal += it.kcal;
    t.protein += it.protein;
    t.carbs += it.carbs;
    t.fat += it.fat;
    t.fiber += it.fiber;
  }
  return { kcal: Math.round(t.kcal), protein: round1(t.protein), carbs: round1(t.carbs), fat: round1(t.fat), fiber: round1(t.fiber) };
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, Number.isFinite(n) ? n : 0));

/**
 * Relative uncertainty of one item. Matches `logAiItems`, so the range shown
 * here is the same one the diary shows after logging: 15 % for a confident
 * item, widening to 45 % for a guess.
 */
export function itemSpread(confidence: number): number {
  return 0.15 + (1 - clamp01(confidence)) * 0.3;
}

/**
 * Likely calorie range for the whole meal. Item ranges are added, not combined
 * as independent errors: photo estimates tend to miss in the same direction
 * (portions and hidden fat both run low), so a narrower band would overstate
 * certainty. Rounded outward to 10 kcal.
 */
export function calorieRange(items: AiFoodItem[]): [number, number] {
  let low = 0;
  let high = 0;
  for (const it of items) {
    const s = itemSpread(it.confidence);
    low += it.kcal * (1 - s);
    high += it.kcal * (1 + s);
  }
  return [Math.max(0, Math.floor(low / 10) * 10), Math.ceil(high / 10) * 10];
}

/** Calorie-weighted confidence of the meal, 0..1. */
export function overallConfidence(items: AiFoodItem[]): number {
  const kcal = items.reduce((s, it) => s + Math.max(0, it.kcal), 0);
  if (kcal <= 0) return items.length ? items.reduce((s, it) => s + clamp01(it.confidence), 0) / items.length : 0;
  return items.reduce((s, it) => s + clamp01(it.confidence) * Math.max(0, it.kcal), 0) / kcal;
}

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export function confidenceLevel(c: number): ConfidenceLevel {
  if (c >= 0.8) return 'high';
  if (c >= 0.55) return 'medium';
  return 'low';
}

export const CONFIDENCE_WORDS: Record<ConfidenceLevel, string> = {
  high: 'Fairly sure',
  medium: 'Reasonable guess',
  low: 'Rough guess',
};

// ------------------------------------------------------------ added fat

export type AddedFat = 'none' | 'tsp' | 'tbsp' | '2tbsp';

/** Teaspoons of oil or butter per option. One teaspoon is about 4.5 g fat and 40 kcal. */
const TSP: Record<AddedFat, number> = { none: 0, tsp: 1, tbsp: 3, '2tbsp': 6 };

export const ADDED_FAT_OPTIONS: { value: AddedFat; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'tsp', label: '1 tsp' },
  { value: 'tbsp', label: '1 tbsp' },
  { value: '2tbsp', label: '2 tbsp' },
];

export const ADDED_FAT_NAME = 'Added oil or butter';

/** The extra item for cooking fat or dressing, or null for none. */
export function addedFatItem(amount: AddedFat): AiFoodItem | null {
  const tsp = TSP[amount];
  if (!tsp) return null;
  return {
    name: ADDED_FAT_NAME,
    grams: round1(tsp * 4.5),
    kcal: tsp * 40,
    protein: 0,
    carbs: 0,
    fat: round1(tsp * 4.5),
    fiber: 0,
    // The user chose the amount; the uncertainty left is how level the spoon was.
    confidence: 0.8,
  };
}

// ------------------------------------------------------------ editable rows

/** One reviewable line. `origin` is what edits scale from; `item` is what is shown and logged. */
export interface ReviewRow {
  key: string;
  origin: AiFoodItem;
  item: AiFoodItem;
  kind: 'detected' | 'added' | 'fat';
}

let seq = 0;
const nextKey = () => `r${Date.now().toString(36)}${(seq++).toString(36)}`;

export function rowsFromResult(result: AiFoodResult): ReviewRow[] {
  return result.items.map((it) => ({ key: nextKey(), origin: it, item: it, kind: 'detected' as const }));
}

export function makeRow(item: AiFoodItem, kind: ReviewRow['kind']): ReviewRow {
  return { key: nextKey(), origin: item, item, kind };
}

export function setRowGrams(row: ReviewRow, grams: number): ReviewRow {
  return { ...row, item: rescaleItem(row.origin, grams) };
}

export function renameRow(row: ReviewRow, name: string): ReviewRow {
  return { ...row, origin: { ...row.origin, name }, item: { ...row.item, name } };
}

/** Replace any added-fat row with the chosen amount (or remove it for none). */
export function applyAddedFat(rows: ReviewRow[], amount: AddedFat): ReviewRow[] {
  const rest = rows.filter((r) => r.kind !== 'fat');
  const fat = addedFatItem(amount);
  return fat ? [...rest, makeRow(fat, 'fat')] : rest;
}

/** Step size for the minus and plus buttons, proportionate to the portion. */
export function gramStep(grams: number): number {
  if (grams < 30) return 5;
  if (grams < 150) return 10;
  if (grams < 400) return 25;
  return 50;
}

export function formatKcalRange([low, high]: [number, number]): string {
  return `likely ${low} to ${high}`;
}
