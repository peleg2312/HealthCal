import React from 'react';
import { View } from 'react-native';

import { formatShortDate } from '@/lib/dates';
import type { Milestone } from '@/lib/insights';
import { useTheme } from '@/theme';
import { MiniCup, Text } from '@/ui';

import { SectionCard } from './parts';

/**
 * Milestones as cups: a reached one is a full cup, one still to come is filled
 * to how close it is. Rows share the card, divided by hairlines.
 */
export function MilestonesCard({ milestones }: { milestones: Milestone[] }) {
  const { colors, spacing } = useTheme();
  const doneAll = milestones.filter((m) => m.achieved).sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
  const done = doneAll.slice(0, 4);
  const next = milestones
    .filter((m) => !m.achieved)
    .sort((a, b) => b.current / b.goal - a.current / a.goal)
    .slice(0, 3);
  return (
    <SectionCard
      testID="progress-milestones"
      title="Milestones"
      subtitle={`${doneAll.length} of ${milestones.length} reached${doneAll.length > done.length ? ', latest shown' : ''}`}>
      {done.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: spacing.md }}>
          {done.map((m, i) => (
            <View
              key={m.id}
              testID={`milestone-${m.id}`}
              accessible
              accessibilityLabel={`Reached: ${m.title}${m.date ? `, ${formatShortDate(m.date)}` : ''}`}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.md,
                width: '50%',
                paddingLeft: i % 2 ? spacing.md : 0,
                paddingRight: i % 2 ? 0 : spacing.md,
                borderLeftWidth: i % 2 ? 1 : 0,
                borderLeftColor: colors.border,
              }}>
              <MiniCup progress={1} color={colors.primary} width={22} height={28} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text variant="label" numberOfLines={2}>
                  {m.title}
                </Text>
                {m.date ? (
                  <Text variant="caption" color="textSecondary">
                    {formatShortDate(m.date)}
                  </Text>
                ) : null}
              </View>
            </View>
          ))}
        </View>
      ) : null}
      {next.length ? (
        <View style={{ gap: spacing.md, borderTopWidth: done.length ? 1 : 0, borderTopColor: colors.border, paddingTop: done.length ? spacing.md : 0 }}>
          <Text variant="overline">Up next</Text>
          {next.map((m) => {
            const pct = Math.round((m.current / m.goal) * 100);
            return (
              <View key={m.id} testID={`milestone-${m.id}`} accessible accessibilityLabel={`${m.title}, ${pct}% of the way. ${m.detail}`} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                <MiniCup progress={Math.min(0.999, m.current / m.goal)} color={colors.primary} width={22} height={28} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text variant="label">{m.title}</Text>
                  <Text variant="caption" color="textSecondary">
                    {m.detail}
                  </Text>
                </View>
                <Text variant="numM" style={{ fontSize: 17, lineHeight: 22 }}>
                  {pct}
                  <Text variant="unit">%</Text>
                </Text>
              </View>
            );
          })}
        </View>
      ) : null}
    </SectionCard>
  );
}
