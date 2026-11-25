import { Footprints } from 'lucide-react-native';
import React from 'react';
import { useWindowDimensions, View } from 'react-native';

import { useTheme } from '@/theme';
import type { ISODate } from '@/types';
import { DECORATIVE, figure, Text } from '@/ui';

import { fileStepsNote, shownSteps, stepsLine, stepsWeek } from '../steps';
import { useHealthSync } from '../store';

/**
 * One line in Train's week card: "8,432 steps today, 7,950 a day this week"
 * ("8,432 steps today, 7,950 a day" under 360 px, where the long form wraps).
 * Steps come from the phone's health store with automatic sync on, or from the
 * Health app's export file (on web, and on an iPhone with sync off or a copy
 * that cannot read Apple Health): a file is
 * a snapshot, so then a second line says where they are from and as of when
 * ("From your Health export, Nov 16"). A synced day wins over the file's.
 * Steps are shown only: never added to the calorie budget (steps.ts says why).
 *
 * With no steps this week nothing is drawn: on web and on an iPhone with sync
 * off, the way to add them is a choice in Train's "Bring in workouts" sheet
 * (`train-steps-import`, `@/features/activity/BringIn`).
 */
export function StepsLine({ dates, today }: { dates: ISODate[]; today: ISODate }) {
  const { colors, spacing } = useTheme();
  const { width } = useWindowDimensions();
  const enabled = useHealthSync((s) => s.enabled);
  const synced = useHealthSync((s) => s.steps.days);
  const file = useHealthSync((s) => s.fileSteps);
  const shown = shownSteps(enabled ? synced : null, file, today);
  const week = stepsWeek(shown.days, dates, today);
  if (!week) return null;
  const line = stepsLine(week);
  // Under 360 px the long form wraps and leaves "week" alone; the card is the week's, so it goes.
  const text = width < 360 ? stepsLine(week, true) : line;
  const fromFile = file && shown.fromFile.some((d) => dates.includes(d)) ? fileStepsNote(file.asOfDay) : null;
  return (
    <View testID="train-steps" {...figure(fromFile ? `${line}. ${fromFile}` : line)} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginTop: spacing.md }}>
      <View style={{ paddingTop: 1 }} {...DECORATIVE}>
        <Footprints size={18} color={colors.textSecondary} strokeWidth={1.9} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="caption" color="textSecondary" testID="train-steps-line">
          {text}
        </Text>
        {fromFile ? (
          <Text variant="caption" color="textTertiary" testID="train-steps-source">
            {fromFile}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
