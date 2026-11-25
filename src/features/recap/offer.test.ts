import { describe, expect, it } from 'vitest';

import { addDays } from '@/lib/dates';

import { parseDealt, periodOffer, withDealt } from './offer';

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
