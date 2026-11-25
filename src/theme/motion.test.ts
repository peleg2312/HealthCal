import { afterEach, describe, expect, it, vi } from 'vitest';

type Opts = { webdriver: boolean; reduce: boolean; optIn?: boolean };
const g = globalThis as unknown as { window?: unknown; navigator?: unknown };
const saved = { window: g.window, navigator: g.navigator };
const setGlobal = (name: 'window' | 'navigator', value: unknown) => Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });

/** A fresh copy of the module, as a web page with these settings would load it. */
async function loadOnWeb({ webdriver, reduce, optIn }: Opts) {
  vi.resetModules();
  const rn = await import('react-native');
  (rn.Platform as { OS: string }).OS = 'web';
  const win: Record<string, unknown> = { matchMedia: () => ({ matches: reduce, addEventListener: () => {} }) };
  if (optIn !== undefined) win.__healthcalMotion = optIn;
  setGlobal('window', win);
  setGlobal('navigator', { webdriver });
  return import('./motion');
}

describe('isReducedMotion on web', () => {
  afterEach(() => {
    setGlobal('window', saved.window);
    setGlobal('navigator', saved.navigator);
    vi.resetModules();
  });

  it('follows prefers-reduced-motion for a person', async () => {
    expect((await loadOnWeb({ webdriver: false, reduce: false })).isReducedMotion()).toBe(false);
    expect((await loadOnWeb({ webdriver: false, reduce: true })).isReducedMotion()).toBe(true);
  });

  it('is on in an automated browser unless the page opts in', async () => {
    expect((await loadOnWeb({ webdriver: true, reduce: false })).isReducedMotion()).toBe(true);
    expect((await loadOnWeb({ webdriver: true, reduce: false, optIn: true })).isReducedMotion()).toBe(false);
  });

  it('opting in does not override the system setting', async () => {
    expect((await loadOnWeb({ webdriver: true, reduce: true, optIn: true })).isReducedMotion()).toBe(true);
  });

  it('window.__healthcalMotion = false forces reduced motion', async () => {
    expect((await loadOnWeb({ webdriver: false, reduce: false, optIn: false })).isReducedMotion()).toBe(true);
  });
});

describe('pourLandsAt', () => {
  it('lands a whole-cup pour at about two thirds of its length', async () => {
    const { pourLandsAt } = await import('./motion');
    expect(pourLandsAt(1)).toBeGreaterThan(0.6);
    expect(pourLandsAt(1)).toBeLessThan(0.7);
  });

  it('lands a small top-up sooner, once three quarters of it has poured', async () => {
    const { pourLandsAt } = await import('./motion');
    // The glass that reaches the water goal: 5% of the cup.
    expect(pourLandsAt(0.05)).toBeGreaterThan(0.3);
    expect(pourLandsAt(0.05)).toBeLessThan(0.45);
    expect(pourLandsAt(0.05)).toBeLessThan(pourLandsAt(0.3));
    expect(pourLandsAt(0.3)).toBeLessThan(pourLandsAt(1));
  });

  it('is the same for a pour down, and safe for nothing or nonsense', async () => {
    const { pourLandsAt } = await import('./motion');
    expect(pourLandsAt(-0.5)).toBe(pourLandsAt(0.5));
    for (const c of [0, Number.NaN, 5]) {
      expect(pourLandsAt(c)).toBeGreaterThan(0);
      expect(pourLandsAt(c)).toBeLessThan(1);
    }
  });
});

describe('routine motion stays within 600 ms', () => {
  it("a big cup's pour and its rim's settle together, a chart's line and every routine step", async () => {
    const { motion } = await import('./motion');
    const d = motion.duration;
    expect(d.pour + d.settle).toBeLessThanOrEqual(600);
    expect(d.pourSmall + d.settle).toBeLessThanOrEqual(600);
    for (const k of ['pour', 'pourSmall', 'settle', 'enter', 'row', 'rowExit', 'sheetIn', 'sheetOut', 'fade', 'draw', 'slide'] as const) {
      expect(d[k], k).toBeLessThanOrEqual(600);
    }
  });
  it("a reached goal's one flash, from its rise to its end", async () => {
    const { motion } = await import('./motion');
    const f = motion.reachFlash;
    expect(f.rise + f.hold + f.fall).toBeLessThanOrEqual(600);
  });
});
