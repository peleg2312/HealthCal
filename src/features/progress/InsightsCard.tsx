import { ChevronRight, CircleCheck, Info, Lightbulb, Sparkles } from 'lucide-react-native';
import React from 'react';
import { View } from 'react-native';

import type { Insight } from '@/lib/insights';
import { useTheme } from '@/theme';
import { Divider, PressableScale, Text } from '@/ui';

import { go, SectionCard } from './parts';

export function InsightsCard({ insights, rangeDays }: { insights: Insight[]; rangeDays: number }) {
  const { colors, spacing } = useTheme();
  return (
    <SectionCard
      testID="progress-insights"
      title="Insights"
      subtitle={`From your last ${rangeDays} days`}
      color={colors.primary}
      icon={<Sparkles size={18} color={colors.primary} />}>
      <View style={{ gap: spacing.md }}>
        {insights.map((ins, i) => (
          <React.Fragment key={ins.id}>
            {i > 0 ? <Divider /> : null}
            <InsightRow insight={ins} />
          </React.Fragment>
        ))}
      </View>
    </SectionCard>
  );
}

function InsightRow({ insight }: { insight: Insight }) {
  const { colors, spacing } = useTheme();
  const tone =
    insight.tone === 'positive'
      ? { color: colors.success, Icon: CircleCheck }
      : insight.tone === 'attention'
        ? { color: colors.warning, Icon: Lightbulb }
        : { color: colors.water, Icon: Info };
  return (
    <View testID={`insight-${insight.id}`} style={{ flexDirection: 'row', gap: spacing.md }}>
      <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: `${tone.color}22`, alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
        <tone.Icon size={16} color={tone.color} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text variant="bodyStrong">{insight.title}</Text>
        <Text variant="body" color="textSecondary" style={{ fontSize: 14, lineHeight: 20 }}>
          {insight.body}
        </Text>
        {insight.action ? (
          <PressableScale
            testID={`insight-${insight.id}-action`}
            onPress={() => go(insight.action!.route)}
            accessibilityLabel={insight.action.label}
            hitSlop={8}
            style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', minHeight: 32, gap: 2 }}>
            <Text variant="label" color="primary">
              {insight.action.label}
            </Text>
            <ChevronRight size={15} color={colors.primary} />
          </PressableScale>
        ) : null}
      </View>
    </View>
  );
}
