import { router } from 'expo-router';
import { ChevronRight, X } from 'lucide-react-native';
import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme';
import { IconButton, PressableScale, Text } from '@/ui';

import { SPREAD_HINT_TEXT, markSpreadHintDone, useSpreadHint } from './spreadHint';

/**
 * The "over 7 days" hint as a small row that opens Goals (./spreadHint says when it shows: at most three visits), with an X
 * beside it (`<testID>-close`, a 44 px clear cup) that puts it away in place, without leaving the screen.
 * The two are siblings in one row, never one pressable inside another. Place the row as a sibling of other
 * controls, never inside another pressable.
 */
export function SpreadHint({ testID, style }: { testID: string; style?: StyleProp<ViewStyle> }) {
  const { colors, spacing } = useTheme();
  const show = useSpreadHint();
  if (!show) return null;
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }, style]}>
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
        style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 44 }}>
        {/* Two sentences: reading text, body in textSecondary. */}
        <Text variant="body" color="textSecondary" style={{ flex: 1, minWidth: 0 }}>
          {SPREAD_HINT_TEXT}
        </Text>
        <ChevronRight size={18} color={colors.textTertiary} strokeWidth={1.9} />
      </PressableScale>
      {/* Its own way out: the hint is put away on this device, as a tap on it does, and the person stays here. */}
      <IconButton testID={`${testID}-close`} tone="clear" accessibilityLabel="Hide this tip" onPress={markSpreadHintDone}>
        <X size={18} color={colors.textSecondary} strokeWidth={1.9} />
      </IconButton>
    </View>
  );
}
