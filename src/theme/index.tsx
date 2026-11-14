import React, { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';

import type { ThemePreference } from '@/types';

import { resolveThemeName, type ThemeName } from './resolve';
import { blossomColors, chartFillOpacity, darkColors, lightColors, radius, spacing, typography, type ThemeColors } from './tokens';

export { resolveThemeName, type ThemeName } from './resolve';

export interface Theme {
  /** Which palette is active. */
  name: ThemeName;
  /** True for palettes with a dark background (drives status bar and similar). */
  dark: boolean;
  colors: ThemeColors;
  /** Opacity of bar-chart cup fills in this palette (see `chartFillOpacity`). */
  chartFill: number;
  spacing: typeof spacing;
  radius: typeof radius;
  typography: typeof typography;
}

const PALETTES: Record<ThemeName, ThemeColors> = { dark: darkColors, light: lightColors, blossom: blossomColors };

const ThemeContext = createContext<Theme>({
  name: 'dark',
  dark: true,
  colors: darkColors,
  chartFill: chartFillOpacity.dark,
  spacing,
  radius,
  typography,
});

export function ThemeProvider({
  preference,
  lead = false,
  children,
}: {
  preference: ThemePreference;
  /** True until setup is finished: nobody has picked a look yet (see resolveThemeName). */
  lead?: boolean;
  children: React.ReactNode;
}) {
  const system = useColorScheme();
  const name: ThemeName = resolveThemeName(preference, system, lead);
  const value = useMemo<Theme>(
    () => ({ name, dark: name === 'dark', colors: PALETTES[name], chartFill: chartFillOpacity[name], spacing, radius, typography }),
    [name],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}

export * from './tokens';
export { isReducedMotion, motion, useReducedMotion } from './motion';
