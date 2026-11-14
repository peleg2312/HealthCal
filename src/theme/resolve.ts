import type { ThemePreference } from '@/types';

export type ThemeName = 'dark' | 'light' | 'blossom';

/**
 * Which palette to draw. An explicit choice always wins. "Match my phone"
 * follows the phone: dark when it says dark, otherwise light, also when the
 * phone does not say (an unknown scheme used to mean dark, which surprised
 * people who had never asked for a dark app).
 *
 * `lead` is true until someone has finished setting up: they have not picked a
 * look yet, so on a light or unknown phone they see the app's own lead look,
 * Blossom, the one on the icon and in the store. The last setup question then
 * stores an explicit choice, and Profile > Appearance changes it at any time.
 */
export function resolveThemeName(preference: ThemePreference, system: string | null | undefined, lead = false): ThemeName {
  if (preference !== 'system') return preference;
  if (system === 'dark') return 'dark';
  return lead ? 'blossom' : 'light';
}
