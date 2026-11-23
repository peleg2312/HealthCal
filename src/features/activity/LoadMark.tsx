import React from 'react';
import { View } from 'react-native';

import { POSITION_WORDS, POSITIONS, type LoadPosition } from '@/lib/trainingLoad';
import { useTheme } from '@/theme';
import { MiniCup, Text } from '@/ui';

/**
 * Where the last 7 days sit against the person's own recent weeks, as three small cups side by
 * side: lighter, usual, more. The cup for the position is filled in the exercise colour (with the
 * kit's level line), the other two are empty cups with the cup outline. Never amber: more than
 * usual is information, not a warning. Drawn with the kit's `MiniCup`, so the cup rules hold.
 *
 * `size="small"` is the 36 px mark beside the title on Train's week card; `size="large"` is the
 * sheet's three zones with "Lighter · Usual · More" under them.
 */
export function LoadMark({ position, size = 'small', testID }: { position: LoadPosition; size?: 'small' | 'large'; testID?: string }) {
  const { colors, spacing } = useTheme();
  const label = `${POSITION_WORDS[position]}, of lighter, usual and more`;
  if (size === 'small') {
    return (
      <View testID={testID} accessible accessibilityLabel={label} style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 3, width: 36 }}>
        {POSITIONS.map((p) => (
          <MiniCup key={p} progress={p === position ? 1 : 0} color={colors.exercise} width={10} height={16} animate={false} />
        ))}
      </View>
    );
  }
  return (
    <View testID={testID} accessible accessibilityLabel={label} style={{ flexDirection: 'row', gap: spacing.sm }}>
      {POSITIONS.map((p) => (
        <View key={p} style={{ flex: 1, alignItems: 'center', gap: 6 }}>
          <MiniCup progress={p === position ? 1 : 0} color={colors.exercise} animate={false} />
          <Text variant="label" color={p === position ? 'text' : 'textSecondary'}>
            {POSITION_WORDS[p]}
          </Text>
        </View>
      ))}
    </View>
  );
}
