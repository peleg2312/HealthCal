import React from 'react';
import { Text as RNText, type TextProps as RNTextProps } from 'react-native';

import { useTheme, type TextVariant, type ThemeColors } from '@/theme';

export type ColorName = keyof ThemeColors;

export interface TextProps extends RNTextProps {
  variant?: TextVariant;
  /** A theme colour name, or any raw colour string. */
  color?: ColorName | (string & {});
  align?: 'left' | 'center' | 'right';
  /** Tabular digits so changing numbers do not jiggle. */
  tabular?: boolean;
}

export function Text({ variant = 'body', color = 'text', align, tabular, style, ...rest }: TextProps) {
  const { colors, typography } = useTheme();
  const resolved = (colors as unknown as Record<string, string>)[color] ?? color;
  return (
    <RNText
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
