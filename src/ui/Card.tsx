import React from 'react';
import { Platform, View, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';

import { spokenUnits } from '@/lib/spokenUnits';
import { cup, useTheme } from '@/theme';

import { PressableScale } from './Pressable';

export interface CardProps extends ViewProps {
  onPress?: () => void;
  padding?: number;
  /** @deprecated Pour has no gradients. Accepted so old callers compile; ignored (the card is flat). */
  gradient?: readonly [string, string, ...string[]];
  /** `surface` (default): surface with a 1 px border. `alt`: surfaceAlt, no border (invites, notes). `transparent`: no fill, no border. */
  tone?: 'surface' | 'alt' | 'transparent';
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

/**
 * The cup: square shoulders (6), round base (22), a 1 px border, no shadow.
 * Related stats share one card, separated by `Divider`s, rather than many small cards.
 */
export function Card({ onPress, padding, gradient: _gradient, tone = 'surface', style, children, accessibilityLabel, ...rest }: CardProps) {
  const { colors, radius, spacing } = useTheme();
  const base: ViewStyle = {
    backgroundColor: tone === 'surface' ? colors.surface : tone === 'alt' ? colors.surfaceAlt : 'transparent',
    ...cup(radius.card),
    borderWidth: tone === 'surface' ? 1 : 0,
    borderColor: colors.border,
    padding: padding ?? spacing.lg,
    overflow: 'hidden',
  };
  if (onPress) {
    return (
      <PressableScale testID={rest.testID} accessibilityHint={rest.accessibilityHint} onPress={onPress} style={[base, style]} scaleTo={0.985} accessibilityLabel={accessibilityLabel}>
        {children}
      </PressableScale>
    );
  }
  // A named card that is not one element (its content can hold controls: the coach's local answer) is a named group
  // on the web, where a name on a box with no role is not read. A figure card (`figure()`) brings its own role.
  const given = rest as { role?: string };
  const webGroup = Platform.OS === 'web' && accessibilityLabel && !given.role && !rest.accessibilityRole ? ({ role: 'group' } as const) : null;
  return (
    <View {...rest} {...webGroup} accessibilityLabel={accessibilityLabel && spokenUnits(accessibilityLabel)} style={[base, style]}>
      {children}
    </View>
  );
}
