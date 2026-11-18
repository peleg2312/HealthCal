/**
 * Open Food Facts: free, open database of packaged products, used for barcode
 * lookups and as the online fallback for search. Entries are crowd-sourced, so
 * they are marked unverified and sanity-checked before being shown.
 */
import { Platform } from 'react-native';

import { atwaterKcal } from '@/lib/nutrition';
import type { Food, Nutrients, Serving } from '@/types';

import { offSearchQuery } from './offQuery';
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
const FIELDS = 'code,product_name,product_name_en,brands,nutriments,serving_size,serving_quantity,quantity,product_name_he,generic_name';
/**
 * The fields of a free-text search: exactly the list sent before the name
 * fallbacks, so that request (and what it finds) stays byte for byte what it
 * was for every query without a Hebrew letter.
 */
const TEXT_FIELDS = 'code,product_name,product_name_en,brands,nutriments,serving_size,serving_quantity,quantity';

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
  return (p.product_name || p.product_name_he || p.product_name_en || p.generic_name || '').trim();
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
  return {
    id: `off_${p.code}`,
    name,
    brand: (Array.isArray(p.brands) ? p.brands[0] : p.brands?.split(',')[0])?.trim() || undefined,
    barcode: p.code,
    per100g,
    servings,
    source: 'openfoodfacts',
    verified: false,
    emoji: '🛒',
  };
}

/** The service answered with an HTTP error, as opposed to not answering at all. */
class HttpError extends Error {}

async function getJson(url: string, timeoutMs: number, headers: Record<string, string> = {}): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json', ...headers } });
    if (!res.ok) throw new HttpError(`Open Food Facts responded ${res.status}`);
    return await res.json();
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

const hitsOf = (data: unknown): OffProduct[] => (data as { hits?: OffProduct[] } | null)?.hits ?? [];

/**
 * The search service's request for a query, as a phone sends it. A query
 * without a Hebrew letter is today's free-text request, unchanged; one with a
 * Hebrew letter is a field query (`offSearchQuery`) sorted by popularity.
 * `text` asks for the free-text form whatever the query holds (the one
 * fallback of a field query that found nothing usable).
 */
export function searchRequestUrl(q: string, limit: number, text = false): string {
  const built = text ? { q } : offSearchQuery(q);
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
      const term = encodeURIComponent(q);
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
    const left = deadline - Date.now();
    if (left < 1000) return { foods: [], failed: false, unavailable: false };
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
