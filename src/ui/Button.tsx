import React from 'react';
import { ActivityIndicator, View, type StyleProp, type ViewStyle } from 'react-native';

import { cup, cupFor, fonts, useTheme } from '@/theme';

import { PressableScale } from './Pressable';
import { Text } from './Text';

export interface ButtonProps {
  title: string;
  onPress?: () => void;
  /**
   * primary: solid primary. secondary: transparent with a 1.5 px borderStrong edge.
   * ghost: no edge, primaryInk text. danger: danger text and edge, no fill.
   * soft: primarySoft fill with primaryInk text (a done state such as "Cheered").
   */
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'soft';
  /** lg 48, md 44, sm 36 visible (a 44 px touch target through hitSlop, on web too; 48 dp on Android, see PressableScale). */
  size?: 'sm' | 'md' | 'lg';
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
}

export function Button({ title, onPress, variant = 'primary', size = 'lg', icon, iconRight, loading, disabled, full = true, tint, style, testID, accessibilityLabel, expanded }: ButtonProps) {
  const { colors, radius } = useTheme();
  const sm = size === 'sm';
  const height = size === 'lg' ? 48 : size === 'md' ? 44 : 36;
  const bg = variant === 'primary' ? colors.primary : variant === 'soft' ? colors.primarySoft : 'transparent';
  const fg =
    variant === 'primary'
      ? colors.onPrimary
      : variant === 'danger'
        ? colors.danger
        : variant === 'ghost' || variant === 'soft'
          ? // Not `primary`: it is under 4.5:1 on the soft fill and on bg in light and Blossom.
            colors.primaryInk
          : colors.text;
  const edge = variant === 'secondary' ? (tint ?? colors.borderStrong) : variant === 'danger' ? colors.danger : 'transparent';
  return (
    <PressableScale
      testID={testID}
      onPress={onPress}
      disabled={disabled || loading}
      feedback={variant === 'primary' ? 'press' : 'tap'}
      accessibilityLabel={accessibilityLabel ?? title}
      expanded={expanded}
      hitSlop={sm ? 4 : undefined}
      style={[
        {
          height,
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
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon ? <View>{icon}</View> : null}
          <Text variant="title" color={fg} numberOfLines={1} style={sm ? { fontSize: 14, lineHeight: 18, fontFamily: fonts.bold } : undefined}>
            {title}
          </Text>
          {iconRight ? <View>{iconRight}</View> : null}
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
      {children}
    </PressableScale>
  );
}
