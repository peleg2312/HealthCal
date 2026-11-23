/**
 * "Report this answer": the row a report makes holds the answer as shown, one reason from the table's
 * list and the question only when ticked, within the table's caps; the outcomes map to the right words;
 * and every word of it passes the coach's banned list.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { buildReportRow, clipText, questionFor, REPORT_ANSWER_MAX, REPORT_DEMO, REPORT_QUESTION_MAX, REPORT_REASON_IDS, reportable, reportOutcome, type ReportReason } from './report';
import type { CoachMessage } from './request';
import * as W from './words';

const BANNED =
  /\b(bad|fail|failed|failure|cheat|cheated|should|guilty|lazy|great|amazing|well done|keep it up|too much|missed your|goal missed|over budget|make up|only|unfortunately|oops|sorry)\b/i;

const q: CoachMessage = { id: 'q1', role: 'user', source: 'typed', text: 'How often should I run?', at: 1 };
const a: CoachMessage = { id: 'a1', role: 'assistant', source: 'ai', replyTo: 'q1', text: 'Three times a week is a fair start.', at: 2 };
const local: CoachMessage = { id: 'l1', role: 'assistant', source: 'local', replyTo: 'q0', topic: 'training', text: 'Last 7 days: 120 minutes.', at: 3 };
const notice: CoachMessage = { id: 'n1', role: 'assistant', source: 'notice', notice: 'network', replyTo: 'q1', at: 4 };

describe('what a report holds', () => {
  it('the answer and the reason, and no question unless ticked', () => {
    expect(buildReportRow({ message: a, reason: 'wrong', question: q.text, withQuestion: false })).toEqual({ kind: 'coach_answer', reason: 'wrong', answer: 'Three times a week is a fair start.' });
    expect(buildReportRow({ message: a, reason: 'unsafe', question: q.text, withQuestion: true })).toEqual({
      kind: 'coach_answer',
      reason: 'unsafe',
      answer: 'Three times a week is a fair start.',
      question: 'How often should I run?',
    });
  });

  it('nothing for a phone answer, a notice, a question, an empty answer or an unknown reason', () => {
    for (const m of [local, notice, q, { ...a, text: '   ' }]) expect(buildReportRow({ message: m, reason: 'wrong', question: null, withQuestion: true })).toBeNull();
    expect(buildReportRow({ message: a, reason: 'spam' as ReportReason, question: null, withQuestion: false })).toBeNull();
    expect(reportable(a)).toBe(true);
    expect([local, notice, q].some(reportable)).toBe(false);
  });

  it('the answer as shown: a cut-short answer keeps its "…"', () => {
    const row = buildReportRow({ message: { ...a, text: 'Run three times a week.', truncated: true }, reason: 'other', question: null, withQuestion: false });
    expect(row?.answer).toBe('Run three times a week…');
  });

  it('keeps to the table’s caps in characters, never splitting one in two', () => {
    const long = '😀'.repeat(REPORT_ANSWER_MAX + 10);
    const row = buildReportRow({ message: { ...a, text: long }, reason: 'other', question: 'é'.repeat(900), withQuestion: true });
    expect(Array.from(row!.answer)).toHaveLength(REPORT_ANSWER_MAX);
    expect(row!.answer.endsWith('😀')).toBe(true);
    expect(Array.from(row!.question!)).toHaveLength(REPORT_QUESTION_MAX);
    expect(clipText('  short  ', 10)).toBe('short');
  });

  it('an empty question is left out even when ticked', () => {
    expect(buildReportRow({ message: a, reason: 'wrong', question: '  ', withQuestion: true })).not.toHaveProperty('question');
    expect(buildReportRow({ message: a, reason: 'wrong', question: null, withQuestion: true })).not.toHaveProperty('question');
  });

  it('finds the typed question an answer replied to, never a button question', () => {
    expect(questionFor(a, [q, a])).toBe('How often should I run?');
    expect(questionFor(a, [{ ...q, source: 'local' }, a])).toBeNull();
    expect(questionFor(a, [a])).toBeNull();
    expect(questionFor(q, [q])).toBeNull();
  });

  it('the reasons are the table’s list, word for word', () => {
    const sql = readFileSync(path.join(__dirname, '../../../supabase/migrations/20261123000100_ai_reports.sql'), 'utf8');
    const listed = /reason in \(([^)]*)\)/.exec(sql)?.[1].match(/'([a-z_]+)'/g)?.map((s) => s.slice(1, -1));
    expect(listed).toEqual([...REPORT_REASON_IDS]);
    expect(Object.keys(W.REPORT_REASONS)).toEqual([...REPORT_REASON_IDS]);
  });
});

describe('how a send went', () => {
  it('maps the client’s answers', () => {
    expect(reportOutcome(null)).toBe('sent');
    expect(reportOutcome({ code: 'P0001', message: 'report_limit' })).toBe('limit');
    expect(reportOutcome({ code: '42501', message: 'new row violates row-level security policy' })).toBe('account');
    expect(reportOutcome({ code: 'PGRST301', message: 'JWT expired' })).toBe('account');
    expect(reportOutcome({ code: '', message: 'TypeError: Failed to fetch' })).toBe('network');
    expect(reportOutcome({ message: 'Network request failed' })).toBe('network');
    expect(reportOutcome({ code: '23514', message: 'violates check constraint' })).toBe('failed');
  });
});

describe('the words', () => {
  it('pass the banned list, with no exclamation mark, in sentence case', () => {
    const words = [
      W.REPORT_OPEN,
      W.REPORT_OPEN_LABEL,
      W.REPORTED,
      W.REPORT_TITLE,
      W.REPORT_REASON_LABEL,
      W.REPORT_WITH_QUESTION,
      W.REPORT_WHAT_IS_SENT,
      W.REPORT_SEND,
      W.REPORT_SENT,
      ...Object.values(W.REPORT_REASONS).map((r) => r.text),
      ...Object.values(W.REPORT_NOT_SENT).map((r) => r.text),
      ...REPORT_DEMO.map((m) => (m.source === 'notice' ? '' : m.text)),
    ];
    const bad = words.filter((s) => !s || BANNED.test(s) || s.includes('!') || !/^[A-Z0-9"]/.test(s));
    expect(bad).toEqual([]);
  });

  it('say exactly what is sent and to whom, and the limit in plain words', () => {
    expect(W.REPORT_WHAT_IS_SENT).toBe('This answer goes to HealthCal so it can be looked at. Your question is added if you tick the box, and left out if you do not.');
    expect(W.REPORT_SENT).toBe('Report sent. Thank you.');
    expect(W.REPORT_NOT_SENT.limit.text).toBe('That is today’s limit of reports.');
  });

  it('the demo is one typed question and an AI answer to it', () => {
    expect(REPORT_DEMO.map((m) => `${m.role}:${m.source}`)).toEqual(['user:typed', 'assistant:ai']);
    expect(questionFor(REPORT_DEMO[1], REPORT_DEMO)).toBe(REPORT_DEMO[0].role === 'user' ? REPORT_DEMO[0].text : null);
  });
});
