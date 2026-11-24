import React from 'react';
import { ActivityIndicator, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { cup, cupFor, fonts, useTheme } from '@/theme';

import { DECORATIVE } from './decorative';
import { PressableScale } from './Pressable';
import { Text, useGrownText } from './Text';

/**
 * The icon a kit button draws, one size per button size and stroke 2.2 (the rule for an icon on a button), so no
 * caller picks its own: 18 px on a small or medium Button, 20 on a large one. The caller's `size` and
 * `strokeWidth` are replaced; its colour is kept.
 */
export const BUTTON_ICON = { sm: 18, md: 18, lg: 20 } as const;
/** The stroke of an icon on a button (on a clear `IconButton`, which draws no cup, it is a bare mark: `BARE_ICON`). */
export const BUTTON_STROKE = 2.2;
/** A clear `IconButton` draws no cup, so its icon is a bare mark, as the trash can is: 18 px at lucide's 1.9. */
export const BARE_ICON = { size: 18, strokeWidth: 1.9 } as const;

/** An `IconButton`'s icon size by its cup: 18 up to 36 px, 20 up to 47, 22 from 48. */
export function iconButtonGlyph(size: number, tone: 'surface' | 'alt' | 'primary' | 'clear'): { size: number; strokeWidth: number } {
  if (tone === 'clear') return BARE_ICON;
  return { size: size <= 36 ? 18 : size < 48 ? 20 : 22, strokeWidth: BUTTON_STROKE };
}

/**
 * Sizes and strokes an icon given to a kit button: a lucide icon or the app's own line glyph (`AiGlyph`), told by the
 * `size` or `strokeWidth` it was given. Anything else (a host element, text, a mark that takes neither) is drawn
 * as given.
 */
function kitIcon(node: React.ReactNode, glyph: { size: number; strokeWidth: number }, recolour?: { from: string[]; to: string }): React.ReactNode {
  if (!React.isValidElement(node) || typeof node.type === 'string') return node;
  const props = node.props as Record<string, unknown>;
  if (!('size' in props) && !('strokeWidth' in props)) return node;
  // A ghost button's icon drawn in the accent takes the button's own ink (`actionInk`), so icon and label match.
  const color = recolour && typeof props.color === 'string' && recolour.from.includes(props.color) ? { color: recolour.to } : null;
  // Hidden from assistive technology: the control is named by its words.
  return React.cloneElement(node as React.ReactElement<{ size?: number; strokeWidth?: number; color?: string }>, { ...glyph, ...color, ...DECORATIVE });
}

export interface ButtonProps {
  title: string;
  onPress?: () => void;
  /**
   * primary: solid primary. secondary: transparent with a 1.5 px borderStrong edge.
   * ghost: no edge, `actionInk` text and icon (never the calorie ink). danger: danger text and edge, no fill.
   * soft: primarySoft fill with primaryInk text (a done state such as "Cheered").
   */
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'soft';
  /** lg 48, md 44, sm 36 visible (a 44 px touch target through hitSlop, on web too; 48 dp on Android, see PressableScale). */
  size?: 'sm' | 'md' | 'lg';
  /** A lucide icon (or `AiGlyph`), drawn at the button's own icon size and stroke (`BUTTON_ICON`, `BUTTON_STROKE`). */
  icon?: React.ReactNode;
  iconRight?: React.ReactNode;
  loading?: boolean;
  disabled?: boolean;
  /** Stretch to the container width. */
  full?: boolean;
  /** Edge colour for a secondary button that belongs to one data colour (the water "+ 250 ml"). */
  tint?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  accessibilityLabel?: string;
  /**
   * For a button that opens or closes more of a list ("Show all"): true while it is open. Sets the
   * expanded state (`aria-expanded` on the web). Leave it out on every other button.
   */
  expanded?: boolean;
  /**
   * Web: the id of an element whose words name the button instead of `accessibilityLabel` (a hidden copy of a name
   * that carries its own `lang`). Passed through as `aria-labelledby`; nothing changes when it is left out.
   */
  'aria-labelledby'?: string;
}

export function Button({ title, onPress, variant = 'primary', size = 'lg', icon, iconRight, loading, disabled, full = true, tint, style, testID, accessibilityLabel, expanded, 'aria-labelledby': labelledBy }: ButtonProps) {
  const { colors, radius } = useTheme();
  const sm = size === 'sm';
  const height = size === 'lg' ? 48 : size === 'md' ? 44 : 36;
  // Large text (the app's size above 100% or the phone's setting): the label wraps onto more lines and the
  // button grows to hold them, never cut with an ellipsis. A height the caller set (a button beside a field)
  // becomes the least height then. At the designed size the button is exactly as before: one line, its height.
  const large = useGrownText();
  const given = large ? StyleSheet.flatten(style) : undefined;
  const callerHeight = typeof given?.height === 'number' ? given.height : undefined;
  const bg = variant === 'primary' ? colors.primary : variant === 'soft' ? colors.primarySoft : 'transparent';
  const fg =
    variant === 'primary'
      ? colors.onPrimary
      : variant === 'danger'
        ? colors.danger
        : variant === 'ghost'
          ? // A borderless control's own ink: never the colour of a calorie figure (in Dark the accent is the calorie ink).
            colors.actionInk
          : variant === 'soft'
            ? // Not `primary`: it is under 4.5:1 on the soft fill and on bg in light and Blossom.
              colors.primaryInk
            : colors.text;
  const edge = variant === 'secondary' ? (tint ?? colors.borderStrong) : variant === 'danger' ? colors.danger : 'transparent';
  const glyph = { size: BUTTON_ICON[size], strokeWidth: BUTTON_STROKE };
  const recolour = variant === 'ghost' ? { from: [colors.primary, colors.primaryInk, colors.caloriesInk], to: colors.actionInk } : undefined;
  return (
    <PressableScale
      testID={testID}
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityLabel={accessibilityLabel ?? title}
      {...(labelledBy ? { 'aria-labelledby': labelledBy } : null)}
      expanded={expanded}
      hitSlop={sm ? 4 : undefined}
      style={[
        {
          ...(large ? { minHeight: height, paddingVertical: sm ? 4 : 8, maxWidth: '100%' as const } : { height }),
          ...(sm ? cup(radius.buttonSm, 5) : cup(radius.button)),
          backgroundColor: bg,
          paddingHorizontal: sm ? 12 : 20,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: sm ? 5 : 8,
          alignSelf: full ? 'stretch' : 'flex-start',
          borderWidth: edge === 'transparent' ? 0 : 1.5,
          borderColor: edge,
        },
        large && given ? { ...given, height: undefined, minHeight: Math.max(height, callerHeight ?? 0, typeof given.minHeight === 'number' ? given.minHeight : 0) } : style,
      ]}>
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon ? <View {...DECORATIVE}>{kitIcon(icon, glyph, recolour)}</View> : null}
          <Text
            variant="title"
            color={fg}
            numberOfLines={large ? undefined : 1}
            style={[sm ? { fontSize: 14, lineHeight: 18, fontFamily: fonts.bold } : null, large ? { flexShrink: 1, textAlign: 'center' } : null]}>
            {title}
          </Text>
          {iconRight ? <View {...DECORATIVE}>{kitIcon(iconRight, glyph, recolour)}</View> : null}
        </>
      )}
    </PressableScale>
  );
}

/**
 * Square icon button, 44 by default, with cup corners. `surface` has a 1 px
 * border; `alt` is a surfaceAlt tile; `primary` is solid; `clear` has nothing
 * behind the icon. Small sizes keep a 44 px touch target through hitSlop, on
 * web as well, and 48 dp on Android (see `PressableScale`).
 *
 * The icon it is given (a lucide icon or `AiGlyph`) is drawn at the cup's one size and stroke
 * (`iconButtonGlyph`): 18 px in a cup up to 36, 20 up to 47, 22 from 48, at stroke 2.2; in a clear
 * one, which draws no cup, a bare mark of 18 px at 1.9 (the trash can). Its colour is the caller's.
 */
export function IconButton({
  children,
  onPress,
  size = 44,
  tone = 'surface',
  accessibilityLabel,
  style,
  testID,
  disabled,
  hitSlop,
  expanded,
  'aria-labelledby': labelledBy,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  size?: number;
  tone?: 'surface' | 'alt' | 'primary' | 'clear';
  accessibilityLabel: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  disabled?: boolean;
  /** The touch area past the cup's edge, when it must differ from the default (44 px in all). The tab header's cups pass theirs. */
  hitSlop?: { top: number; bottom: number; left: number; right: number };
  /** For a cup that opens or closes something: the expanded state (`aria-expanded` on the web). */
  expanded?: boolean;
  /** Web: the id of an element whose words name the cup (`aria-labelledby`), as on `Button`. Nothing changes when left out. */
  'aria-labelledby'?: string;
}) {
  const { colors } = useTheme();
  const bg = tone === 'primary' ? colors.primary : tone === 'alt' ? colors.surfaceAlt : tone === 'surface' ? colors.surface : 'transparent';
  return (
    <PressableScale
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      scaleTo={0.92}
      expanded={expanded}
      hitSlop={hitSlop ?? Math.max(0, Math.ceil((44 - size) / 2))}
      accessibilityLabel={accessibilityLabel}
      {...(labelledBy ? { 'aria-labelledby': labelledBy } : null)}
      style={[
        {
          width: size,
          height: size,
          ...cupFor(size),
          backgroundColor: bg,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: tone === 'surface' ? 1 : 0,
          borderColor: colors.border,
        },
        style,
      ]}>
      {React.Children.map(children, (c) => kitIcon(c, iconButtonGlyph(size, tone)))}
    </PressableScale>
  );
}
