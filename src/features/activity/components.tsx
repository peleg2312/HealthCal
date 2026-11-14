import { ChevronLeft, ChevronRight, Trash2 } from 'lucide-react-native';
import React from 'react';
import { View } from 'react-native';

import { useToday } from '@/store/clock';
import { addDays, formatDayLabel, formatLongDate } from '@/lib/dates';
import { INTENSITY_LABELS, kcalRange } from '@/lib/exercise';
import { formatDistance, formatNumber } from '@/lib/units';
import { cup, fonts, useTheme } from '@/theme';
import type { ActivityEntry, UnitSystem } from '@/types';
import { CupKey, IconButton, PressableScale, Text } from '@/ui';

/** Day chooser: today by default, earlier days allowed, never the future. */
export function DateStepper({ date, onChange, testID = 'date' }: { date: string; onChange: (d: string) => void; testID?: string }) {
  const { colors, radius, spacing } = useTheme();
  const isToday = date >= useToday();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        ...cup(radius.buttonSm, 5),
        borderWidth: 1.5,
        borderColor: colors.borderStrong,
        padding: 4,
      }}>
      <IconButton accessibilityLabel="Previous day" tone="clear" testID={`${testID}-prev`} onPress={() => onChange(addDays(date, -1))} size={44}>
        <ChevronLeft size={20} color={colors.text} />
      </IconButton>
      <View style={{ flex: 1, alignItems: 'center' }}>
        <Text variant="bodyStrong" testID={`${testID}-label`}>
          {formatDayLabel(date)}
        </Text>
        <Text variant="caption" color="textSecondary">
          {formatLongDate(date)}
        </Text>
      </View>
      <IconButton
        accessibilityLabel="Next day"
        tone="clear"
        testID={`${testID}-next`}
        disabled={isToday}
        onPress={() => onChange(addDays(date, 1))}
        size={44}>
        <ChevronRight size={20} color={colors.text} />
      </IconButton>
    </View>
  );
}

export function sessionSubtitle(e: ActivityEntry, units: UnitSystem): string {
  const parts = [`${e.durationMin} min`];
  if (e.exercises?.length) {
    const sets = e.exercises.reduce((s, x) => s + x.sets.length, 0);
    parts.push(`${e.exercises.length} ${e.exercises.length === 1 ? 'exercise' : 'exercises'}`, `${sets} sets`);
  } else {
    parts.push(INTENSITY_LABELS[e.intensity].title);
  }
  // Non-breaking spaces keep each value with its unit when the line wraps.
  if (e.distanceKm) parts.push(formatDistance(e.distanceKm, units));
  return parts.map((p) => p.replace(/ /g, '\u00A0')).join(' · ');
}

export function SessionRow({ entry, units, onPress, onDelete }: { entry: ActivityEntry; units: UnitSystem; onPress: () => void; onDelete: () => void }) {
  const { colors, spacing } = useTheme();
  const garmin = entry.source === 'garmin';
  // A device-measured burn is shown as it is; an estimate from a MET table carries "~" and its range.
  const measured = !!entry.measured;
  const range = measured ? null : kcalRange(entry.kcalNet);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: 18, paddingRight: 4 }}>
      <PressableScale
        testID={`session-${entry.activityId}`}
        accessibilityLabel={`Edit ${entry.name}${garmin ? ', imported from Garmin' : ''}, ${measured ? '' : 'about '}${formatNumber(entry.kcalNet)} kilocalories`}
        onPress={onPress}
        scaleTo={0.985}
        style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 56, paddingVertical: 11 }}>
        <View style={{ width: 24, alignItems: 'center' }}>
          <Text style={{ fontSize: 17, lineHeight: 24 }}>{entry.emoji}</Text>
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text variant="bodyStrong" numberOfLines={1} style={{ fontFamily: fonts.semibold }}>
            {entry.name}
          </Text>
          <Text variant="caption" color="textSecondary" numberOfLines={2}>
            {sessionSubtitle(entry, units)}
          </Text>
          {garmin ? (
            <View testID={`session-source-${entry.id}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <CupKey color={colors.textSecondary} variant={measured ? 'filled' : 'outline'} size={8} />
              <Text variant="caption" color="textSecondary">
                {measured ? 'Garmin · measured' : 'Garmin'}
              </Text>
            </View>
          ) : null}
        </View>
        <View style={{ alignItems: 'flex-end', flexShrink: 0 }}>
          <Text variant="numM" style={{ fontSize: 17, lineHeight: 22 }}>
            {measured ? '' : '~'}
            {formatNumber(entry.kcalNet)}
            <Text variant="unit">{' kcal'}</Text>
          </Text>
          <Text variant="caption" color="textSecondary" tabular>
            {range ? `${formatNumber(range[0])}–${formatNumber(range[1])} net` : 'net'}
          </Text>
        </View>
      </PressableScale>
      <IconButton accessibilityLabel={`Delete ${entry.name}`} tone="clear" testID={`delete-${entry.activityId}`} onPress={onDelete} size={40}>
        <Trash2 size={18} color={colors.textSecondary} strokeWidth={1.9} />
      </IconButton>
    </View>
  );
}

/** Quick-start tile: a cup with the activity's emoji as a small content mark and its name. */
export function ActivityTile({
  emoji,
  name,
  onPress,
  testID,
  width,
}: {
  emoji: string;
  name: string;
  onPress: () => void;
  testID?: string;
  width?: number;
}) {
  const { colors, radius, spacing } = useTheme();
  return (
    <PressableScale
      testID={testID}
      accessibilityLabel={name}
      onPress={onPress}
      scaleTo={0.96}
      style={{
        width,
        flex: width ? undefined : 1,
        minHeight: 76,
        justifyContent: 'space-between',
        gap: spacing.xs,
        paddingVertical: 10,
        paddingHorizontal: 10,
        ...cup(radius.tile, 5),
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
      }}>
      <Text style={{ fontSize: 17, lineHeight: 22 }}>{emoji}</Text>
      <Text variant="label" numberOfLines={2} style={{ fontSize: 12.5, lineHeight: 16 }}>
        {name}
      </Text>
    </PressableScale>
  );
}
