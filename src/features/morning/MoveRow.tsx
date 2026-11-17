import React from 'react';
import { useWindowDimensions, View } from 'react-native';

import { formatNumber } from '@/lib/units';
import { useTheme } from '@/theme';
import { CupKey, PressableScale, Text } from '@/ui';

import { leaveMorningTo } from './leave';
import { moveAccessibilityLabel, moveLine, type MoveActivity } from './line';

/**
 * Yesterday's movement in one row under the shelf: "🏃 Running, 42 min · about 380 kcal", or
 * "No workout logged" in secondary text, and the day's steps on the right when there are any.
 * Steps are shown only, never added to anything. The row opens Train.
 */
export function MoveRow({ activities, exerciseNet, steps, stepsNote }: { activities: MoveActivity[]; exerciseNet: number; steps: number | null; stepsNote?: string }) {
  const { colors, spacing, typography } = useTheme();
  const line = moveLine(activities, exerciseNet);
  // One activity with an emoji: the emoji is the content mark, drawn at 17 px.
  const emoji = activities.length === 1 ? activities[0].emoji.trim() : '';
  const rest = emoji && line.startsWith(`${emoji} `) ? line.slice(emoji.length + 1) : line;
  const none = activities.length === 0;
  // Under 360 px the steps beside the line would leave it too little room ("Walking, 150 min · …"), so they go under it.
  const below = useWindowDimensions().width < 360;
  const stepsFigure =
    steps && steps > 0 ? (
      <Text variant="numM" tabular style={{ fontSize: 15, lineHeight: 20 }} numberOfLines={1} testID="morning-steps">
        {formatNumber(steps)}
        <Text variant="unit"> steps</Text>
      </Text>
    ) : null;
  return (
    <PressableScale
      testID="morning-move"
      accessibilityRole="link"
      accessibilityLabel={moveAccessibilityLabel(activities, exerciseNet, steps, stepsNote)}
      scaleTo={0.98}
      onPress={() => leaveMorningTo('/train')}
      style={{ minHeight: 44, flexDirection: 'row', alignItems: below && stepsFigure ? 'flex-start' : 'center', gap: spacing.sm }}>
      {/* With the steps under the line, the key stays beside the line's first row. */}
      <View style={below && stepsFigure ? { height: typography.body.lineHeight, justifyContent: 'center' } : undefined}>
        <CupKey color={colors.exercise} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: spacing.sm }}>
        <Text variant="body" color={none ? 'textSecondary' : 'text'} numberOfLines={2} testID="morning-move-line">
          {emoji ? <Text style={{ fontSize: 17 }}>{`${emoji} `}</Text> : null}
          {rest}
        </Text>
        {below ? stepsFigure : null}
      </View>
      {!below && stepsFigure ? <View style={{ paddingLeft: spacing.xs }}>{stepsFigure}</View> : null}
    </PressableScale>
  );
}
