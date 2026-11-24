import React, { createContext, useContext, useEffect, useMemo } from 'react';
import { Platform, useColorScheme } from 'react-native';

import type { ThemePreference } from '@/types';

import { forcedColorsPalette, moreContrastChartFill, moreContrastColors, readSystemColors } from './contrastMore';
import { useLegibility } from './legibility';
import { resolveThemeName, type ThemeName } from './resolve';
import { chartFillOpacity, darkColors, isDarkTheme, paletteFor, radius, spacing, typography, type ThemeColors } from './tokens';

export * from './resolve';

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
  look,
  lead = false,
  children,
}: {
  preference: ThemePreference;
  /** `Settings.look`: a newer look, drawn while `preference` holds its fallback (see resolveThemeName). */
  look?: unknown;
  /** True until setup is finished: nobody has picked a look yet (see resolveThemeName). */
  lead?: boolean;
  children: React.ReactNode;
}) {
  const system = useColorScheme();
  const name: ThemeName = resolveThemeName(preference, system, lead, look);
  // The system's contrast settings (./legibility.ts): the person's forced colours on the web, else the
  // look with more contrast (iOS Increase Contrast, Android high contrast text, prefers-contrast: more).
  const { moreContrast, forcedColors } = useLegibility();
  const [value, forcedOn] = useMemo<[Theme, boolean]>(() => {
    const base = paletteFor(name);
    const fill = chartFillOpacity[name] ?? chartFillOpacity.light;
    const systemColors = forcedColors && Platform.OS === 'web' ? readSystemColors() : null;
    if (systemColors) {
      const colors = forcedColorsPalette(systemColors, base);
      return [{ name, dark: luminanceOf(colors.bg) < 0.4, colors, chartFill: 1, spacing, radius, typography }, true];
    }
    if (moreContrast) return [{ name, dark: isDarkTheme(name), colors: moreContrastColors(base), chartFill: moreContrastChartFill(fill), spacing, radius, typography }, false];
    return [{ name, dark: isDarkTheme(name), colors: base, chartFill: fill, spacing, radius, typography }, false];
  }, [name, moreContrast, forcedColors]);
  // Under forced colours the page is drawn in the system's own colours (above), so the browser is asked to
  // keep them instead of painting every background as the page (cups, bars and the + would vanish).
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    document.documentElement.style.setProperty('forced-color-adjust', forcedOn ? 'none' : '');
  }, [forcedOn]);
  // On web the browser draws around the app: the status bar of an app added to a phone's home
  // screen, the strip by the home indicator, the page behind an overscroll. Keep them the colour
  // of the active look (public/index.html starts them at the Blossom paper).
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const bg = value.colors.bg;
    document.documentElement.style.backgroundColor = bg;
    document.body.style.backgroundColor = bg;
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'theme-color');
      document.head.appendChild(meta);
    }
    meta.setAttribute('content', bg);
  }, [value.colors.bg]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}

/** Relative luminance of '#RRGGBB', enough to tell a dark page from a light one. */
function luminanceOf(hex: string): number {
  const n = (i: number) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * n(1) + 0.7152 * n(3) + 0.0722 * n(5);
}

export * from './tokens';
export { isReducedMotion, motion, useReducedMotion } from './motion';
export { legibility, useLegibility, type Legibility } from './legibility';
export {
  bolder,
  LARGE_TEXT,
  MAX_TEXT_GROWTH,
  normaliseTextSize,
  phoneCapFor,
  scaledFontSize,
  scaleTextStyle,
  setTextSize,
  TEXT_SIZE_KEY,
  TEXT_SIZES,
  textGrowth,
  textSize,
  textSizeLabel,
  useLargeText,
  useTextGrowth,
  useTextSize,
  type TextSize,
} from './textSize';
