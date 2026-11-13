/**
 * Open Food Facts: free, open database of packaged products, used for barcode
 * lookups and as the online fallback for search. Entries are crowd-sourced, so
 * they are marked unverified and sanity-checked before being shown.
 */
import { Platform } from 'react-native';

import { atwaterKcal } from '@/lib/nutrition';
import type { Food, Nutrients, Serving } from '@/types';

import { FUNCTIONS_URL, SUPABASE_ANON_KEY } from './supabase';

const BASE = 'https://world.openfoodfacts.org';
/** Full-text search service (the search endpoints on the main site answer 503 since full-text search moved here). */
const SEARCH = 'https://search.openfoodfacts.org/search';
const FIELDS = 'code,product_name,product_name_en,brands,nutriments,serving_size,serving_quantity,quantity';

interface OffProduct {
  code?: string;
  product_name?: string;
  product_name_en?: string;
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

/** Map a product to our Food shape, or null when it lacks usable nutrition data. */
export function offToFood(p: OffProduct): Food | null {
  const name = (p.product_name || p.product_name_en || '').trim();
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

async function getJson(url: string, timeoutMs: number, headers: Record<string, string> = {}): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json', ...headers } });
    if (!res.ok) throw new Error(`Open Food Facts responded ${res.status}`);
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
  if (!food) return { status: 'incomplete', name: data.product.product_name ?? 'This product' };
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

/**
 * Full-text product search. Never throws: `failed` tells "offline" apart from
 * "no matches", and `unavailable` covers the browser-without-backend case.
 */
export async function searchProductsWithStatus(query: string, limit = 20): Promise<ProductSearchResult> {
  const q = query.trim();
  if (q.length < 2) return { foods: [], failed: false, unavailable: false };
  if (!onlineSearchAvailable) return { foods: [], failed: false, unavailable: true };
  const term = encodeURIComponent(q);
  try {
    const data =
      Platform.OS === 'web'
        ? await getJson(`${FUNCTIONS_URL}/food-search?q=${term}&limit=${limit}`, 12_000, { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` })
        : await getJson(`${SEARCH}?q=${term}&page_size=${limit}&fields=${FIELDS}`, 10_000);
    return { foods: toFoods((data as { hits?: OffProduct[] }).hits ?? []), failed: false, unavailable: false };
  } catch {
    return { foods: [], failed: true, unavailable: false };
  }
}

/** Convenience form of the search that only returns the foods. */
export async function searchProducts(query: string, limit = 20): Promise<Food[]> {
  return (await searchProductsWithStatus(query, limit)).foods;
}
