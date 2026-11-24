import React from 'react';
import { useWindowDimensions, View } from 'react-native';

import type { Direction } from '@/lib/insights';
import { useTheme } from '@/theme';
import { CupKey, FadeUp, PressableScale, Text } from '@/ui';

import { spokenUnits } from './chartWords';
import { TrendMark } from './parts';

/**
 * One cell of the overview card: a cup key and title, one large value with
 * its unit small inside it and the Nutrition card's trend mark beside it (a
 * triangle against the previous equal period for a change worth calling, a
 * dash for about the same; explained once under the grid),
 * and one caption line. The comparison in words is read out with the cell and
 * shown in full one tap away. Cells share one card and are divided by hairlines
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
  captionShort,
  spoken,
  compare,
  trend,
  period,
  onPress,
  keyVariant,
  valueColor = 'text',
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
  /** One line of context under the value, e.g. 'a day · budget 2,171'. */
  caption?: string;
  /** The same line for a phone under 360 px, where a cell is about 108 px wide. */
  captionShort?: string;
  /** What a screen reader says for the number and its line, when the short caption needs more words ("218 active minutes a week, toward ..."). */
  spoken?: string;
  /** Neutral comparison sentence, read out with the cell; null when there is nothing to compare with. */
  compare: string | null;
  /** The triangle beside the value: the shown number against the previous equal period. */
  trend?: Direction | null;
  /** e.g. '30 days', for the triangle's spoken words. */
  period?: string;
  onPress: () => void;
  /** An outlined key marks an estimate (expenditure), as on the designer's board. */
  keyVariant?: 'filled' | 'outline';
  /** Calorie numbers are drawn in `caloriesInk`; every other number in `text`. */
  valueColor?: 'text' | 'caloriesInk';
  borderRight?: boolean;
  borderTop?: boolean;
  /** Position in the grid: tiles fade up in reading order. */
  index?: number;
}) {
  const { colors, spacing } = useTheme();
  // At 320 px a tile is about 108 px wide: the number steps down instead of being cut.
  const narrow = useWindowDimensions().width < 360;
  const line = narrow && captionShort ? captionShort : caption;
  return (
    <FadeUp index={index + 1} style={{ width: '50%' }}>
    <PressableScale
      testID={testID}
      onPress={onPress}
      scaleTo={0.98}
      accessibilityLabel={spokenUnits(`${title}: ${spoken ?? `${value === null ? 'no data' : `${value} ${unit ?? ''}`}${caption ? `, ${caption}` : ''}`}.${compare ? ` ${compare}.` : ''} Open details.`)}
      style={{
        flexGrow: 1,
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
        <Text variant="label" color="textSecondary" style={{ flex: 1, fontSize: 13.5 }}>
          {title}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
        <Text variant="numL" color={value === null ? 'textTertiary' : valueColor} style={[{ flexShrink: 1 }, narrow ? { fontSize: 24, lineHeight: 28 } : null]}>
          {value ?? '–'}
          {unit && value !== null ? <Text variant="unit">{` ${unit}`}</Text> : null}
        </Text>
        {value !== null ? <TrendMark trend={trend} period={period} /> : null}
      </View>
      {line ? (
        // One line: what the number counts. The comparison is the triangle, and in full one tap away.
        <Text variant="caption" color="textSecondary" numberOfLines={1}>
          {line}
        </Text>
      ) : null}
    </PressableScale>
    </FadeUp>
  );
}
