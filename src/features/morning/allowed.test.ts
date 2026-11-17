import { afterEach, describe, expect, it, vi } from 'vitest';

type Opts = { os?: string; webdriver?: boolean; flag?: boolean; e2e?: string };
const g = globalThis as unknown as { window?: unknown; navigator?: unknown };
const saved = { window: g.window, navigator: g.navigator, e2e: process.env.EXPO_PUBLIC_E2E };
const setGlobal = (name: 'window' | 'navigator', value: unknown) => Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });

/** A fresh copy of the module, as a page or a phone with these settings would load it. */
async function load({ os = 'web', webdriver = false, flag, e2e }: Opts) {
  vi.resetModules();
  const rn = await import('react-native');
  (rn.Platform as { OS: string }).OS = os;
  const win: Record<string, unknown> = {};
  if (flag !== undefined) win.__healthcalMorning = flag;
  setGlobal('window', win);
  setGlobal('navigator', { webdriver });
  if (e2e === undefined) delete process.env.EXPO_PUBLIC_E2E;
  else process.env.EXPO_PUBLIC_E2E = e2e;
  return (await import('./allowed')).morningAllowed();
}

describe('morningAllowed', () => {
  afterEach(() => {
    setGlobal('window', saved.window);
    setGlobal('navigator', saved.navigator);
    if (saved.e2e === undefined) delete process.env.EXPO_PUBLIC_E2E;
    else process.env.EXPO_PUBLIC_E2E = saved.e2e;
    vi.resetModules();
  });

  it('a normal browser is allowed', async () => {
    expect(await load({ webdriver: false })).toBe(true);
  });

  it('an automated browser without the flag is not', async () => {
    expect(await load({ webdriver: true })).toBe(false);
    expect(await load({ webdriver: true, flag: false })).toBe(false);
  });

  it('an automated browser with the flag is', async () => {
    expect(await load({ webdriver: true, flag: true })).toBe(true);
  });

  it('a test build (EXPO_PUBLIC_E2E) without the flag is not, with it is', async () => {
    expect(await load({ os: 'android', e2e: '1' })).toBe(false);
    expect(await load({ os: 'android', e2e: '1', flag: true })).toBe(true);
  });

  it('a phone is allowed, and webdriver means nothing off the web', async () => {
    expect(await load({ os: 'ios' })).toBe(true);
    expect(await load({ os: 'android', webdriver: true })).toBe(true);
  });
});
