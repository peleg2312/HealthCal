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
