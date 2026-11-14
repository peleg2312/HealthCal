import React, { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';

import type { ThemePreference } from '@/types';

import { blossomColors, darkColors, lightColors, radius, spacing, typography, type ThemeColors } from './tokens';

export type ThemeName = 'dark' | 'light' | 'blossom';

export interface Theme {
  /** Which palette is active. */
  name: ThemeName;
  /** True for palettes with a dark background (drives status bar and similar). */
  dark: boolean;
  colors: ThemeColors;
  spacing: typeof spacing;
  radius: typeof radius;
  typography: typeof typography;
}

const PALETTES: Record<ThemeName, ThemeColors> = { dark: darkColors, light: lightColors, blossom: blossomColors };

const ThemeContext = createContext<Theme>({
  name: 'dark',
  dark: true,
  colors: darkColors,
  spacing,
  radius,
  typography,
});

export function ThemeProvider({
  preference,
  children,
}: {
  preference: ThemePreference;
  children: React.ReactNode;
}) {
  const system = useColorScheme();
  const name: ThemeName = preference === 'system' ? (system === 'light' ? 'light' : 'dark') : preference;
  const value = useMemo<Theme>(
    () => ({ name, dark: name === 'dark', colors: PALETTES[name], spacing, radius, typography }),
    [name],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}

export * from './tokens';
export { isReducedMotion, motion, useReducedMotion } from './motion';
