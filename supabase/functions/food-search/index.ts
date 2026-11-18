/**
 * GET /functions/v1/food-search?q=greek+yogurt&limit=24
 *
 * Thin proxy to the Open Food Facts search service for the web build. That
 * service does not send cross-origin headers, so a browser cannot call it
 * directly; phones call it without this function. Callers must present the
 * project's anon key (Supabase checks it before this code runs).
 *
 * It builds the service's query itself from the plain words (`offSearchQuery`,
 * query.ts, the same builder the phones use) and never accepts a ready query
 * string: a query without a Hebrew letter is sent exactly as before; one with a
 * Hebrew letter becomes a field query on the product's own name, and only when
 * that finds no product the app can show is the free-text search asked once
 * more, so the browser makes one call.
 */
import { offQueryText, offSearchQuery, usableHit } from './query.ts';

const SEARCH = 'https://search.openfoodfacts.org/search';
/** A field query also asks for the name fallbacks of `offToFood`. */
const FIELDS = 'code,product_name,product_name_en,brands,nutriments,serving_size,serving_quantity,quantity,product_name_he,generic_name';
/** A free-text search asks for exactly what it asked for before. */
const TEXT_FIELDS = 'code,product_name,product_name_en,brands,nutriments,serving_size,serving_quantity,quantity';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

function json(status: number, body: unknown, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json', ...extra } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'GET') return json(405, { error: 'method_not_allowed' });

  const url = new URL(req.url);
  // Cut to 80 characters inside the shared builder (`offQueryText`), as the phones cut it.
  const q = offQueryText((url.searchParams.get('q') ?? '').trim());
  const limit = Math.min(30, Math.max(1, Number(url.searchParams.get('limit')) || 24));
  if (q.length < 2) return json(400, { error: 'bad_request', message: 'Search for at least two characters.' });

  // One time limit for the request and its one fallback together.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  const ask = (url: string) => fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
  const textUrl = `${SEARCH}?q=${encodeURIComponent(q)}&page_size=${limit}&fields=${TEXT_FIELDS}`;
  // Product data changes slowly; let the browser and CDN reuse answers for an hour. A fallback that
  // follows a refused field query is kept 60 s only, so one refusal does not stand for an hour.
  let cache = 'public, max-age=3600';
  try {
    const built = offSearchQuery(q);
    if (built.sortBy) {
      const field = await ask(`${SEARCH}?q=${encodeURIComponent(built.q)}&page_size=${limit}&fields=${FIELDS}&sort_by=${built.sortBy}`);
      if (field.ok) {
        const data = (await field.json()) as { hits?: unknown } | null;
        const list = data?.hits;
        const hits = Array.isArray(list) ? list : [];
        if (hits.some(usableHit)) return json(200, { hits }, { 'Cache-Control': cache });
      } else {
        console.warn(`food-search: the field query was refused (${field.status}); using the free-text search`);
        cache = 'public, max-age=60';
      }
    }
    const upstream = await ask(textUrl);
    if (!upstream.ok) return json(502, { error: 'upstream', message: 'The product database is not answering right now.' });
    const data = (await upstream.json()) as { hits?: unknown } | null;
    // A body without a list of hits is a failure, never "no matches".
    const hits = data?.hits;
    if (!Array.isArray(hits)) return json(502, { error: 'upstream', message: 'The product database is not answering right now.' });
    return json(200, { hits }, { 'Cache-Control': cache });
  } catch {
    return json(502, { error: 'upstream', message: 'The product database is not answering right now.' });
  } finally {
    clearTimeout(timer);
  }
});
