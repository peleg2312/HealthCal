import { ChevronDown, ChevronRight, ChevronUp, CircleCheck, Info, Lightbulb } from 'lucide-react-native';
import React, { useState } from 'react';
import { View } from 'react-native';

import type { Insight } from '@/lib/insights';
import { useTheme } from '@/theme';
import { Button, Divider, PressableScale, Text } from '@/ui';

import { go, SectionCard } from './parts';

/** The last two words of a short line share a line, so a narrow phone never leaves one word alone ("gap."). */
const noWidow = (text: string) => text.replace(/ (\S+)$/, '\u00A0$1');

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

/**
 * One insight in two short lines: the finding (bold) and the one step under it. The full numbers are
 * one tap away ("The numbers", beside the action when there is one), as a quieter paragraph under the step.
 */
function InsightRow({ insight }: { insight: Insight }) {
  const { colors, spacing } = useTheme();
  const [open, setOpen] = useState(false);
  const tone =
    insight.tone === 'positive'
      ? { color: colors.success, Icon: CircleCheck }
      : insight.tone === 'attention'
        ? { color: colors.warningInk, Icon: Lightbulb }
        : { color: colors.textSecondary, Icon: Info };
  const Chevron = open ? ChevronUp : ChevronDown;
  return (
    <View testID={`insight-${insight.id}`} style={{ flexDirection: 'row', gap: spacing.md }}>
      <View style={{ width: 20, alignItems: 'center', paddingTop: 1 }}>
        <tone.Icon size={19} color={tone.color} strokeWidth={1.9} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text variant="bodyStrong">{noWidow(insight.title)}</Text>
        <Text variant="body" color="textSecondary" style={{ fontSize: 14, lineHeight: 20 }} testID={`insight-${insight.id}-step`}>
          {noWidow(insight.step)}
        </Text>
        {open ? (
          // The numbers behind the finding, as a quieter paragraph under the step.
          <Text variant="caption" color="textSecondary" testID={`insight-${insight.id}-body`} style={{ marginTop: spacing.sm, fontSize: 13, lineHeight: 19 }}>
            {insight.body}
          </Text>
        ) : null}
        {/* The action and the numbers' toggle side by side: two buttons, never one inside the other. */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, marginTop: spacing.xs }}>
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
              style={{ paddingHorizontal: 0 }}
            />
          ) : null}
          <PressableScale
            testID={`insight-${insight.id}-numbers`}
            onPress={() => setOpen((o) => !o)}
            scaleTo={0.97}
            accessibilityRole="button"
            accessibilityLabel={open ? `Hide the numbers: ${insight.title}` : `The numbers: ${insight.title}`}
            accessibilityState={{ expanded: open }}
            hitSlop={6}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 36, paddingHorizontal: insight.action ? spacing.xs : 0 }}>
            <Text variant="label" color="textSecondary">
              {open ? 'Hide the numbers' : 'The numbers'}
            </Text>
            <Chevron size={16} color={colors.textSecondary} strokeWidth={2} />
          </PressableScale>
        </View>
      </View>
    </View>
  );
}
