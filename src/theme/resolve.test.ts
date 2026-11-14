import { describe, expect, it } from 'vitest';

import { resolveThemeName } from './resolve';

describe('resolveThemeName', () => {
  it('uses an explicit choice whatever the phone says', () => {
    for (const system of ['light', 'dark', null, undefined]) {
      expect(resolveThemeName('light', system)).toBe('light');
      expect(resolveThemeName('dark', system)).toBe('dark');
      expect(resolveThemeName('blossom', system, true)).toBe('blossom');
    }
  });

  it('follows the phone, and falls back to light when the phone does not say', () => {
    expect(resolveThemeName('system', 'dark')).toBe('dark');
    expect(resolveThemeName('system', 'light')).toBe('light');
    expect(resolveThemeName('system', null)).toBe('light');
    expect(resolveThemeName('system', undefined)).toBe('light');
    expect(resolveThemeName('system', 'unspecified')).toBe('light');
  });

  it('shows the lead look to someone who has not chosen yet, unless their phone is dark', () => {
    expect(resolveThemeName('system', 'light', true)).toBe('blossom');
    expect(resolveThemeName('system', null, true)).toBe('blossom');
    expect(resolveThemeName('system', 'dark', true)).toBe('dark');
  });
});
