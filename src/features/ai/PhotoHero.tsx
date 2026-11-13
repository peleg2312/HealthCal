import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { View } from 'react-native';

import { useTheme } from '@/theme';
import type { AiFoodItem } from '@/types';
import { PressableScale, Text } from '@/ui';

/*
 * The photo is not themed, so text over it uses fixed white on a dark scrim in
 * every theme, the same way the barcode viewfinder does. These are the only
 * fixed colours here.
 */
const ON_PHOTO = '#FFFFFF';
const ON_PHOTO_SOFT = 'rgba(255,255,255,0.82)';
const SCRIM = ['rgba(0,0,0,0)', 'rgba(0,0,0,0.28)', 'rgba(0,0,0,0.78)'] as const;
const PILL_BG = 'rgba(255,255,255,0.94)';
const PILL_TEXT = '#14161A';

/**
 * The meal photo as the head of the review: dish name, total and range on a
 * scrim, and the detected items as pills along the bottom edge. Pills are not
 * pinned onto the food: the analysis returns no positions, and invented ones
 * would look more certain than the estimate is.
 */
export function PhotoHero({
  uri,
  dish,
  kcal,
  range,
  items,
  onItemPress,
}: {
  uri: string;
  dish: string;
  kcal: number;
  range: string;
  items: { key: string; item: AiFoodItem }[];
  onItemPress: (key: string) => void;
}) {
  const { radius, spacing, colors } = useTheme();
  return (
    <View
      testID="ai-photo-hero"
      style={{ width: '100%', aspectRatio: 4 / 3, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.surfaceAlt }}>
      <Image source={{ uri }} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }} contentFit="cover" accessibilityLabel="Your meal photo" />
      <LinearGradient colors={SCRIM} locations={[0.25, 0.5, 1]} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }} pointerEvents="none" />
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: spacing.lg, gap: spacing.sm }}>
        <Text variant="h3" color={ON_PHOTO} numberOfLines={2} testID="ai-dish">
          {dish}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
          <Text variant="numXL" color={ON_PHOTO} tabular testID="ai-total-kcal">
            {kcal}
          </Text>
          <Text variant="title" color={ON_PHOTO_SOFT}>
            kcal
          </Text>
          <Text variant="label" color={ON_PHOTO_SOFT} testID="ai-total-range" style={{ marginLeft: spacing.xs }}>
            {range}
          </Text>
        </View>
        {items.length > 0 ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {items.map(({ key, item }, i) => (
              <PressableScale
                key={key}
                testID={`ai-hero-item-${i}`}
                accessibilityLabel={`${item.name}, ${item.kcal} kcal. Show in the list`}
                onPress={() => onItemPress(key)}
                hitSlop={6}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 4, height: 30, paddingHorizontal: 10, borderRadius: radius.pill, backgroundColor: PILL_BG, maxWidth: '100%' }}>
                <Text variant="caption" color={PILL_TEXT} numberOfLines={1} style={{ flexShrink: 1, fontWeight: '600' }}>
                  {shortName(item.name)}
                </Text>
                <Text variant="caption" color={PILL_TEXT} tabular style={{ opacity: 0.6 }}>
                  {item.kcal}
                </Text>
              </PressableScale>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

/** "Rice, white, cooked" reads as "Rice" on a pill. */
function shortName(name: string): string {
  const first = name.split(/[,(]/)[0].trim();
  return first.length > 22 ? `${first.slice(0, 21)}…` : first || name;
}
