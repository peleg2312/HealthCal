import { ChevronDown, ChevronRight, ChevronUp, CircleCheck, Info, Lightbulb } from 'lucide-react-native';
import React, { useState } from 'react';
import { View } from 'react-native';

import type { Insight } from '@/lib/insights';
import { useTheme } from '@/theme';
import { Button, Divider, PressableScale, Text } from '@/ui';

import { go, SectionCard } from './parts';

/** The top-ranked insight, with the rest one tap away. */
export function InsightsCard({ insights, rangeDays }: { insights: Insight[]; rangeDays: number }) {
  const { colors, spacing } = useTheme();
  const [open, setOpen] = useState(false);
  if (!insights.length) return null;
  const shown = open ? insights : insights.slice(0, 1);
  const more = insights.length - 1;
  return (
    <SectionCard
      testID="progress-insights"
      title="Insights"
      subtitle={`From your last ${rangeDays} days`}>
      <View style={{ gap: spacing.md }}>
        {shown.map((ins, i) => (
          <React.Fragment key={ins.id}>
            {i > 0 ? <Divider /> : null}
            <InsightRow insight={ins} />
          </React.Fragment>
        ))}
      </View>
      {more > 0 ? (
        <PressableScale
          testID="progress-insights-toggle"
          onPress={() => setOpen((o) => !o)}
          accessibilityLabel={open ? 'Show only the top insight' : `Show all ${insights.length} insights`}
          accessibilityState={{ expanded: open }}
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44, borderTopWidth: 1, borderTopColor: colors.border, marginBottom: -spacing.sm }}>
          <Text variant="label">{open ? 'Show fewer' : `All ${insights.length} insights`}</Text>
          {open ? <ChevronUp size={18} color={colors.textSecondary} /> : <ChevronDown size={18} color={colors.textSecondary} />}
        </PressableScale>
      ) : null}
    </SectionCard>
  );
}

function InsightRow({ insight }: { insight: Insight }) {
  const { colors, spacing } = useTheme();
  const tone =
    insight.tone === 'positive'
      ? { color: colors.success, Icon: CircleCheck }
      : insight.tone === 'attention'
        ? { color: colors.warningInk, Icon: Lightbulb }
        : { color: colors.textSecondary, Icon: Info };
  return (
    <View testID={`insight-${insight.id}`} style={{ flexDirection: 'row', gap: spacing.md }}>
      <View style={{ width: 20, alignItems: 'center', paddingTop: 1 }}>
        <tone.Icon size={19} color={tone.color} strokeWidth={1.9} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text variant="bodyStrong">{insight.title}</Text>
        <Text variant="body" color="textSecondary" style={{ fontSize: 14, lineHeight: 20 }}>
          {insight.body}
        </Text>
        {insight.action ? (
          // A small kit ghost button (as Train's and Weight's), not an underlined text link; drawn without
          // side padding so its words line up with the insight's text above it.
          <Button
            testID={`insight-${insight.id}-action`}
            title={insight.action.label}
            variant="ghost"
            size="sm"
            full={false}
            iconRight={<ChevronRight size={16} color={colors.primaryInk} strokeWidth={2.2} />}
            onPress={() => go(insight.action!.route)}
            style={{ paddingHorizontal: 0, marginTop: spacing.xs }}
          />
        ) : null}
      </View>
    </View>
  );
}
