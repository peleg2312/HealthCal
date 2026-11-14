import React from 'react';
import { useWindowDimensions, View } from 'react-native';

import { useTheme } from '@/theme';
import { CupKey, FadeUp, PressableScale, Text } from '@/ui';

/**
 * One cell of the overview card: a cup key and title, one large value with
 * its unit small inside it, a caption and a one-line comparison with the
 * previous equal period. Cells share one card and are divided by hairlines
 * (drawn by the grid). The whole cell is one pressable; it holds nothing else
 * that can be pressed.
 */
export function ProgressTile({
  testID,
  title,
  color,
  value,
  unit,
  caption,
  compare,
  onPress,
  keyVariant,
  borderRight,
  borderTop,
  index = 0,
}: {
  testID: string;
  title: string;
  color: string;
  /** Null shows a dash. */
  value: string | null;
  unit?: string;
  /** Short context under the value, e.g. 'a day · budget 2,171'. */
  caption?: string;
  /** Neutral comparison line, or null when there is nothing to compare with. */
  compare: string | null;
  onPress: () => void;
  /** An outlined key marks an estimate (expenditure), as on the designer's board. */
  keyVariant?: 'filled' | 'outline';
  borderRight?: boolean;
  borderTop?: boolean;
  /** Position in the grid: tiles fade up in reading order. */
  index?: number;
}) {
  const { colors, spacing } = useTheme();
  // At 320 px a tile is about 108 px wide: the number steps down instead of being cut.
  const narrow = useWindowDimensions().width < 360;
  return (
    <FadeUp index={index + 1} style={{ width: '50%' }}>
    <PressableScale
      testID={testID}
      onPress={onPress}
      scaleTo={0.98}
      accessibilityLabel={`${title}: ${value === null ? 'no data' : `${value} ${unit ?? ''}`}${caption ? `, ${caption}` : ''}. ${compare ?? ''} Open details.`}
      style={{
        flexGrow: 1,
        minHeight: 132,
        paddingHorizontal: spacing.lg,
        paddingTop: 14,
        paddingBottom: spacing.lg,
        gap: 4,
        borderRightWidth: borderRight ? 1 : 0,
        borderTopWidth: borderTop ? 1 : 0,
        borderColor: colors.border,
      }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
        <CupKey color={color} size={10} variant={keyVariant} />
        <Text variant="label" color="textSecondary" numberOfLines={2} style={{ flex: 1, fontSize: 13.5 }}>
          {title}
        </Text>
      </View>
      <Text variant="numL" color={value === null ? 'textTertiary' : 'text'} style={[{ marginTop: 2 }, narrow ? { fontSize: 24, lineHeight: 28 } : null]}>
        {value ?? '–'}
        {unit && value !== null ? <Text variant="unit">{` ${unit}`}</Text> : null}
      </Text>
      {caption ? (
        <Text variant="caption" color="textSecondary" numberOfLines={2}>
          {caption}
        </Text>
      ) : null}
      <View style={{ flex: 1 }} />
      <Text variant="caption" color="textTertiary" numberOfLines={3} style={{ marginTop: 4 }}>
        {compare ?? 'Nothing to compare with yet'}
      </Text>
    </PressableScale>
    </FadeUp>
  );
}
