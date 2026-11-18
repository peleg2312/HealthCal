import { router } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import React from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

import { useTheme } from '@/theme';
import { PressableScale, Text } from '@/ui';

import { SPREAD_HINT_TEXT, markSpreadHintDone, useSpreadHint } from './spreadHint';

/**
 * The "over 7 days" hint as a small caption row that opens Goals (./spreadHint says when it shows).
 * Place it as a sibling of other controls, never inside another pressable.
 */
export function SpreadHint({ testID, style }: { testID: string; style?: StyleProp<ViewStyle> }) {
  const { colors, spacing } = useTheme();
  const show = useSpreadHint();
  if (!show) return null;
  return (
    <PressableScale
      testID={testID}
      scaleTo={0.98}
      accessibilityRole="link"
      accessibilityLabel={`${SPREAD_HINT_TEXT} Opens Goals`}
      onPress={() => {
        markSpreadHintDone();
        // Opened at the choice ("How the budget works" is the last block on Goals), so the tap lands on what it names.
        router.push('/settings/goals?section=exercise');
      }}
      style={[{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 44 }, style]}>
      <Text variant="caption" color="textSecondary" style={{ flex: 1, minWidth: 0 }}>
        {SPREAD_HINT_TEXT}
      </Text>
      <ChevronRight size={18} color={colors.textTertiary} strokeWidth={1.9} />
    </PressableScale>
  );
}
