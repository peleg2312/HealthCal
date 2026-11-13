import React from 'react';
import { ActivityIndicator, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme';

import { PressableScale } from './Pressable';
import { Text } from './Text';

export interface ButtonProps {
  title: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  icon?: React.ReactNode;
  iconRight?: React.ReactNode;
  loading?: boolean;
  disabled?: boolean;
  /** Stretch to the container width. */
  full?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function Button({ title, onPress, variant = 'primary', size = 'lg', icon, iconRight, loading, disabled, full = true, style, testID }: ButtonProps) {
  const { colors, radius } = useTheme();
  const height = size === 'lg' ? 54 : size === 'md' ? 46 : 36;
  const bg =
    variant === 'primary' ? colors.primary : variant === 'secondary' ? colors.surfaceAlt : variant === 'danger' ? colors.danger : 'transparent';
  const fg =
    variant === 'primary' ? colors.onPrimary : variant === 'danger' ? '#FFFFFF' : variant === 'ghost' ? colors.primary : colors.text;
  return (
    <PressableScale
      testID={testID}
      onPress={onPress}
      disabled={disabled || loading}
      feedback={variant === 'primary' ? 'press' : 'tap'}
      accessibilityLabel={title}
      style={[
        {
          height,
          borderRadius: size === 'sm' ? radius.sm : radius.md,
          backgroundColor: bg,
          paddingHorizontal: size === 'sm' ? 12 : 20,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          alignSelf: full ? 'stretch' : 'flex-start',
          borderWidth: variant === 'secondary' ? 1 : 0,
          borderColor: colors.border,
        },
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon ? <View>{icon}</View> : null}
          <Text variant={size === 'sm' ? 'label' : 'title'} color={fg} numberOfLines={1}>
            {title}
          </Text>
          {iconRight ? <View>{iconRight}</View> : null}
        </>
      )}
    </PressableScale>
  );
}

export function IconButton({
  children,
  onPress,
  size = 40,
  tone = 'surface',
  accessibilityLabel,
  style,
  testID,
  disabled,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  size?: number;
  tone?: 'surface' | 'alt' | 'primary' | 'clear';
  accessibilityLabel: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  const bg = tone === 'primary' ? colors.primary : tone === 'alt' ? colors.surfaceAlt : tone === 'surface' ? colors.surface : 'transparent';
  return (
    <PressableScale
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      scaleTo={0.9}
      hitSlop={8}
      accessibilityLabel={accessibilityLabel}
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
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
