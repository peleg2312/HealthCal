/**
 * How big the phone draws text at its font size: Android's own sp-to-dp curve, so the widget can
 * size its text itself (every TextWidget is given dp, `allowFontScaling={false}`) and then lay it
 * out from the size that is really drawn. Pure, tested (fontScale.test.ts).
 *
 * Since Android 14, text grows less the larger it already is (nonlinear font scaling): at the
 * phone's 130% a 12 sp caption is drawn at 15.6 dp but a 30 sp figure stays 30 dp. The tables
 * below are AOSP's, copied from frameworks/base, core/java/android/content/res/
 * FontScaleConverterFactory.java (main, read on 2026-11-25), with its rules: below 1.04 and above
 * the last table the scale is linear; between two tables both are read at the common sizes and
 * mixed in proportion; between two sizes of a table the dp is interpolated, from 0 below 8 sp, and
 * past 100 sp by the last pair's ratio. Pixel's "Font size" steps are 0.85, 1, 1.15, 1.3, 1.5, 1.8
 * and 2; 1.05, 1.1 and 1.2 are tables some phones offer.
 */

const SP = [8, 10, 12, 14, 18, 20, 24, 30, 100] as const;

/** Font scale, then the dp each size of `SP` is drawn at. */
const TABLES: readonly (readonly [number, readonly number[]])[] = [
  [1.05, [8.4, 10.5, 12.6, 14.8, 18.6, 20.6, 24.4, 30, 100]],
  [1.1, [8.8, 11, 13.2, 15.6, 19.2, 21.2, 24.8, 30, 100]],
  [1.15, [9.2, 11.5, 13.8, 16.4, 19.8, 21.8, 25.2, 30, 100]],
  [1.2, [9.6, 12, 14.4, 17.2, 20.4, 22.4, 25.6, 30, 100]],
  [1.3, [10.4, 13, 15.6, 18.8, 21.6, 23.6, 26.4, 30, 100]],
  [1.5, [12, 15, 18, 22, 24, 26, 28, 30, 100]],
  [1.8, [14.4, 18, 21.6, 24.4, 27.6, 30.8, 32.8, 34.8, 100]],
  [2, [16, 20, 24, 26, 30, 34, 36, 38, 100]],
];

/** Below this the phone scales text linearly (AOSP: the first table's scale less 0.01). */
const CURVES_FROM = 1.04;

/** The phone's font scale as a usable number: Android's `Configuration.fontScale`, 1 when unknown. */
export function cleanScale(fontScale: number | undefined): number {
  return typeof fontScale === 'number' && Number.isFinite(fontScale) && fontScale > 0 ? Math.round(fontScale * 100) / 100 : 1;
}

function interpolate(value: number, from: readonly number[], to: readonly number[]): number {
  const last = from.length - 1;
  if (value >= from[last]) return value * (to[last] / from[last]);
  let i = 0;
  while (i < last && from[i + 1] <= value) i += 1;
  if (value < from[0]) return (value / from[0]) * to[0];
  if (value === from[i]) return to[i];
  const t = (value - from[i]) / (from[i + 1] - from[i]);
  return to[i] + t * (to[i + 1] - to[i]);
}

/** The dp the phone draws `sp` at, at font scale `fontScale`. */
export function spToDp(sp: number, fontScale: number): number {
  const s = cleanScale(fontScale);
  if (s < CURVES_FROM) return sp * s;
  const exact = TABLES.find(([scale]) => Math.abs(scale - s) < 1e-6);
  if (exact) return interpolate(sp, SP, exact[1]);
  const upper = TABLES.findIndex(([scale]) => scale > s);
  // Below the first table or above the last: linear, as AOSP does.
  if (upper <= 0) return sp * s;
  const [lo, loDp] = TABLES[upper - 1];
  const [hi, hiDp] = TABLES[upper];
  const t = (s - lo) / (hi - lo);
  const mixed = SP.map((_, i) => loDp[i] + t * (hiDp[i] - loDp[i]));
  return interpolate(sp, SP, mixed);
}

/** Android's font size steps, largest first: where a size cannot hold the widget's text, it is drawn one step smaller. */
const LADDER = [2, 1.8, 1.5, 1.3, 1.2, 1.15, 1.1, 1.05, 1] as const;

/**
 * The scales the widget tries, in order: the phone's own, then each smaller step of Android's ladder
 * down to the designed size (or the phone's own when it is smaller than that), never below it.
 */
export function scaleSteps(fontScale: number): number[] {
  const s = cleanScale(fontScale);
  return [s, ...LADDER.filter((step) => step < s - 1e-6 && step >= Math.min(1, s) - 1e-6)];
}
