/**
 * "Report this answer": what a report of one of the AI coach's answers holds, and what the app says
 * about how it went. Pure; the send is ./reportSend.ts and the sheet ./ReportSheet.tsx.
 *
 * WHAT IS SENT. One row into `ai_reports` (supabase/migrations/20261123000100_ai_reports.sql), inserted
 * with no select (the person cannot read the table): the kind 'coach_answer', one reason from the
 * table's list, the answer as it was shown (at most 2,000 characters), and the question it answered only
 * when the person ticked "Also send my question" (at most 500). Nothing else: no profile, no note, no
 * week, no earlier messages. The server adds the person's id and the time, and refuses the 21st report
 * in 24 hours ('report_limit').
 *
 * Only an AI answer can be reported, never an answer worked out on the phone or the app's own notice.
 */
import type { CoachMessage } from './request';
import { shownAnswer } from './request';

export type ReportReason = 'unsafe' | 'wrong' | 'offensive' | 'off_topic' | 'other';
/** In the order the sheet shows them; the table's check list, word for word. */
export const REPORT_REASON_IDS: readonly ReportReason[] = ['unsafe', 'wrong', 'offensive', 'off_topic', 'other'];

/** The table's caps, counted in characters as Postgres counts them (code points). */
export const REPORT_ANSWER_MAX = 2000;
export const REPORT_QUESTION_MAX = 500;
/** The server's limit, for the words and the tests; the server decides. */
export const REPORTS_PER_DAY = 20;

export interface ReportRow {
  kind: 'coach_answer';
  reason: ReportReason;
  answer: string;
  question?: string;
}

/** The text cut to `max` code points (a cut never splits a character in two), trimmed. */
export function clipText(text: string, max: number): string {
  const t = text.trim();
  const chars = Array.from(t);
  return chars.length <= max ? t : chars.slice(0, max).join('').trimEnd();
}

/** Whether a message may be reported: an AI answer with words in it. */
export function reportable(m: CoachMessage): m is Extract<CoachMessage, { source: 'ai' }> {
  return m.role === 'assistant' && m.source === 'ai' && m.text.trim().length > 0;
}

/** The question an answer replied to, when it is a typed question still in the chat. */
export function questionFor(answer: CoachMessage, messages: readonly CoachMessage[]): string | null {
  if (answer.role !== 'assistant') return null;
  const q = messages.find((m) => m.id === answer.replyTo);
  return q && q.role === 'user' && q.source === 'typed' && q.text.trim() ? q.text : null;
}

/**
 * The row a report makes, or null when there is nothing to report (not an AI answer, or no words).
 * The question goes in only when `withQuestion` is true and there is one.
 */
export function buildReportRow(input: { message: CoachMessage; reason: ReportReason; question: string | null; withQuestion: boolean }): ReportRow | null {
  const { message, reason } = input;
  if (!reportable(message) || !REPORT_REASON_IDS.includes(reason)) return null;
  const answer = clipText(shownAnswer(message), REPORT_ANSWER_MAX);
  if (!answer) return null;
  const row: ReportRow = { kind: 'coach_answer', reason, answer };
  const question = input.withQuestion && input.question ? clipText(input.question, REPORT_QUESTION_MAX) : '';
  if (question) row.question = question;
  return row;
}

export type ReportOutcome = 'sent' | 'network' | 'limit' | 'account' | 'failed';

/**
 * How an insert went, from what the Supabase client gave back: null is sent; the server's daily cap
 * ('report_limit', raised as P0001) is the limit; a refused or expired sign-in is the account; a request
 * that never reached the server is the network; anything else failed.
 */
export function reportOutcome(error: { code?: string | null; message?: string | null; status?: number | null } | null | undefined): ReportOutcome {
  if (!error) return 'sent';
  const code = String(error.code ?? '');
  const message = String(error.message ?? '');
  if (/report_limit/.test(message) || (code === 'P0001' && /limit/i.test(message))) return 'limit';
  if (code === '42501' || code === 'PGRST301' || code === 'PGRST302' || error.status === 401 || error.status === 403 || /jwt/i.test(message)) return 'account';
  if (/failed to fetch|network request failed|fetch failed|networkerror|load failed|timed? ?out/i.test(message) || error.status === 0) return 'network';
  return 'failed';
}

/**
 * Test-hook builds only (`/coach?reportDemo=1`, src/app/coach.tsx): one typed question and an AI answer
 * to it, shown and never stored, so a build without a backend can show the report control and sheet.
 */
export const REPORT_DEMO: readonly CoachMessage[] = [
  { id: 'report-demo-q', role: 'user', source: 'typed', text: 'How many rest days a week do I need?', at: 0 },
  {
    id: 'report-demo-a',
    role: 'assistant',
    source: 'ai',
    replyTo: 'report-demo-q',
    at: 0,
    text: 'Most people training three to five times a week do well with one or two rest days. Put an easy day after your hardest session, and take an extra one when your legs still feel heavy the next morning. Sleep counts as part of recovery too.',
  },
];
