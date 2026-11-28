/**
 * Meals shown to friends, on the wire: the same cleaning the server does
 * (social_clean_meal in supabase/migrations/20261201000000_friends_meals.sql), so the
 * app can show "exactly the card your friends will see" before anything is sent, tell
 * whether a meal changed since it was shown, and read the server's answers without
 * trusting them. Pure; scripts/dev/mock-backend.cjs applies the same rules and
 * friendsWire.test.ts holds them.
 */
import { sha256Hex } from '@/lib/sha256';
import type {
  Buddy,
  BuddyDay,
  BuddyInvite,
  FeedItem,
  FeedMeal,
  FeedSavedMeal,
  FeedWorkout,
  FriendPerson,
  ISODate,
  MealSettings,
  MealType,
  MySharedMeal,
  MySharedSavedMeal,
  NoteKind,
  NoteReceived,
  NoteSent,
  SharedFoodSource,
  SharedMealItem,
  SignalsWanted,
  TogetherCircle,
  TogetherInvite,
  TogetherKind,
  TogetherMember,
  TogetherWeek,
} from '@/types';

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

/** A server time in milliseconds (its fraction cut to 3 digits, as every JavaScript engine reads it); unreadable is -Infinity. */
function serverTime(v: string): number {
  const t = Date.parse(v.replace(/(\.\d{3})\d+/, '$1'));
  return Number.isFinite(t) ? t : -Infinity;
}

/**
 * The cheers received as one list, newest first. The overview sends them in two (20261201000000_friends_meals.sql):
 * `cheers` for workouts and days, the only list an app from before meals reads (it would name any other ref "a
 * workout of yours"), and `meal_cheers` for shown meals, absent on a server without meals. Each list comes newest
 * first; equal times keep their order, workouts and days before meals.
 */
export function mergeCheers<C extends { createdAt: string }>(cheers: readonly C[], mealCheers: readonly C[]): C[] {
  return [...cheers, ...mealCheers]
    .map((c, i) => ({ c, i, t: serverTime(c.createdAt) }))
    .sort((a, b) => (a.t === b.t ? a.i - b.i : b.t - a.t))
    .map((x) => x.c);
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

// ------------------------------------------------------------------ together (20261202000000_friends_together.sql)
// Circles, buddies, notes and saved meals shown, as the overview sends them, made safe to draw: an entry that is
// not the expected shape is dropped, one malformed entry never takes the screen down. scripts/dev/mock-backend.cjs
// sends the same shapes; friendsWire.test.ts holds them.

const isUuidish = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 64;
const count = (v: unknown): number => (isNumber(v) && v > 0 ? Math.round(v) : 0);
const isKind = (v: unknown): v is TogetherKind => v === 'minutes' || v === 'days';
/** The three kind notes, in the order offered. */
export const NOTE_KINDS: readonly NoteKind[] = ['thinking_of_you', 'walk_later', 'nice_week'];
const isNoteKind = (v: unknown): v is NoteKind => typeof v === 'string' && (NOTE_KINDS as readonly string[]).includes(v);
const text = (v: unknown): string => (typeof v === 'string' ? v : '');
const people = (v: unknown): FriendPerson[] => (Array.isArray(v) ? v.filter(isObject).map(person).filter((p) => p.userId) : []);

function togetherWeek(x: unknown): TogetherWeek | null {
  if (!isObject(x) || !isCalendarDay(x.week) || !isNumber(x.target) || x.target <= 0) return null;
  return { week: x.week, target: Math.round(x.target), total: count(x.total) };
}

/** The user's circle (one at most today; a list so a later server can send more). */
export function toTogether(raw: unknown): TogetherCircle[] {
  if (!Array.isArray(raw)) return [];
  const out: TogetherCircle[] = [];
  for (const x of raw) {
    if (!isObject(x) || !isUuidish(x.id) || !isKind(x.kind)) continue;
    const week = togetherWeek(x);
    if (!week) continue;
    const members: TogetherMember[] = Array.isArray(x.members) ? x.members.filter(isObject).map((m) => ({ ...person(m), me: m.me === true })).filter((m) => m.userId) : [];
    out.push({
      id: x.id,
      kind: x.kind,
      ...week,
      lastWeek: togetherWeek(x.last_week),
      members,
      asked: Array.isArray(x.asked) ? x.asked.filter(isUuidish) : [],
    });
  }
  return out;
}

/** Invitations to a circle, newest first (the server's order). */
export function toTogetherInvites(raw: unknown): TogetherInvite[] {
  if (!Array.isArray(raw)) return [];
  const out: TogetherInvite[] = [];
  for (const x of raw) {
    if (!isObject(x) || !isUuidish(x.id) || !isKind(x.kind) || !isNumber(x.target) || x.target <= 0 || !isObject(x.from)) continue;
    const from = person(x.from);
    if (!from.userId) continue;
    out.push({ id: x.id, kind: x.kind, target: Math.round(x.target), from, members: people(x.members), createdAt: text(x.created_at) });
  }
  return out;
}

function buddyDay(x: unknown): BuddyDay | null {
  if (!isObject(x) || !isCalendarDay(x.day)) return null;
  const c = x.count;
  return { day: x.day, count: c === 0 || c === 1 || c === 2 ? c : null };
}

/** Logging buddies: together (with the week of seven days) or asked by the user. */
export function toBuddies(raw: unknown): Buddy[] {
  if (!Array.isArray(raw)) return [];
  const out: Buddy[] = [];
  for (const x of raw) {
    if (!isObject(x)) continue;
    const p = person(x);
    if (!p.userId) continue;
    if (x.status === 'asked') {
      out.push({ ...p, status: 'asked' });
      continue;
    }
    if (x.status !== 'together' || !isCalendarDay(x.since) || !Array.isArray(x.week)) continue;
    const week = x.week.map(buddyDay).filter((d): d is BuddyDay => !!d);
    if (week.length !== 7) continue;
    out.push({ ...p, status: 'together', since: x.since, week, run: count(x.run), kept: x.kept === true });
  }
  return out;
}

/** Friends asking the user to log together, newest first. */
export function toBuddyInvites(raw: unknown): BuddyInvite[] {
  return Array.isArray(raw) ? raw.filter(isObject).map((x) => ({ ...person(x), createdAt: text(x.created_at) })).filter((x) => x.userId) : [];
}

/** Notes received, newest first. A kind this app does not know is left out. */
export function toNotes(raw: unknown): NoteReceived[] {
  if (!Array.isArray(raw)) return [];
  const out: NoteReceived[] = [];
  for (const x of raw) {
    if (!isObject(x) || !isNoteKind(x.kind) || (typeof x.id !== 'string' && !isNumber(x.id))) continue;
    const from = { userId: text(x.from_user), displayName: text(x.display_name), avatar: text(x.avatar) };
    if (!from.userId) continue;
    out.push({ ...from, id: String(x.id), kind: x.kind, createdAt: text(x.created_at) });
  }
  return out;
}

/** The notes the user sent today. */
export function toNotesSent(raw: unknown): NoteSent[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isObject).flatMap((x) => (isUuidish(x.to_user) && isNoteKind(x.kind) ? [{ toUserId: x.to_user, kind: x.kind, createdAt: text(x.created_at) }] : []));
}

export const NO_SIGNALS: SignalsWanted = { minutes: false, logged: false, today: null };

/** What the server wants this phone to send (absent or malformed: nothing). */
export function toSignalsWanted(raw: unknown): SignalsWanted {
  if (!isObject(raw)) return NO_SIGNALS;
  return { minutes: raw.minutes === true, logged: raw.logged === true, today: isCalendarDay(raw.today) ? raw.today : null };
}

function savedPart(x: Json): { ref: string; name: string; items: SharedMealItem[]; showKcal: boolean; servings?: number } | null {
  const name = cleanWireText(x.name, 60);
  if (!isRef(x.ref) || !name) return null;
  const showKcal = x.show_kcal === true;
  const items = cleanSharedMealItems(x.items, showKcal);
  if (!items.length) return null;
  const servings = isNumber(x.servings) && x.servings >= 1 && x.servings <= 100 && x.servings !== 1 ? x.servings : undefined;
  return { ref: x.ref, name, items, showKcal, ...(servings ? { servings } : null) };
}

/** Saved meals and recipes friends show the user (never in `feed`), newest first. */
export function toSharedSavedMeals(raw: unknown): FeedSavedMeal[] {
  if (!Array.isArray(raw)) return [];
  const out: FeedSavedMeal[] = [];
  for (const x of raw) {
    if (!isObject(x) || typeof x.user_id !== 'string' || !x.user_id) continue;
    const part = savedPart(x);
    if (part) out.push({ kind: 'saved_meal', ...person(x), ...part, cheered: x.cheered === true });
  }
  return out;
}

/** The user's own saved meals showing now, newest first. */
export function toMySavedMeals(raw: unknown): MySharedSavedMeal[] {
  if (!Array.isArray(raw)) return [];
  const out: MySharedSavedMeal[] = [];
  for (const x of raw) {
    if (!isObject(x)) continue;
    const part = savedPart(x);
    if (!part) continue;
    out.push({ ...part, shownAt: text(x.shown_at), expiresAt: text(x.expires_at), viewers: people(x.viewers), cheers: count(x.cheers) });
  }
  return out;
}

/**
 * The reference a saved meal shown to friends gets: the first 32 hex characters of
 * SHA-256(shareKey + ':saved:' + savedMealId), made on the server (social_saved_ref); here for matching and tests.
 */
export function sharedSavedRef(shareKey: string, savedMealId: string): string {
  return sha256Hex(`${shareKey}:saved:${savedMealId}`).slice(0, 32);
}
