import { describe, expect, it } from 'vitest';

import { niceTicks } from './chart';

describe('niceTicks', () => {
  it('uses round steps inside the range, about as many as asked for', () => {
    expect(niceTicks(73.2, 81.4, 3)).toEqual([74, 76, 78, 80]);
    expect(niceTicks(161, 178, 3)).toEqual([165, 170, 175]);
    expect(niceTicks(0.92, 1.38, 3)).toEqual([1, 1.1, 1.2, 1.3]);
    expect(niceTicks(0, 3000, 3)).toEqual([0, 1000, 2000, 3000]);
  });
  it('copes with an empty range', () => {
    expect(niceTicks(5, 5, 3)).toEqual([5]);
  });
});
