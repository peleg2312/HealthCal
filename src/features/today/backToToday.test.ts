import { describe, expect, it } from 'vitest';

import { AWAY_MS, backToTodayOnReturn } from './backToToday';

describe('backToTodayOnReturn', () => {
  const at = Date.UTC(2026, 10, 16, 12, 0);
  const left = { at, day: '2026-11-16' };
  it('keeps the day when the app never left the front', () => {
    expect(backToTodayOnReturn(null, at + 10 * AWAY_MS, '2026-11-16')).toBe(false);
  });
  it('keeps the day after a short look elsewhere', () => {
    expect(backToTodayOnReturn(left, at + AWAY_MS - 1, '2026-11-16')).toBe(false);
    expect(backToTodayOnReturn(left, at + 30_000, '2026-11-16')).toBe(false);
  });
  it('shows today after five minutes or more away', () => {
    expect(backToTodayOnReturn(left, at + AWAY_MS, '2026-11-16')).toBe(true);
    expect(backToTodayOnReturn(left, at + 3 * 86_400_000, '2026-11-19')).toBe(true);
  });
  it('shows today when the calendar day changed, however short the time away', () => {
    expect(backToTodayOnReturn({ at, day: '2026-11-15' }, at + 60_000, '2026-11-16')).toBe(true);
  });
  it('treats a clock set back as no time away', () => {
    expect(backToTodayOnReturn(left, at - 2 * AWAY_MS, '2026-11-16')).toBe(false);
  });
});
