/**
 * A search for any drink on the Water screen: the pure rules (no React, no store, no request), tested
 * in pick.test.ts. The screens only place what these return: the drink sheet (`DrinkPickSheet`) draws
 * `sheetList` item by item, the Water kind's recent chips are `recentChips`, and every pick, from the
 * "Search" button beside "Add a drink" or from Juice's "Other juice" and Other's "Choose a drink",
 * goes where `placePick` says, with the words of `pickToast`.
 *
 * - "Is this a drink" has one answer, `drinkStatus` (./diary.ts), shared with the diary: the sheet never
 *   lists a 'not' food; 'drink' foods come before 'maybe' ones (an own food or a remembered product with
 *   no drink flag), each group in the search's own order. Online products are listed only as 'drink'
 *   (filed under beverages by Open Food Facts, at most 150 kcal per 100 ml, no alcohol).
 * - "Your drinks" (`yourDrinks`) is read from the diary alone: every drink logged on Water with calories
 *   and every drink logged in the diary already holds its food. Nothing new is stored.
 * - Picking logs nothing: the pick becomes a kind's selected drink, and a glass adds it through
 *   `planDrink` and `logDrink` as before.
 */
import { chipWidth } from '@/features/food/chipLines';
import { resolveFood } from '@/features/food/usuals';
import { SEARCH_NAMES } from '@/data/searchNames';
import { isolateRtl } from '@/lib/bidi';
import { fold, isHebrew, prefixReadings } from '@/lib/hebrew';
import { BEVERAGE_LABELS } from '@/lib/hydration';
import { formatNumber, formatVolume } from '@/lib/units';
import type { Beverage, Food, FoodEntry, UnitSystem } from '@/types';

import { DRINK_CHOICES, choiceById } from './choices';
import { drinkChoiceId, drinkKind, drinkStatus, isBundled } from './diary';
import { builtinFood, drinkKcal, isAlcohol, pickCaption, pickedToast, selectChoice, selectFood, sheetDrinks, spokenVolume, type SelectedDrink } from './rules';

/** "Your drinks" at the top of the empty sheet: at most this many. */
export const YOUR_DRINKS_LIMIT = 5;
/** With a query, this many local drinks are shown before "Show all N". */
export const LOCAL_FIRST = 3;
/** Online drinks listed at most. */
export const ONLINE_LIMIT = 12;
/** The online search starts from this many characters. */
export const ONLINE_MIN_CHARS = 2;
/** The Water kind's recent chips: at most this many, on one line. */
export const RECENT_CHIPS_MAX = 3;

/** The foods behind the fixed choices (and their no-calorie reference foods): they already have a chip of their own. */
export const FIXED_CHOICE_FOOD_IDS: ReadonlySet<string> = new Set(DRINK_CHOICES.flatMap((c) => [c.foodId, c.refId].filter((x): x is string => !!x)));

// ---------------------------------------------------------------- your drinks

function live<T extends { deleted?: boolean }>(records: Iterable<T> | Record<string, T>): T[] {
  const list = Symbol.iterator in (records as object) ? [...(records as Iterable<T>)] : Object.values(records as Record<string, T>);
  return list.filter((r) => !r.deleted);
}

/**
 * The person's own drinks, newest first: the food of each live diary entry (`e.food`, else the bundled
 * food by `foodId`), as it is now (`resolveFood`: a deleted own food is dropped, a bundled food is
 * today's), kept when `drinkStatus` calls it a 'drink' and it is not a fixed choice's food (that has its
 * chip already); one per food id; quick entries ("Other drink", calories typed in) skipped. Covers drinks
 * logged on Water with calories (`via: 'water'`) and drinks logged in the diary alike.
 */
export function yourDrinks(entries: Iterable<FoodEntry> | Record<string, FoodEntry>, customById: ReadonlyMap<string, Food>, limit: number = YOUR_DRINKS_LIMIT): Food[] {
  const sorted = live(entries).sort((a, b) => (a.loggedAt < b.loggedAt ? 1 : a.loggedAt > b.loggedAt ? -1 : 0));
  const seen = new Set<string>();
  const out: Food[] = [];
  for (const e of sorted) {
    if (out.length >= limit) break;
    if (e.source === 'quick') continue;
    const stored = e.food ?? (e.foodId ? builtinFood(e.foodId) : null);
    if (!stored || seen.has(stored.id)) continue;
    seen.add(stored.id);
    const food = resolveFood(stored, customById);
    if (!food || FIXED_CHOICE_FOOD_IDS.has(food.id) || drinkStatus(food) !== 'drink') continue;
    out.push(food);
  }
  return out;
}

// ---------------------------------------------------------------- the sheet's rows

/** A local search hit as `searchLocal` gives it (only these two fields are read). */
export interface LocalHit {
  food: Food;
  /** The search name the query matched, when it was not the stored name. */
  matched?: string;
}

/** A query word this long or longer is checked for matching only inside a name word. */
export const INSIDE_MIN_LETTERS = 3;

/** Every word of the food's names, folded: the stored name, the search name the query matched, and its bundled search names. */
function nameWords(h: LocalHit): string[] {
  const names = [h.food.name, h.matched ?? '', ...(SEARCH_NAMES[h.food.id]?.he ?? []), ...(SEARCH_NAMES[h.food.id]?.latin ?? [])];
  return names.flatMap((n) => fold(n).split(' ')).filter(Boolean);
}

/** A name word that starts with the query word, directly or after a Hebrew prefix on either side ("הקפה" for "קפה", "קפה" for "בקפה"). */
function startsWord(w: string, qw: string): boolean {
  if (w.startsWith(qw)) return true;
  if (!isHebrew(qw)) return false;
  return prefixReadings(w).some((r) => r.startsWith(qw)) || prefixReadings(qw).some((r) => w.startsWith(r));
}

/**
 * How a hit matched the query: 'inside' when a query word of 3 letters or more is found only inside a name
 * word ("cola" in "chocolate") and never at the start of one, 'start' when a query word starts a name word,
 * else 'other' (a typo, a stem: the search's own reasons).
 */
export function matchPlace(h: LocalHit, query: string): 'start' | 'inside' | 'other' {
  const words = nameWords(h);
  let start = false;
  for (const qw of fold(query).split(' ').filter(Boolean)) {
    const atStart = words.some((w) => startsWord(w, qw));
    if (atStart) start = true;
    else if (qw.length >= INSIDE_MIN_LETTERS && words.some((w) => w.indexOf(qw) > 0)) return 'inside';
  }
  return start ? 'start' : 'other';
}

/**
 * The local hits the sheet may list: never a 'not' food; the 'drink' foods first, then the 'maybe' ones,
 * each in the search's order; one per id. With `query`, a hit that matches only inside a name word
 * (`matchPlace` 'inside': "cola" in hot chocolate) is left out when another hit matches at a word start;
 * when none does, the list stays as the search gave it. The food search itself keeps its ranking.
 */
export function localDrinkHits(hits: readonly LocalHit[], query?: string): LocalHit[] {
  const drinks: LocalHit[] = [];
  const maybes: LocalHit[] = [];
  const seen = new Set<string>();
  if (query?.trim()) {
    const places = hits.map((h) => matchPlace(h, query));
    if (places.some((p, i) => p === 'start' && drinkStatus(hits[i].food) !== 'not')) hits = hits.filter((_, i) => places[i] !== 'inside');
  }
  for (const h of hits) {
    if (seen.has(h.food.id)) continue;
    seen.add(h.food.id);
    const s = drinkStatus(h.food);
    if (s === 'drink') drinks.push(h);
    else if (s === 'maybe') maybes.push(h);
  }
  return [...drinks, ...maybes];
}

/** The online products the sheet lists: 'drink' only, none of `exclude` (the local rows), one per id, at most 12, in the given order (`rankOnline`'s). */
export function onlineDrinks(foods: readonly Food[], exclude: Iterable<string> = [], limit: number = ONLINE_LIMIT): Food[] {
  const skip = new Set(exclude);
  const out: Food[] = [];
  for (const f of foods) {
    if (out.length >= limit) break;
    if (skip.has(f.id) || drinkStatus(f) !== 'drink') continue;
    skip.add(f.id);
    out.push(f);
  }
  return out;
}

/** An online product's pack in the person's units ("500 ml"), from the pack serving `offToFood` gives a single drink ("500 ml"), or null. */
export function packVolume(food: Pick<Food, 'servings'>, units: UnitSystem): string | null {
  for (const s of food.servings) {
    const m = s.label.match(/^(\d+) ml$/);
    if (m) return formatVolume(Number(m[1]), units);
  }
  return null;
}

/** Letters and digits only, lower case: "Coca-Cola" and "coca cola" are the same brand. */
const squash = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

/**
 * What tells online products apart, before the calories: the brand (left out when the name already
 * says it, ignoring case, spaces and punctuation, as "Coca-Cola" by "coca cola" does) and the pack ("Monster · 500 ml"), or '' when there is
 * neither. Only for an online product (source 'openfoodfacts'). `drawn` isolates a Hebrew or Arabic brand.
 */
export function brandAndPack(food: Food, units: UnitSystem, drawn = true): string {
  if (food.source !== 'openfoodfacts') return '';
  const brand = food.brand?.trim();
  const showBrand = brand && !squash(food.name).includes(squash(brand)) ? brand : null;
  const pack = packVolume(food, units);
  return [showBrand ? (drawn ? isolateRtl(showBrand) : showBrand) : null, pack].filter(Boolean).join(' · ');
}

/**
 * A row's second line: "Prew · 180 ml · 40 kcal per 250 ml · Community" for an online product (brand and
 * pack first, `brandAndPack`), else `pickCaption` alone ("105 kcal per 250 ml · Reference").
 */
export function pickDetail(food: Food, glassMl: number, units: UnitSystem, drawn = true): string {
  const bp = brandAndPack(food, units, drawn);
  const caption = pickCaption(food, glassMl, units);
  return bp ? `${bp} · ${caption}` : caption;
}

export type OnlineStatus = 'loading' | 'done' | 'failed' | 'unavailable';

/** The sheet's last online answer, with the query it answered (an answer for another query is stale and never shown). */
export interface OnlineAnswer {
  query: string;
  status: OnlineStatus;
  /** `searchOnlineWithStatus(...).items` as it came (the filter is applied here). */
  items: readonly Food[];
}

/** One drink row. Drawn: `name` (bodyStrong, isolated), `matched` (caption, when set), `detail` (caption). */
export interface SheetRow {
  type: 'row';
  /** React key (unique in the list). */
  key: string;
  /** `water-pick-<id>`; under "Your drinks" `water-pick-yours-<id>` (the same food can also be under "All drinks"). */
  testID: string;
  /** What a tap hands to `placePick`. */
  food: Food;
  section: 'yours' | 'all' | 'local' | 'online';
  name: string;
  /** The search name the query found, isolated; absent when it is the stored name or none. */
  matched?: string;
  /** `water-pick-<id>-matched` when `matched` is set. */
  matchedTestID?: string;
  /** The second line (`pickDetail`). */
  detail: string;
  /** The row's accessibilityLabel, raw names: "Iced coffee, Prew · 180 ml · 40 kcal per 250 ml · Community". */
  label: string;
  /** A thin divider above it (the previous item is a row). */
  divider: boolean;
}

/** A heading in the label style (textSecondary), with an optional caption line under it. */
export interface SheetHeading {
  type: 'heading';
  key: string;
  testID: 'water-pick-yours' | 'water-pick-all' | 'water-pick-online';
  text: string;
  caption?: string;
}

/** "Show all N" (`water-pick-more`): a tap sets the sheet's showAll. */
export interface SheetMore {
  type: 'more';
  key: 'more';
  testID: 'water-pick-more';
  text: string;
  label: string;
  /** How many local rows it adds. */
  hidden: number;
}

/** A line of text in place of rows (body style, textSecondary). */
export interface SheetMessage {
  type: 'message';
  key: string;
  testID: 'water-pick-none' | 'water-pick-alcohol' | 'water-pick-online-empty';
  text: string;
}

export type SheetItem = SheetRow | SheetHeading | SheetMore | SheetMessage;

export interface SheetListInput {
  /** What is typed now. */
  query: string;
  /** The query `local` was computed for (the sheet's deferred value); while it differs from `query` no "no match" line is shown. Defaults to `query`. */
  localQuery?: string;
  /** `searchLocal(localQuery, ...)` as it came: alcohol and foods included (the filter is applied here). */
  local: readonly LocalHit[];
  /** `yourDrinks(...)`, shown with an empty query. */
  yours: readonly Food[];
  /** The last online answer, or null before any. */
  online: OnlineAnswer | null;
  /** `onlineSearchAvailable` (false in a browser without the backend: the line says so at once). Default true. */
  onlineAvailable?: boolean;
  /** "Show all N" was tapped for this query. */
  showAll: boolean;
  glassMl: number;
  units: UnitSystem;
}

export interface SheetList {
  /** Show the hint line ("Tap a drink to choose it, then tap a glass to add it."): only with an empty query. */
  hint: boolean;
  /** Everything under the hint, in order. */
  items: SheetItem[];
  /** Ids of every local drink row for this query (shown or behind "Show all"): pass as `exclude` to `searchOnlineWithStatus`. */
  exclude: string[];
  /** Whether the online search runs for this query (two characters or more). */
  searchOnline: boolean;
}

export const ONLINE_HEADING = 'Online products';
export const ONLINE_CAPTION = 'Community data from Open Food Facts';
export const ONLINE_WORDS: Record<OnlineStatus | 'none', string> = {
  loading: 'Searching Open Food Facts…',
  none: 'No online drinks match that search.',
  done: 'No online drinks match that search.',
  failed: 'Could not reach the online products. The drinks above still work.',
  unavailable: 'Product search by name works in the phone app. Here, enter the calories above.',
};
/** A query that found only alcohol. */
export const ALCOHOL_LINE = 'Drinks with alcohol are added in the diary, not in Water.';
/** A query that found only foods that are not drinks. */
export const foodsOnlyLine = (q: string) => `No drink matches “${isolateRtl(q)}”. Foods are added in the diary.`;
/** The failed line when no local drink is shown above it (nothing "above" to point to). */
export const ONLINE_FAILED_ALONE = 'Could not reach the online products.';
/**
 * A query that found nothing at all. Without product search, the words from before; with online
 * products about to follow (`online`: product search available, two characters or more), only the fact,
 * so the line does not argue with the online rows under it.
 */
export const noMatchLine = (q: string, online = false) =>
  online ? `No drink in the list matches “${isolateRtl(q)}”.` : `No drink matches “${isolateRtl(q)}”. Try another word, or enter the calories above.`;
/** The online section's one line: `ONLINE_WORDS[status]`, except a failure with no local rows shown, `ONLINE_FAILED_ALONE`. */
export const onlineLine = (status: OnlineStatus | 'none', localShown: boolean) => (status === 'failed' && !localShown ? ONLINE_FAILED_ALONE : ONLINE_WORDS[status]);

function row(food: Food, section: SheetRow['section'], glassMl: number, units: UnitSystem, divider: boolean, matched?: string): SheetRow {
  const m = matched && matched !== food.name ? matched : undefined;
  const detail = pickDetail(food, glassMl, units, true);
  return {
    type: 'row',
    key: `${section}-${food.id}`,
    testID: section === 'yours' ? `water-pick-yours-${food.id}` : `water-pick-${food.id}`,
    food,
    section,
    name: isolateRtl(food.name),
    ...(m ? { matched: isolateRtl(m), matchedTestID: `water-pick-${food.id}-matched` } : null),
    detail,
    // The row's words as drawn (WCAG 2.5.3, label in name); a row under "Your drinks" says so, so it is never named
    // as the same drink's row under "All drinks" is.
    label: `${food.name}${m ? `, ${m}` : ''}, ${pickDetail(food, glassMl, units, false)}${section === 'yours' ? ', from your drinks' : ''}`,
    divider,
  };
}

/**
 * Exactly what the drink sheet draws under its search field and "Or enter calories", in order.
 *
 * Empty query: "Your drinks" (`water-pick-yours`) with `yours` (left out when there are none), then
 * "All drinks" (`water-pick-all`) over every bundled drink by name (`sheetDrinks`).
 *
 * With a query: the local drinks (`localDrinkHits`), the first 3 and "Show all N" (`water-pick-more`)
 * unless `showAll`; or, once the list has caught up with the typing, one line (`water-pick-none`): only
 * alcohol matched, `ALCOHOL_LINE` (`water-pick-alcohol`); only foods that are not drinks,
 * `foodsOnlyLine`; nothing, `noMatchLine` (only "No drink in the list matches …" when online products
 * follow). Then, from two characters, "Online products"
 * (`water-pick-online`, captioned "Community data from Open Food Facts") with the online drinks
 * (`onlineDrinks`, excluding the local ones) or one line (`water-pick-online-empty`): searching (also
 * while the answer is for another query), none, failed (`onlineLine`: "The drinks above still work."
 * only when local rows are shown) or unavailable.
 */
export function sheetList(input: SheetListInput): SheetList {
  const { glassMl, units } = input;
  const q = input.query.trim();
  const items: SheetItem[] = [];
  const add = (it: SheetItem) => items.push(it);
  const lastIsRow = () => items.length > 0 && items[items.length - 1].type === 'row';

  if (!q) {
    if (input.yours.length) {
      add({ type: 'heading', key: 'h-yours', testID: 'water-pick-yours', text: 'Your drinks' });
      for (const f of input.yours) add(row(f, 'yours', glassMl, units, lastIsRow()));
    }
    add({ type: 'heading', key: 'h-all', testID: 'water-pick-all', text: 'All drinks' });
    for (const f of sheetDrinks()) add(row(f, 'all', glassMl, units, lastIsRow()));
    return { hint: true, items, exclude: [], searchOnline: false };
  }

  const localQ = (input.localQuery ?? input.query).trim();
  const kept = localDrinkHits(input.local, localQ);
  const shown = input.showAll ? kept : kept.slice(0, LOCAL_FIRST);
  for (const h of shown) add(row(h.food, 'local', glassMl, units, lastIsRow(), h.matched));
  if (kept.length > shown.length) {
    add({ type: 'more', key: 'more', testID: 'water-pick-more', text: `Show all ${kept.length}`, label: `Show all ${kept.length} drinks from the list`, hidden: kept.length - shown.length });
  }
  const searchOnline = q.length >= ONLINE_MIN_CHARS;
  const answer = input.online;
  const onlineFollows = searchOnline && input.onlineAvailable !== false && !(answer && answer.query.trim() === q && answer.status === 'unavailable');
  if (kept.length === 0 && localQ === q) {
    const hits = input.local;
    if (hits.length === 0) add({ type: 'message', key: 'none', testID: 'water-pick-none', text: noMatchLine(q, onlineFollows) });
    else if (hits.every((h) => isAlcohol(h.food))) add({ type: 'message', key: 'alcohol', testID: 'water-pick-alcohol', text: ALCOHOL_LINE });
    else add({ type: 'message', key: 'none', testID: 'water-pick-none', text: foodsOnlyLine(q) });
  }

  if (searchOnline) {
    add({ type: 'heading', key: 'h-online', testID: 'water-pick-online', text: ONLINE_HEADING, caption: ONLINE_CAPTION });
    const line = (status: OnlineStatus | 'none') => add({ type: 'message', key: 'online-empty', testID: 'water-pick-online-empty', text: onlineLine(status, kept.length > 0) });
    if (input.onlineAvailable === false) line('unavailable');
    else if (!answer || answer.query.trim() !== q || answer.status === 'loading') line('loading');
    else if (answer.status !== 'done') line(answer.status);
    else {
      const found = onlineDrinks(answer.items, kept.map((h) => h.food.id));
      if (found.length === 0) line('none');
      for (const f of found) add(row(f, 'online', glassMl, units, lastIsRow()));
    }
  }
  return { hint: false, items, exclude: kept.map((h) => h.food.id), searchOnline };
}

// ---------------------------------------------------------------- picking

/** Where a pick goes: the kind to show and what it selects there (null for Water: plain water, no choice). */
export interface PlacedPick {
  kind: Beverage;
  selected: SelectedDrink | null;
}

/**
 * Where a pick goes, from the title row's search (`from` null) and from Juice's "Other juice" and
 * Other's "Choose a drink" (`from` 'juice' or 'other') alike:
 * 1. a bundled drink goes to its own kind (`drinkKind`), selecting that kind's chip when it is one of its
 *    fixed choices (`drinkChoiceId`: a latte is Coffee's Latte, a cola Other's Soft drink), else held as
 *    the kind's picked food (a mocha under Coffee, shoko under Milk);
 * 2. a water (`drinkKind`'s name rule: at most 2 kcal per 100 g and named water, mineral, sparkling,
 *    seltzer or soda water) selects the Water kind and nothing else;
 * 3. anything else (an online product, an own drink) goes to `from` when the sheet was opened from a
 *    kind's chip, else to Other, as the kind's picked food. The kind is never guessed from a name.
 * The screen then calls `rememberDrinkChoice(kind, selected)` (unless kind is 'water') and shows `kind`.
 */
export function placePick(food: Food, from: Beverage | null): PlacedPick {
  const kind = drinkKind(food);
  if (isBundled(food)) {
    const choice = choiceById(drinkChoiceId(food));
    return { kind, selected: choice && choice.kind === kind ? selectChoice(choice) : selectFood(food) };
  }
  if (kind === 'water') return { kind: 'water', selected: null };
  const to: Beverage = from && from !== 'water' ? from : 'other';
  return { kind: to, selected: selectFood(food) };
}

/** The toast for Water: nothing more is chosen, the glasses add plain water. */
export const WATER_CHOSEN = 'Water chosen. Tap a glass to add it.';

/**
 * The toast after a pick (nothing is logged yet): for a water `WATER_CHOSEN`; when the kind changed,
 * "Cafe mocha, whole milk chosen, under Coffee. Tap a glass to add it."; otherwise the words from before
 * (`pickedToast`). The name is the food tapped, isolated when Hebrew or Arabic.
 */
export function pickToast(food: Pick<Food, 'name'>, placed: PlacedPick, current: Beverage): string {
  if (placed.kind === 'water') return WATER_CHOSEN;
  if (placed.kind !== current) return `${isolateRtl(food.name)} chosen, under ${BEVERAGE_LABELS[placed.kind].label}. Tap a glass to add it.`;
  return pickedToast(food);
}

// ---------------------------------------------------------------- the Water kind's recent chips

/** One recent chip on the Water kind (`water-recent-<foodId>`): a tap is `placePick(food, null)`. */
export interface RecentChip {
  food: Food;
  testID: string;
  /** The chip's words: the food's name, isolated; drawn on one line (ends in an ellipsis past `maxChip`). */
  text: string;
  /** "Cafe mocha, whole milk, 188 kcal per 250 ml, choose" (raw name). */
  label: string;
  /** The estimated width it was laid out with (`chipWidth`, at most `maxChip`). */
  width: number;
}

/**
 * Up to 3 of `yours` as chips on ONE line `room` px wide (no wrapping): in order, a chip that does not
 * fit in what is left is left out and the next one tried. Widths are `chipWidth` estimates capped at
 * `maxChip` (the screen draws each chip with that maxWidth and one line). Empty when `yours` is.
 */
export function recentChips(yours: readonly Food[], glassMl: number, units: UnitSystem, room: number, maxChip = 200, gap = 8): RecentChip[] {
  const out: RecentChip[] = [];
  let used = 0;
  for (const food of yours) {
    if (out.length >= RECENT_CHIPS_MAX) break;
    const width = chipWidth(food.name, Math.min(maxChip, room));
    const need = width + (out.length ? gap : 0);
    if (used + need > room) continue;
    used += need;
    out.push({
      food,
      testID: `water-recent-${food.id}`,
      text: isolateRtl(food.name),
      // Spoken in full: "108 kilocalories per 250 millilitres".
      label: `${food.name}, ${formatNumber(drinkKcal(food, glassMl))} kilocalories per ${spokenVolume(formatVolume(glassMl, units))}, choose`,
      width,
    });
  }
  return out;
}
