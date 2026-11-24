import { router } from 'expo-router';
import React from 'react';
import { View } from 'react-native';

import { AiGlyph } from '@/features/ai/mark';
import { useTheme } from '@/theme';
import { IconButton } from '@/ui';

import { useCoachSession } from './session';
import { COACH_OPEN_LABEL, COACH_OPEN_NEW } from './words';

/** The glyph's size in the cup, and the unread line's width. */
const GLYPH = 20;
const UNREAD_W = 12;
/** The bubble's tail ends at 20 of the glyph's 24 grid, its stroke half of 1.9: the line starts 3 px under that (28 in a 36 px cup). */
const unreadTop = (size: number) => Math.round((size - GLYPH) / 2 + (20 * GLYPH) / 24 + (1.9 * GLYPH) / 48 + 3);

/**
 * The way into the coach: the first of the three cups on every tab header (Coach, Friends,
 * profile). One tap raises the coach from the bottom over the tab; its X comes back to the
 * same place. Its mark is the coach's own glyph (`AiGlyph` 'coach': the speech cup with the
 * AI's drop inside), so it reads as the AI coach, not as messages. While an answer arrived with
 * the coach closed, a short level line (the `rim`, the app's "poured in" mark) lies under the
 * bubble, low in the cup, clear of the glyph's lines and its drop; there is never a number.
 * It is the one accented cup of the three (a `primarySoft` fill and a `primaryInk` glyph, the
 * border as on the others); Friends and the profile tile stay neutral. The level line on that
 * tint is held to 3:1 in `contrast.test.ts`.
 */
export function CoachEntry({ testID, size = 44, hitSlop }: { testID: string; size?: number; hitSlop?: { top: number; bottom: number; left: number; right: number } }) {
  const { colors } = useTheme();
  const unread = useCoachSession((s) => s.unread);
  return (
    <View>
      <IconButton testID={testID} size={size} hitSlop={hitSlop} accessibilityLabel={unread ? COACH_OPEN_NEW : COACH_OPEN_LABEL} onPress={() => router.push('/coach' as never)}
        style={{ backgroundColor: colors.primarySoft }}>
        <AiGlyph name="coach" size={GLYPH} color={colors.primaryInk} strokeWidth={1.9} />
      </IconButton>
      {unread ? (
        // A level line poured into the cup under the bubble, taking no touches, so the whole cup stays the button.
        // The bubble holds the AI's drop, so there is no room inside it; drawn across the cup's top it cut the
        // outline and read as a broken icon. It lies 3 px under the bubble's tail, centred, inside the cup's walls.
        <View
          pointerEvents="none"
          testID={`${testID}-unread`}
          style={{ position: 'absolute', top: unreadTop(size), left: (size - UNREAD_W) / 2, width: UNREAD_W, height: 3, borderRadius: 1, backgroundColor: colors.rim }}
        />
      ) : null}
    </View>
  );
}
