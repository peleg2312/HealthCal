import React from 'react';
import { Platform, Text as RNText, StyleSheet, type StyleProp, type TextProps as RNTextProps, type TextStyle } from 'react-native';

import { leftToRightStart } from '@/lib/bidi';
import { keepTogether, keepUnitWithNumber } from '@/lib/text';
import { MAX_TEXT_GROWTH, phoneCapFor, scaleTextStyle, useLegibility, useTextSize, useTheme, type TextVariant, type ThemeColors } from '@/theme';

import { langParts, wholeLang } from './textLang';

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
 * The most the phone's text-size setting may scale the kit's type (Text and the text fields): 2x, the 200%
 * WCAG 1.4.4 asks for. With the app's own text size above 100% (Profile > Appearance, @/theme textSize)
 * a Text lets the phone add only what keeps the two together at 2x (`phoneCapFor`). Web ignores it: the
 * browser's zoom and the app's text size scale the page there.
 */
export const MAX_FONT_SCALE = MAX_TEXT_GROWTH;

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
  // The app's text size (100% to 200%) and the system's Bold Text: every size and family is drawn through them.
  const scale = useTextSize();
  const { boldText } = useLegibility();
  const name = color ?? (SECONDARY_BY_DEFAULT[variant] ? 'textSecondary' : 'text');
  const resolved = (colors as unknown as Record<string, string>)[name] ?? name;
  const styles: StyleProp<TextStyle> = [typography[variant] as TextStyle, { color: resolved }, align && { textAlign: align }, tabular && { fontVariant: ['tabular-nums'] }, style];
  const drawn = scale === 1 && !boldText ? styles : scaleTextStyle(StyleSheet.flatten(styles) ?? {}, scale, boldText);
  // A whole name that starts with a Hebrew or Arabic letter stays at the left edge (@/lib/bidi).
  const content = keepNumbers(typeof children === 'string' ? leftToRightStart(children) : children, variant === 'unit');
  // A Hebrew or Arabic name is marked with its language (./textLang.ts): the whole Text when it is only
  // that name, else a span around the name on the web. `dir="auto"` keeps the browser's own direction
  // finding (with the left-to-right mark above), since `lang` alone would turn the part right to left.
  const whole = typeof children === 'string' ? wholeLang(children) : null;
  const langProps = whole ? (Platform.OS === 'web' ? { lang: whole, dir: 'auto' } : { accessibilityLanguage: whole }) : null;
  let key = 0;
  const parts = !whole && Platform.OS === 'web' ? content.flatMap((n) => markLanguage(n, () => key++)) : content;
  // Spread as separate children (not one array), as JSX would, so React does not ask for keys.
  return React.createElement(
    RNText,
    {
      maxFontSizeMultiplier: phoneCapFor(scale),
      ...langProps,
      ...rest,
      style: drawn,
    },
    ...parts,
  );
}

/** A string with a Hebrew or Arabic name inside it, as spans with that part's language (web only). */
function markLanguage(node: React.ReactNode, nextKey: () => number): React.ReactNode[] {
  if (typeof node !== 'string') return [node];
  const parts = langParts(node);
  if (parts.length === 1 && !parts[0].lang) return [node];
  return parts.map((p) => (p.lang ? React.createElement(RNText, { key: `lang-${nextKey()}`, lang: p.lang, dir: 'auto' } as object, p.text) : p.text));
}
