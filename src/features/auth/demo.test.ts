/**
 * The demo views of a test build (`?authDemo=`, `&syncDemo=`, `&demoEmail=`): what the address asks
 * for, and the gate that keeps every one of them out of a release bundle.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AUTH_DEMOS, authDemoFrom, DEMO_EMAIL, DEMO_EMAIL_LONG, demoEmailFrom, syncDemoFrom } from './demo';
import { SYNC_DEMOS } from './syncRow';

describe('what the address asks for', () => {
  it('reads a known view and nothing else', () => {
    for (const d of AUTH_DEMOS) expect(authDemoFrom(`?authDemo=${d}`)).toBe(d);
    expect(authDemoFrom('?mode=signin&authDemo=declined')).toBe('declined');
    expect(authDemoFrom('?authDemo=nonsense')).toBeNull();
    expect(authDemoFrom('?mode=signin')).toBeNull();
    expect(authDemoFrom('')).toBeNull();
  });

  it('reads a known state of the sync row and nothing else', () => {
    for (const d of SYNC_DEMOS) expect(syncDemoFrom(`?authDemo=signed-in&syncDemo=${d}`)).not.toBeNull();
    expect(syncDemoFrom('?syncDemo=paused')?.status).toBe('error');
    expect(syncDemoFrom('?syncDemo=nonsense')).toBeNull();
    expect(syncDemoFrom('?authDemo=signed-in')).toBeNull();
  });

  it('shows an everyday address, and the long one only when asked', () => {
    expect(demoEmailFrom('?authDemo=signed-in')).toBe(DEMO_EMAIL);
    expect(demoEmailFrom('?authDemo=signed-in&demoEmail=long')).toBe(DEMO_EMAIL_LONG);
    // About 20 letters: one line of Account's card (26 fit at 360 px).
    expect(DEMO_EMAIL.length).toBeGreaterThanOrEqual(18);
    expect(DEMO_EMAIL.length).toBeLessThanOrEqual(24);
    expect(DEMO_EMAIL_LONG.length).toBe(55);
  });
});

describe('the gate: a demo view is drawn only by a test-hook web build', () => {
  const g = globalThis as unknown as { window?: unknown };
  const saved = { window: g.window, e2e: process.env.EXPO_PUBLIC_E2E };
  const ASKS = '?authDemo=signed-in&syncDemo=paused&demoEmail=long';

  /** A fresh copy of the module, as a page with this address would load it on this platform and build. */
  async function load({ os = 'web', e2e, search = ASKS }: { os?: string; e2e?: string; search?: string }) {
    vi.resetModules();
    const rn = await import('react-native');
    (rn.Platform as { OS: string }).OS = os;
    Object.defineProperty(globalThis, 'window', { value: { location: { search } }, configurable: true, writable: true });
    if (e2e === undefined) delete process.env.EXPO_PUBLIC_E2E;
    else process.env.EXPO_PUBLIC_E2E = e2e;
    const demo = await import('./demo');
    return { view: demo.authDemo(), sync: demo.syncDemo(), email: demo.demoEmail() };
  }

  afterEach(async () => {
    Object.defineProperty(globalThis, 'window', { value: saved.window, configurable: true, writable: true });
    if (saved.e2e === undefined) delete process.env.EXPO_PUBLIC_E2E;
    else process.env.EXPO_PUBLIC_E2E = saved.e2e;
    ((await import('react-native')).Platform as { OS: string }).OS = 'ios';
    vi.resetModules();
  });

  it('answers null without EXPO_PUBLIC_E2E, whatever the address asks for (a release bundle)', async () => {
    // Unit tests run with no `__DEV__`, as a release bundle does.
    expect(typeof __DEV__ !== 'undefined' && __DEV__).toBe(false);
    for (const e2e of [undefined, '', '0', 'true']) {
      expect(await load({ e2e })).toEqual({ view: null, sync: null, email: DEMO_EMAIL });
    }
  });

  it('reads the same address with EXPO_PUBLIC_E2E=1, so the null above is the gate and not the address', async () => {
    const on = await load({ e2e: '1' });
    expect(on.view).toBe('signed-in');
    expect(on.sync?.status).toBe('error');
    expect(on.email).toBe(DEMO_EMAIL_LONG);
  });

  it('answers null on a phone even in a test build: the address is a web page', async () => {
    expect(await load({ e2e: '1', os: 'android' })).toEqual({ view: null, sync: null, email: DEMO_EMAIL });
    expect(await load({ e2e: '1', os: 'ios' })).toEqual({ view: null, sync: null, email: DEMO_EMAIL });
  });
});
