import React from 'react';
import { View } from 'react-native';

import { trainingOverview, type LoadSession } from '@/lib/trainingLoad';
import { useTheme } from '@/theme';
import type { ISODate } from '@/types';
import { BarChart, Text } from '@/ui';

import { TRAINING_CARD_OVERLINE } from './words';

/** The WHO guideline's weekly band, as Train's overview draws it. */
const BAND = { from: 150, to: 300 } as const;

/**
 * "How is my training week?" answered live (the newest phone answer of today): the overview's title,
 * its lead, its numbers, the five weeks as the overview's chart and the counts. Every word is
 * `trainingOverview`'s (src/lib/trainingLoad.ts), the same as Train's sheet; this only places it.
 */
export function TrainingCard({ activities, today }: { activities: readonly LoadSession[]; today: ISODate }) {
  const { colors, spacing } = useTheme();
  const o = trainingOverview(activities, today);
  return (
    <View style={{ gap: spacing.sm }}>
      <Text variant="overline" color="textSecondary">
        {TRAINING_CARD_OVERLINE}
      </Text>
      {o.title ? <Text variant="h3">{o.title}</Text> : null}
      {o.lead ? <Text variant="bodyStrong">{o.lead}</Text> : null}
      {o.lines[0] ? (
        <Text variant="body" testID="coach-training-numbers">
          {o.lines[0]}
        </Text>
      ) : null}
      {/* Each column is drawn in a box 24 px wider on each side than its slot (room for the pour): the inset keeps them inside the card. */}
      <View style={{ paddingHorizontal: 24, marginTop: spacing.xs }}>
        <BarChart
          testID="coach-training-chart"
          data={o.blocks.map((b) => ({ label: b.label, value: b.minutes, detail: b.detail }))}
          color={colors.exercise}
          band={BAND}
          goalKind="reach"
          highlightIndex={o.blocks.length - 1}
          height={96}
        />
      </View>
      {o.countsLine ? (
        <Text variant="caption" color="textSecondary">
          {o.countsLine}
        </Text>
      ) : null}
    </View>
  );
}
