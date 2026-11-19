/**
 * Open Food Facts: free, open database of packaged products, used for barcode
 * lookups and as the online fallback for search. Entries are crowd-sourced, so
 * they are marked unverified and sanity-checked before being shown.
 */
import { Platform } from 'react-native';

import { atwaterKcal } from '@/lib/nutrition';
import type { Food, Nutrients, Serving } from '@/types';

import { offQueryText, offSearchQuery } from './offQuery';
import { FUNCTIONS_URL, SUPABASE_ANON_KEY } from './supabase';

const BASE = 'https://world.openfoodfacts.org';
/** Full-text search service (the search endpoints on the main site answer 503 since full-text search moved here). */
const SEARCH = 'https://search.openfoodfacts.org/search';
/**
 * The fields asked for. `product_name_he` and `generic_name` are name fallbacks
 * (an Israeli product often has only its Hebrew name, entered as
 * `product_name_he`); the search index holds neither of them, so they matter
 * mostly to the barcode lookup.
 */
const FIELDS = 'code,product_name,product_name_en,brands,nutriments,serving_size,serving_quantity,quantity,product_name_he,generic_name,categories_tags';
/**
 * The fields of a free-text search: the list sent before the name fallbacks,
 * so that request finds what it found before for every query without a Hebrew
 * letter (the query itself is unchanged; a field asked for changes what comes
 * back, never what is found). Both lists end with `categories_tags`, which
 * decides whether a product is a drink (`offBeverage`). The `food-search`
 * function (supabase/functions/food-search/index.ts) asks for the same lists.
 */
const TEXT_FIELDS = 'code,product_name,product_name_en,brands,nutriments,serving_size,serving_quantity,quantity,categories_tags';

interface OffProduct {
  code?: string;
  product_name?: string;
  product_name_en?: string;
  product_name_he?: string;
  generic_name?: string;
  /** A comma-separated string from the product API, a list from the search service. */
  brands?: string | string[];
  nutriments?: Record<string, number | string | undefined>;
  serving_size?: string;
  serving_quantity?: number | string;
  /** The pack size as printed: "500 ml", "0,5 l", "6 x 330 ml". */
  quantity?: string;
  /** Open Food Facts' categories, most general first ("en:beverages", "en:energy-drinks"). Read, never stored. */
  categories_tags?: string[];
}

function n(v: number | string | undefined): number | undefined {
  const x = typeof v === 'string' ? Number(v) : v;
  return typeof x === 'number' && Number.isFinite(x) && x >= 0 ? x : undefined;
}

/**
 * The product's name: its name in its main language, then its Hebrew name (an
 * Israeli product's English field often holds a shorter Hebrew text), then the
 * English one, then the generic description. Products without a Hebrew name
 * keep the order they had.
 */
function productName(p: OffProduct): string {
  // Each candidate is trimmed before choosing: a name of spaces must not hide the Hebrew name behind it.
  return [p.product_name, p.product_name_he, p.product_name_en, p.generic_name].map((x) => (typeof x === 'string' ? x.trim() : '')).find(Boolean) ?? '';
}

// ---------------------------------------------------------------- drinks

/** Categories that are never a drink as logged: syrups to dilute, powders, beans and bags, alcohol, soups and sauces. */
const NOT_DRINK_TAGS = [
  'en:syrups',
  'en:instant-beverages',
  'en:instant-coffees',
  'en:protein-powders',
  'en:alcoholic-beverages',
  'en:beers',
  'en:wines',
  'en:spirits',
  'en:soups',
  'en:sauces',
];
/** Coffee and tea are beans, ground coffee and tea bags unless one of these says it is the drink. */
const MADE_DRINK_TAGS = ['en:coffee-drinks', 'en:iced-coffees', 'en:iced-teas'];
const DRINK_TAGS = ['en:beverages', 'en:soft-drinks', 'en:dairy-drinks', 'en:milks', 'en:protein-shakes', 'en:energy-drinks', 'en:waters'];

/**
 * Whether a product is a drink, from its Open Food Facts categories: undefined when it has none (not
 * known: the diary's fallback rule decides, src/features/drinks/diary.ts), else false for a category in
 * NOT_DRINK_TAGS or coffee or tea without one of MADE_DRINK_TAGS, true for one in DRINK_TAGS, false
 * otherwise. Measured on real answers (src/services/__fixtures__/off-drinks.tsv, tested in
 * openFoodFacts.test.ts): of the 141 products the app would show, 77 of 90 drinks are called a drink
 * (the misses: 12 with no categories, one iced tea tagged only as tea) and 3 of 51 others are (two
 * protein powders and an iced tea mix, all above the diary's 150 kcal per 100 ml). The kind of drink is not carried: an online drink is 'other' in Water
 * (or 'water' by the name rule there), so Food gains no field for it.
 */
export function offBeverage(tags: readonly unknown[] | undefined | null): boolean | undefined {
  if (!Array.isArray(tags)) return undefined;
  const has = new Set(tags.filter((t): t is string => typeof t === 'string'));
  if (has.size === 0) return undefined;
  if (NOT_DRINK_TAGS.some((t) => has.has(t))) return false;
  if ((has.has('en:coffees') || has.has('en:teas')) && !MADE_DRINK_TAGS.some((t) => has.has(t))) return false;
  return DRINK_TAGS.some((t) => has.has(t));
}

const FL_OZ_ML = 29.5735;
/** The largest pack that is one person's drink: a 750 ml bottle; a 1.5 L bottle is poured from. */
const PACK_MAX_ML = 750;
const VOLUME = /(\d+(?:[.,]\d+)?)\s*(ml|cl|l|lt|litres?|liters?|fl\.?\s*oz)(?![a-z])/gi;
/** "6 x 330 ml", "3 * 200 ml", "4×250ml": a multipack, never one drink. */
const MULTIPACK = /\d\s*[x×*]\s*\d/i;

/**
 * The one volume in ml a pack size names ("500 ml", "0,5 l", "33 cl", "16.9 fl oz", "473 ml, 16 fl oz"),
 * or null: no volume, a multipack, two volumes that disagree by more than 3%, or more than 750 ml. When
 * the pack names it in metric and in fl oz, the metric figure is kept.
 */
export function packMl(quantity: unknown): number | null {
  if (typeof quantity !== 'string' || MULTIPACK.test(quantity)) return null;
  const found: { ml: number; metric: boolean }[] = [];
  for (const m of quantity.matchAll(VOLUME)) {
    const v = Number(m[1].replace(',', '.'));
    const unit = m[2].toLowerCase();
    const metric = !unit.startsWith('fl');
    const ml = unit === 'ml' ? v : unit === 'cl' ? v * 10 : metric ? v * 1000 : v * FL_OZ_ML;
    if (ml > 0) found.push({ ml, metric });
  }
  if (!found.length) return null;
  const first = found.find((f) => f.metric) ?? found[0];
  if (found.some((f) => Math.abs(f.ml - first.ml) > first.ml * 0.03)) return null;
  const ml = Math.round(first.ml);
  return ml >= 1 && ml <= PACK_MAX_ML ? ml : null;
}

/** Map a product to our Food shape, or null when it lacks usable nutrition data. */
export function offToFood(p: OffProduct): Food | null {
  const name = productName(p);
  const nu = p.nutriments ?? {};
  let kcal = n(nu['energy-kcal_100g']);
  const kj = n(nu['energy_100g']);
  if (kcal === undefined && kj !== undefined) kcal = kj / 4.184;
  const protein = n(nu['proteins_100g']);
  const carbs = n(nu['carbohydrates_100g']);
  const fat = n(nu['fat_100g']);
  if (!name || !p.code || kcal === undefined || protein === undefined || carbs === undefined || fat === undefined) return null;
  if (protein + carbs + fat > 101 || kcal > 905) return null;
  // Label data where calories and macros disagree badly is a typo more often than not.
  const implied = atwaterKcal({ protein, carbs, fat });
  if (implied > 40 && (kcal < implied * 0.55 || kcal > implied * 1.6)) return null;

  const sodiumG = n(nu['sodium_100g']);
  const per100g: Nutrients = {
    kcal: Math.round(kcal),
    protein,
    carbs,
    fat,
    fiber: n(nu['fiber_100g']),
    sugar: n(nu['sugars_100g']),
    satFat: n(nu['saturated-fat_100g']),
    sodium: sodiumG !== undefined ? Math.round(sodiumG * 1000) : undefined,
  };
  const servings: Serving[] = [];
  const grams = n(p.serving_quantity);
  if (grams && grams > 0 && grams < 2000) {
    servings.push({ label: p.serving_size?.trim() ? `1 serving (${p.serving_size.trim()})` : '1 serving', grams });
  }
  const beverage = offBeverage(p.categories_tags);
  // A drink found by search has no serving at all: its one-person pack becomes one ("500 ml", grams =
  // ml, as Open Food Facts gives a drink's values per 100 ml), so it is not logged by weight only.
  const pack = beverage === true && servings.length === 0 ? packMl(p.quantity) : null;
  if (pack) servings.push({ label: `${pack} ml`, grams: pack });
  return {
    id: `off_${p.code}`,
    name,
    brand: (Array.isArray(p.brands) ? p.brands[0] : p.brands?.split(',')[0])?.trim() || undefined,
    barcode: p.code,
    per100g,
    servings,
    source: 'openfoodfacts',
    verified: false,
    ...(beverage !== undefined ? { beverage } : {}),
    emoji: '🛒',
  };
}

/** The service answered with an HTTP error, as opposed to not answering at all. */
class HttpError extends Error {}
/** The service answered with a body that is not a search answer (not JSON, null, no list of hits). */
class MalformedError extends Error {}

async function getJson(url: string, timeoutMs: number, headers: Record<string, string> = {}): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json', ...headers } });
    if (!res.ok) throw new HttpError(`Open Food Facts responded ${res.status}`);
    try {
      return await res.json();
    } catch (e) {
      // An abort while the body arrives is a timeout, not a malformed answer.
      if (controller.signal.aborted) throw e;
      throw new MalformedError('Open Food Facts sent a body that is not JSON');
    }
  } finally {
    clearTimeout(timer);
  }
}

export type BarcodeResult = { status: 'found'; food: Food } | { status: 'not_found' } | { status: 'incomplete'; name: string };

/** Look up a scanned barcode. Throws on network failure so the caller can offer a retry. */
export async function lookupBarcode(code: string): Promise<BarcodeResult> {
  const clean = code.replace(/\D/g, '');
  if (clean.length < 6) return { status: 'not_found' };
  const data = (await getJson(`${BASE}/api/v2/product/${clean}.json?fields=${FIELDS}`, 12_000)) as { status?: number; product?: OffProduct };
  if (data.status !== 1 || !data.product) return { status: 'not_found' };
  const food = offToFood({ ...data.product, code: clean });
  if (!food) return { status: 'incomplete', name: productName(data.product) || 'This product' };
  return { status: 'found', food };
}

function toFoods(products: OffProduct[]): Food[] {
  const seen = new Set<string>();
  const out: Food[] = [];
  for (const p of products) {
    const food = offToFood(p);
    if (!food) continue;
    const key = `${food.name.toLowerCase()}|${food.brand?.toLowerCase() ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(food);
  }
  return out;
}

export interface ProductSearchResult {
  foods: Food[];
  /** The service could not be reached, as opposed to finding nothing. */
  failed: boolean;
  /** Online search cannot run here at all (a browser without the backend proxy). */
  unavailable: boolean;
}

/**
 * Where online search can run. The search service sends no cross-origin
 * headers, so a browser has to go through the `food-search` edge function;
 * phones call the service directly.
 */
export const onlineSearchAvailable = Platform.OS !== 'web' || FUNCTIONS_URL !== '';

/** The hits of a search answer; a body without a list of hits is a failure, never "no matches". */
const hitsOf = (data: unknown): OffProduct[] => {
  const hits = data && typeof data === 'object' ? (data as { hits?: unknown }).hits : undefined;
  if (!Array.isArray(hits)) throw new MalformedError('Open Food Facts sent no list of hits');
  return hits as OffProduct[];
};

/**
 * The search service's request for a query, as a phone sends it. A query
 * without a Hebrew letter is today's free-text request, unchanged; one with a
 * Hebrew letter is a field query (`offSearchQuery`) sorted by popularity.
 * `text` asks for the free-text form whatever the query holds (the one
 * fallback of a field query that found nothing usable).
 */
export function searchRequestUrl(q: string, limit: number, text = false): string {
  const built = text ? { q: offQueryText(q) } : offSearchQuery(q);
  if (built.sortBy) {
    return `${SEARCH}?q=${encodeURIComponent(built.q)}&page_size=${limit}&fields=${FIELDS}&sort_by=${built.sortBy}`;
  }
  return `${SEARCH}?q=${encodeURIComponent(built.q)}&page_size=${limit}&fields=${TEXT_FIELDS}`;
}

/** Time a phone waits for the service, for the first request and its one fallback together. */
const SEARCH_TIMEOUT_MS = 10_000;

/**
 * Product search. Never throws: `failed` tells "offline" apart from "no
 * matches", and `unavailable` covers the browser-without-backend case.
 *
 * The browser sends the plain query to the `food-search` edge function, which
 * builds the same request itself. A phone sends one request; only when a
 * Hebrew field query found no product the app can show (or the service
 * refused it) does it send the free-text request once more, within the same
 * time limit. The caller's debounce keeps the rate within what the service
 * asks for.
 */
export async function searchProductsWithStatus(query: string, limit = 20): Promise<ProductSearchResult> {
  const q = query.trim();
  if (q.length < 2) return { foods: [], failed: false, unavailable: false };
  if (!onlineSearchAvailable) return { foods: [], failed: false, unavailable: true };
  try {
    if (Platform.OS === 'web') {
      const term = encodeURIComponent(offQueryText(q));
      const data = await getJson(`${FUNCTIONS_URL}/food-search?q=${term}&limit=${limit}`, 12_000, { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` });
      return { foods: toFoods(hitsOf(data)), failed: false, unavailable: false };
    }
    if (!offSearchQuery(q).sortBy) {
      const data = await getJson(searchRequestUrl(q, limit), SEARCH_TIMEOUT_MS);
      return { foods: toFoods(hitsOf(data)), failed: false, unavailable: false };
    }
    const deadline = Date.now() + SEARCH_TIMEOUT_MS;
    try {
      const foods = toFoods(hitsOf(await getJson(searchRequestUrl(q, limit), SEARCH_TIMEOUT_MS)));
      if (foods.length > 0) return { foods, failed: false, unavailable: false };
    } catch (e) {
      // Not answering at all: a second request would not answer either.
      if (!(e instanceof HttpError)) throw e;
      console.warn('Open Food Facts refused a field query; using the free-text search', e);
    }
    // No time left for the fallback: the search did not finish, which is a failure, not "no matches".
    const left = deadline - Date.now();
    if (left < 1000) return { foods: [], failed: true, unavailable: false };
    const data = await getJson(searchRequestUrl(q, limit, true), left);
    return { foods: toFoods(hitsOf(data)), failed: false, unavailable: false };
  } catch {
    return { foods: [], failed: true, unavailable: false };
  }
}

/** Convenience form of the search that only returns the foods. */
export async function searchProducts(query: string, limit = 20): Promise<Food[]> {
  return (await searchProductsWithStatus(query, limit)).foods;
}
