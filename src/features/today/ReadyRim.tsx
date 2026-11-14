import React from 'react';
import { View } from 'react-native';

import { useTheme } from '@/theme';

/**
 * Day one: a dashed level line across the open top of the empty hero cup, at
 * the budget, so the cup reads "ready to fill" rather than unfinished. Drawn as
 * separate dashes (a dashed one-sided border is unreliable on iOS). It lies over
 * the top of a `Vessel` placed at the top left of the same parent; it leaves as
 * soon as the first entry starts the pour.
 */
export function ReadyRim({ width }: { width: number }) {
  const { colors } = useTheme();
  const dash = 6;
  const gap = 4;
  const count = Math.max(2, Math.floor((width + gap) / (dash + gap)));
  return (
    <View
      pointerEvents="none"
      testID="today-ready-rim"
      style={{ position: 'absolute', left: 0, top: -1, width, height: 2.5, flexDirection: 'row', justifyContent: 'space-between' }}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={{ width: dash, height: 2.5, borderRadius: 1, backgroundColor: colors.rim }} />
      ))}
    </View>
  );
}
