import React from 'react';
import { Text as RNText, type TextProps as RNTextProps } from 'react-native';

import { useTheme, type TextVariant, type ThemeColors } from '@/theme';

export type ColorName = keyof ThemeColors;

export interface TextProps extends RNTextProps {
  variant?: TextVariant;
  /** A theme colour name, or any raw colour string. Defaults to `text` (`textSecondary` for overline, caption and unit). */
  color?: ColorName | (string & {});
  align?: 'left' | 'center' | 'right';
  /** Tabular digits so changing numbers do not jiggle (the num variants already have them). */
  tabular?: boolean;
}

/**
 * The most the phone's text-size setting may scale the kit's type (Text and the text fields).
 * Large text still grows by up to 30%, but a row built for one line does not break apart.
 * Web ignores it: the browser's own zoom scales the whole page instead.
 */
export const MAX_FONT_SCALE = 1.3;

const SECONDARY_BY_DEFAULT: Partial<Record<TextVariant, true>> = { overline: true, unit: true };

/**
 * Bricolage Grotesque for display, headings and every num variant; Hanken
 * Grotesk for the rest. A unit beside a number is a nested Text:
 *   <Text variant="numL">941<Text variant="unit"> kcal</Text></Text>
 */
export function Text({ variant = 'body', color, align, tabular, style, ...rest }: TextProps) {
  const { colors, typography } = useTheme();
  const name = color ?? (SECONDARY_BY_DEFAULT[variant] ? 'textSecondary' : 'text');
  const resolved = (colors as unknown as Record<string, string>)[name] ?? name;
  return (
    <RNText
      maxFontSizeMultiplier={MAX_FONT_SCALE}
      {...rest}
      style={[
        typography[variant],
        { color: resolved },
        align && { textAlign: align },
        tabular && { fontVariant: ['tabular-nums'] },
        style,
      ]}
    />
  );
}
