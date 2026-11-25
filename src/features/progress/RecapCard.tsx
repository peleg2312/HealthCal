import { ChevronRight } from 'lucide-react-native';
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
      {/* The title is the card's heading (level 2, as SectionTitle's), outside the control that opens the check-in:
          a heading inside a button is not a heading to a screen reader. A no-break hyphen keeps "check-in" whole.
          No icon before the title, so the badge fits beside it at 320 px; should it ever wrap (a much larger text
          size), it keeps 8 px from the title. */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: spacing.sm, rowGap: spacing.sm, marginBottom: -6 }}>
        <Text variant="h3" accessibilityRole="header" {...({ 'aria-level': 2 } as object)} style={{ flexShrink: 1 }}>
          Weekly check{'\u2011'}in
        </Text>
        {unseen ? <Badge label="New" color={colors.primary} /> : null}
      </View>
      <PressableScale
        testID="progress-recap-open"
        onPress={() => go(`/recap?week=${recap.weekStart}`)}
        // The words it shows first (WCAG 2.5.3), then where it leads.
        accessibilityLabel={`${recap.label}, ${range}. ${recap.win} Open the weekly check-in`}
        scaleTo={0.985}
        style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 44 }}>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
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
        // The chips wrap under each other, never back under the word "Earlier".
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, paddingTop: spacing.xs }}>
          <Text variant="caption" color="textSecondary" style={{ lineHeight: 32 }}>
            Earlier
          </Text>
          <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {earlier.slice(0, 2).map((w) => (
              <Chip
                key={w}
                testID={`progress-recap-week-${w}`}
                onPress={() => go(`/recap?week=${w}`)}
                label={weekRangeLabel(w, addDays(w, 6))}
              />
            ))}
          </View>
        </View>
      ) : null}
    </Card>
  );
}
