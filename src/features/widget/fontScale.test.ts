/**
 * Android's own sp-to-dp curve (AOSP FontScaleConverterFactory), which the widget uses to size its
 * text at the phone's font size.
 */
import { describe, expect, it } from 'vitest';

import { cleanScale, scaleSteps, spToDp } from './fontScale';

describe('spToDp', () => {
  it('reads the AOSP tables at their own sizes', () => {
    expect(spToDp(12, 1.15)).toBeCloseTo(13.8);
    expect(spToDp(14, 1.15)).toBeCloseTo(16.4);
    expect(spToDp(12, 1.3)).toBeCloseTo(15.6);
    expect(spToDp(14, 1.3)).toBeCloseTo(18.8);
    expect(spToDp(12, 2)).toBeCloseTo(24);
    expect(spToDp(30, 1.5)).toBeCloseTo(30);
  });

  it('interpolates between the sizes of a table, from 0 below 8 sp', () => {
    // 16 sp at 1.15: half way from 14 (16.4) to 18 (19.8).
    expect(spToDp(16, 1.15)).toBeCloseTo(18.1);
    expect(spToDp(11, 1.3)).toBeCloseTo(14.3);
    expect(spToDp(4, 2)).toBeCloseTo(8);
  });

  it('grows large text less than small text, as Android 14 does', () => {
    expect(spToDp(12, 2) / 12).toBeCloseTo(2);
    expect(spToDp(30, 2) / 30).toBeLessThan(1.3);
  });

  it('is linear at the default size, below the curves and above the last table', () => {
    expect(spToDp(12, 1)).toBe(12);
    expect(spToDp(12, 0.85)).toBeCloseTo(10.2);
    expect(spToDp(12, 1.03)).toBeCloseTo(12.36);
    expect(spToDp(12, 2.5)).toBeCloseTo(30);
  });

  it('mixes the two nearest tables for a scale between them', () => {
    // 1.25 is half way between 1.2 (14.4) and 1.3 (15.6) at 12 sp.
    expect(spToDp(12, 1.25)).toBeCloseTo(15);
  });

  it("takes Android's float font scale as the step it is", () => {
    expect(cleanScale(1.149999976158142)).toBe(1.15);
    expect(cleanScale(undefined)).toBe(1);
    expect(cleanScale(Number.NaN)).toBe(1);
    expect(spToDp(12, 1.149999976158142)).toBeCloseTo(13.8);
  });
});

describe('scaleSteps', () => {
  it("tries the phone's scale, then each smaller step of Android's ladder down to the designed size", () => {
    expect(scaleSteps(1.3)).toEqual([1.3, 1.2, 1.15, 1.1, 1.05, 1]);
    expect(scaleSteps(2)).toEqual([2, 1.8, 1.5, 1.3, 1.2, 1.15, 1.1, 1.05, 1]);
    expect(scaleSteps(1)).toEqual([1]);
  });

  it('never goes below the phone’s own size when it is smaller than the designed one', () => {
    expect(scaleSteps(0.85)).toEqual([0.85]);
  });
});
