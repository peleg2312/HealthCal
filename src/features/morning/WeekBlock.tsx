import React from 'react';
import { useWindowDimensions, View } from 'react-native';

import { formatNumber } from '@/lib/units';
import { cup, fonts, useTheme } from '@/theme';
import { FadeUp, Text } from '@/ui';

import type { CoachMessage } from './coach';
import { keepLastWord } from './coachLines';
import type { WeekCells } from './weekCells';
import { WeekCups } from './WeekCups';

/** The coach's lead: Bricolage semibold, a size no heading on the page uses. */
const LEAD_TYPE = { fontFamily: fonts.displaySemibold, fontSize: 20, lineHeight: 26, letterSpacing: -0.2 } as const;
const LEAD_TYPE_NARROW = { ...LEAD_TYPE, fontSize: 18, lineHeight: 24 } as const;

/**
 * The first block of the morning page: one flat cup in the theme's surfaceAlt with the level line
 * (3 px rim) across its top. "Your week" (with the streak when the personal line does not already
 * speak of it, and not in the first week), the personal line, the week in cups (WeekCups) and, as the picture's caption, the
 * coach in three voices: what went well (or a neutral opener) large, then the next step and the
 * first step for today, each its own line. The coach is one accessible element read as its label.
 *
 * With no picture (no food in the drawn week, or only today drawn) the block holds only the
 * personal line and the coach.
 */
export function WeekBlock({ cells, streak, personal, coach, firstWeek }: { cells: WeekCells; streak: number; personal: string | null; coach: CoachMessage; firstWeek: boolean }) {
  const { colors, spacing, radius } = useTheme();
  const width = useWindowDimensions().width;
  const narrow = width < 360;
  const show = cells.show;
  // The streak tag is left out when the personal line already speaks of the streak, and in the first
  // week: a streak counted from days before setup would contradict "Day 2 of your first week".
  const streakTag = show && !firstWeek && streak >= 2 && !(personal ?? '').includes('streak') ? `${formatNumber(streak)}-day streak` : null;
  const hasTop = show || !!personal;

  return (
    <View
      testID="morning-week"
      style={{
        ...cup(radius.card),
        backgroundColor: colors.surfaceAlt,
        borderWidth: 1,
        borderColor: colors.border,
        padding: width >= 390 ? 18 : spacing.lg,
        overflow: 'hidden',
      }}>
      {/* The level line, Pour's signature, across the block's square top. */}
      <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, backgroundColor: colors.rim }} />

      {show ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md }}>
          <Text variant="overline" color="textSecondary" numberOfLines={1} style={{ flexShrink: 1 }}>
            Your week
          </Text>
          {streakTag ? (
            <View testID="morning-streak" style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
              <View style={{ width: 12, height: 3, backgroundColor: colors.rim }} />
              <Text variant="label" color="text" numberOfLines={1}>
                {streakTag}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {personal ? (
        <Text variant="body" color="text" testID="morning-personal" style={show ? { marginTop: spacing.sm } : undefined}>
          {personal}
        </Text>
      ) : null}

      {show ? (
        <View style={{ marginTop: spacing.lg }}>
          <WeekCups cells={cells} />
        </View>
      ) : null}

      {coach.text ? (
        <FadeUp index={1} style={hasTop ? { marginTop: spacing.xl } : undefined}>
          <View testID="morning-coach" accessible accessibilityLabel={coach.label} style={{ gap: spacing.sm }}>
            {coach.opener ?? coach.good ? (
              <Text variant="h3" color="text" testID="morning-coach-lead" style={narrow ? LEAD_TYPE_NARROW : LEAD_TYPE}>
                {keepLastWord((coach.opener ?? coach.good) as string)}
              </Text>
            ) : null}
            {coach.improve ? (
              <Text variant="body" color="text" testID="morning-coach-improve">
                {keepLastWord(coach.improve)}
              </Text>
            ) : null}
            {coach.today ? (
              <Text variant="body" color="text" testID="morning-coach-today">
                {keepLastWord(coach.today)}
              </Text>
            ) : null}
          </View>
        </FadeUp>
      ) : null}
    </View>
  );
}
