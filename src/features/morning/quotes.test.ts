import { describe, expect, it } from 'vitest';

import { addDays, diffDays } from '@/lib/dates';
import type { ISODate } from '@/types';

import {
  AUTHOR_DIED,
  QUOTE_DAYS,
  QUOTE_EPOCH,
  QUOTES,
  quoteAccessibilityLabel,
  quoteById,
  quoteDayIndex,
  quoteFor,
  quoteOnDay,
  quoteTheme,
  REST_UNDER_HOURS,
  type QuoteTheme,
} from './quotes';

const THEMES: QuoteTheme[] = ['again', 'onward', 'rest'];

/** Words that would scold or touch a subject the page leaves out (religion, war, death, dieting, the body). */
const EXCLUDED =
  /\b(god|gods|lord|heaven|hell|death|dead|die|dies|dying|war|wars|kill|diet|dieting|weight|body|fat|sin|cheat|fail|failed|failure|failures|pray|prayer|church|bible|lazy|shame|guilt|cheating)\b/i;

/**
 * English a tired reader, or one whose first language is not English, has to decode: thou, thee,
 * thy, thine, hath, doth, wilt, shalt, an -eth verb, an 18th-century elision such as produc'd, or
 * words addressed to a named person. ('Tis in the Tennyson line may stay.)
 */
const ARCHAIC = /\b(thou|thee|thy|thine|thyself|hath|doth|wilt|shalt|art thou|ye)\b|\b\w{2,}eth\b|\w'd\b|\bLucilius\b|\bmy dear\b/i;

/** "He" or "men" for everyone. */
const GENERIC_MALE = /\b(he|him|his|himself|man|men|mankind)\b/i;

/** Every id a day can show, whatever the theme turns out to be. */
function idsOn(today: ISODate): Set<string> {
  const d = QUOTE_DAYS[quoteDayIndex(today)];
  return new Set([d.again.id, d.onward.id, d.rest?.id].filter((x): x is string => !!x));
}

describe('the quote table', () => {
  it('is 31 days, each with an again and an onward quote, and a rest quote on at least 10', () => {
    expect(QUOTE_DAYS).toHaveLength(31);
    for (const d of QUOTE_DAYS) {
      expect(d.again.theme).toBe('again');
      expect(d.onward.theme).toBe('onward');
      if (d.rest) expect(d.rest.theme).toBe('rest');
    }
    expect(QUOTE_DAYS.filter((d) => d.rest).length).toBeGreaterThanOrEqual(10);
  });

  it('has at least 45 quotes and at least six per theme', () => {
    expect(QUOTES.length).toBeGreaterThanOrEqual(45);
    expect(QUOTES).toHaveLength(72);
    for (const t of THEMES) expect(QUOTES.filter((q) => q.theme === t).length).toBeGreaterThanOrEqual(6);
  });

  it('has unique kebab-case ids and unique words', () => {
    const ids = QUOTES.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z]+(-[a-z]+)+$/);
    const texts = QUOTES.map((q) => q.text.toLowerCase().replace(/\s+/g, ' '));
    expect(new Set(texts).size).toBe(texts.length);
  });

  it('keeps every quote short, plain and kind', () => {
    for (const q of QUOTES) {
      const where = `${q.id}: ${q.text}`;
      // 150 at most (lead's rule L4): the page holds a five-line quote at 320 px.
      expect(q.text.length, where).toBeLessThanOrEqual(150);
      expect(q.text.length, where).toBeGreaterThan(10);
      expect(q.text, where).toBe(q.text.trim());
      expect(q.text, where).not.toMatch(/!/);
      expect(q.text, where).not.toMatch(/\.\.\.|…/);
      expect(q.text, where).not.toMatch(/[‘’“”]/);
      expect(q.text, where).not.toMatch(EXCLUDED);
      expect(q.text, where).not.toMatch(GENERIC_MALE);
      expect(q.text, where).not.toMatch(ARCHAIC);
      expect(q.text, where).toMatch(/[.?]$/);
      expect(q.text, where).not.toMatch(/ \n|\n /);
    }
  });

  it('names an author who died before 1955 and a work with its year for every quote', () => {
    for (const q of QUOTES) {
      expect(q.author.trim().length, q.id).toBeGreaterThan(0);
      expect(AUTHOR_DIED[q.author], q.id).toBeDefined();
      expect(AUTHOR_DIED[q.author], q.id).toBeLessThan(1955);
      expect(q.work, q.id).toMatch(/, ([0-9]{1,2} [A-Z][a-z]+ )?1[0-9]{3}$/);
      const year = Number(q.work.match(/([0-9]{4})$/)?.[1]);
      // Published by the author in life or soon after (letters and journals can come later), never after 1955.
      expect(year, q.id).toBeLessThan(1955);
    }
    expect(Object.keys(AUTHOR_DIED).sort()).toEqual([...new Set(QUOTES.map((q) => q.author))].sort());
  });

  it('gives every translated text its named translator and a year before 1930', () => {
    for (const q of QUOTES.filter((x) => x.author === 'Seneca')) {
      const m = q.work.match(/translated by ([A-Z][a-z]+(?: [A-Z][a-z.]*)+), ([0-9]{4})$/);
      expect(m, q.id).not.toBeNull();
      expect(Number(m![2]), q.id).toBeLessThan(1930);
    }
    expect(QUOTES.filter((q) => q.author === 'Seneca' && q.work.includes('Gummere')).length).toBeGreaterThan(0);
  });

  it('never puts one author on two days in a row within a theme, across the wrap too', () => {
    for (const t of THEMES) {
      const seq = QUOTE_DAYS.map((d) => d[t]?.author).filter((a): a is string => !!a);
      for (let i = 0; i < seq.length; i++) {
        expect(seq[i], `${t} ${i}`).not.toBe(seq[(i + 1) % seq.length]);
      }
    }
  });

  it('never shows one author twice on the same day', () => {
    for (const d of QUOTE_DAYS) {
      const authors = [d.again, d.onward, d.rest].filter((q) => q).map((q) => q!.author);
      expect(new Set(authors).size).toBe(authors.length);
    }
  });

  it('keeps verse lines and inner quotation marks as printed', () => {
    expect(quoteById('longfellow-up-and-doing')!.text.split('\n')).toHaveLength(4);
    expect(quoteById('vandyke-faltering')!.text).toBe('But often faltering feet\nCome surest to the goal;\nAnd they who walk in darkness meet\nThe sunrise of the soul.');
    expect(quoteById('davies-leisure')!.text.split('\n')).toEqual(['What is this life if, full of care,', 'We have no time to stand and stare.']);
    expect(quoteById('tagore-morning')!.text).toContain('"It is morning,"');
    expect(quoteById('dickens-bent')!.text).toBe('I have been bent and broken, but — I hope — into a better shape.');
  });

  it('reads the quote, the author and the work to a screen reader, without line breaks or a doubled stop', () => {
    expect(quoteAccessibilityLabel(quoteById('vandyke-faltering')!)).toBe(
      'Quote of the day. But often faltering feet Come surest to the goal; And they who walk in darkness meet The sunrise of the soul. Henry van Dyke, Reliance, 1904',
    );
    expect(quoteAccessibilityLabel(quoteById('shelley-spring')!)).toBe(
      'Quote of the day. If Winter comes, can Spring be far behind? Percy Bysshe Shelley, Ode to the West Wind, 1819',
    );
    expect(quoteAccessibilityLabel({ id: 'x-y', text: 'Words without a stop', author: 'A', work: 'W, 1900', theme: 'again' })).toBe('Quote of the day. Words without a stop. A, W, 1900');
    for (const q of QUOTES) expect(quoteAccessibilityLabel(q), q.id).not.toMatch(/[.?!]\./);
  });

  it('has none of the quotes the review took out (archaic, scolding, needing context or off theme)', () => {
    const removed = [
      'carlyle-blue-day', 'montgomery-evening', 'franklin-felicity', 'longfellow-past', 'seneca-begin', 'shelley-fields',
      'tagore-clouds', 'smiles-bright-side', 'longfellow-builders', 'hubbard-credo', 'seneca-burdens', 'baum-courage',
      'longfellow-perseverance', 'james-uncompleted', 'bronte-hope',
      // The page's banned words ("great", "greatest", "bad", "should"), replaced on 25 November 2026.
      'lubbock-best', 'henley-sleep', 'lowell-endurance', 'emerson-speakers', 'emerson-good', 'hubbard-mistake',
    ];
    for (const id of removed) expect(quoteById(id), id).toBeUndefined();
  });
});

describe('quoteDayIndex', () => {
  it('counts from the epoch in a cycle of 31, also before it', () => {
    expect(QUOTE_EPOCH).toBe('2026-01-01');
    expect(quoteDayIndex('2026-01-01')).toBe(0);
    expect(quoteDayIndex('2026-11-17')).toBe(10);
    expect(quoteDayIndex('2025-12-31')).toBe(30);
    expect(quoteDayIndex('2026-02-01')).toBe(0);
    expect(quoteDayIndex('2020-03-01')).toBe(((diffDays(QUOTE_EPOCH, '2020-03-01') % 31) + 31) % 31);
  });

  it('crosses daylight-saving changes and leap days by calendar day', () => {
    expect(quoteDayIndex('2026-03-09')).toBe((quoteDayIndex('2026-03-08') + 1) % 31);
    expect(quoteDayIndex('2026-11-02')).toBe((quoteDayIndex('2026-11-01') + 1) % 31);
    expect(quoteDayIndex('2028-03-01')).toBe((quoteDayIndex('2028-02-29') + 1) % 31);
  });
});

describe('quoteTheme', () => {
  const steady = { foodLogged: true, complete: true, overBand: false };

  it('gives rest after a logged night under 6 hours, whatever the day', () => {
    expect(REST_UNDER_HOURS).toBe(6);
    expect(quoteTheme(steady, 5.99)).toBe('rest');
    expect(quoteTheme({ foodLogged: false, complete: false, overBand: false }, 4)).toBe('rest');
    expect(quoteTheme(steady, 0)).toBe('rest');
  });

  it('does not give rest at exactly 6 hours, with no night, or with a value that is not a number', () => {
    expect(quoteTheme(steady, 6)).toBe('onward');
    expect(quoteTheme(steady, 7)).toBe('onward');
    expect(quoteTheme(steady, null)).toBe('onward');
    expect(quoteTheme(steady, Number.NaN)).toBe('onward');
  });

  it('gives again for no food, a part-logged day or a day over the band, onward for a steady day', () => {
    expect(quoteTheme({ foodLogged: false, complete: false, overBand: false }, null)).toBe('again');
    expect(quoteTheme({ foodLogged: true, complete: false, overBand: false }, null)).toBe('again');
    expect(quoteTheme({ foodLogged: true, complete: true, overBand: true }, 8)).toBe('again');
    expect(quoteTheme(steady, null)).toBe('onward');
  });

  it('decides cases A to G of the specification', () => {
    // A. Strong day, last night 7 h 30 min.
    expect(quoteTheme(steady, 7.5)).toBe('onward');
    // B. Over the band, last night 5 h 40 min.
    expect(quoteTheme({ foodLogged: true, complete: true, overBand: true }, 5 + 40 / 60)).toBe('rest');
    // C. Breakfast only, no night.
    expect(quoteTheme({ foodLogged: true, complete: false, overBand: false }, null)).toBe('again');
    // D. Only water, no night.
    expect(quoteTheme({ foodLogged: false, complete: false, overBand: false }, null)).toBe('again');
    // E. Nothing logged, no night.
    expect(quoteTheme({ foodLogged: false, complete: false, overBand: false }, null)).toBe('again');
    // F. Day 2, within the budget, no night.
    expect(quoteTheme(steady, null)).toBe('onward');
    // G. Over the band, last night 6 h 50 min.
    expect(quoteTheme({ foodLogged: true, complete: true, overBand: true }, 6 + 50 / 60)).toBe('again');
  });
});

describe('quoteFor', () => {
  it('picks from the day and the theme, and a day without a rest quote gives its again quote', () => {
    for (let i = 0; i < 31; i++) {
      const day = addDays(QUOTE_EPOCH, i);
      expect(quoteFor(day, 'again')).toBe(QUOTE_DAYS[i].again);
      expect(quoteFor(day, 'onward')).toBe(QUOTE_DAYS[i].onward);
      expect(quoteFor(day, 'rest')).toBe(QUOTE_DAYS[i].rest ?? QUOTE_DAYS[i].again);
    }
  });

  it('is the same for the same day, wherever and whenever it is asked', () => {
    for (const t of THEMES) {
      expect(quoteFor('2026-11-19', t)).toBe(quoteFor('2026-11-19', t));
      expect(quoteFor('2026-11-19', t)).toBe(quoteFor(addDays('2026-11-19', 31 * 7), t));
    }
  });

  it('changes from one day to the next in every theme', () => {
    for (let d = 0; d < 400; d++) {
      const a = addDays('2026-01-01', d);
      const b = addDays(a, 1);
      for (const t of THEMES) expect(quoteFor(a, t).id, `${a} ${t}`).not.toBe(quoteFor(b, t).id);
    }
  });

  it('never repeats a quote within 30 days, whatever each day turns out to be', () => {
    const start = '2025-06-01';
    const sets = Array.from({ length: 831 }, (_, d) => idsOn(addDays(start, d)));
    for (let d = 0; d <= 800; d++) {
      for (let k = 1; k <= 30; k++) {
        for (const id of sets[d]) expect(sets[d + k].has(id), `${addDays(start, d)} +${k} ${id}`).toBe(false);
      }
    }
  });

  it('gives the specification cases their quotes', () => {
    expect(quoteDayIndex('2026-11-19')).toBe(12); // A
    expect(quoteFor('2026-11-18', 'rest').theme).toBe('rest'); // B: index 11 has a rest quote
    expect(quoteFor('2026-11-17', 'onward')).toBe(QUOTE_DAYS[10].onward); // F
  });
});

describe('quoteOnDay and quoteById', () => {
  it('accepts a pinned id only when it belongs to that day', () => {
    const today = '2026-11-18';
    const d = QUOTE_DAYS[quoteDayIndex(today)];
    expect(quoteOnDay(today, d.again.id)).toBe(d.again);
    expect(quoteOnDay(today, d.onward.id)).toBe(d.onward);
    if (d.rest) expect(quoteOnDay(today, d.rest.id)).toBe(d.rest);
    expect(quoteOnDay(addDays(today, 1), d.again.id)).toBeUndefined();
    expect(quoteOnDay(today, 'no-such-quote')).toBeUndefined();
  });

  it('finds any quote by id, for the test hook', () => {
    expect(quoteById('franklin-well-done')?.author).toBe('Benjamin Franklin');
    expect(quoteById('nope')).toBeUndefined();
    for (const q of QUOTES) expect(quoteById(q.id)).toBe(q);
  });
});
