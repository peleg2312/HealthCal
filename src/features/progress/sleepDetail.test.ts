import { describe, expect, it } from 'vitest';

import { sleepDetail } from './sleepDetail';

describe('sleepDetail', () => {
  it('gives the quality over all nights when every night is rated', () => {
    expect(sleepDetail({ avgHours: 7, nights: 5, avgQuality: 3.4, rated: 5 })).toBe('5 nights logged · quality 3.4 of 5 · aim for 7 to 9 h');
  });
  it('says how many nights the quality is over when some are unrated', () => {
    expect(sleepDetail({ avgHours: 7, nights: 7, avgQuality: 4, rated: 2 })).toBe('7 nights logged · quality 4.0 of 5 over 2 rated · aim for 7 to 9 h');
  });
  it('leaves quality out when no night is rated', () => {
    expect(sleepDetail({ avgHours: 7, nights: 3, avgQuality: null, rated: 0 })).toBe('3 nights logged · aim for 7 to 9 h');
  });
});
