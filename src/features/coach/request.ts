/**
 * The chat's messages and what a question sends: the request builder, the client for the coach-chat
 * edge function, and the mapping of every answer it gives to the app's words. Pure apart from the
 * `fetch` passed in, so it is tested against a fake one (the shape of `postAnalyze` in
 * @/features/ai/api, with its own codes and words: none of the food estimate's are reused).
 *
 * WHAT IS SENT. The typed question; the last `pairs` completed pairs (the plan's `memoryPairs`: 3 on
 * the free plan, while plans are off and while the plan is not known, 6 on Plus; never more than
 * `MAX_PAIRS`, the server's 12 turns) of a TYPED question and the AI's
 * answer to it (user first, each cut to 1,200 characters at a sentence end); the consent version; and
 * the note from `buildCoachNote`, only while "Share my week" is on. An answer given on the phone (the
 * two buttons) and its button's question are never part of it, in any position, and neither is the
 * app's own line for a question the AI did not answer (that question is left out too, so the pairs
 * stay whole). The server checks the same caps (supabase/functions/coach-chat/coach.ts).
 */
import { limitInfoFrom, type LimitInfo } from '@/features/ai/limit';

import type { CoachNoticeKind } from './words';

export type CoachMessage =
  /** Something the person asked: typed into the field, or one of the two buttons answered on the phone. */
  | { id: string; role: 'user'; source: 'typed' | 'local'; text: string; at: number }
  /** The AI's answer to a typed question. `text` is what arrived (without the "…" of a cut-short answer). */
  | { id: string; role: 'assistant'; source: 'ai'; replyTo: string; text: string; at: number; truncated?: boolean; refer?: boolean }
  /** An answer worked out on the phone from the person's data. Never sent. */
  | { id: string; role: 'assistant'; source: 'local'; replyTo: string; text: string; at: number; topic: 'training' | 'ideas' }
  /** The app's own line when the AI did not answer (no account, the limit, a failure). Never sent. */
  | { id: string; role: 'assistant'; source: 'notice'; replyTo: string; notice: CoachNoticeKind; at: number; limit?: LimitInfo | null };

/** Pairs sent while the plan is not known (and on the free plan). */
export const HISTORY_PAIRS = 3;
/** The server accepts at most 12 earlier turns (supabase/functions/coach-chat/coach.ts `MAX_TURNS`). */
export const MAX_PAIRS = 6;
export const TURN_MAX = 1200;
export const NOTE_MAX = 900;
export const MESSAGE_MAX = 500;
/** The server takes 20 s an attempt with one retry; the app waits a little longer than both. */
export const COACH_TIMEOUT_MS = 50_000;

export interface CoachTurn {
  role: 'user' | 'assistant';
  text: string;
}

export interface CoachBody {
  message: string;
  history?: CoachTurn[];
  note?: string;
  consentVersion: number;
}

/**
 * A turn longer than `max` characters cut at its last sentence end that leaves at least half of it,
 * else at its last space, with "…"; never longer than `max`.
 */
export function cutAtSentence(text: string, max = TURN_MAX): string {
  const t = text.trim();
  if (t.length <= max) return t;
  const room = t.slice(0, max - 1);
  let end = -1;
  const re = /[.!?。؟](?=\s|$)/g;
  for (let m = re.exec(room); m; m = re.exec(room)) end = m.index + 1;
  if (end < max / 2) {
    const space = room.lastIndexOf(' ');
    end = space > max / 2 ? space : max - 1;
  }
  return `${room.slice(0, end).trimEnd()}…`;
}

/**
 * The history sent with a new question: the last `pairs` completed pairs of a typed question and the
 * AI's answer to it, oldest first, user first. Everything else in the chat stays on the phone.
 */
export function historyFor(messages: readonly CoachMessage[], pairs = HISTORY_PAIRS): CoachTurn[] {
  const byId = new Map(messages.map((m) => [m.id, m]));
  const found: CoachTurn[][] = [];
  const used = new Set<string>();
  for (const m of messages) {
    if (m.role !== 'assistant' || m.source !== 'ai') continue;
    const q = byId.get(m.replyTo);
    if (!q || q.role !== 'user' || q.source !== 'typed' || used.has(q.id)) continue;
    const question = cutAtSentence(q.text);
    const answer = cutAtSentence(m.text);
    if (!question || !answer) continue;
    used.add(q.id);
    found.push([
      { role: 'user', text: question },
      { role: 'assistant', text: answer },
    ]);
  }
  return pairs > 0 ? found.slice(-pairs).flat() : [];
}

/** How many pairs a request carries: the plan's number, whole, between 0 and `MAX_PAIRS`; 3 when it cannot be read. */
export function pairsToSend(memoryPairs: number | null | undefined): number {
  if (typeof memoryPairs !== 'number' || !Number.isFinite(memoryPairs)) return HISTORY_PAIRS;
  return Math.max(0, Math.min(MAX_PAIRS, Math.floor(memoryPairs)));
}

/**
 * The body of one question. `pairs` is the plan's `memoryPairs` (`usePlan().limits.memoryPairs`, 3 while
 * not known), held to `pairsToSend`. `note` is passed only while sharing is on; an empty one is left out.
 */
export function buildCoachRequest(input: { message: string; messages: readonly CoachMessage[]; note: string | null; consentVersion: number; pairs: number }): CoachBody {
  const body: CoachBody = { message: input.message.trim().slice(0, MESSAGE_MAX), consentVersion: input.consentVersion };
  const history = historyFor(input.messages, pairsToSend(input.pairs));
  if (history.length) body.history = history;
  const note = input.note?.trim();
  if (note) body.note = note.slice(0, NOTE_MAX);
  return body;
}

// ------------------------------------------------------------------ the answer and its errors

export interface CoachAnswer {
  text: string;
  remaining: number | null;
  truncated: boolean;
  refer: boolean;
}

export class CoachError extends Error {
  constructor(
    public kind: CoachNoticeKind | 'consent_outdated',
    public remaining: number | null = null,
    /** A limit answer's plan fields (@/features/ai/limit), or null with plans off or from an older server. */
    public limit: LimitInfo | null = null,
  ) {
    super(kind);
    this.name = 'CoachError';
  }
}

/** The server's code (and, for a body with no code we know, the status) as what the app says. */
export function coachErrorFrom(status: number, body: unknown): CoachError {
  const b = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const code = typeof b.error === 'string' ? b.error : '';
  const remaining = typeof b.remaining === 'number' && Number.isFinite(b.remaining) ? b.remaining : null;
  switch (code) {
    case 'unauthorized':
      return new CoachError('account');
    case 'unconfirmed':
      return new CoachError('unconfirmed');
    case 'under_18':
      return new CoachError('under18');
    case 'consent_outdated':
      return new CoachError('consent_outdated');
    case 'daily_limit':
      return new CoachError('daily_limit', remaining ?? 0, limitInfoFrom(b));
    case 'shared_limit':
      return new CoachError('shared_limit', remaining ?? 0, limitInfoFrom(b));
    case 'busy':
      return new CoachError('busy', remaining);
    case 'timeout':
      return new CoachError('timeout', remaining);
    case 'upstream':
      return new CoachError('upstream', remaining);
    case 'declined':
      return new CoachError('declined', remaining);
    case 'not_configured':
      return new CoachError('not_configured');
    case 'body_too_large':
      return new CoachError('too_large');
  }
  // A code for a request outside the caps (a fault of this app), a server fault, or no body we know.
  if (code) return new CoachError('failed', remaining);
  if (status === 401) return new CoachError('account');
  if (status === 404) return new CoachError('not_configured');
  if (status === 413) return new CoachError('too_large');
  if (status === 429) return new CoachError('busy');
  if (status === 408 || status === 504) return new CoachError('timeout');
  if (status >= 500) return new CoachError('upstream');
  return new CoachError('failed');
}

/** A 200 body, checked: an answer with no text is a failure the server should not send. */
export function parseCoachAnswer(body: unknown): CoachAnswer {
  const b = body && typeof body === 'object' ? (body as Record<string, unknown>) : null;
  const text = b && typeof b.text === 'string' ? b.text.trim() : '';
  if (!b || !text) throw new CoachError('upstream');
  return {
    text,
    remaining: typeof b.remaining === 'number' && Number.isFinite(b.remaining) ? b.remaining : null,
    truncated: b.truncated === true,
    refer: b.refer === true,
  };
}

export interface CoachConnection {
  functionsUrl: string;
  accessToken: string;
  anonKey?: string;
}

export function coachFetchInit(body: CoachBody, c: CoachConnection): { url: string; init: RequestInit } {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', Authorization: `Bearer ${c.accessToken}` };
  if (c.anonKey) headers.apikey = c.anonKey;
  return { url: `${c.functionsUrl.replace(/\/$/, '')}/coach-chat`, init: { method: 'POST', headers, body: JSON.stringify(body) } };
}

/** POST one question; an answer, or a `CoachError` (a cancel passes through as the fetch's own error). */
export async function postCoach(
  fetchFn: typeof fetch,
  body: CoachBody,
  c: CoachConnection & { timeoutMs?: number; signal?: AbortSignal },
): Promise<CoachAnswer> {
  const { url, init } = coachFetchInit(body, c);
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, c.timeoutMs ?? COACH_TIMEOUT_MS);
  const onCancel = () => controller.abort();
  c.signal?.addEventListener('abort', onCancel);
  let res: Response;
  try {
    res = await fetchFn(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (timedOut) throw new CoachError('timeout');
    if (c.signal?.aborted) throw error;
    throw new CoachError('network');
  } finally {
    clearTimeout(timer);
    c.signal?.removeEventListener('abort', onCancel);
  }
  let parsed: unknown = null;
  try {
    parsed = await res.json();
  } catch {
    parsed = null;
  }
  if (!res.ok) throw coachErrorFrom(res.status, parsed);
  return parseCoachAnswer(parsed);
}

/** What a shown AI answer reads: the text, and "…" after one the length cap cut short. */
export function shownAnswer(m: { text: string; truncated?: boolean }): string {
  return m.truncated ? `${m.text.replace(/[\s.…]+$/, '')}…` : m.text;
}
