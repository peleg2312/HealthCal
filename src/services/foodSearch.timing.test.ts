/**
 * The JIT half of the search's time budget (specification 4.9), at twice the budget so a slow machine
 * does not make it flaky: median per query <= 6 ms (budget 3), first call <= 60 ms (budget 30).
 * The interpreter-only half, the closest stand-in for Hermes, is `node scripts/dev/search-timing.mjs`.
 */
import { describe, expect, it } from 'vitest';

import { searchLocal } from './foodSearch';

const QUERIES = [
  'חומוס', 'קוטג 5', 'שניצל', 'והחומוס', 'פלאפאל', 'שקשוקע', 'חמוס', 'xyzzy', 'קקקקקק', 'avacado',
  'chicken breast', 'chiken', 'brocolli', 'עגבניות', 'ב', 'tahina', 'chicken', '2 ביצים', 'טוסט גבינה צהובה', 'חומוס בטחינה',
  // The parts pass and a six-word Hebrew query.
  'שניצל בפיתה', 'סביח בפיתה', 'פלאפל חומוס טחינה סלט חריף מלפפון',
];

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

describe('search time with the JIT', () => {
  it('first call (index build) within twice the budget', () => {
    const t0 = performance.now();
    searchLocal(QUERIES[0]);
    expect(performance.now() - t0).toBeLessThan(60);
  });

  it.each(QUERIES)('%s: median within twice the budget', (q) => {
    const ts: number[] = [];
    for (let i = 0; i < 30; i++) {
      const t0 = performance.now();
      searchLocal(q);
      ts.push(performance.now() - t0);
    }
    expect(median(ts.slice(5))).toBeLessThan(6);
  });
});
