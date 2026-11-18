import { describe, expect, it } from 'vitest';

import { heartFigures } from './heart';

describe('a workout\'s heart rate', () => {
  it('keeps a plausible average and a highest at or above it, in whole beats per minute', () => {
    expect(heartFigures(142.4, 171.6)).toEqual({ avg: 142, max: 172 });
    expect(heartFigures(142, null)).toEqual({ avg: 142, max: null });
    expect(heartFigures(30, 240)).toEqual({ avg: 30, max: 240 });
  });

  it('drops a highest below the average or above 240', () => {
    expect(heartFigures(142, 130)).toEqual({ avg: 142, max: null });
    expect(heartFigures(142, 241)).toEqual({ avg: 142, max: null });
  });

  it('is null with nothing measured, or an average that cannot be a person\'s', () => {
    expect(heartFigures(0, 0, 0)).toBeNull();
    expect(heartFigures(140, 170, 0)).toBeNull();
    expect(heartFigures(29, 120)).toBeNull();
    expect(heartFigures(231, 235)).toBeNull();
    expect(heartFigures(undefined, 170)).toBeNull();
    expect(heartFigures(Number.NaN, 170)).toBeNull();
    expect(heartFigures(140, 170, 12)).toEqual({ avg: 140, max: 170 });
  });
});
