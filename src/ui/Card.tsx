import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { View, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme';

import { PressableScale } from './Pressable';

export interface CardProps extends ViewProps {
  onPress?: () => void;
  padding?: number;
  /** Two or more colours render a gradient background. */
  gradient?: readonly [string, string, ...string[]];
  tone?: 'surface' | 'alt' | 'transparent';
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

export function Card({ onPress, padding, gradient, tone = 'surface', style, children, accessibilityLabel, ...rest }: CardProps) {
  const { colors, radius, spacing } = useTheme();
  const base: ViewStyle = {
    backgroundColor: tone === 'surface' ? colors.surface : tone === 'alt' ? colors.surfaceAlt : 'transparent',
    borderRadius: radius.lg,
    borderWidth: tone === 'transparent' ? 0 : 1,
    borderColor: colors.border,
    padding: padding ?? spacing.lg,
    overflow: 'hidden',
  };
  const body = gradient ? (
    <>
      <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }} />
      {children}
    </>
  ) : (
    children
  );
  if (onPress) {
    return (
      <PressableScale testID={rest.testID} accessibilityHint={rest.accessibilityHint} onPress={onPress} style={[base, style]} scaleTo={0.985} accessibilityLabel={accessibilityLabel}>
        {body}
      </PressableScale>
    );
  }
  return (
    <View {...rest} style={[base, style]}>
      {body}
    </View>
  );
}
