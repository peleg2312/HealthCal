/**
 * Meals shown to friends, on the wire: the same cleaning the server does
 * (social_clean_meal in supabase/migrations/20261201000000_friends_meals.sql), so the
 * app can show "exactly the card your friends will see" before anything is sent, tell
 * whether a meal changed since it was shown, and read the server's answers without
 * trusting them. Pure; scripts/dev/mock-backend.cjs applies the same rules and
 * friendsWire.test.ts holds them.
 */
import { sha256Hex } from '@/lib/sha256';
import type { FeedItem, FeedMeal, FeedWorkout, FriendPerson, ISODate, MealSettings, MealType, MySharedMeal, SharedFoodSource, SharedMealItem } from '@/types';

/** The most foods a shown meal carries; more are left out. */
export const MAX_SHARED_FOODS = 15;
/** A shown meal leaves by itself this long after it was first shown. */
export const SHARED_MEAL_DAYS = 7;
export const DEFAULT_MEAL_SETTINGS: MealSettings = { auto: [], kcal: false, see: true };

const MEALS: readonly MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];
const SOURCES: readonly SharedFoodSource[] = ['builtin', 'usda', 'openfoodfacts', 'custom', 'ai', 'quick', 'typical'];
const BUNDLED_SOURCES: readonly SharedFoodSource[] = ['builtin', 'typical', 'usda'];
const REF = /^[0-9a-f]{32}$/;

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json => !!v && typeof v === 'object' && !Array.isArray(v);
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isMeal = (v: unknown): v is MealType => typeof v === 'string' && (MEALS as readonly string[]).includes(v);
const isRef = (v: unknown): v is string => typeof v === 'string' && REF.test(v);

/** A real calendar day written as YYYY-MM-DD. */
export function isCalendarDay(v: unknown): v is ISODate {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

/**
 * Text as the server keeps it (social_clean_text): control characters become a space, cut
 * to `max` characters (code points, as PostgreSQL counts), spaces trimmed; empty is none.
 */
export function cleanWireText(v: unknown, max: number): string | undefined {
  if (typeof v !== 'string') return undefined;
  const flat = v.replace(/[\u0000-\u001f\u007f-\u009f]+/g, ' ');
  const cut = Array.from(flat).slice(0, max).join('').replace(/^ +| +$/g, '');
  return cut === '' ? undefined : cut;
}

/** PostgreSQL's round(numeric, places): half away from zero on the decimal written. */
function roundTo(x: number, places: number): number {
  const text = String(Math.abs(x));
  const scaled = text.includes('e') ? Math.round(Math.abs(x) * 10 ** places) : Math.round(Number(`${text}e${places}`));
  const out = text.includes('e') ? scaled / 10 ** places : Number(`${scaled}e-${places}`);
  return x < 0 ? -out : out;
}

const kcalValue = (v: number) => Math.min(Math.max(roundTo(v, 0), 0), 20000) || 0;

/**
 * The foods of a shown meal as friends receive them: at most 15, each with only the allowed
 * keys within their bounds, and calories only when `showKcal`. A food without a name or a
 * known kind of source is left out. The same rule as the server's social_clean_meal.
 */
export function cleanSharedMealItems(raw: unknown, showKcal: boolean): SharedMealItem[] {
  if (!Array.isArray(raw)) return [];
  const out: SharedMealItem[] = [];
  for (const e of raw) {
    if (out.length >= MAX_SHARED_FOODS) break;
    if (!isObject(e)) continue;
    const name = cleanWireText(e.name, 60);
    const source = e.source;
    if (!name || typeof source !== 'string' || !(SOURCES as readonly string[]).includes(source)) continue;
    const item: SharedMealItem = { name, emoji: cleanWireText(e.emoji, 8) ?? '', portion: cleanWireText(e.portion, 40) ?? '', source: source as SharedFoodSource };
    if ((BUNDLED_SOURCES as readonly string[]).includes(source) && typeof e.foodId === 'string' && /^b_[a-z0-9_]{1,40}$/.test(e.foodId)) item.foodId = e.foodId;
    if (typeof e.barcode === 'string' && /^[0-9]{6,14}$/.test(e.barcode)) item.barcode = e.barcode;
    const serving = cleanWireText(e.serving, 40);
    if (serving) item.serving = serving;
    if (isNumber(e.quantity) && e.quantity > 0) item.quantity = Math.min(roundTo(e.quantity, 2), 1000);
    if (isNumber(e.grams) && e.grams > 0) item.grams = Math.min(roundTo(e.grams, 1), 10000);
    if (showKcal) {
      if (isNumber(e.kcal)) item.kcal = kcalValue(e.kcal);
      if (isNumber(e.kcalLow) && isNumber(e.kcalHigh) && e.kcalLow <= e.kcalHigh) {
        item.kcalLow = kcalValue(e.kcalLow);
        item.kcalHigh = kcalValue(e.kcalHigh);
      }
    }
    out.push(item);
  }
  return out;
}

/** A stable text form of a meal's foods, to tell whether it changed since it was shown. */
export function mealItemsSignature(items: readonly SharedMealItem[]): string {
  return JSON.stringify(
    items.map((i) => [i.name, i.emoji ?? '', i.portion, i.source, i.foodId ?? null, i.barcode ?? null, i.serving ?? null, i.quantity ?? null, i.grams ?? null, i.kcal ?? null, i.kcalLow ?? null, i.kcalHigh ?? null]),
  );
}

/**
 * The opaque reference the server gives a shown meal: the first 32 hex characters of
 * SHA-256(shareKey + ':meal:' + day + ':' + meal). The same day and meal is the same shown
 * meal. Made on the server (social_meal_ref); here for matching and tests only.
 */
export function sharedMealRef(shareKey: string, day: ISODate, meal: MealType): string {
  return sha256Hex(`${shareKey}:meal:${day}:${meal}`).slice(0, 32);
}

/** What a cheer for a shown meal carries. */
export const mealCheerRef = (ref: string) => `meal:${ref}`;
/** The shown meal a cheer is for, or null when it is for a workout or a day. */
export function mealOfCheer(cheerRef: string): string | null {
  return cheerRef.startsWith('meal:') && isRef(cheerRef.slice(5)) ? cheerRef.slice(5) : null;
}

/** Meal settings as the server sent them, made whole. */
export function cleanMealSettings(raw: unknown): MealSettings {
  const o = isObject(raw) ? raw : {};
  const auto = Array.isArray(o.auto) ? MEALS.filter((m) => (o.auto as unknown[]).includes(m)) : [];
  return { auto, kcal: o.kcal === true, see: o.see !== false };
}

function person(o: Json): FriendPerson {
  return { userId: typeof o.user_id === 'string' ? o.user_id : '', displayName: typeof o.display_name === 'string' ? o.display_name : '', avatar: typeof o.avatar === 'string' ? o.avatar : '' };
}

/**
 * The feed as the server sent it (friends_overview -> feed), made safe to draw: an item
 * that is not the expected shape is dropped, one malformed item never takes the screen down.
 * The server's order (newest first) is kept.
 */
export function toFeed(raw: unknown): FeedItem[] {
  if (!Array.isArray(raw)) return [];
  const out: FeedItem[] = [];
  for (const x of raw) {
    if (!isObject(x) || typeof x.user_id !== 'string' || !isRef(x.ref) || !isCalendarDay(x.day)) continue;
    if (x.kind === 'meal') {
      if (!isMeal(x.meal)) continue;
      const showKcal = x.show_kcal === true;
      const items = cleanSharedMealItems(x.items, showKcal);
      if (!items.length) continue;
      const meal: FeedMeal = { kind: 'meal', ...person(x), ref: x.ref, day: x.day, meal: x.meal, items, showKcal, cheered: x.cheered === true };
      out.push(meal);
    } else if (x.kind === 'workout') {
      if (!isNumber(x.minutes) || x.minutes < 0) continue;
      const name = typeof x.name === 'string' && x.name.trim() ? x.name.trim() : 'Workout';
      const workout: FeedWorkout = {
        kind: 'workout',
        ...person(x),
        ref: x.ref,
        day: x.day,
        name,
        emoji: typeof x.emoji === 'string' ? x.emoji : '',
        minutes: x.minutes,
        cheered: x.cheered === true,
        ...(isNumber(x.distance_km) && x.distance_km > 0 ? { distanceKm: x.distance_km } : null),
      };
      out.push(workout);
    }
  }
  return out;
}

/** A friend as `toOverview` holds them, with only what `workoutFeedOf` reads. */
export interface FeedFriend extends FriendPerson {
  /** References this user already cheered. */
  cheered: readonly string[];
  summary: { workouts?: readonly { id: string; name: string; emoji: string; minutes: number; date: string; distanceKm?: number }[] };
}

/**
 * The feed's workouts made on the phone from friends' shared weeks, for a server that sends no feed (before
 * 20261201000000_friends_meals.sql is applied; the overview then has no `feed` key): the same items the server's
 * feed would hold for them, in its order (the day, newest first, then the place in the friend's list, then the
 * name and the reference), at most 100. The 7 days are the phone's own, as for the server's feed (`localFeed`).
 */
export function workoutFeedOf(friends: readonly FeedFriend[]): FeedWorkout[] {
  const rows: { item: FeedWorkout; seq: number; name: string }[] = [];
  for (const f of friends) {
    if (!f.userId) continue;
    (f.summary.workouts ?? []).forEach((w, i) => {
      if (!isRef(w.id) || !isCalendarDay(w.date) || !isNumber(w.minutes) || w.minutes < 0) return;
      const item: FeedWorkout = {
        kind: 'workout',
        userId: f.userId,
        displayName: f.displayName,
        avatar: f.avatar,
        ref: w.id,
        day: w.date,
        name: w.name.trim() || 'Workout',
        emoji: w.emoji,
        minutes: w.minutes,
        cheered: f.cheered.includes(w.id),
        ...(isNumber(w.distanceKm) && w.distanceKm > 0 ? { distanceKm: w.distanceKm } : null),
      };
      rows.push({ item, seq: i, name: f.displayName.toLowerCase() });
    });
  }
  const text = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  rows.sort((a, b) => text(b.item.day, a.item.day) || a.seq - b.seq || text(a.name, b.name) || text(a.item.ref, b.item.ref));
  return rows.slice(0, 100).map((r) => r.item);
}

/** The user's own meals showing now (friends_overview -> my_meals), newest first. */
export function toMyMeals(raw: unknown): MySharedMeal[] {
  if (!Array.isArray(raw)) return [];
  const out: MySharedMeal[] = [];
  for (const x of raw) {
    if (!isObject(x) || !isRef(x.ref) || !isCalendarDay(x.day) || !isMeal(x.meal)) continue;
    const showKcal = x.show_kcal === true;
    out.push({
      ref: x.ref,
      day: x.day,
      meal: x.meal,
      items: cleanSharedMealItems(x.items, showKcal),
      showKcal,
      shownAt: typeof x.shown_at === 'string' ? x.shown_at : '',
      expiresAt: typeof x.expires_at === 'string' ? x.expires_at : '',
      viewers: Array.isArray(x.viewers) ? x.viewers.filter(isObject).map(person).filter((p) => p.userId) : [],
      cheers: isNumber(x.cheers) && x.cheers > 0 ? Math.round(x.cheers) : 0,
    });
  }
  return out;
}
