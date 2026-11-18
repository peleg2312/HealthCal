/**
 * The checks of the temporary measuring route (analyze-food-lab), kept free of Deno and of the
 * network so they can be tested under Node (lab.test.ts). index.ts wires them to the HTTP edge.
 *
 * The route passes a Messages API request from ONE test account to the model with the project's
 * key and returns the model's own response. It exists only while a measuring round runs: see
 * ../README.md. Everything here refuses by default.
 */

/** The three current Claude models (claude-api skill, model table cached 2026-11-03). */
export const LAB_MODELS = ['claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-opus-5-5'] as const;
/** The analyze code asks for 2000 (900 on its second try); a little room for an experiment, no more. */
export const LAB_MAX_TOKENS = 3000;
/** A request body larger than this is refused before it is parsed (a 1024 px JPEG is about 250 kB of base64). */
export const LAB_MAX_BODY_BYTES = 1_500_000;
/**
 * All the text a request carries (system, messages and the JSON schema), in characters. The analyze code sends
 * about 6,000; the reference-table experiment about 25,000. This bounds the input cost of one request: about
 * 20,000 tokens, under 10 cents even on claude-opus-5-5, where the body cap alone allowed several dollars.
 */
export const LAB_MAX_TEXT_CHARS = 60_000;
/** The analyze code sends one photo; one more for an experiment, no more (each is billed by its pixels). */
export const LAB_MAX_IMAGES = 2;
/** The only beta the analyze code sends (the careful pass's server-side fallback). */
const LAB_BETAS = ['server-side-fallback-2026-07-01'];
/** The request fields supabase/functions/analyze-food/analyze.ts sends, and nothing else. */
const FIELDS = new Set(['model', 'max_tokens', 'system', 'messages', 'output_config', 'thinking', 'betas', 'fallbacks']);
const EFFORTS = new Set(['low', 'medium', 'high', 'xhigh', 'max']);
const THINKING = new Set(['adaptive', 'disabled', 'between_tools']);
const MEDIA = new Set(['image/jpeg', 'image/png', 'image/webp']);

export type LabRefusal = { ok: false; status: number; reason: string };
export type LabRequest = { ok: true; params: Record<string, unknown>; beta: boolean };

const refuse = (status: number, reason: string): LabRefusal => ({ ok: false, status, reason });
const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const onlyKeys = (o: Record<string, unknown>, keys: string[]) => Object.keys(o).every((k) => keys.includes(k));

/** Whether the route is still open. A missing or unreadable LAB_UNTIL counts as closed. */
export function labOpen(until: string | undefined, now: number): boolean {
  if (!until) return false;
  const end = Date.parse(until);
  return Number.isFinite(end) && now < end;
}

/** The caller is the one test account, and the route was given one (an unset LAB_USER_ID admits no one). */
export function labCaller(userId: string | undefined, allowed: string | undefined): boolean {
  return !!allowed && !!userId && userId === allowed;
}

function checkCacheControl(v: unknown): boolean {
  return v === undefined || (isObject(v) && v.type === 'ephemeral' && onlyKeys(v, ['type']));
}

function checkTextBlock(b: Record<string, unknown>): boolean {
  return typeof b.text === 'string' && onlyKeys(b, ['type', 'text', 'cache_control']) && checkCacheControl(b.cache_control);
}

function checkContentBlock(b: unknown): boolean {
  if (!isObject(b)) return false;
  if (b.type === 'text') return checkTextBlock(b);
  if (b.type === 'image') {
    const s = b.source;
    return (
      onlyKeys(b, ['type', 'source', 'cache_control']) &&
      checkCacheControl(b.cache_control) &&
      isObject(s) &&
      onlyKeys(s, ['type', 'media_type', 'data']) &&
      s.type === 'base64' &&
      typeof s.media_type === 'string' &&
      MEDIA.has(s.media_type) &&
      typeof s.data === 'string'
    );
  }
  return false;
}

/**
 * Accepts only what the analyze code sends: a Messages request for one of LAB_MODELS with
 * max_tokens up to LAB_MAX_TOKENS, text and base64 images, effort and a JSON schema, a thinking
 * switch, and the careful pass's fallback beta. Anything else (tools, other betas, metadata, a
 * stream, an unknown field) is refused before the model is reached.
 */
export function checkLabRequest(body: unknown): LabRequest | LabRefusal {
  if (!isObject(body)) return refuse(400, 'not a JSON object');
  if (!onlyKeys(body, [...FIELDS])) return refuse(400, `fields not allowed: ${Object.keys(body).filter((k) => !FIELDS.has(k)).join(', ')}`);
  if (typeof body.model !== 'string' || !(LAB_MODELS as readonly string[]).includes(body.model)) return refuse(400, 'model not allowed');
  const mt = body.max_tokens;
  if (typeof mt !== 'number' || !Number.isInteger(mt) || mt < 1 || mt > LAB_MAX_TOKENS) return refuse(400, `max_tokens must be 1 to ${LAB_MAX_TOKENS}`);

  const messages = body.messages;
  if (!Array.isArray(messages) || messages.length < 1 || messages.length > 4) return refuse(400, 'messages must be 1 to 4 turns');
  for (const m of messages) {
    if (!isObject(m) || !onlyKeys(m, ['role', 'content']) || (m.role !== 'user' && m.role !== 'assistant')) return refuse(400, 'bad message');
    const c = m.content;
    if (typeof c !== 'string' && !(Array.isArray(c) && c.length > 0 && c.length <= 4 && c.every(checkContentBlock))) return refuse(400, 'bad message content');
  }
  if (!isObject(messages[0]) || messages[0].role !== 'user') return refuse(400, 'first message must be the user');

  const system = body.system;
  if (system !== undefined && typeof system !== 'string') {
    if (!Array.isArray(system) || system.length < 1 || system.length > 4 || !system.every((b) => isObject(b) && b.type === 'text' && checkTextBlock(b))) {
      return refuse(400, 'bad system');
    }
  }

  const oc = body.output_config;
  if (oc !== undefined) {
    if (!isObject(oc) || !onlyKeys(oc, ['effort', 'format'])) return refuse(400, 'bad output_config');
    if (oc.effort !== undefined && (typeof oc.effort !== 'string' || !EFFORTS.has(oc.effort))) return refuse(400, 'bad effort');
    if (oc.format !== undefined) {
      const f = oc.format;
      if (!isObject(f) || !onlyKeys(f, ['type', 'schema']) || f.type !== 'json_schema' || !isObject(f.schema)) return refuse(400, 'bad format');
    }
  }

  const th = body.thinking;
  if (th !== undefined && (!isObject(th) || !onlyKeys(th, ['type']) || typeof th.type !== 'string' || !THINKING.has(th.type))) return refuse(400, 'bad thinking');

  const betas = body.betas;
  if (betas !== undefined && (!Array.isArray(betas) || betas.length === 0 || !betas.every((b) => typeof b === 'string' && LAB_BETAS.includes(b)))) {
    return refuse(400, 'beta not allowed');
  }
  if (body.fallbacks !== undefined && (body.fallbacks !== 'default' || betas === undefined)) return refuse(400, 'fallbacks must be "default" with its beta');

  // Input size: the body cap alone let one text request cost dollars, so count what the model will read.
  let chars = typeof system === 'string' ? system.length : Array.isArray(system) ? system.reduce((n, b) => n + String(b.text).length, 0) : 0;
  let images = 0;
  for (const m of messages as Record<string, unknown>[]) {
    if (typeof m.content === 'string') chars += m.content.length;
    else
      for (const b of m.content as Record<string, unknown>[]) {
        if (b.type === 'text') chars += String(b.text).length;
        else images += 1;
      }
  }
  const format = isObject(oc) ? oc.format : undefined;
  if (format !== undefined) chars += JSON.stringify(format).length;
  if (chars > LAB_MAX_TEXT_CHARS) return refuse(413, `text over ${LAB_MAX_TEXT_CHARS} characters`);
  if (images > LAB_MAX_IMAGES) return refuse(413, `more than ${LAB_MAX_IMAGES} images`);

  const { betas: _b, ...rest } = body;
  return { ok: true, params: betas === undefined ? rest : { ...rest, betas }, beta: betas !== undefined };
}
