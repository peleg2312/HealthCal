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

const all = (d: LegalDocument) => [d.title, d.subtitle, ...d.summary.map((s) => s.text), d.intro, ...d.sections.flatMap((s) => [s.heading, ...s.paragraphs])];
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

  it('open with a short layer: three to six plain lines, each short, each with its own id', () => {
    for (const d of [TERMS, PRIVACY]) {
      expect(d.summary.length).toBeGreaterThanOrEqual(3);
      expect(d.summary.length).toBeLessThanOrEqual(6);
      expect(new Set(d.summary.map((s) => s.id)).size).toBe(d.summary.length);
      for (const s of d.summary) {
        expect(s.text.length).toBeLessThan(130);
        expect(BANNED.test(s.text) || s.text.includes('!')).toBe(false);
        expect(s.text).toMatch(/^[A-Z0-9"].*\.$/);
      }
    }
  });

  it('the short layer holds no price', () => {
    for (const d of [TERMS, PRIVACY]) expect(d.summary.map((s) => s.text).join(' ')).not.toMatch(/[$€£]|\d+[.,]\d{2}/);
  });

  /**
   * Each line of the short layer, by its id: what the line itself must say (`says`), and for each of
   * those facts the section of the full text that holds it (`held`). A line cannot be changed to say
   * something else without failing `says`, and a section cannot drop the fact without failing `held`.
   */
  const FACTS: Record<LegalDocument['id'], Record<string, { says: RegExp[]; held: [section: string, fact: RegExp][] }>> = {
    terms: {
      medical: {
        says: [/tracking tool, not medical advice/, /numbers are estimates/],
        held: [
          ['medical', /tracking tool, not a medical device, and nothing in it is medical advice/],
          ['medical', /calorie and nutrient figures, calorie burn and AI estimates are estimates/],
        ],
      },
      free: {
        says: [/Everything on your phone is free/, /no ads/, /So are the account and sync/],
        held: [
          ['free', /Everything HealthCal does on your phone is free/],
          ['free', /There are no ads/],
          ['free', /So are the account with backup and sync/],
        ],
      },
      plus: {
        says: [/Plus is optional/, /renews until you cancel/, /cancel in the plan screen/],
        held: [
          ['plus', /Plus is an optional subscription/],
          ['renewal', /renews by itself at the end of each period, until you cancel/],
          ['renewal', /cancel at any time from the plan screen/],
        ],
      },
      yours: {
        says: [/export your data/, /delete your account at any time/],
        held: [
          ['free', /full export/],
          ['account', /delete your account at any time/],
        ],
      },
      age: {
        says: [/aged 16 and over/, /AI coach is for 18 and over/],
        held: [
          ['who', /for people aged 16 and over/],
          ['who', /AI coach is for people aged 18 and over/],
        ],
      },
    },
    privacy: {
      device: {
        says: [/Without an account/, /stays on this device/],
        held: [
          ['short', /stays on this device unless you create an account/],
          ['device', /Without an account, .* stored on this device and nowhere else/],
        ],
      },
      account: {
        says: [/With an account/, /private space/, /back up and sync/, /No other account can read it/],
        held: [
          ['short', /With an account it is kept in your private space/],
          ['short', /so it can back up and sync/],
          ['short', /no other account can read it/],
          ['account', /Each account can read and change its own data and nothing else/],
        ],
      },
      friends: {
        // Friends are opt-in, and what they see is a training summary; a meal when the person chooses to show it.
        says: [/Friends are off until you turn them on/, /friends see your workouts and streak/, /what you choose to show or do together/],
        held: [
          ['short', /Friends, if you turn them on, see your workouts and streak, and a meal when you choose to show it/],
          ['friends', /off until you turn them on/],
          ['friends', /A friend sees your display name, your active minutes, sessions and streak, and your recent workouts/],
          ['friends', /You choose each meal a friend sees/],
          ['friends', /and the friends who see it/],
          ['friends', /kept on HealthCal’s server for 7 days from when you first showed it and is then deleted/],
          ['friends', /Friends never see your weight/],
          ['friends', /Doing things together is each off until you start it or accept it/],
          ['friends', /the circle’s total for the week/],
          ['friends', /Never one person’s figure/],
          ['friends', /whether one or both of you logged anything, never what or how much/],
          ['friends', /your phone sends HealthCal’s server just what they need/],
          ['friends', /a few set phrases, with no words of your own, and is kept for 14 days/],
        ],
      },
      ads: {
        says: [/No ads, no tracking, no analytics and no selling of data/],
        held: [['short', /No ads, no tracking, no analytics and no selling of data/]],
      },
      ai: {
        // What you give it, after agreeing; and what the coach sends beyond the typed question.
        says: [/gets what you give it once you agree/, /coach adds your last few questions and answers/, /if shared, a week summary/],
        held: [
          ['ai-estimate', /after you have agreed once on this device/],
          ['ai-estimate', /What is sent is a smaller copy of the photo .* or the words you typed/],
          ['coach', /A question you type goes .* after you have agreed once on this device/],
          ['coach', /with your last few typed questions and the coach’s answers to them/],
          ['coach', /A short summary of your week goes with it while "Share my week" is on, and never otherwise/],
        ],
      },
      yours: {
        says: [/export everything you log or delete it at any time/, /the coach chat and meal photos stay on this phone/],
        held: [
          ['short', /export everything you log or delete it at any time/],
          ['export', /exports everything you logged as a file you keep/],
          ['export', /removes your account and everything stored with it/],
          ['coach', /The chat itself is kept on this phone and is not in the export/],
          ['ai-estimate', /a small copy of the photo is kept on this phone .* never uploaded, synced or put in the export/],
          ['export', /The coach chat and meal photos stay on the phone and are not in the file/],
        ],
      },
    },
  };

  it('every line of the short layer says its own fact, and a section of the full text holds the same fact', () => {
    for (const d of [TERMS, PRIVACY]) {
      const facts = FACTS[d.id];
      // Every line is pinned, and nothing is pinned that is not a line.
      expect(d.summary.map((s) => s.id).sort()).toEqual(Object.keys(facts).sort());
      for (const item of d.summary) {
        const { says, held } = facts[item.id];
        expect(says.length).toBeGreaterThan(0);
        // At least one section fact for each thing the line says.
        expect(held.length).toBeGreaterThanOrEqual(says.length);
        for (const fact of says) expect(item.text, `${d.id}.${item.id} says`).toMatch(fact);
        for (const [id, fact] of held) expect(section(d, id), `${d.id}.${item.id} held in ${id}`).toMatch(fact);
      }
    }
  });

  it('the AI line covers what the coach sends beyond the typed question', () => {
    const line = PRIVACY.summary.find((s) => s.id === 'ai')?.text ?? '';
    expect(line).toBe('The AI gets what you give it once you agree; the coach adds your last few questions and answers and, if shared, a week summary.');
    // One sentence.
    expect(line.match(/[.!?]/g)).toEqual(['.']);
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
