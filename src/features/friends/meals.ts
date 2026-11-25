/**
 * A meal shown to friends: the one door for food (as `buildFriendSummary` is for the week).
 *
 * Someone shows one meal of one day, on purpose, to the friends they pick, for 7 days. What leaves
 * the phone is each food's name, emoji, portion and where its numbers come from, and its calories
 * only when the person switched them on (a range kept for an estimate). Never the day's total, the
 * budget, macros, weight, notes, the time it was eaten, a record id or a date in clear in a reference.
 * A drink logged on the Water screen is left out, as it is for "logged" everywhere else. The server
 * keeps the same short list of keys (`social_clean_meal`), whatever a device sends.
 *
 * Pure: no React, no storage, no clock. `cleanSharedMeal` is the receiving side, like
 * `cleanFriendSummary`: anything not of the expected shape is dropped, never trusted.
 */
import { isWaterDrinkEntry } from '@/features/drinks/via';
import { portionLabel, sourceKindOf, type SourceKind } from '@/features/food/helpers';
import { addDays } from '@/lib/dates';
import { sha256Hex } from '@/lib/sha256';
import type { FoodEntry, ISODate, MealType } from '@/types';

export const MEAL_TYPES: readonly MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];
/** How long a shown meal stays in friends' feeds. */
export const SHOWN_DAYS = 7;
/** The most foods one shown meal holds. */
export const MAX_SHARED_ITEMS = 15;
export const NAME_MAX = 60;
export const PORTION_MAX = 40;
const EMOJI_MAX = 8;
const SOURCES: readonly SourceKind[] = ['builtin', 'typical', 'usda', 'openfoodfacts', 'custom', 'ai', 'quick'];

/** One food of a shown meal, as it travels (snake_case, the server's own keys). */
export interface SharedMealItem {
  name: string;
  emoji?: string;
  /** The portion as the diary draws it: "1 breast · 172 g". */
  portion: string;
  /** The serving label and amount, so a friend can copy the portion exactly. */
  serving: string;
  qty: number;
  /** Grams eaten, 0 when unknown. */
  grams: number;
  source: SourceKind;
  /** A bundled food's id (reference or typical values), so a friend's phone prices it with its own list. */
  food_id?: string;
  /** An Open Food Facts product's barcode. */
  barcode?: string;
  /** Only when the person switched calories on. */
  kcal?: number;
  kcal_low?: number;
  kcal_high?: number;
}

/** What `meal_show` takes (besides the viewers and the share key). */
export interface SharedMealPayload {
  ref: string;
  day: ISODate;
  meal: MealType;
  items: SharedMealItem[];
  showKcal: boolean;
}

/** A meal a friend shows me, as the Friends screen draws it. */
export interface FriendMeal {
  owner: string;
  ref: string;
  day: ISODate;
  meal: MealType;
  items: SharedMealItem[];
  showKcal: boolean;
  shownAt: string;
  expiresAt: string;
  /** I cheered it. Who else cheered or sees it is never sent. */
  cheered: boolean;
}

/** A meal I show: to whom, its cheers, when it leaves. */
export interface MyMeal {
  ref: string;
  day: ISODate;
  meal: MealType;
  items: SharedMealItem[];
  showKcal: boolean;
  shownAt: string;
  expiresAt: string;
  viewers: string[];
  cheers: number;
}

export interface MealSettings {
  /** Meal types shown by themselves as they are logged, from the day it was picked on. None by default. */
  auto: MealType[];
  /** Calories with shown meals. Off by default. */
  kcal: boolean;
  /** Friends' meals in my feed. On by default. */
  see: boolean;
}

export const DEFAULT_MEAL_SETTINGS: MealSettings = { auto: [], kcal: false, see: true };

/**
 * How friends refer to one shown meal: the first 32 hex characters of SHA-256 over the owner's secret
 * share key, the day and the meal. One meal per day and meal; neither the date nor a record id is in it.
 */
export function mealRef(shareKey: string, day: ISODate, meal: MealType): string {
  return sha256Hex(`${shareKey}:meal:${day}:${meal}`).slice(0, 32);
}

/** The reference a cheer for a shown meal carries. */
export const mealCheerRef = (ref: string) => `meal:${ref}`;

/** "meal:<ref>" -> ref, else null. */
export function mealRefOfCheer(cheerRef: string): string | null {
  const m = /^meal:([0-9a-f]{32})$/.exec(cheerRef);
  return m ? m[1] : null;
}

/**
 * The user's own meals of the last weeks by the reference friends see, to name a cheer ("your lunch").
 * Days from `today` back `days` days, every meal type. Empty without a share key.
 */
export function ownMealsByRef(shareKey: string | null | undefined, today: ISODate, days = 14): Map<string, { day: ISODate; meal: MealType }> {
  const out = new Map<string, { day: ISODate; meal: MealType }>();
  if (!shareKey) return out;
  for (let i = -1; i < days; i++) {
    const day = addDays(today, -i);
    for (const meal of MEAL_TYPES) out.set(mealRef(shareKey, day, meal), { day, meal });
  }
  return out;
}

const cut = (s: string, max: number) => {
  const t = s.replace(/\s+/g, ' ').trim();
  return Array.from(t).length > max ? Array.from(t).slice(0, max).join('').trim() : t;
};

/** The portion line as the diary's row draws it: "1 oz · 28 g", "250 ml", "150 g". */
export function entryPortion(e: Pick<FoodEntry, 'servingLabel' | 'quantity' | 'grams'>): string {
  const volume = /(ml|fl oz)$/.test(e.servingLabel.trim());
  return e.grams > 0 && !volume && e.servingLabel !== `${Math.round(e.grams)} g` && !/^\d+(\.\d+)?\s*g$/.test(e.servingLabel.trim())
    ? `${portionLabel(e.servingLabel, e.quantity)} · ${Math.round(e.grams)} g`
    : portionLabel(e.servingLabel, e.quantity);
}

/** The entries a shown meal holds: live, of that day and meal, logged in the diary (not a drink from Water). */
export function mealEntries(entries: readonly FoodEntry[], day: ISODate, meal: MealType): FoodEntry[] {
  return entries
    .filter((e) => !e.deleted && e.date === day && e.meal === meal && !isWaterDrinkEntry(e) && e.quantity > 0)
    .sort((a, b) => a.loggedAt.localeCompare(b.loggedAt));
}

/** One entry as friends may see it. */
function sharedItem(e: FoodEntry, showKcal: boolean): SharedMealItem {
  // An entry with a range is an estimate, whatever food it was matched to afterwards (as the diary reads it).
  const source: SourceKind = e.kcalRange ? 'ai' : sourceKindOf(e);
  const bundled = (source === 'builtin' || source === 'typical') && (e.food?.id ?? e.foodId);
  const barcode = source === 'openfoodfacts' ? (e.food?.barcode ?? '').replace(/\D/g, '') : '';
  const item: SharedMealItem = {
    name: cut(e.name, NAME_MAX) || 'Food',
    ...(e.emoji ? { emoji: Array.from(e.emoji).slice(0, EMOJI_MAX).join('') } : null),
    portion: cut(entryPortion(e), PORTION_MAX),
    serving: cut(e.servingLabel, PORTION_MAX),
    qty: Math.round(e.quantity * 1000) / 1000,
    grams: e.grams > 0 ? Math.round(e.grams * 10) / 10 : 0,
    source,
    ...(bundled ? { food_id: String(bundled) } : null),
    ...(barcode.length >= 6 && barcode.length <= 14 ? { barcode } : null),
  };
  if (showKcal) {
    item.kcal = Math.max(0, Math.round(e.nutrients.kcal));
    if (e.kcalRange) {
      item.kcal_low = Math.max(0, Math.round(e.kcalRange[0]));
      item.kcal_high = Math.max(0, Math.round(e.kcalRange[1]));
    }
  }
  return item;
}

/**
 * The meal as friends will see it, built from the diary: the one door for food. `entries` may hold the
 * whole diary; only the live entries of `day` and `meal` logged in the diary go in, at most 15. Null when
 * nothing is left to show (no share key, or no food in that meal).
 */
export function buildSharedMeal(input: { entries: readonly FoodEntry[]; day: ISODate; meal: MealType; showKcal: boolean; shareKey: string | null | undefined }): SharedMealPayload | null {
  if (!input.shareKey) return null;
  const items = mealEntries(input.entries, input.day, input.meal).slice(0, MAX_SHARED_ITEMS).map((e) => sharedItem(e, input.showKcal));
  if (!items.length) return null;
  return { ref: mealRef(input.shareKey, input.day, input.meal), day: input.day, meal: input.meal, items, showKcal: input.showKcal };
}

/** A stable text form, so an unchanged meal is not sent again after every sync. */
export function sharedMealSignature(m: SharedMealPayload): string {
  return JSON.stringify([m.ref, m.showKcal, m.items.map((i) => [i.name, i.emoji ?? '', i.portion, i.serving, i.qty, i.grams, i.source, i.food_id ?? '', i.barcode ?? '', i.kcal ?? null, i.kcal_low ?? null, i.kcal_high ?? null])]);
}

// ------------------------------------------------------------------ the receiving side

type Json = Record<string, unknown>;
const text = (v: unknown, max: number): string => (typeof v === 'string' ? cut(v, max) : '');
const num = (v: unknown, max: number): number | undefined => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max ? v : undefined);
const isDay = (v: unknown): v is ISODate => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const isMeal = (v: unknown): v is MealType => typeof v === 'string' && (MEAL_TYPES as readonly string[]).includes(v);

/** A meal's foods as the server sent them, made safe to draw. Anything unexpected is dropped. */
export function cleanSharedItems(raw: unknown, showKcal: boolean): SharedMealItem[] {
  if (!Array.isArray(raw)) return [];
  const out: SharedMealItem[] = [];
  for (const r of raw) {
    if (!r || typeof r !== 'object' || out.length >= MAX_SHARED_ITEMS) continue;
    const o = r as Json;
    const name = text(o.name, NAME_MAX);
    if (!name) continue;
    const source = (SOURCES as readonly unknown[]).includes(o.source) ? (o.source as SourceKind) : 'quick';
    const serving = text(o.serving, PORTION_MAX);
    const qty = num(o.qty, 100);
    const item: SharedMealItem = {
      name,
      portion: text(o.portion, PORTION_MAX) || serving,
      serving,
      qty: qty && qty > 0 ? qty : 1,
      grams: num(o.grams, 5000) ?? 0,
      source,
    };
    const emoji = text(o.emoji, EMOJI_MAX);
    if (emoji) item.emoji = emoji;
    if (typeof o.food_id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(o.food_id)) item.food_id = o.food_id;
    if (typeof o.barcode === 'string' && /^\d{6,14}$/.test(o.barcode)) item.barcode = o.barcode;
    if (showKcal) {
      const kcal = num(o.kcal, 10000);
      if (kcal !== undefined) item.kcal = Math.round(kcal);
      const lo = num(o.kcal_low, 10000);
      const hi = num(o.kcal_high, 10000);
      if (lo !== undefined && hi !== undefined && lo <= hi) {
        item.kcal_low = Math.round(lo);
        item.kcal_high = Math.round(hi);
      }
    }
    out.push(item);
  }
  return out;
}

/** Shared base of a friend's meal and one of mine, or null when it is not a meal. */
function cleanBase(raw: unknown): (Omit<FriendMeal, 'owner' | 'cheered'> & { o: Json }) | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Json;
  if (typeof o.ref !== 'string' || !/^[0-9a-f]{32}$/.test(o.ref) || !isDay(o.day) || !isMeal(o.meal)) return null;
  const showKcal = o.show_kcal === true;
  const items = cleanSharedItems(o.items, showKcal);
  if (!items.length) return null;
  return { o, ref: o.ref, day: o.day, meal: o.meal, items, showKcal, shownAt: text(o.shown_at, 40), expiresAt: text(o.expires_at, 40) };
}

/** A meal a friend shows me, from the overview's `meals`. Null when it is not one. */
export function cleanFriendMeal(raw: unknown): FriendMeal | null {
  const b = cleanBase(raw);
  if (!b || typeof b.o.owner !== 'string' || !b.o.owner) return null;
  const { o, ...rest } = b;
  return { ...rest, owner: o.owner as string, cheered: o.cheered === true };
}

/** A meal I show, from the overview's `my_meals`. Null when it is not one. */
export function cleanMyMeal(raw: unknown): MyMeal | null {
  const b = cleanBase(raw);
  if (!b) return null;
  const { o, ...rest } = b;
  const viewers = Array.isArray(o.viewers) ? o.viewers.filter((v): v is string => typeof v === 'string' && !!v) : [];
  return { ...rest, viewers, cheers: num(o.cheers, 1e6) ?? 0 };
}

/** The meal settings as stored on the card, with the defaults for anything missing. */
export function cleanMealSettings(raw: unknown): MealSettings {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Json;
  const auto = Array.isArray(o.auto) ? MEAL_TYPES.filter((m) => (o.auto as unknown[]).includes(m)) : [];
  return { auto, kcal: o.kcal === true, see: o.see !== false };
}

/** Whether a meal is still shown on `today` (in its 7 days, the day itself counted). By day, never the clock while drawing. */
export function inShownWindow(day: ISODate, today: ISODate): boolean {
  return day <= addDays(today, 1) && day > addDays(today, -SHOWN_DAYS);
}
