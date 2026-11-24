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
  // Non-breaking spaces keep each value with its unit when the line wraps, and each "·" with the value before it,
  // so a wrapped line never starts with a separator ("Sun · 45 min · Moderate ·" / "3.9 km").
  if (e.distanceKm) parts.push(formatDistance(e.distanceKm, units));
  return parts.map((p) => p.replace(/ /g, '\u00A0')).join('\u00A0· ');
}

/**
 * One workout as a row. `day` (Train's history, where a week's card holds its rows) leads the row's line
 * ("Sun · 45 min · Moderate") and is spoken in its label.
 */
export function SessionRow({
  entry,
  units,
  day,
  onPress,
  onDelete,
}: {
  entry: ActivityEntry;
  units: UnitSystem;
  day?: { word: string; spoken: string };
  onPress: () => void;
  onDelete: () => void;
}) {
  const { colors, spacing } = useTheme();
  const garmin = entry.source === 'garmin';
  // A device-measured burn is shown as it is; an estimate from a MET table carries "~" and its range.
  const measured = !!entry.measured;
  const range = measured ? null : kcalRange(entry.kcalNet);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: 18, paddingRight: 4 }}>
      <PressableScale
        testID={`session-${entry.activityId}`}
        accessibilityLabel={`Edit ${entry.name}${day ? `, ${day.spoken}` : ''}${garmin ? ', imported from Garmin' : ''}, ${measured ? '' : 'about '}${formatNumber(entry.kcalNet)} kilocalories`}
        onPress={onPress}
        scaleTo={0.985}
        style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 56, paddingVertical: 11 }}>
        <View style={{ width: 24, alignItems: 'center' }}>
          <Text style={{ fontSize: 17, lineHeight: 24 }}>{entry.emoji}</Text>
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          {/* Two lines for a long name and as many as the details need on a narrow phone: nothing here is cut. */}
          <Text variant="bodyStrong" numberOfLines={2} style={{ fontFamily: fonts.semibold }}>
            {entry.name}
          </Text>
          <Text variant="caption" color="textSecondary">
            {day ? `${day.word}\u00A0· ${sessionSubtitle(entry, units)}` : sessionSubtitle(entry, units)}
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
      <IconButton accessibilityLabel={`Delete ${entry.name}`} tone="clear" testID={`delete-${entry.activityId}`} onPress={onDelete} size={44}>
        <Trash2 size={18} color={colors.textSecondary} strokeWidth={1.9} />
      </IconButton>
    </View>
  );
}

/**
 * Train's Quick start: one tile per activity, each as wide as its emoji and its whole name, in rows
 * that wrap. A name is never broken inside a word ("Volleyba/ll") at any width, because no tile is
 * narrower than its longest word; a name longer than a row (never in the catalogue) wraps at a space.
 */
export function QuickStartTiles({ items, onPick }: { items: { id: string; emoji: string; name: string }[]; onPick: (id: string) => void }) {
  const { colors, radius, spacing } = useTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }} testID="train-quick-start">
      {items.map((a) => (
        <PressableScale
          key={a.id}
          testID={`quick-${a.id}`}
          accessibilityLabel={a.name}
          onPress={() => onPick(a.id)}
          scaleTo={0.96}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.sm,
            minHeight: 48,
            maxWidth: '100%',
            // Each line of tiles is filled edge to edge, so the block reads as a set, not a ragged cloud with a
            // short line (or one tile) left at the end.
            flexGrow: 1,
            paddingVertical: 8,
            paddingLeft: 12,
            paddingRight: 14,
            ...cup(radius.tile, 5),
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
          }}>
          <Text style={{ fontSize: 17, lineHeight: 22 }}>{a.emoji}</Text>
          <Text variant="label" style={{ flexShrink: 1 }}>
            {a.name}
          </Text>
        </PressableScale>
      ))}
    </View>
  );
}
