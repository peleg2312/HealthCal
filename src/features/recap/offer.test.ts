import { describe, expect, it } from 'vitest';

import { addDays } from '@/lib/dates';

import { parseDealt, periodLinkWords, periodOffer, withDealt } from './offer';

const run = (from: string, n: number) => new Set(Array.from({ length: n }, (_, i) => addDays(from, i)));

describe('periodOffer', () => {
  const october = run('2026-10-01', 31);

  it('offers the month just ended in the first seven days of the next one', () => {
    expect(periodOffer('2026-11-01', october, '2026-09-01', [])?.key).toBe('2026-10');
    expect(periodOffer('2026-11-07', october, '2026-09-01', [])?.key).toBe('2026-10');
    expect(periodOffer('2026-11-08', october, '2026-09-01', [])).toBeNull();
    expect(periodOffer('2026-10-25', october, '2026-09-01', [])).toBeNull();
  });

  it('needs five days with food logged in that month', () => {
    expect(periodOffer('2026-11-02', run('2026-10-01', 4), '2026-09-01', [])).toBeNull();
    expect(periodOffer('2026-11-02', run('2026-10-27', 5), '2026-09-01', [])?.key).toBe('2026-10');
  });

  it('never offers a period dealt with on this device, nor before the device’s answer is read', () => {
    expect(periodOffer('2026-11-02', october, '2026-09-01', ['2026-10'])).toBeNull();
    expect(periodOffer('2026-11-02', october, '2026-09-01', null)).toBeNull();
  });

  it('never offers a month before the first record, nor with nothing on the phone', () => {
    expect(periodOffer('2026-11-02', october, '2026-11-01', [])).toBeNull();
    expect(periodOffer('2026-11-02', october, null, [])).toBeNull();
  });

  it('offers the year from December 26 to January 7, before December, and once', () => {
    const year = run('2026-06-01', 200);
    expect(periodOffer('2026-12-25', year, '2026-06-01', [])).toBeNull();
    expect(periodOffer('2026-12-26', year, '2026-06-01', [])?.key).toBe('2026');
    expect(periodOffer('2027-01-03', year, '2026-06-01', [])?.key).toBe('2026');
    // The year dealt with: December follows in its own week.
    expect(periodOffer('2027-01-03', year, '2026-06-01', ['2026'])?.key).toBe('2026-12');
    expect(periodOffer('2027-01-08', year, '2026-06-01', ['2026'])).toBeNull();
  });

  it('needs fourteen days with food logged in the year', () => {
    expect(periodOffer('2026-12-28', run('2026-12-10', 13), '2026-06-01', [])).toBeNull();
    expect(periodOffer('2026-12-28', run('2026-12-10', 14), '2026-06-01', [])?.key).toBe('2026');
  });
});

describe('the device’s list', () => {
  it('reads back only period keys and keeps the last eight', () => {
    expect(parseDealt(null)).toEqual([]);
    expect(parseDealt('not json')).toEqual([]);
    expect(parseDealt('{"a":1}')).toEqual([]);
    expect(parseDealt('["2026-10", 5, "x", "2026"]')).toEqual(['2026-10', '2026']);
    let list: string[] = [];
    for (let m = 1; m <= 10; m++) list = withDealt(list, `2026-${String(m).padStart(2, '0')}`);
    expect(list).toHaveLength(8);
    expect(list[0]).toBe('2026-03');
    expect(withDealt(['2026-10', '2026'], '2026-10')).toEqual(['2026', '2026-10']);
  });
});

describe('Today’s link (periodLinkWords)', () => {
  const october = run('2026-10-01', 26);
  it('says the month is ready, with the month alone as its short form, and where it leads', () => {
    const p = periodOffer('2026-11-02', october, '2026-09-01', [])!;
    const w = periodLinkWords(p, '2026-11-02', october, '2026-09-01');
    expect(w.label).toBe('Your October is ready');
    expect(w.short).toBe('Your October');
    expect(w.hint).toBe('October: 26 of 31 days logged. Opens the month in cups');
    expect(w.route).toBe('/recap/month?month=2026-10');
    expect(w.hide).toBe('Hide your October in cups');
    expect(w.hidden).toBe('Month in cups hidden. It stays on Progress.');
  });

  it('says the year around New Year, and another year’s month by its name alone when short', () => {
    const year = run('2026-06-01', 200);
    const y = periodLinkWords(periodOffer('2027-01-03', year, '2026-06-01', [])!, '2027-01-03', year, '2026-06-01');
    expect([y.label, y.short, y.route]).toEqual(['Your 2026 is ready', 'Your 2026', '/recap/year?year=2026']);
    const m = periodLinkWords(periodOffer('2027-01-03', year, '2026-06-01', ['2026'])!, '2027-01-03', year, '2026-06-01');
    expect([m.label, m.short]).toEqual(['Your December 2026 is ready', 'Your December']);
  });

  it('uses no exclamation mark and no word of pressure', () => {
    const p = periodOffer('2026-11-02', october, '2026-09-01', [])!;
    for (const s of Object.values(periodLinkWords(p, '2026-11-02', october, '2026-09-01'))) {
      expect(s).not.toContain('!');
      expect(s).not.toMatch(/\b(upgrade|unlock|premium|last chance|missed|should)\b/i);
    }
  });
});
