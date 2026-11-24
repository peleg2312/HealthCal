/**
 * Pure maths for reviewing an AI meal estimate: rescaling edited portions,
 * totals, an honest calorie range, and the added-fat item that covers what a
 * camera cannot see. No React, no storage, so it is unit-tested directly.
 */
import type { AiFoodItem, AiFoodResult, Food, SavedMealItem } from '@/types';

import { itemFromFood } from './localMatch';

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
 * Relative uncertainty of one item. `buildEntry` (src/features/food/build.ts) uses it too, so the range shown
 * here is the same one the diary shows after logging: 15 % for a confident
 * item, widening to 45 % for a guess. `widen` scales it (PHOTO_SPREAD for an
 * item read from a photo), never past 90 %.
 */
export function itemSpread(confidence: number, widen = 1): number {
  return Math.min(0.9, (0.15 + (1 - clamp01(confidence)) * 0.3) * widen);
}

/**
 * How much wider the band is for an item the model read from a photo. Measured
 * against weighed dishes (README, "AI food estimate"): the plain band held the
 * true calories in only 44% of quick photo answers (58% careful); one and a half
 * times as wide holds them in about two thirds (quick, about +-40%) and about
 * four in five (careful). Typed meals keep the plain band.
 */
export const PHOTO_SPREAD = 1.5;

/** The spread factor for a review row: wider for what the model read from a photo, plain for what the person added or chose. */
export function rowWiden(row: Pick<ReviewRow, 'kind'>, fromPhoto: boolean): number {
  return fromPhoto && row.kind === 'detected' ? PHOTO_SPREAD : 1;
}

/**
 * Calorie range for the whole meal. Item ranges are added, not combined
 * as independent errors: photo estimates tend to miss in the same direction
 * (portions and hidden fat both run the same way), so a narrower band would overstate
 * certainty. Rounded outward to 10 kcal. `widen` is per item, in the items' order (1 when left out).
 */
export function calorieRange(items: AiFoodItem[], widen: number[] = []): [number, number] {
  let low = 0;
  let high = 0;
  items.forEach((it, i) => {
    const s = itemSpread(it.confidence, widen[i] ?? 1);
    low += it.kcal * (1 - s);
    high += it.kcal * (1 + s);
  });
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
  /**
   * A database food the row was matched or swapped to. Its per-gram values
   * replace the model's, and it is logged with this definition.
   */
  food?: Food;
  /** The model's own estimate, kept so a swap can be undone. */
  estimate?: AiFoodItem;
}

let seq = 0;
const nextKey = () => `r${Date.now().toString(36)}${(seq++).toString(36)}`;

export function rowsFromResult(result: AiFoodResult): ReviewRow[] {
  return result.items.map((it) => ({ key: nextKey(), origin: it, item: it, kind: 'detected' as const }));
}

export function makeRow(item: AiFoodItem, kind: ReviewRow['kind'], food?: Food): ReviewRow {
  return { key: nextKey(), origin: item, item, kind, ...(food ? { food } : null) };
}

export function setRowGrams(row: ReviewRow, grams: number): ReviewRow {
  if (row.food) return { ...row, item: itemFromFood(row.food, grams, row.item.confidence) };
  return { ...row, item: rescaleItem(row.origin, grams) };
}

/**
 * Rename a row. A row swapped to a database food goes back to being an
 * estimate under the new name: the food's values no longer describe it.
 */
export function renameRow(row: ReviewRow, name: string): ReviewRow {
  if (row.food) {
    const base = row.estimate ? rescaleItem(row.estimate, row.item.grams) : row.item;
    const { food: _food, estimate: _estimate, ...rest } = row;
    return { ...rest, origin: { ...base, name }, item: { ...base, name } };
  }
  return { ...row, origin: { ...row.origin, name }, item: { ...row.item, name } };
}

/**
 * Swap a row to a database food at the current weight. The calories now come
 * from the food; the portion is still the model's (or the user's) guess, so
 * the row keeps its confidence and its range.
 */
export function swapRow(row: ReviewRow, food: Food): ReviewRow {
  const estimate = row.estimate ?? (row.food ? undefined : row.origin);
  const item = itemFromFood(food, row.item.grams, row.item.confidence);
  return { ...row, origin: item, item, food, ...(estimate ? { estimate } : null) };
}

/** Undo a swap: back to the model's estimate at the current weight. */
export function unswapRow(row: ReviewRow): ReviewRow {
  if (!row.food || !row.estimate) return row;
  const item = rescaleItem(row.estimate, row.item.grams);
  return { key: row.key, kind: row.kind, origin: row.estimate, item };
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

/**
 * The words before the range. "likely" where the band holds the truth most of the time (typed meals, the
 * careful pass on a photo); "rough" for a quick photo answer, whose band holds it about two times in three.
 */
export type RangeWord = 'likely' | 'rough';

export function rangeWord(fromPhoto: boolean, carefulPass: boolean): RangeWord {
  return fromPhoto && !carefulPass ? 'rough' : 'likely';
}

export function formatKcalRange([low, high]: [number, number], word: RangeWord = 'likely'): string {
  return `${word} ${low} to ${high}`;
}

// ------------------------------------------------------------ correction

/** Longest text the analyze function accepts. */
export const MAX_TEXT = 500;

/**
 * Text for a re-estimate: the original note or description plus what the
 * user says was wrong. The correction is kept whole; the original is cut to
 * fit when the two together are too long.
 */
export function withCorrection(base: string | undefined, correction: string): string {
  const fix = correction.trim().slice(0, 300);
  const label = 'Correction from the person who ate it: ';
  const original = (base ?? '').trim();
  if (!fix) return original.slice(0, MAX_TEXT);
  const tail = `${label}${fix}`;
  if (!original) return tail;
  const room = MAX_TEXT - tail.length - 1;
  return room > 0 ? `${original.slice(0, room)}\n${tail}` : tail;
}

// ------------------------------------------------------------ logging

/**
 * The row mark of an estimated food when no food in the list is like it: a pot of food, a dish with
 * colour that can be seen on every card (the white plate all but vanished on the light papers). Never
 * a sparkle: that an entry is an AI estimate is said by its source mark (`SourceMark`, the small AI
 * cup), not by its emoji.
 */
export const AI_FOOD_EMOJI = '🍲';

/**
 * A food definition for an estimated item, so the diary entry can be
 * re-portioned later in the grams editor and found again in Recent.
 * `emoji` is the mark of the food in the list that the item names, when the caller found one.
 */
export function aiFoodDefinition(item: AiFoodItem, id: string, emoji: string = AI_FOOD_EMOJI): Food {
  const g = item.grams > 0 ? item.grams : 100;
  const per = (v: number) => Math.round(((v * 100) / g) * 10) / 10;
  return {
    id,
    name: item.name,
    per100g: { kcal: Math.round((item.kcal * 100) / g), protein: per(item.protein), carbs: per(item.carbs), fat: per(item.fat), fiber: per(item.fiber) },
    servings: [{ label: `${Math.round(g)} g`, grams: Math.round(g) }],
    source: 'ai',
    verified: false,
    emoji,
  };
}

/** Calorie range for one logged item, the same band the review shows. */
export function itemRange(item: AiFoodItem, widen = 1): [number, number] {
  const s = itemSpread(item.confidence, widen);
  return [Math.round(item.kcal * (1 - s)), Math.round(item.kcal * (1 + s))];
}

/**
 * The diary lines for the reviewed rows. Estimated rows carry a derived
 * definition and their range (wider for rows read from a photo, `fromPhoto`); rows matched to a database food are logged
 * with that food per gram, keeping the range because the portion is still a
 * guess. Rows without a name or weight are left out. `emojiOf` gives an estimated
 * row the mark of the food it names (`emojiLike`, ./localMatch.ts: "Grilled chicken
 * breast" wears the chicken's), so the diary's rows read as food; without one it wears the plate.
 */
export function rowsToLogItems(rows: ReviewRow[], makeId: () => string, fromPhoto = false, emojiOf?: (name: string) => string | undefined): SavedMealItem[] {
  const out: SavedMealItem[] = [];
  for (const r of rows) {
    const it = { ...r.item, name: r.item.name.trim() };
    if (!(it.grams > 0) || !it.name) continue;
    const nutrients = { kcal: it.kcal, protein: it.protein, carbs: it.carbs, fat: it.fat, fiber: it.fiber };
    const range = { kcalRange: itemRange(it, rowWiden(r, fromPhoto)), confidence: it.confidence };
    if (r.food) {
      out.push({
        name: r.food.name,
        brand: r.food.brand,
        emoji: r.food.emoji ?? '🍽️',
        servingLabel: '1 g',
        quantity: it.grams,
        grams: it.grams,
        nutrients,
        food: r.food,
        source: r.food.source,
        verified: r.food.verified,
        ...range,
      });
      continue;
    }
    const food = aiFoodDefinition(it, `ai_${makeId()}`, emojiOf?.(it.name) || AI_FOOD_EMOJI);
    out.push({
      name: it.name,
      emoji: food.emoji,
      servingLabel: food.servings[0].label,
      quantity: 1,
      grams: it.grams,
      nutrients,
      food,
      source: 'ai',
      verified: false,
      ...range,
    });
  }
  return out;
}
