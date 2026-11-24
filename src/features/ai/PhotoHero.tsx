import { Image } from 'expo-image';
import React from 'react';
import { View } from 'react-native';

import { cup, useTheme } from '@/theme';
import type { AiFoodItem } from '@/types';
import { AnimatedNumber, Chip, Text } from '@/ui';

import { itemKcalSpoken } from './words';

/**
 * The meal photo as the head of the review: the photo in a cup, then the dish
 * name, the estimated total with its range, and the detected items as chips.
 * Chips are not pinned onto the food: the analysis returns no positions, and
 * invented ones would look more certain than the estimate is.
 */
export function PhotoHero({
  uri,
  dish,
  kcal,
  from,
  range,
  arrival,
  items,
  onItemPress,
}: {
  uri: string;
  dish: string;
  kcal: number;
  /** Where the total starts counting on arrival: the low end of its range, so it never shows a number outside it; none, drawn at once. */
  from?: number;
  range: string;
  /** Which arrival of the estimate this is: the total counts up from `from` once for each, and ticks from the old total after an edit. */
  arrival: number;
  items: { key: string; item: AiFoodItem }[];
  onItemPress: (key: string) => void;
}) {
  const { radius, spacing, colors } = useTheme();
  return (
    <View testID="ai-photo-hero" style={{ ...cup(radius.card), overflow: 'hidden', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
      <View style={{ width: '100%', aspectRatio: 4 / 3, backgroundColor: colors.surfaceAlt }}>
        <Image source={{ uri }} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }} contentFit="cover" accessibilityLabel="Your meal photo" />
      </View>
      <View style={{ padding: 18, gap: spacing.sm }}>
        <Text variant="h3" numberOfLines={2} testID="ai-dish">
          {dish}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
          <AnimatedNumber
            variant="numXL"
            color="caloriesInk"
            tabular
            testID="ai-total-kcal"
            value={kcal}
            from={from}
            format={(n) => `~${Math.round(n)}`}
            memoryKey={`ai-total-${arrival}`}
            style={{ fontSize: 46, lineHeight: 50, letterSpacing: -1.4 }}
          />
          <Text variant="unit" style={{ fontSize: 15 }}>
            kcal
          </Text>
          <Text variant="label" color="textSecondary" testID="ai-total-range" style={{ marginLeft: spacing.xs }}>
            {range}
          </Text>
        </View>
        {items.length > 0 ? (
          // 12 px between the lines: a chip is 44 px tall to touch (6 px above and below its 32), and the areas of two lines meet without one taking the other's taps.
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 8, rowGap: 12, marginTop: 2 }}>
            {items.map(({ key, item }, i) => (
              <Chip
                key={key}
                testID={`ai-hero-item-${i}`}
                // An estimate never shows an exact number: "~248 kcal" drawn, "about 248 kilocalories" heard.
                label={`${shortName(item.name)} · ~${Math.round(item.kcal)} kcal`}
                accessibilityLabel={`${shortName(item.name)}, ${itemKcalSpoken(item.kcal)}`}
                onPress={() => onItemPress(key)}
              />
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

/** "Rice, white, cooked" reads as "Rice" on a chip. */
function shortName(name: string): string {
  const first = name.split(/[,(]/)[0].trim();
  return first.length > 22 ? `${first.slice(0, 21)}…` : first || name;
}
