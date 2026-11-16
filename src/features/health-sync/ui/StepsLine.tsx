import { Footprints } from 'lucide-react-native';
import React from 'react';
import { useWindowDimensions, View } from 'react-native';

import { useTheme } from '@/theme';
import type { ISODate } from '@/types';
import { Text } from '@/ui';

import { stepsLine, stepsWeek } from '../steps';
import { useHealthSync } from '../store';

/**
 * One line in Train's week card: "8,432 steps today, 7,950 a day this week"
 * ("8,432 steps today, 7,950 a day" under 360 px, where the long form wraps).
 * Steps come from the phone's health store with automatic sync on, and are
 * shown only: they are never added to the calorie budget (steps.ts says why).
 * Nothing is drawn while sync is off or the week has no steps.
 */
export function StepsLine({ dates, today }: { dates: ISODate[]; today: ISODate }) {
  const { colors, spacing } = useTheme();
  const { width } = useWindowDimensions();
  const enabled = useHealthSync((s) => s.enabled);
  const days = useHealthSync((s) => s.steps.days);
  const week = enabled ? stepsWeek(days, dates, today) : null;
  if (!week) return null;
  const line = stepsLine(week);
  // Under 360 px the long form wraps and leaves "week" alone; the card is the week's, so it goes.
  const shown = width < 360 ? stepsLine(week, true) : line;
  return (
    <View testID="train-steps" accessible accessibilityLabel={line} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md }}>
      <Footprints size={18} color={colors.textSecondary} strokeWidth={1.9} />
      <Text variant="caption" color="textSecondary" style={{ flex: 1, minWidth: 0 }} testID="train-steps-line">
        {shown}
      </Text>
    </View>
  );
}
