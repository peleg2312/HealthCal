import { Award, Medal } from 'lucide-react-native';
import React from 'react';
import { View } from 'react-native';

import { formatShortDate } from '@/lib/dates';
import type { Milestone } from '@/lib/insights';
import { useTheme } from '@/theme';
import { ProgressBar, Text } from '@/ui';

import { SectionCard } from './parts';

export function MilestonesCard({ milestones }: { milestones: Milestone[] }) {
  const { colors, spacing, radius } = useTheme();
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
      subtitle={`${doneAll.length} of ${milestones.length} reached${doneAll.length > done.length ? ', latest shown' : ''}`}
      color={colors.carbs}
      icon={<Award size={18} color={colors.carbs} />}>
      {done.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          {done.map((m) => (
            <View
              key={m.id}
              testID={`milestone-${m.id}`}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.sm,
                paddingVertical: spacing.sm,
                paddingHorizontal: spacing.md,
                borderRadius: radius.md,
                backgroundColor: `${colors.carbs}1A`,
                flexGrow: 1,
                flexBasis: '45%',
              }}>
              <Medal size={18} color={colors.carbs} />
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
        <View style={{ gap: spacing.md }}>
          <Text variant="overline" color="textTertiary">
            UP NEXT
          </Text>
          {next.map((m) => (
            <View key={m.id} testID={`milestone-${m.id}`} style={{ gap: 6 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text variant="label">{m.title}</Text>
                  <Text variant="caption" color="textSecondary">
                    {m.detail}
                  </Text>
                </View>
                <Text variant="caption" color="textSecondary" tabular>
                  {Math.round((m.current / m.goal) * 100)}%
                </Text>
              </View>
              <ProgressBar progress={m.current / m.goal} color={colors.carbs} height={6} />
            </View>
          ))}
        </View>
      ) : null}
    </SectionCard>
  );
}
