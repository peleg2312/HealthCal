/**
 * The terms and the privacy text hold what a subscription needs, in the app's own voice: the sections a
 * store, a payment company and consumer law ask for are there, every word passes the app's banned list
 * (the morning page's, src/features/morning/words.test.ts), nothing names a payment company, and no
 * address is made up while the owner has not given one.
 */
import { describe, expect, it } from 'vitest';

import { CONTACT_EMAIL, contactLine, LEGAL_UPDATED, PRIVACY, TERMS, updatedLine, type LegalDocument } from './content';

const BANNED =
  /\b(bad|fail|failed|failure|cheat|cheated|should|guilty|lazy|great|amazing|well done|keep it up|too much|missed your|goal missed|over budget|make up|only|unfortunately|oops|sorry)\b/i;
const PAYMENT_COMPANIES = /\b(stripe|paddle|polar|revenuecat|lemon ?squeezy|paypal|braintree|adyen|fastspring|gumroad|chargebee)\b/i;

const all = (d: LegalDocument) => [d.title, d.subtitle, d.intro, ...d.sections.flatMap((s) => [s.heading, ...s.paragraphs])];
const text = (d: LegalDocument) => all(d).join('\n');
const section = (d: LegalDocument, id: string) => d.sections.find((s) => s.id === id)?.paragraphs.join(' ') ?? '';

describe('the terms', () => {
  it('hold the sections a subscription needs', () => {
    const ids = TERMS.sections.map((s) => s.id);
    for (const id of ['what', 'medical', 'who', 'account', 'free', 'plus', 'renewal', 'refunds', 'fair-use', 'content', 'ending', 'warranty', 'changes']) expect(ids).toContain(id);
  });

  it('say the price and period come before paying, it renews until cancelled, and Plus stays to the end of the paid period', () => {
    expect(section(TERMS, 'plus')).toMatch(/Before you pay, .*price, the currency and the period/);
    expect(section(TERMS, 'renewal')).toMatch(/renews by itself .* until you cancel/);
    expect(section(TERMS, 'renewal')).toMatch(/cancel at any time/);
    expect(section(TERMS, 'renewal')).toMatch(/stays until the end of the period you have paid for/);
  });

  it('defer refunds and withdrawal to the checkout terms and the law, without a number of days', () => {
    const r = section(TERMS, 'refunds');
    expect(r).toMatch(/payment company under its checkout terms/);
    expect(r).toMatch(/law where you live/);
    expect(r).not.toMatch(/\d+\s*days?/);
  });

  it('say it is not medical advice and estimates are estimates', () => {
    expect(section(TERMS, 'medical')).toMatch(/nothing in it is medical advice/);
    expect(section(TERMS, 'medical')).toMatch(/estimates/);
  });
});

describe('the privacy text', () => {
  it('holds every part of what the app does with data', () => {
    const ids = PRIVACY.sections.map((s) => s.id);
    for (const id of ['short', 'device', 'account', 'food-data', 'ai-estimate', 'coach', 'reports', 'health', 'friends', 'payments', 'export', 'children', 'changes']) expect(ids).toContain(id);
  });

  it('says what a payment adds and that card details never reach HealthCal', () => {
    const p = section(PRIVACY, 'payments');
    expect(p).toMatch(/payment company that is the seller/);
    expect(p).toMatch(/card details never reach HealthCal/);
    expect(p).toMatch(/whether your plan is active and until when/);
  });

  it('says the week goes to the coach only with "Share my week" and names the AI provider the consent sheets name', () => {
    expect(section(PRIVACY, 'coach')).toMatch(/while "Share my week" is on, and never otherwise/);
    expect(section(PRIVACY, 'ai-estimate')).toMatch(/Anthropic/);
    expect(section(PRIVACY, 'coach')).toMatch(/Anthropic/);
  });

  it('keeps the app’s own age rules', () => {
    expect(section(PRIVACY, 'children')).toMatch(/16 and over/);
    expect(section(PRIVACY, 'children')).toMatch(/AI coach is for people aged 18 and over/);
  });
});

describe('both documents', () => {
  it('pass the banned list, with no exclamation mark, in sentence case', () => {
    for (const d of [TERMS, PRIVACY]) {
      const bad = all(d).filter((s) => BANNED.test(s) || s.includes('!') || !/^[A-Z0-9"]/.test(s));
      expect(bad).toEqual([]);
    }
  });

  it('name no payment company, no "Brim", and no address while none is set', () => {
    for (const d of [TERMS, PRIVACY]) {
      expect(text(d)).not.toMatch(PAYMENT_COMPANIES);
      expect(text(d)).not.toMatch(/\bBrim\b/);
      expect(text(d)).not.toMatch(/@|https?:\/\//);
    }
  });

  it('headings are short and every paragraph is a few sentences at most', () => {
    for (const d of [TERMS, PRIVACY]) {
      for (const s of d.sections) {
        expect(s.heading.length).toBeLessThanOrEqual(40);
        expect(s.paragraphs.length).toBeGreaterThan(0);
        for (const p of s.paragraphs) expect(p.length).toBeLessThanOrEqual(520);
      }
      expect(new Set(d.sections.map((s) => s.id)).size).toBe(d.sections.length);
    }
  });

  it('show a contact line only when an address is set', () => {
    expect(CONTACT_EMAIL).toBe('');
    expect(contactLine()).toBeNull();
    expect(contactLine('  ')).toBeNull();
    expect(contactLine('help@example.org')).toBe('Questions about these pages: help@example.org');
  });

  it('write the date out the same on every phone', () => {
    expect(LEGAL_UPDATED).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(updatedLine('2026-11-23')).toBe('Updated November 23, 2026');
    expect(updatedLine('nonsense')).toBe('Updated recently');
  });
});
