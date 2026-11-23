import React from 'react';
import { useWindowDimensions, View } from 'react-native';

import { CHART_CAPTION, type TrainingOverview } from '@/lib/trainingLoad';
import { useTheme } from '@/theme';
import { BarChart, Sheet, Text } from '@/ui';

import { WHO_WEEKLY_MINUTES } from './build';
import { LoadMark } from './LoadMark';

/**
 * The training overview behind Train's line (`train-load-info`, or the guideline line's info cup
 * when there is no state): the title, the numbers and at most one next step, the three-zone mark,
 * the last four 7-day blocks and this one against WHO's 150 to 300, the counts, and the honest
 * sentences. Every word comes from `trainingOverview` (src/lib/trainingLoad.ts); this only places it.
 * With too little history it says so and still shows the last 7 days' minutes and the chart.
 */
export function TrainingLoadSheet({ overview: o, visible, onClose }: { overview: TrainingOverview; visible: boolean; onClose: () => void }) {
  const { colors, spacing } = useTheme();
  // Under 360 px the body never fits, so the chart is drawn taller and the sheet clearly scrolls
  // (a body that scrolls by a few lines reads as cut); from 360 the shorter chart lets it fit.
  const narrow = useWindowDimensions().width < 360;
  return (
    <Sheet visible={visible} onClose={onClose} title={o.title ?? 'Last 7 days'}>
      <View style={{ gap: spacing.md }} testID="train-load-sheet">
        {o.lead ? (
          <Text variant="bodyStrong" testID="train-load-lead">
            {o.lead}
          </Text>
        ) : null}
        <View style={{ gap: spacing.xs }} testID="train-load-lines">
          {o.lines.map((line, i) => (
            <Text key={i} variant="body" color={i === 0 ? 'text' : 'textSecondary'} testID={i === 0 ? 'train-load-numbers' : undefined}>
              {line}
            </Text>
          ))}
        </View>
        {o.position ? <LoadMark position={o.position} size="large" testID="train-load-mark" /> : null}
        <View style={{ gap: spacing.sm }}>
          {/* Each column of the kit's chart is drawn in a box 24 px wider on each side than its slot (room for the
              pour): the inset keeps those boxes inside the sheet's side padding. */}
          <View style={{ paddingHorizontal: 24 }}>
            <BarChart
              testID="train-load-chart"
              data={o.blocks.map((b) => ({ label: b.label, value: b.minutes, detail: b.detail }))}
              color={colors.exercise}
              band={{ from: WHO_WEEKLY_MINUTES, to: WHO_WEEKLY_MINUTES * 2 }}
              goalKind="reach"
              highlightIndex={o.blocks.length - 1}
              height={narrow ? 150 : 108}
            />
          </View>
          <Text variant="caption" color="textSecondary">
            {CHART_CAPTION}
          </Text>
        </View>
        <Text variant="body" testID="train-load-counts">
          {o.countsLine}
        </Text>
        <View style={{ gap: spacing.sm }} testID="train-load-honest">
          {o.honest.map((line, i) => (
            <Text key={i} variant="caption" color="textSecondary">
              {line}
            </Text>
          ))}
        </View>
      </View>
    </Sheet>
  );
}
