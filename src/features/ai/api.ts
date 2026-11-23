/**
 * Talking to the analyze-food edge function: request building, response
 * validation and error mapping. Free of React Native imports so it can be
 * tested against a mocked fetch; `@/services/aiFood` supplies the URL, token
 * and fetch at runtime.
 */
import type { AiFoodItem, AiFoodResult } from '@/types';

import { limitInfoFrom, type LimitInfo } from './limit';

export interface AnalyzeRequest {
  /** Base64 JPEG without a data: prefix. */
  image?: string;
  /** A description, or a note that travels with the photo. */
  text?: string;
  /** Ask for the stronger model. Counts as another analysis. */
  precise?: boolean;
}

export interface AnalyzeResponse {
  result: AiFoodResult;
  /** Analyses left today, or null when the server did not say. */
  remaining: number | null;
}

export type AiErrorCode =
  | 'daily_limit'
  | 'not_food'
  | 'declined'
  | 'truncated'
  | 'rate_limited'
  | 'unauthorized'
  | 'not_configured'
  | 'bad_request'
  | 'upstream'
  | 'network'
  | 'timeout'
  | 'unknown';

export class AiError extends Error {
  constructor(
    public code: AiErrorCode,
    message: string,
    /** Whether trying the same thing again soon has a fair chance of working. */
    public retryable: boolean,
    public remaining: number | null = null,
    /** A limit answer's plan fields (./limit.ts), or null with plans off or from an older server. */
    public limit: LimitInfo | null = null,
  ) {
    super(message);
    this.name = 'AiError';
  }
}

const COPY: Record<AiErrorCode, { message: string; retryable: boolean }> = {
  daily_limit: { message: "You have used today's AI analyses. They reset at midnight UTC.", retryable: false },
  not_food: { message: 'No food was recognised. Try a clearer photo or describe the meal.', retryable: false },
  declined: { message: 'This photo could not be analysed. Try a different one or describe the meal instead.', retryable: false },
  truncated: { message: 'The meal was too complex to analyse in one go. Try a closer photo of fewer items, or describe it.', retryable: false },
  rate_limited: { message: 'The analysis service is busy. Try again in a moment.', retryable: true },
  unauthorized: { message: 'Your session has expired. Sign in again to analyse food.', retryable: false },
  not_configured: { message: 'Food analysis is not set up on the server yet.', retryable: false },
  bad_request: { message: 'That image could not be read. Try another photo.', retryable: false },
  upstream: { message: 'The analysis service is unavailable right now. Try again in a moment.', retryable: true },
  network: { message: 'No connection. Check your internet and try again.', retryable: true },
  timeout: { message: 'The analysis took too long. It usually works on a second try.', retryable: true },
  unknown: { message: 'Something went wrong analysing that. Try again.', retryable: true },
};

/** The 403 of an account whose email address is not confirmed yet. */
export const UNCONFIRMED_MESSAGE = 'Confirm your email address to use food analysis.';

/** Server codes whose own message is more specific than ours and safe to show. */
const SERVER_MESSAGE_WINS = new Set<AiErrorCode>(['daily_limit', 'not_food', 'bad_request', 'truncated']);

export function aiError(code: AiErrorCode, serverMessage?: string, remaining: number | null = null): AiError {
  const copy = COPY[code];
  const msg = serverMessage && SERVER_MESSAGE_WINS.has(code) ? serverMessage : copy.message;
  return new AiError(code, msg, copy.retryable, remaining);
}

/** Map an HTTP status and body (whatever shape it has) to a typed error. */
export function errorFromResponse(status: number, body: unknown): AiError {
  const b = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const serverCode = typeof b.error === 'string' ? b.error : undefined;
  const message = typeof b.message === 'string' && b.message.trim() ? b.message.trim().slice(0, 200) : undefined;
  const remaining = typeof b.remaining === 'number' ? b.remaining : null;
  switch (serverCode) {
    case 'daily_limit': {
      const e = aiError('daily_limit', message, remaining ?? 0);
      e.limit = limitInfoFrom(b);
      return e;
    }
    case 'unauthorized':
      // analyze-food answers 403 with this code for a signed-in account whose email is not confirmed yet:
      // signing in again would not help, so say what will.
      if (status === 403) return new AiError('unauthorized', UNCONFIRMED_MESSAGE, false);
      return aiError('unauthorized', message);
    case 'not_food':
    case 'declined':
    case 'truncated':
    case 'rate_limited':
    case 'not_configured':
    case 'bad_request':
    case 'upstream':
      return aiError(serverCode, message);
    case 'quota_check_failed':
    case 'internal':
      return aiError('unknown');
  }
  // No code we know: the Supabase gateway answered, or something in between did.
  if (status === 401 || status === 403) return aiError('unauthorized');
  if (status === 404) return aiError('not_configured', undefined);
  if (status === 413) return aiError('bad_request', 'Image is too large. Try again with a smaller photo.');
  if (status === 429) return aiError('rate_limited');
  if (status === 408 || status === 504) return aiError('timeout');
  if (status >= 500) return aiError('upstream');
  return aiError('unknown');
}

export interface BuildOptions {
  functionsUrl: string;
  accessToken: string;
  /** Supabase anon key, sent as `apikey` the way supabase-js does. */
  anonKey?: string;
}

export function buildAnalyzeRequest(input: AnalyzeRequest, opts: BuildOptions): { url: string; init: RequestInit } {
  const body: Record<string, unknown> = {};
  if (input.image) {
    body.image = stripDataPrefix(input.image);
    body.mediaType = 'image/jpeg';
  }
  const text = input.text?.trim();
  if (text) body.text = text.slice(0, 500);
  if (input.precise) body.precise = true;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${opts.accessToken}`,
  };
  if (opts.anonKey) headers.apikey = opts.anonKey;
  return {
    url: `${opts.functionsUrl.replace(/\/$/, '')}/analyze-food`,
    init: { method: 'POST', headers, body: JSON.stringify(body) },
  };
}

export function stripDataPrefix(base64: string): string {
  const i = base64.indexOf('base64,');
  return base64.startsWith('data:') && i >= 0 ? base64.slice(i + 7) : base64;
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0);
const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** Validate a 200 body. The server already sanitises; this guards the shape. */
export function parseAnalyzeBody(body: unknown): AnalyzeResponse {
  const b = body && typeof body === 'object' ? (body as Record<string, unknown>) : null;
  if (!b || !Array.isArray(b.items)) throw aiError('upstream');
  const items: AiFoodItem[] = [];
  for (const raw of b.items) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    const name = str(r.name);
    const grams = num(r.grams);
    if (!name || grams <= 0) continue;
    items.push({
      name,
      grams,
      kcal: num(r.kcal),
      protein: num(r.protein),
      carbs: num(r.carbs),
      fat: num(r.fat),
      fiber: num(r.fiber),
      confidence: Math.min(1, num(r.confidence)),
    });
  }
  if (items.length === 0) throw aiError('not_food', str(b.note) ?? undefined);
  return {
    result: {
      dish: str(b.dish) ?? items[0].name,
      items,
      hiddenFatQuestion: str(b.hiddenFatQuestion),
      note: str(b.note),
      model: str(b.model) ?? 'unknown',
    },
    remaining: typeof b.remaining === 'number' ? b.remaining : null,
  };
}

/** The precise pass runs a bigger model with more reasoning, so it gets longer. */
export const TIMEOUT_MS = { fast: 45_000, precise: 90_000 };

/**
 * POST the request and return a validated result, or throw an `AiError`.
 * `signal` lets the screen cancel; a cancel surfaces as an AbortError, not an AiError.
 */
export async function postAnalyze(
  fetchFn: typeof fetch,
  input: AnalyzeRequest,
  opts: BuildOptions & { timeoutMs?: number; signal?: AbortSignal },
): Promise<AnalyzeResponse> {
  const { url, init } = buildAnalyzeRequest(input, opts);
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, opts.timeoutMs ?? (input.precise ? TIMEOUT_MS.precise : TIMEOUT_MS.fast));
  const onCancel = () => controller.abort();
  opts.signal?.addEventListener('abort', onCancel);
  let res: Response;
  try {
    res = await fetchFn(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (timedOut) throw aiError('timeout');
    if (opts.signal?.aborted) throw error;
    throw aiError('network');
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener('abort', onCancel);
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok) throw errorFromResponse(res.status, body);
  return parseAnalyzeBody(body);
}
