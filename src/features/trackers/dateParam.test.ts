import { describe, expect, it } from 'vitest';

import { dayTitle, resolveDateParam } from './dateParam';

const today = '2026-11-13';

describe('resolveDateParam', () => {
  it('keeps a valid past day and today', () => {
    expect(resolveDateParam('2026-11-11', today)).toBe('2026-11-11');
    expect(resolveDateParam('2025-12-31', today)).toBe('2025-12-31');
    expect(resolveDateParam(today, today)).toBe(today);
  });
  it('falls back to today for a missing, malformed, impossible or future date', () => {
    expect(resolveDateParam(undefined, today)).toBe(today);
    expect(resolveDateParam('', today)).toBe(today);
    expect(resolveDateParam('yesterday', today)).toBe(today);
    expect(resolveDateParam('2026-11-1', today)).toBe(today);
    expect(resolveDateParam('2026-02-30', today)).toBe(today);
    expect(resolveDateParam('2026-13-01', today)).toBe(today);
    expect(resolveDateParam('2026-11-14', today)).toBe(today);
  });
  it('takes the first value of a repeated param', () => {
    expect(resolveDateParam(['2026-11-10', '2026-11-12'], today)).toBe('2026-11-10');
  });
});

describe('dayTitle', () => {
  it('reads as a short weekday and date', () => {
    expect(dayTitle('2026-11-11')).toBe('Wed, Nov 11');
  });
});
