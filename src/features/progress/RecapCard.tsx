import { CalendarCheck, ChevronRight } from 'lucide-react-native';
import React from 'react';
import { View } from 'react-native';

import { addDays } from '@/lib/dates';
import { weekRangeLabel, type WeeklyRecap } from '@/lib/insights';
import { useTheme } from '@/theme';
import { Badge, Card, Chip, PressableScale, Text } from '@/ui';

import { go } from './parts';

/**
 * Compact entry to the weekly check-in (/recap): last week's win in one line,
 * plus links to earlier weeks.
 */
export function RecapCard({ recap, earlier, unseen }: { recap: WeeklyRecap; earlier: string[]; unseen: boolean }) {
  const { colors, spacing } = useTheme();
  const range = weekRangeLabel(recap.weekStart, recap.weekEnd);
  return (
    <Card testID="progress-recap" style={{ gap: spacing.sm }}>
      <PressableScale
        testID="progress-recap-open"
        onPress={() => go(`/recap?week=${recap.weekStart}`)}
        accessibilityLabel={`Weekly check-in, ${recap.label}, ${range}. ${recap.win}`}
        scaleTo={0.985}
        style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 44 }}>
        <CalendarCheck size={22} color={colors.text} strokeWidth={1.9} />
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          {/* A no-break hyphen keeps "check-in" whole; the badge wraps under the title when there is no room beside it. */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: spacing.sm, rowGap: 2 }}>
            <Text variant="h3" style={{ flexShrink: 1 }}>
              Weekly check{'\u2011'}in
            </Text>
            {unseen ? <Badge label="New" color={colors.primary} /> : null}
          </View>
          <Text variant="caption" color="textSecondary">
            {recap.label} · {range}
          </Text>
          <Text variant="body" style={{ marginTop: 2 }}>
            {recap.win}
          </Text>
        </View>
        <ChevronRight size={18} color={colors.textSecondary} strokeWidth={1.9} />
      </PressableScale>
      {earlier.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm, paddingLeft: 34, paddingTop: spacing.xs }}>
          <Text variant="caption" color="textSecondary">
            Earlier
          </Text>
          {earlier.slice(0, 2).map((w) => (
            <Chip
              key={w}
              testID={`progress-recap-week-${w}`}
              onPress={() => go(`/recap?week=${w}`)}
              label={weekRangeLabel(w, addDays(w, 6))}
            />
          ))}
        </View>
      ) : null}
    </Card>
  );
}
