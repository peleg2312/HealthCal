import { describe, expect, it } from 'vitest';

import type { Settings, ThemePreference } from '@/types';

import {
  activeLook,
  isThemeLook,
  lookFallback,
  resolveThemeName,
  THEME_CHOICES,
  THEME_LABELS,
  THEME_LOOKS,
  THEME_NAMES,
  THEME_PREFERENCES,
  themeChoiceOf,
  themeChoicePatch,
  themeNameFor,
  themeNameOfChoice,
  type ThemeChoice,
} from './resolve';

const SYSTEMS = ['light', 'dark', null, undefined, 'unspecified'] as const;

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

  it('keeps the lead look before setup when no look is stored, or an unknown one', () => {
    for (const look of [undefined, null, 'sepia', 42]) {
      expect(resolveThemeName('system', 'light', true, look)).toBe('blossom');
      expect(resolveThemeName('system', null, true, look)).toBe('blossom');
      expect(resolveThemeName('system', 'dark', true, look)).toBe('dark');
    }
  });

  it('draws each newer look while theme holds its fallback, on any phone, before and after setup', () => {
    for (const system of SYSTEMS) {
      for (const lead of [false, true]) {
        expect(resolveThemeName('light', system, lead, 'butter')).toBe('butter');
        expect(resolveThemeName('light', system, lead, 'honey')).toBe('honey');
        expect(resolveThemeName('dark', system, lead, 'java')).toBe('java');
      }
    }
  });

  it('ignores a look whose theme is not its fallback: the preference wins', () => {
    expect(resolveThemeName('dark', 'light', false, 'butter')).toBe('dark');
    expect(resolveThemeName('blossom', 'light', false, 'honey')).toBe('blossom');
    expect(resolveThemeName('light', 'dark', false, 'java')).toBe('light');
    expect(resolveThemeName('blossom', 'dark', false, 'java')).toBe('blossom');
    // "Match my phone" is never a look's fallback: it still follows the phone.
    for (const look of THEME_LOOKS) {
      expect(resolveThemeName('system', 'dark', false, look)).toBe('dark');
      expect(resolveThemeName('system', 'light', false, look)).toBe('light');
      expect(resolveThemeName('system', null, true, look)).toBe('blossom');
    }
  });

  it('ignores a look it does not know, so a later version can add looks the same way', () => {
    for (const look of ['sepia', 'Butter', '', null, 7, { look: 'java' }, ['java'], 'toString', '__proto__']) {
      expect(resolveThemeName('light', 'dark', false, look)).toBe('light');
      expect(resolveThemeName('dark', 'light', false, look)).toBe('dark');
      expect(isThemeLook(look)).toBe(false);
    }
  });

  it('reads a preference it does not know as "Match my phone", so it always names a palette', () => {
    const odd = 'sepia' as unknown as ThemePreference;
    expect(resolveThemeName(odd, 'dark')).toBe('dark');
    expect(resolveThemeName(odd, 'light')).toBe('light');
    expect(resolveThemeName(odd, null, true)).toBe('blossom');
  });

  it('names a palette for every stored combination', () => {
    const looks = [undefined, ...THEME_LOOKS, 'sepia'];
    for (const theme of THEME_PREFERENCES)
      for (const look of looks)
        for (const system of SYSTEMS)
          for (const lead of [false, true]) expect(THEME_NAMES).toContain(resolveThemeName(theme, system, lead, look));
  });
});

describe('the choices and what a pick writes', () => {
  it('lists seven choices, each with a label, and six palettes', () => {
    expect(THEME_CHOICES).toEqual(['system', 'light', 'dark', 'blossom', 'butter', 'honey', 'java']);
    expect(Object.keys(THEME_LABELS).sort()).toEqual([...THEME_CHOICES].sort());
    expect([...THEME_NAMES].sort()).toEqual(['blossom', 'butter', 'dark', 'honey', 'java', 'light']);
  });

  it("gives each look its fallback: light for the butter papers, dark for java", () => {
    expect(lookFallback('butter')).toBe('light');
    expect(lookFallback('honey')).toBe('light');
    expect(lookFallback('java')).toBe('dark');
  });

  it('writes a newer look with its fallback, and an older choice with the look removed', () => {
    expect(themeChoicePatch('butter')).toEqual({ theme: 'light', look: 'butter' });
    expect(themeChoicePatch('honey')).toEqual({ theme: 'light', look: 'honey' });
    expect(themeChoicePatch('java')).toEqual({ theme: 'dark', look: 'java' });
    for (const p of THEME_PREFERENCES) {
      const patch = themeChoicePatch(p);
      expect(patch).toEqual({ theme: p, look: undefined });
      // The key is present, so a spread over settings that held a look removes it.
      expect('look' in patch).toBe(true);
      const held: Pick<Settings, 'theme' | 'look'> = { theme: 'dark', look: 'java' };
      expect(JSON.parse(JSON.stringify({ ...held, ...patch }))).toEqual({ theme: p });
    }
  });

  it('every choice draws the palette it names, after a pick, whatever was stored before', () => {
    const before: Pick<Settings, 'theme' | 'look'>[] = [
      { theme: 'system' },
      { theme: 'light', look: 'butter' },
      { theme: 'dark', look: 'java' },
      { theme: 'blossom', look: 'honey' },
    ];
    for (const old of before) {
      for (const choice of THEME_CHOICES) {
        const next = { ...old, ...themeChoicePatch(choice) };
        for (const system of SYSTEMS) {
          const want = choice === 'system' ? (system === 'dark' ? 'dark' : 'light') : choice;
          expect(themeNameFor(next, system), `${choice} over ${JSON.stringify(old)} on ${system}`).toBe(want);
        }
        expect(themeChoiceOf(next)).toBe(choice);
      }
    }
  });

  it('shows one selected choice for every stored combination', () => {
    const cases: [Pick<Settings, 'theme' | 'look'> | { theme: unknown; look?: unknown }, ThemeChoice][] = [
      [{ theme: 'system' }, 'system'],
      [{ theme: 'light' }, 'light'],
      [{ theme: 'dark' }, 'dark'],
      [{ theme: 'blossom' }, 'blossom'],
      [{ theme: 'light', look: 'butter' }, 'butter'],
      [{ theme: 'light', look: 'honey' }, 'honey'],
      [{ theme: 'dark', look: 'java' }, 'java'],
      // A look whose fallback no longer matches: an older copy changed the theme.
      [{ theme: 'dark', look: 'butter' }, 'dark'],
      [{ theme: 'blossom', look: 'honey' }, 'blossom'],
      [{ theme: 'light', look: 'java' }, 'light'],
      [{ theme: 'system', look: 'java' }, 'system'],
      [{ theme: 'system', look: 'butter' }, 'system'],
      // Unknown values.
      [{ theme: 'light', look: 'sepia' }, 'light'],
      [{ theme: 'sepia' }, 'system'],
      [{ theme: 'sepia', look: 'java' }, 'system'],
    ];
    for (const [settings, want] of cases) expect(themeChoiceOf(settings as Pick<Settings, 'theme' | 'look'>), JSON.stringify(settings)).toBe(want);
  });

  it('the selected choice and the drawn palette never disagree', () => {
    for (const theme of THEME_PREFERENCES)
      for (const look of [undefined, ...THEME_LOOKS, 'sepia'] as Settings['look'][])
        for (const system of SYSTEMS) {
          const s = { theme, look };
          expect(themeNameOfChoice(themeChoiceOf(s), system), JSON.stringify({ ...s, system })).toBe(themeNameFor(s, system));
          expect(activeLook(theme, look) === null).toBe(!THEME_LOOKS.includes(themeChoiceOf(s) as never));
        }
  });

  it('a miniature for "Match my phone" follows the phone', () => {
    expect(themeNameOfChoice('system', 'dark')).toBe('dark');
    expect(themeNameOfChoice('system', 'light')).toBe('light');
    expect(themeNameOfChoice('system', null, true)).toBe('blossom');
    expect(themeNameOfChoice('java', 'light')).toBe('java');
  });
});

/**
 * resolve.ts as it was before the newer looks (commit e2dbbbf), word for word. An older copy of the
 * app on another phone receives these settings through sync and draws PALETTES[name] with what this
 * returns: a name it does not know would give no colours at all and every screen would fail.
 */
type OldThemeName = 'dark' | 'light' | 'blossom';
function oldResolveThemeName(preference: ThemePreference, system: string | null | undefined, lead = false): OldThemeName {
  if (preference !== 'system') return preference;
  if (system === 'dark') return 'dark';
  return lead ? 'blossom' : 'light';
}
const OLD_PALETTES = new Set(['dark', 'light', 'blossom']);

describe('an older copy of the app', () => {
  it('draws only its own three palettes for the settings any pick writes', () => {
    const before: Pick<Settings, 'theme' | 'look'>[] = [{ theme: 'system' }, { theme: 'blossom' }, { theme: 'dark', look: 'java' }, { theme: 'light', look: 'honey' }];
    for (const old of before) {
      for (const choice of THEME_CHOICES) {
        // What the newer phone stores and syncs: the whole settings object, as JSON.
        const synced = JSON.parse(JSON.stringify({ ...old, ...themeChoicePatch(choice) })) as Settings;
        expect(THEME_PREFERENCES).toContain(synced.theme);
        for (const system of SYSTEMS)
          for (const lead of [false, true]) expect(OLD_PALETTES.has(oldResolveThemeName(synced.theme, system, lead)), `${choice} on ${system}`).toBe(true);
      }
    }
  });

  it('shows a look as its fallback: Light for Butter and Honey, Dark for Java', () => {
    for (const look of THEME_LOOKS) {
      const p = themeChoicePatch(look);
      expect(oldResolveThemeName(p.theme, 'light')).toBe(look === 'java' ? 'dark' : 'light');
      expect(oldResolveThemeName(p.theme, 'dark')).toBe(look === 'java' ? 'dark' : 'light');
    }
  });

  it('wins when it changes the theme: it keeps look untouched, and the look stops applying', () => {
    // An older copy writes { theme } over the settings it holds, keeping fields it does not know.
    const fromNewer = { theme: 'dark', look: 'java' } as Pick<Settings, 'theme' | 'look'>;
    for (const theme of ['light', 'blossom', 'system'] as const) {
      const after = { ...fromNewer, theme };
      expect(themeChoiceOf(after)).toBe(theme);
      expect(themeNameFor(after, 'light')).toBe(theme === 'system' ? 'light' : theme);
    }
  });
});
