import { ChevronLeft, ChevronRight, Trash2 } from 'lucide-react-native';
import React from 'react';
import { View } from 'react-native';

import { useToday } from '@/store/clock';
import { addDays, formatDayLabel, formatLongDate } from '@/lib/dates';
import { INTENSITY_LABELS } from '@/lib/exercise';
import { formatDistance, formatNumber } from '@/lib/units';
import { useTheme } from '@/theme';
import type { ActivityEntry, UnitSystem } from '@/types';
import { Avatar, IconButton, PressableScale, Text } from '@/ui';

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
        backgroundColor: colors.surface,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.border,
        padding: spacing.sm,
      }}>
      <IconButton accessibilityLabel="Previous day" tone="alt" testID={`${testID}-prev`} onPress={() => onChange(addDays(date, -1))} size={44}>
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
        tone="alt"
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
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
      <PressableScale
        testID={`session-${entry.activityId}`}
        accessibilityLabel={`Edit ${entry.name}`}
        onPress={onPress}
        scaleTo={0.985}
        style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 60, paddingVertical: spacing.sm }}>
        <Avatar emoji={entry.emoji} color={colors.exercise} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="bodyStrong" numberOfLines={1}>
            {entry.name}
          </Text>
          <Text variant="caption" color="textSecondary" numberOfLines={2}>
            {sessionSubtitle(entry, units)}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text variant="bodyStrong" tabular>
            ~{formatNumber(entry.kcalNet)}
            <Text variant="caption" color="textSecondary">
              {' '}
              kcal
            </Text>
          </Text>
          <Text variant="caption" color="textTertiary">
            net
          </Text>
        </View>
      </PressableScale>
      <IconButton accessibilityLabel={`Delete ${entry.name}`} tone="clear" testID={`delete-${entry.activityId}`} onPress={onDelete} size={40}>
        <Trash2 size={18} color={colors.textTertiary} />
      </IconButton>
    </View>
  );
}

/** Emoji tile for quick-start grids. */
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
      scaleTo={0.95}
      style={{
        width,
        flex: width ? undefined : 1,
        minHeight: 92,
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.xs,
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.xs,
        borderRadius: radius.md,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
      }}>
      <Text style={{ fontSize: 28, lineHeight: 36 }}>{emoji}</Text>
      <Text variant="caption" align="center" numberOfLines={2}>
        {name}
      </Text>
    </PressableScale>
  );
}
