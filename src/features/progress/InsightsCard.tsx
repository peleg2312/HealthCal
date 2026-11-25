import { ChevronDown, ChevronRight, ChevronUp, Info, Lightbulb, Sprout } from 'lucide-react-native';
import React, { useState } from 'react';
import { View } from 'react-native';

import type { Insight } from '@/lib/insights';
import { useTheme } from '@/theme';
import { Button, Divider, Text } from '@/ui';

import { insightMark } from './insightMark';
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
        // The kit's "show more": a small ghost button centred under the list, as every other list that opens its rest.
        <Button
          testID="progress-insights-toggle"
          title={open ? 'Show fewer' : `Show all ${insights.length} insights`}
          variant="ghost"
          size="sm"
          full={false}
          expanded={open}
          icon={open ? <ChevronUp size={16} color={colors.primaryInk} strokeWidth={2.2} /> : <ChevronDown size={16} color={colors.primaryInk} strokeWidth={2.2} />}
          onPress={() => setOpen((o) => !o)}
          style={{ alignSelf: 'center', marginTop: -spacing.xs, marginBottom: -spacing.xs }}
        />
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
  // One meaning per mark (`insightMark`): a positive finding wears a sprout, never a check (a check means only a
  // day on budget); the amber ink only for a value above its limit; a finding below a goal is an ink lightbulb.
  const mark = insightMark(insight);
  const tone =
    mark === 'sprout'
      ? { color: colors.text, Icon: Sprout }
      : mark === 'above'
        ? { color: colors.warningInk, Icon: Lightbulb }
        : mark === 'act'
          ? { color: colors.text, Icon: Lightbulb }
          : { color: colors.textSecondary, Icon: Info };
  const Chevron = open ? ChevronUp : ChevronDown;
  return (
    <View testID={`insight-${insight.id}`} style={{ flexDirection: 'row', gap: spacing.md }}>
      <View aria-hidden style={{ width: 20, alignItems: 'center', paddingTop: 1 }}>
        <tone.Icon size={19} color={tone.color} strokeWidth={1.9} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text variant="bodyStrong">{noWidow(insight.title)}</Text>
        {/* Reading text at the body size (15 px), never smaller. */}
        <Text variant="body" color="textSecondary" testID={`insight-${insight.id}-step`}>
          {noWidow(insight.step)}
        </Text>
        {open ? (
          // The numbers behind the finding, under the step: reading text, so the body size in the secondary ink.
          <Text variant="body" color="textSecondary" testID={`insight-${insight.id}-body`} style={{ marginTop: spacing.sm }}>
            {insight.body}
          </Text>
        ) : null}
        {/* The action and the numbers' toggle side by side: two buttons, never one inside the other. At large
            text the toggle wraps under the action rather than run past the card. */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', columnGap: spacing.md, rowGap: spacing.xs, marginTop: spacing.xs }}>
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
          {/* The kit's opener (a small ghost Button with its chevron and `expanded`), as every other one that
              opens more in place; drawn without side padding, so its words end at the card's text edge. */}
          <Button
            testID={`insight-${insight.id}-numbers`}
            title={open ? 'Hide the numbers' : 'The numbers'}
            accessibilityLabel={open ? `Hide the numbers: ${insight.title}` : `The numbers: ${insight.title}`}
            variant="ghost"
            size="sm"
            full={false}
            expanded={open}
            iconRight={<Chevron size={18} color={colors.actionInk} strokeWidth={2.2} />}
            onPress={() => setOpen((o) => !o)}
            style={{ paddingHorizontal: 0 }}
          />
        </View>
      </View>
    </View>
  );
}
