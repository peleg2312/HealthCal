/**
 * "Meals that fit": up to three meals that fit what is left of the day's budget, for the meal "What
 * fits" works out, each a list of items `logItems` (@/features/food/log) logs in one tap, priced at
 * today's values. Pure, so every rule is unit-tested (ideas.test.ts).
 *
 * 1. The person's own past meals for that meal (the 30 days before the day, two foods or more, one
 *    idea per set of foods, never one holding alcohol; drinks logged on Water are left out) and their
 *    saved meals: whole when it fits what is left, else three quarters or half when that fits and is
 *    still 150 kcal or more ("Half of Tuesday's dinner"). Ranked by closeness to the usual size of
 *    that meal (never past what is left), then by protein when protein is the gap, then newest.
 * 2. Fewer than three: plates from the fixed list (`plates.ts`), which ones rotating by the day, kept
 *    only at 85% of what is left or less (halved when the whole is more), one without meat or fish
 *    among them whenever one fits. A plate is an estimate: cooking oil is not in it.
 * 3. Under 150 kcal left: no meal ideas ('few'; the sheet shows the person's own foods that fit).
 *    Over the budget: no ideas at all ('over'), only a neutral line. Never a list of low-calorie foods.
 */
import { BUILTIN_FOODS } from '@/data/foods';
import { isAlcohol } from '@/features/drinks/rules';
import { isWaterDrinkEntry } from '@/features/drinks/via';
import { foodNameHead, toastFoodName } from '@/features/food/addedTo';
import { planSavedMeal, savedItemFromFood, setItemAmount } from '@/features/food/build';
import { displayFoodName } from '@/features/food/displayName';
import { currentValues, foodKey } from '@/features/food/usuals';
import { isolateRtl } from '@/lib/bidi';
import { addDays, diffDays, formatShortDate, fromISODate } from '@/lib/dates';
import { MEAL_LABEL } from '@/lib/nutrition';
import { formatNumber } from '@/lib/units';
import type { FoodEntry, ISODate, MealType, SavedMeal, SavedMealItem } from '@/types';

import { platesFor, type Plate } from './plates';

/** Below this many kcal left there are no meal ideas, and a part of a meal is never offered below it. */
export const IDEAS_FROM_KCAL = 150;
/** A plate is kept only at this share of what is left or less: cooking oil is not in it. */
export const PLATE_SHARE = 0.85;
/** How far back the person's own meals are read. */
export const IDEA_DAYS = 30;
export const MAX_IDEAS = 3;

export type IdeaKind = 'past' | 'saved' | 'plate';
/** Whole, three quarters or half of the meal. */
export type IdeaShare = 1 | 0.75 | 0.5;

export interface MealIdea {
  /** Stable while the sheet is open: one per set of foods ('set:...'), saved meal ('saved:<id>') or plate ('plate:<id>'). */
  key: string;
  kind: IdeaKind;
  share: IdeaShare;
  /** "Tuesday's dinner", "Half of yesterday's lunch", "Three quarters of Pasta night", "Chicken, rice and salad". */
  name: string;
  /** What `logItems` writes: already at the share, priced at today's values. */
  items: SavedMealItem[];
  kcal: number;
  protein: number;
  /** The foods' names, in the order they were logged. */
  foods: string[];
  /** The first item's emoji, for the row. */
  emoji?: string;
}

export type MealIdeas =
  | { state: 'ideas'; ideas: MealIdea[]; plates: boolean }
  | { state: 'few'; ideas: [] }
  | { state: 'over'; ideas: []; overBy: number };

export interface MealIdeasInput {
  /** Live diary entries (any days; soft-deleted ones already left out). */
  entries: readonly FoodEntry[];
  /** Live saved meals. */
  savedMeals: readonly SavedMeal[];
  /** The meal the ideas are for. */
  meal: MealType;
  /** The day they would be logged to: own meals are read from the 30 days before it. */
  date: ISODate;
  /** The calendar day it is now: names "yesterday's" and "Tuesday's" from it. */
  today: ISODate;
  /** Calories left on `date` (negative when over). */
  kcalLeft: number;
  /** Protein is the gap: among meals of about the same size, more protein first. */
  proteinGap?: boolean;
  limit?: number;
}

const BUILTIN_BY_ID = new Map(BUILTIN_FOODS.map((f) => [f.id, f]));
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const SHARE_WORDS: Record<IdeaShare, string> = { 1: '', 0.75: 'Three quarters of ', 0.5: 'Half of ' };
/** Two meals this close to the usual size count as the same size, so protein can decide between them. */
const SIZE_STEP = 50;

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** "yesterday's dinner", "Tuesday's dinner" (within the week), "dinner from Nov 3". */
export function pastMealName(meal: MealType, date: ISODate, today: ISODate): string {
  const m = MEAL_LABEL[meal].toLowerCase();
  const ago = diffDays(date, today);
  if (ago === 1) return `yesterday's ${m}`;
  if (ago >= 2 && ago <= 6) return `${WEEKDAYS[fromISODate(date).getDay()]}'s ${m}`;
  return `${m} from ${formatShortDate(date)}`;
}

/** "Tuesday's dinner", "Half of Tuesday's dinner", "Three quarters of yesterday's lunch". */
export function sharedName(share: IdeaShare, base: string): string {
  return share === 1 ? cap(base) : `${SHARE_WORDS[share]}${base}`;
}

/** "Chicken, rice and salad" after "Half of": lower case, except a word that is always written with a capital ("Greek yogurt"). */
const lowerFirst = (name: string) => (/^(Greek|Israeli|Turkish|French|Italian|Swiss)\b/.test(name) ? name : name[0].toLowerCase() + name.slice(1));

function entryItem(e: FoodEntry): SavedMealItem {
  return {
    name: e.name,
    brand: e.brand,
    emoji: e.emoji,
    ...(e.kcalRange ? { kcalRange: e.kcalRange, confidence: e.confidence } : null),
    servingLabel: e.servingLabel,
    quantity: e.quantity,
    grams: e.grams,
    nutrients: e.nutrients,
    food: e.food,
    source: e.source,
    verified: e.verified,
  };
}

/** One item at a share of its amount, at today's values (a bundled food is priced from its grams). */
function atShare(it: SavedMealItem, share: number): SavedMealItem {
  const now = currentValues(it);
  if (share === 1 || !(now.quantity > 0)) return now;
  const scaled = setItemAmount(now, { label: now.servingLabel, grams: now.grams / now.quantity }, now.quantity * share);
  return currentValues(scaled);
}

const totals = (items: SavedMealItem[]) =>
  items.reduce((t, it) => ({ kcal: t.kcal + it.nutrients.kcal, protein: t.protein + it.nutrients.protein }), { kcal: 0, protein: 0 });

const itemAlcohol = (it: Pick<SavedMealItem, 'name' | 'food'>) => isAlcohol({ id: it.food?.id ?? '', name: it.name });
const entryAlcohol = (e: FoodEntry) => isAlcohol({ id: e.foodId ?? e.food?.id ?? '', name: e.name });

interface Candidate {
  key: string;
  kind: 'past' | 'saved';
  base: string;
  items: SavedMealItem[];
  /** Newest first among ties. */
  when: string;
}

/** The person's meals: one per set of foods (the newest day it was eaten), then the saved meals. */
function ownCandidates(input: MealIdeasInput): Candidate[] {
  const { entries, savedMeals, meal, date, today } = input;
  const floor = addDays(date, -IDEA_DAYS);
  const byDay = new Map<ISODate, FoodEntry[]>();
  for (const e of entries) {
    if (e.meal !== meal || e.date >= date || e.date < floor || isWaterDrinkEntry(e)) continue;
    const list = byDay.get(e.date) ?? [];
    list.push(e);
    byDay.set(e.date, list);
  }
  const out: Candidate[] = [];
  const seen = new Set<string>();
  for (const day of [...byDay.keys()].sort().reverse()) {
    const list = byDay.get(day)!.sort((a, b) => a.loggedAt.localeCompare(b.loggedAt));
    const keys = new Set(list.map(foodKey));
    if (keys.size < 2 || list.some(entryAlcohol)) continue;
    const key = `set:${[...keys].sort().join('|')}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ key, kind: 'past', base: pastMealName(meal, day, today), items: list.map(entryItem), when: day });
  }
  for (const s of savedMeals) {
    if (!s.items.length || s.items.some(itemAlcohol)) continue;
    const plan = planSavedMeal(s);
    if (!plan.items.length || !(plan.kcal > 0)) continue;
    // The same set of foods as a meal already offered (a saved meal the person also ate last week) is one idea, not two.
    const set = `set:${[...new Set(plan.items.map((it) => foodKey({ foodId: it.food?.id, name: it.name, brand: it.brand })))].sort().join('|')}`;
    if (seen.has(set)) continue;
    seen.add(set);
    out.push({ key: `saved:${s.id}`, kind: 'saved', base: s.name, items: plan.items, when: s.updatedAt ?? '' });
  }
  return out;
}

/** The usual size of the meal: the median of its days in the window (stored values; drinks from Water left out). */
export function usualMealKcal(entries: readonly FoodEntry[], meal: MealType, date: ISODate): number | null {
  const floor = addDays(date, -IDEA_DAYS);
  const byDay = new Map<ISODate, number>();
  for (const e of entries) {
    if (e.meal !== meal || e.date >= date || e.date < floor || isWaterDrinkEntry(e)) continue;
    byDay.set(e.date, (byDay.get(e.date) ?? 0) + e.nutrients.kcal);
  }
  const days = [...byDay.values()].filter((k) => k > 0).sort((a, b) => a - b);
  if (!days.length) return null;
  const mid = Math.floor(days.length / 2);
  return days.length % 2 ? days[mid] : (days[mid - 1] + days[mid]) / 2;
}

function ideaOf(c: { key: string; kind: IdeaKind; base: string; items: SavedMealItem[] }, share: IdeaShare): MealIdea {
  const items = c.items.map((it) => atShare(it, share));
  const t = totals(items);
  return {
    key: c.key,
    kind: c.kind,
    share,
    // A plate's name is a description ("Half of chicken, rice and salad"); a saved meal's is its own name.
    name: sharedName(share, c.kind === 'plate' && share !== 1 ? lowerFirst(c.base) : c.base),
    items,
    kcal: t.kcal,
    protein: t.protein,
    foods: items.map((it) => it.name),
    emoji: items.find((it) => it.emoji)?.emoji,
  };
}

/** The largest share of a candidate that fits: whole within what is left, a part only at 150 kcal or more. */
function fitted(c: Candidate, left: number): MealIdea | null {
  for (const share of [1, 0.75, 0.5] as IdeaShare[]) {
    const idea = ideaOf(c, share);
    if (idea.kcal <= 0) return null;
    if (idea.kcal <= left && (share === 1 || idea.kcal >= IDEAS_FROM_KCAL)) return idea;
  }
  return null;
}

/** A whole number for a day, so the plates shown turn over each day and stay put within it. */
function dayIndex(date: ISODate): number {
  return Math.max(0, diffDays('2000-01-01', date));
}

function plateItems(pl: Plate): SavedMealItem[] {
  return pl.items.map((it) => {
    const food = BUILTIN_BY_ID.get(it.foodId);
    const serving = food?.servings.find((s) => s.label === it.serving);
    if (!food || !serving) throw new Error(`plate ${pl.id}: ${it.foodId} ${it.serving}`);
    return savedItemFromFood(food, serving, it.quantity);
  });
}

/** Plates for the meal that fit in 85% of what is left (halved when the whole does not), rotated by the day. */
export function plateIdeas(meal: MealType, date: ISODate, kcalLeft: number, count: number): MealIdea[] {
  if (count <= 0) return [];
  const list = platesFor(meal);
  if (!list.length) return [];
  const room = kcalLeft * PLATE_SHARE;
  const start = dayIndex(date) % list.length;
  const rotated = list.map((_, i) => list[(start + i) % list.length]);
  const fits: { idea: MealIdea; plate: Plate }[] = [];
  for (const pl of rotated) {
    const c = { key: `plate:${pl.id}`, kind: 'plate' as const, base: pl.name, items: plateItems(pl) };
    const whole = ideaOf(c, 1);
    const idea = whole.kcal <= room ? whole : ideaOf(c, 0.5);
    if (idea.kcal <= room && idea.kcal > 0) fits.push({ idea, plate: pl });
  }
  const chosen = fits.slice(0, count);
  // One without meat or fish among them whenever one fits.
  if (chosen.length && chosen.every((f) => f.plate.meatOrFish)) {
    const veg = fits.find((f) => !f.plate.meatOrFish);
    if (veg) chosen[chosen.length - 1] = veg;
  }
  return chosen.map((f) => f.idea);
}

/** Up to three meals that fit what is left (see the header). */
export function mealIdeas(input: MealIdeasInput): MealIdeas {
  const { kcalLeft, meal, date, proteinGap = false, limit = MAX_IDEAS } = input;
  const left = Math.round(kcalLeft);
  if (left < 0) return { state: 'over', ideas: [], overBy: -left };
  if (left < IDEAS_FROM_KCAL) return { state: 'few', ideas: [] };

  const usual = usualMealKcal(input.entries, meal, date);
  const target = Math.min(usual ?? left, left);
  const own = ownCandidates(input)
    .map((c) => ({ c, idea: fitted(c, left) }))
    .filter((x): x is { c: Candidate; idea: MealIdea } => x.idea !== null)
    .sort((a, b) => {
      const da = Math.round(Math.abs(a.idea.kcal - target) / SIZE_STEP);
      const db = Math.round(Math.abs(b.idea.kcal - target) / SIZE_STEP);
      if (da !== db) return da - db;
      if (proteinGap && Math.round(a.idea.protein) !== Math.round(b.idea.protein)) return b.idea.protein - a.idea.protein;
      return b.c.when.localeCompare(a.c.when);
    })
    .map((x) => x.idea)
    .slice(0, limit);
  const plates = plateIdeas(meal, date, left, limit - own.length);
  return { state: 'ideas', ideas: [...own, ...plates], plates: plates.length > 0 };
}

// ------------------------------------------------------------------ words

export const IDEAS_TITLE = 'Meals that fit';
export const PLATE_NOTE = 'An estimate. Cooking oil adds about 40 kcal a teaspoon.';

/** The line in place of every list when the day is above its budget. */
export function overLine(overBy: number, isToday: boolean): string {
  const n = formatNumber(Math.round(overBy));
  return `${isToday ? 'Today is' : 'That day is'} ${n} kcal above the budget. One day does not move the week's trend much.`;
}

export type IdeaRow = { kind: 'open' } | { kind: 'added' } | { kind: 'dim'; caption: string };

/**
 * What a row says once the sheet has seen an add: it never moves or goes away. The one added shows its
 * tick; one that no longer fits in what is left now is dimmed with a neutral caption (never amber).
 */
export function ideaRow(kcal: number, added: boolean, left: number): IdeaRow {
  if (added) return { kind: 'added' };
  const more = Math.round(kcal) - Math.round(left);
  if (more > 0) return { kind: 'dim', caption: `${formatNumber(more)} kcal more than what is left` };
  return { kind: 'open' };
}

/** A food's name after the first in a toast's list: lower case ("rice") unless it carries another capital ("Coca-Cola") or is always written with one. */
function laterName(name: string): string {
  if (!/^[A-Z][a-z]/.test(name) || /[A-Z]/.test(name.slice(1))) return name;
  return lowerFirst(name);
}

/**
 * The foods of an idea as a toast names them, each as a toast says a food (`toastFoodName`), each once: "Chicken
 * breast", "Chicken breast and rice", "Chicken breast, rice and 2 more".
 */
export function ideaFoodsPhrase(items: readonly Pick<SavedMealItem, 'name' | 'source'>[]): string {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const it of items) {
    const shown = displayFoodName({ name: it.name, source: it.source });
    const key = foodNameHead(shown).toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    names.push(names.length === 0 ? toastFoodName(shown) : toastFoodName(laterName(shown)));
  }
  if (names.length <= 1) return names[0] ?? '';
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  if (names.length === 3) return `${names[0]}, ${names[1]} and ${names[2]}`;
  return `${names[0]}, ${names[1]} and ${names.length - 2} more`;
}

/**
 * The toast after an idea is logged from What fits or the coach, in the meal toast's order, naming what was added
 * first: a saved meal or a plate by its own name ("Pasta night added to dinner", "Half of chicken, rice and salad
 * added to lunch"); a past meal, whose name says only where it came from ("Tuesday's dinner"), by its foods
 * ("Chicken breast and rice added to dinner"). `where` is `mealOnDay` (@/features/food/addedTo), read in the handler.
 */
export function ideaAddedToast(idea: Pick<MealIdea, 'kind' | 'name' | 'items'>, where: string): string {
  const what = idea.kind === 'past' ? ideaFoodsPhrase(idea.items) : '';
  return `${what || isolateRtl(idea.name)} added to ${where}`;
}

/** One idea as a line of text (for a reader or another screen): "Half of Tuesday's dinner: 410 kcal, 32 g protein (Chicken, Rice)". */
export function ideaLine(idea: MealIdea): string {
  return `${idea.name}: ${formatNumber(Math.round(idea.kcal))} kcal, ${Math.round(idea.protein)} g protein (${idea.foods.join(', ')})`;
}
