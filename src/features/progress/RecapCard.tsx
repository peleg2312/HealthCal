import { CalendarCheck, ChevronRight } from 'lucide-react-native';
import React from 'react';
import { View } from 'react-native';

import { addDays, formatShortDate } from '@/lib/dates';
import { weekRangeLabel, type WeeklyRecap } from '@/lib/insights';
import { useTheme } from '@/theme';
import { Badge, Card, PressableScale, Text } from '@/ui';

import { go } from './parts';

/**
 * Compact entry to the weekly check-in (/recap): last week's win in one line,
 * plus links to earlier weeks.
 */
export function RecapCard({ recap, earlier, unseen }: { recap: WeeklyRecap; earlier: string[]; unseen: boolean }) {
  const { colors, spacing, radius } = useTheme();
  const range = weekRangeLabel(recap.weekStart, recap.weekEnd);
  return (
    <Card testID="progress-recap" style={{ gap: spacing.sm }}>
      <PressableScale
        testID="progress-recap-open"
        onPress={() => go(`/recap?week=${recap.weekStart}`)}
        accessibilityLabel={`Weekly check-in, ${recap.label}, ${range}. ${recap.win}`}
        scaleTo={0.985}
        style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 44 }}>
        <View style={{ width: 40, height: 40, borderRadius: radius.sm, backgroundColor: `${colors.carbs}22`, alignItems: 'center', justifyContent: 'center' }}>
          <CalendarCheck size={20} color={colors.carbs} />
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <Text variant="h3" numberOfLines={1} style={{ flexShrink: 1 }}>
              Weekly check-in
            </Text>
            {unseen ? <Badge label="New" color={colors.carbs} /> : null}
          </View>
          <Text variant="caption" color="textSecondary" numberOfLines={1}>
            {recap.label} · {range}
          </Text>
          <Text variant="body" numberOfLines={2} style={{ marginTop: 2 }}>
            {recap.win}
          </Text>
        </View>
        <ChevronRight size={20} color={colors.textTertiary} />
      </PressableScale>
      {earlier.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingLeft: 52 }}>
          {earlier.slice(0, 2).map((w) => (
            <PressableScale
              key={w}
              testID={`progress-recap-week-${w}`}
              onPress={() => go(`/recap?week=${w}`)}
              accessibilityLabel={`Check-in for the week of ${formatShortDate(w)}`}
              style={{ minHeight: 36, justifyContent: 'center', paddingHorizontal: spacing.md, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt }}>
              <Text variant="caption" color="textSecondary">
                {weekRangeLabel(w, addDays(w, 6))}
              </Text>
            </PressableScale>
          ))}
        </View>
      ) : null}
    </Card>
  );
}
