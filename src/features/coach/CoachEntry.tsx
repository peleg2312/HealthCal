import { router } from 'expo-router';
import { MessageCircle } from 'lucide-react-native';
import React from 'react';
import { View } from 'react-native';

import { useTheme } from '@/theme';
import { IconButton } from '@/ui';

import { useCoachSession } from './session';
import { COACH_OPEN_LABEL, COACH_OPEN_NEW } from './words';

/**
 * The way into the coach: the first of the three cups on every tab header (Coach, Friends,
 * profile). One tap raises the coach from the bottom over the tab; its X comes back to the
 * same place. While an answer arrived with the coach closed, a short level line (the `rim`,
 * the app's "poured in" mark) lies inside the speech bubble; there is never a number.
 * It is the one accented cup of the three (a `primarySoft` fill and a `primaryInk` bubble, the
 * border as on the others), so it reads as the coach rather than as messages; Friends and the
 * profile tile stay neutral. The level line on that tint is held to 3:1 in `contrast.test.ts`.
 */
export function CoachEntry({ testID, size = 44, hitSlop }: { testID: string; size?: number; hitSlop?: { top: number; bottom: number; left: number; right: number } }) {
  const { colors } = useTheme();
  const unread = useCoachSession((s) => s.unread);
  return (
    <View>
      <IconButton testID={testID} size={size} hitSlop={hitSlop} accessibilityLabel={unread ? COACH_OPEN_NEW : COACH_OPEN_LABEL} onPress={() => router.push('/coach' as never)}
        style={{ backgroundColor: colors.primarySoft }}>
        <MessageCircle size={20} color={colors.primaryInk} strokeWidth={1.9} />
      </IconButton>
      {unread ? (
        // A level line poured into the speech bubble (the icon's round body sits in the cup's middle, about
        // 15 px across), taking no touches, so the whole cup stays the button. Drawn across the cup's top it
        // cut the bubble's outline and read as a broken icon, so it lies inside the bubble instead.
        <View
          pointerEvents="none"
          testID={`${testID}-unread`}
          style={{ position: 'absolute', top: size / 2 - 1, left: (size - 9) / 2 - 0.5, width: 9, height: 3, backgroundColor: colors.rim }}
        />
      ) : null}
    </View>
  );
}
