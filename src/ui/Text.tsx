import React from 'react';
import { Text as RNText, type TextProps as RNTextProps } from 'react-native';

import { leftToRightStart } from '@/lib/bidi';
import { keepTogether, keepUnitWithNumber } from '@/lib/text';
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
 * The strings a Text draws, with a number kept on one line with its unit, a macro letter with its
 * number and a range with both its ends (`keepTogether`, @/lib/text). Strings and numbers side by
 * side (`{kcal} kcal`) are drawn as one run, so they are joined first. A nested unit's leading
 * space (`<Text variant="unit"> kcal</Text>`) holds it to the number before it.
 */
function keepNumbers(children: React.ReactNode, unit: boolean): React.ReactNode[] {
  const list = Array.isArray(children) ? (children as React.ReactNode[]) : [children];
  const out: React.ReactNode[] = [];
  let run: string | null = null;
  const flush = () => {
    if (run === null) return;
    let text = keepTogether(run);
    // A unit's own leading space, or a unit word that follows a nested number.
    if (unit || out.length) text = keepUnitWithNumber(text);
    out.push(text);
    run = null;
  };
  for (const c of list) {
    if (typeof c === 'string' || typeof c === 'number') run = (run ?? '') + String(c);
    else {
      flush();
      out.push(c);
    }
  }
  flush();
  return out;
}

/**
 * Bricolage Grotesque for display, headings and every num variant; Hanken
 * Grotesk for the rest. A unit beside a number is a nested Text:
 *   <Text variant="numL">941<Text variant="unit"> kcal</Text></Text>
 * A number never breaks from its unit, nor a macro letter from its number (see `keepNumbers`).
 */
export function Text({ variant = 'body', color, align, tabular, style, children, ...rest }: TextProps) {
  const { colors, typography } = useTheme();
  const name = color ?? (SECONDARY_BY_DEFAULT[variant] ? 'textSecondary' : 'text');
  const resolved = (colors as unknown as Record<string, string>)[name] ?? name;
  // Spread as separate children (not one array), as JSX would, so React does not ask for keys.
  return React.createElement(
    RNText,
    {
      maxFontSizeMultiplier: MAX_FONT_SCALE,
      ...rest,
      style: [typography[variant], { color: resolved }, align && { textAlign: align }, tabular && { fontVariant: ['tabular-nums'] }, style],
    },
    // A whole name that starts with a Hebrew or Arabic letter stays at the left edge (@/lib/bidi).
    ...keepNumbers(typeof children === 'string' ? leftToRightStart(children) : children, variant === 'unit'),
  );
}
