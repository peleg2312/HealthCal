import React, { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';

import type { ThemePreference } from '@/types';

import { darkColors, lightColors, radius, spacing, typography, type ThemeColors } from './tokens';

export interface Theme {
  dark: boolean;
  colors: ThemeColors;
  spacing: typeof spacing;
  radius: typeof radius;
  typography: typeof typography;
}

const ThemeContext = createContext<Theme>({
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
  const dark = preference === 'system' ? system !== 'light' : preference === 'dark';
  const value = useMemo<Theme>(
    () => ({ dark, colors: dark ? darkColors : lightColors, spacing, radius, typography }),
    [dark],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}

export * from './tokens';
