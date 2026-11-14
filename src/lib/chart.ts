/** Pure helpers for charts (no React), so they can be unit-tested. */

/**
 * About `count` round values inside [min, max]: multiples of 1, 2 or 5 times a
 * power of ten, whichever gives a number of grid lines closest to `count`.
 */
export function niceTicks(min: number, max: number, count: number): number[] {
  const span = max - min;
  if (!(span > 0) || count < 1) return [min];
  const pow = 10 ** Math.floor(Math.log10(span / count));
  const at = (step: number) => {
    const out: number[] = [];
    for (let k = Math.ceil(min / step - 1e-9); k * step <= max + 1e-9; k += 1) out.push(Math.round(k * step * 1e6) / 1e6 + 0); // + 0 turns -0 into 0
    return out;
  };
  let best: number[] = [];
  for (const m of [1, 2, 5, 10]) {
    const ticks = at(m * pow);
    const better = Math.abs(ticks.length - count) < Math.abs(best.length - count) || (Math.abs(ticks.length - count) === Math.abs(best.length - count) && ticks.length > best.length);
    if (best.length === 0 || better) best = ticks;
  }
  return best.length ? best : [min];
}
