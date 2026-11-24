import { router } from 'expo-router';
import { ChevronRight, Footprints } from 'lucide-react-native';
import React from 'react';
import { Platform, useWindowDimensions, View } from 'react-native';

import { useTheme } from '@/theme';
import type { ISODate } from '@/types';
import { PressableScale, Text } from '@/ui';

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
 * With no steps at all, on web and on an iPhone with sync off, one quiet row
 * with a chevron (as the card's "About your usual" row) leads to the import instead; on Android, and on an iPhone with sync on,
 * where sync reads them, nothing is drawn.
 */
export function StepsLine({ dates, today }: { dates: ISODate[]; today: ISODate }) {
  const { colors, spacing } = useTheme();
  const { width } = useWindowDimensions();
  const enabled = useHealthSync((s) => s.enabled);
  const synced = useHealthSync((s) => s.steps.days);
  const file = useHealthSync((s) => s.fileSteps);
  const shown = shownSteps(enabled ? synced : null, file, today);
  const week = stepsWeek(shown.days, dates, today);
  if (!week) {
    if (Platform.OS === 'android' || enabled || Object.keys(shown.days).length) return null;
    return (
      <PressableScale
        testID="train-steps-import"
        accessibilityRole="button"
        accessibilityLabel="Add your daily steps from the Health app’s export"
        onPress={() => router.push('/activity/import')}
        hitSlop={6}
        style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md, minHeight: 44 }}>
        <Footprints size={18} color={colors.textSecondary} strokeWidth={1.9} />
        <Text variant="caption" color="text" style={{ flex: 1, minWidth: 0 }}>
          Add steps from your Health export
        </Text>
        <ChevronRight size={18} color={colors.textSecondary} strokeWidth={1.9} />
      </PressableScale>
    );
  }
  const line = stepsLine(week);
  // Under 360 px the long form wraps and leaves "week" alone; the card is the week's, so it goes.
  const text = width < 360 ? stepsLine(week, true) : line;
  const fromFile = file && shown.fromFile.some((d) => dates.includes(d)) ? fileStepsNote(file.asOfDay) : null;
  return (
    <View testID="train-steps" accessible accessibilityLabel={fromFile ? `${line}. ${fromFile}` : line} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginTop: spacing.md }}>
      <View style={{ paddingTop: 1 }}>
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
