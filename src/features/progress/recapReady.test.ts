import { describe, expect, it } from 'vitest';

import { recapStatus } from './recapReady';

// 2026-11-09 is a Monday; the week before it runs 2026-11-02 (Mon) to 2026-11-08 (Sun).
const lastWeek = (days: number[]) => new Set(days.map((d) => `2026-11-0${d}`));

describe('recapStatus', () => {
  it('reports the last completed Monday-based week', () => {
    expect(recapStatus('2026-11-09', new Set(), undefined).week).toBe('2026-11-02');
    expect(recapStatus('2026-11-15', new Set(), undefined).week).toBe('2026-11-02');
    expect(recapStatus('2026-11-16', new Set(), undefined).week).toBe('2026-11-09');
  });

  it('is ready only when that week has at least three logged days', () => {
    expect(recapStatus('2026-11-09', lastWeek([2, 3]), undefined).ready).toBe(false);
    expect(recapStatus('2026-11-09', lastWeek([2, 3, 8]), undefined).ready).toBe(true);
  });

  it('stops being ready once that week has been opened, and becomes ready again for the next week', () => {
    expect(recapStatus('2026-11-09', lastWeek([2, 3, 4]), '2026-11-02').ready).toBe(false);
    const next = new Set(['2026-11-09', '2026-11-10', '2026-11-11']);
    expect(recapStatus('2026-11-16', next, '2026-11-02').ready).toBe(true);
  });

  it('is announced on Today from Monday to Wednesday only', () => {
    const logged = lastWeek([2, 3, 4]);
    expect(recapStatus('2026-11-09', logged, undefined).announce).toBe(true);
    expect(recapStatus('2026-11-11', logged, undefined).announce).toBe(true);
    expect(recapStatus('2026-11-12', logged, undefined).announce).toBe(false);
    expect(recapStatus('2026-11-12', logged, undefined).ready).toBe(true);
  });
});
