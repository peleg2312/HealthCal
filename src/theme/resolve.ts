import type { Settings, ThemeLook, ThemePreference } from '@/types';

export type { ThemeLook } from '@/types';

/** A palette the app can draw. The first three are the original looks; the last three were added beside them. */
export type ThemeName = 'dark' | 'light' | 'blossom' | 'butter' | 'honey' | 'java';

/** Every palette, in the order the pickers list them. */
export const THEME_NAMES: readonly ThemeName[] = ['light', 'dark', 'blossom', 'butter', 'honey', 'java'];

/**
 * One choice in a theme picker: "Match my phone" or one of the six looks. A picker shows one of
 * these as selected (`themeChoiceOf`) and writes the patch for the one tapped (`themeChoicePatch`).
 */
export type ThemeChoice = ThemePreference | ThemeLook;

/** The seven choices, in the order Profile > Appearance lists them. */
export const THEME_CHOICES: readonly ThemeChoice[] = ['system', 'light', 'dark', 'blossom', 'butter', 'honey', 'java'];

/** The four choices an older copy of the app knows, and the only values `Settings.theme` ever holds. */
export const THEME_PREFERENCES: readonly ThemePreference[] = ['system', 'light', 'dark', 'blossom'];

/** The newer looks, stored in `Settings.look`. */
export const THEME_LOOKS: readonly ThemeLook[] = ['butter', 'honey', 'java'];

/** The name of each choice as a picker shows it. */
export const THEME_LABELS: Record<ThemeChoice, string> = {
  system: 'Match my phone',
  light: 'Light',
  dark: 'Dark',
  blossom: 'Blossom',
  butter: 'Butter',
  honey: 'Honey',
  java: 'Java',
};

/** One line about each newer look (the pickers may shorten them to fit). */
export const LOOK_HINTS: Record<ThemeLook, string> = {
  butter: 'Butter paper, wine and cerulean',
  honey: 'Butter paper with a gold cup',
  java: 'Coffee brown, butter and cerulean',
};

const FALLBACK: Record<ThemeLook, 'light' | 'dark'> = {
  butter: 'light',
  honey: 'light',
  java: 'dark',
};

/** True for a look this version knows ('butter', 'honey', 'java'); false for anything else, including a later version's look. */
export function isThemeLook(x: unknown): x is ThemeLook {
  return typeof x === 'string' && Object.prototype.hasOwnProperty.call(FALLBACK, x);
}

/** True for one of the four stored preferences. */
export function isThemePreference(x: unknown): x is ThemePreference {
  return x === 'system' || x === 'light' || x === 'dark' || x === 'blossom';
}

/** The preference stored in `Settings.theme` beside a look: what an older copy of the app shows instead of it. */
export function lookFallback(look: ThemeLook): 'light' | 'dark' {
  return FALLBACK[look];
}

/**
 * The look in force for a stored pair, or null. A look applies only while `theme` still equals
 * its fallback: an older copy that changed `theme` (it keeps `look` untouched, as it does every
 * field it does not know) has made a newer choice, and that wins. An unknown look is ignored.
 */
export function activeLook(theme: unknown, look: unknown): ThemeLook | null {
  return isThemeLook(look) && theme === FALLBACK[look] ? look : null;
}

/**
 * Which palette to draw. An explicit choice always wins. "Match my phone"
 * follows the phone: dark when it says dark, otherwise light, also when the
 * phone does not say (an unknown scheme used to mean dark, which surprised
 * people who had never asked for a dark app).
 *
 * `lead` is true until someone has finished setting up: they have not picked a
 * look yet, so on a light or unknown phone the welcome screens show the app's
 * own lead look, Blossom, the one on the icon and in the store. Set-up asks no
 * question about the look and is drawn without the lead, as the app will be
 * drawn once it ends: following the phone ("Match my phone"), unless a backup
 * or a sign-in brought a choice. Profile > Appearance changes it at any time.
 *
 * `look` is `Settings.look`: a newer look, drawn while `preference` equals its fallback
 * (`activeLook`). A preference this version does not know is read as "Match my phone", so a
 * stored value from elsewhere never leaves the app without a palette.
 */
export function resolveThemeName(preference: ThemePreference, system: string | null | undefined, lead = false, look?: unknown): ThemeName {
  const applied = activeLook(preference, look);
  if (applied) return applied;
  if (preference === 'light' || preference === 'dark' || preference === 'blossom') return preference;
  if (system === 'dark') return 'dark';
  return lead ? 'blossom' : 'light';
}

/** `resolveThemeName` for stored settings. */
export function themeNameFor(settings: Pick<Settings, 'theme' | 'look'>, system: string | null | undefined, lead = false): ThemeName {
  return resolveThemeName(settings.theme, system, lead, settings.look);
}

/**
 * The one choice a picker shows as selected for the stored settings: the look when it applies,
 * else the stored preference ('system' for a value this version does not know).
 */
export function themeChoiceOf(settings: Pick<Settings, 'theme' | 'look'>): ThemeChoice {
  const applied = activeLook(settings.theme, settings.look);
  if (applied) return applied;
  return isThemePreference(settings.theme) ? settings.theme : 'system';
}

/** What a pick writes, in one `setSettings`: a look with its fallback, or a preference with `look` removed. */
export type ThemePatch = {
  theme: ThemePreference;
  look: ThemeLook | undefined;
};

/**
 * The settings patch for a pick: `useStore.getState().setSettings(themeChoicePatch(choice))`.
 * A newer look writes `look` and its fallback in `theme`, so an older copy shows Light or Dark;
 * one of the four preferences writes `theme` and removes `look` (undefined, which the device's
 * storage and the synced settings drop).
 */
export function themeChoicePatch(choice: ThemeChoice): ThemePatch {
  if (isThemeLook(choice)) return { theme: FALLBACK[choice], look: choice };
  return { theme: choice, look: undefined };
}

/** The palette a choice draws on a phone in the given scheme (a picker's miniature for "Match my phone" follows the phone). */
export function themeNameOfChoice(choice: ThemeChoice, system: string | null | undefined, lead = false): ThemeName {
  const p = themeChoicePatch(choice);
  return resolveThemeName(p.theme, system, lead, p.look);
}
