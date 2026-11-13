/**
 * GET /functions/v1/food-search?q=greek+yogurt&limit=24
 *
 * Thin proxy to the Open Food Facts search service for the web build. That
 * service does not send cross-origin headers, so a browser cannot call it
 * directly; phones call it without this function. Callers must present the
 * project's anon key (Supabase checks it before this code runs).
 */
const SEARCH = 'https://search.openfoodfacts.org/search';
const FIELDS = 'code,product_name,product_name_en,brands,nutriments,serving_size,serving_quantity,quantity';

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
  const q = (url.searchParams.get('q') ?? '').trim().slice(0, 80);
  const limit = Math.min(30, Math.max(1, Number(url.searchParams.get('limit')) || 24));
  if (q.length < 2) return json(400, { error: 'bad_request', message: 'Search for at least two characters.' });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    const upstream = await fetch(`${SEARCH}?q=${encodeURIComponent(q)}&page_size=${limit}&fields=${FIELDS}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!upstream.ok) return json(502, { error: 'upstream', message: 'The product database is not answering right now.' });
    const data = (await upstream.json()) as { hits?: unknown[] };
    // Product data changes slowly; let the browser and CDN reuse answers for an hour.
    return json(200, { hits: Array.isArray(data.hits) ? data.hits : [] }, { 'Cache-Control': 'public, max-age=3600' });
  } catch {
    return json(502, { error: 'upstream', message: 'The product database is not answering right now.' });
  } finally {
    clearTimeout(timer);
  }
});
