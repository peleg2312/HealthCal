import { ArrowUp } from 'lucide-react-native';
import React from 'react';

import { cupFor, useTheme } from '@/theme';
import { PressableScale } from '@/ui';

/** The send cup matches the field's one-line height. */
const SIZE = 50;

/**
 * The composer's send cup (fix X8), 50 px to match the field. Idle (no words, a question on its way,
 * or no backend): an outline cup in every look, `surface` with the `vesselEdge` outline and a
 * `textTertiary` arrow, never a dimmed primary. With words and a tap that does something: the filled
 * `primary` cup. The same 1.5 px edge in both, so nothing moves when it changes. An idle cup does
 * nothing when tapped.
 */
export function SendCup({ active, onPress, accessibilityLabel, testID }: { active: boolean; onPress: () => void; accessibilityLabel: string; testID?: string }) {
  const { colors } = useTheme();
  return (
    <PressableScale
      testID={testID}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !active }}
      onPress={active ? onPress : undefined}
      disabled={!active}
      dimDisabled={false}
      scaleTo={0.92}
      style={{
        width: SIZE,
        height: SIZE,
        ...cupFor(SIZE),
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: active ? colors.primary : colors.surface,
        borderWidth: 1.5,
        borderColor: active ? colors.primary : colors.vesselEdge,
      }}>
      <ArrowUp size={20} color={active ? colors.onPrimary : colors.textTertiary} strokeWidth={2.2} />
    </PressableScale>
  );
}
