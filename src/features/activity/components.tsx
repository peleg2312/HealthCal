import { Trash2 } from 'lucide-react-native';
import React from 'react';
import { PixelRatio, Platform, useWindowDimensions, View } from 'react-native';

import { DayStepper } from '@/features/food/components';
import { useToday } from '@/store/clock';
import { useLive, useProfile } from '@/store/selectors';
import { INTENSITY_LABELS, kcalRange } from '@/lib/exercise';
import { dayRuleFor, type ExerciseRule } from '@/lib/exerciseBudget';
import { formatDistance, formatNumber } from '@/lib/units';
import { cup, fonts, useTheme } from '@/theme';
import type { ActivityEntry, ISODate, UnitSystem } from '@/types';
import { CupKey, IconButton, MAX_FONT_SCALE, PressableScale, Text } from '@/ui';

import { deleteSessionLabel, historyFigureBeside, historyFigureWords, historyMetaLines } from './history';
import { budgetAdds, budgetAddsShort, NEXT_DAY_HINT } from './logWords';

/**
 * The day of a workout: the app's one date control (`DayStepper`, `@/features/food/components`), the same look
 * and words as food detail and Saved meals, stopping at today (a burn is logged once it happened). testIDs
 * `<testID>-prev`, `-today`, `-label`, `-next`.
 */
export function DateStepper({ date, onChange, testID = 'date' }: { date: string; onChange: (d: string) => void; testID?: string }) {
  const todayDate = useToday();
  return <DayStepper value={date} onChange={onChange} testIDPrefix={testID} latest={todayDate} nextHint={NEXT_DAY_HINT} />;
}

/** A workout's details as parts of its line: "75 min", "Moderate" (or its exercises and sets), "3.9 km". */
export function sessionParts(e: ActivityEntry, units: UnitSystem): string[] {
  const parts = [`${e.durationMin} min`];
  if (e.exercises?.length) {
    const sets = e.exercises.reduce((s, x) => s + x.sets.length, 0);
    parts.push(`${e.exercises.length} ${e.exercises.length === 1 ? 'exercise' : 'exercises'}`, `${sets} sets`);
  } else {
    parts.push(INTENSITY_LABELS[e.intensity].title);
  }
  if (e.distanceKm) parts.push(formatDistance(e.distanceKm, units));
  return parts;
}

/** Room for a history row's line: the screen's content width less the card's row (18 + emoji 24 + 12, trash 44 + 4). */
const ROW_CHROME = 18 + 24 + 12 + 44 + 4;

/** The budget rule of a workout's day, as that day's summary reads it (`dayRuleFor`): on the day, over 7 days or off. */
function useDayRule(date: ISODate): ExerciseRule {
  const profile = useProfile();
  const days = useLive('days');
  return dayRuleFor(profile, new Map(days.map((d) => [d.date, d])))(date);
}

/**
 * One workout as a row, as the diary draws a food: the name with its figure beside it, and under both, across
 * the row, its line ("Today · 75 min · Moderate", `historyMetaLines`: one line at 360, at most two balanced
 * lines at 320, never a word alone). `day` (Train's history, where a week's card holds its rows) leads that
 * line and is spoken in the label. The figure is the net number the workout adds, with the run log's words for
 * its day's rule (`budgetAddsShort`: "~290 kcal added", "~290 kcal added over 7 days", "~290 kcal not added"),
 * so it never reads as the run log's larger burn. Where the name and the figure do not fit side by side
 * (`historyFigureBeside`), the figure takes a line of its own under the name. An estimate's range is in the
 * label and on the session's own screen ("likely 390–585 kcal").
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
  const { width } = useWindowDimensions();
  const garmin = entry.source === 'garmin';
  // A device-measured burn is shown as it is; an estimate from a MET table carries "~" and, when spoken, its range.
  const measured = !!entry.measured;
  const range = measured ? null : kcalRange(entry.kcalNet);
  const parts = sessionParts(entry, units);
  const scale = Platform.OS === 'web' ? 1 : Math.min(PixelRatio.getFontScale(), MAX_FONT_SCALE);
  const room = Math.min(width, 560) - 40 - ROW_CHROME;
  const meta = historyMetaLines(day ? [day.word, ...parts] : parts, room, scale);
  const rule = useDayRule(entry.date);
  const adds = budgetAdds(rule, entry.kcalNet);
  const short = budgetAddsShort(rule);
  const beside = historyFigureBeside(entry.name, adds.figure, short, room, scale);
  const spoken = [
    `Edit ${entry.name}`,
    ...(day ? [day.spoken] : []),
    ...parts,
    ...(garmin ? ['imported from Garmin'] : []),
    measured ? `${adds.spoken}, from a measured burn` : `${adds.spoken}, an estimate, likely ${formatNumber(range![0])} to ${formatNumber(range![1])}`,
  ].join(', ');
  const figure = (
    <Text variant="numM" testID={`session-kcal-${entry.id}`} style={{ fontSize: 17, lineHeight: 22, flexShrink: beside ? 0 : 1 }}>
      {adds.figure}
      <Text variant="unit">{' kcal'}</Text>
      <Text variant="label" color="textSecondary">
        {historyFigureWords(short)}
      </Text>
    </Text>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: 18, paddingRight: 4 }}>
      <PressableScale
        testID={`session-${entry.activityId}`}
        accessibilityLabel={spoken}
        onPress={onPress}
        scaleTo={0.985}
        style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 56, paddingVertical: 11 }}>
        <View style={{ width: 24, alignItems: 'center' }}>
          <Text style={{ fontSize: 17, lineHeight: 24 }}>{entry.emoji}</Text>
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: spacing.md }}>
            {/* Two lines for a long name: nothing here is cut. */}
            <Text variant="bodyStrong" numberOfLines={2} style={{ flex: 1, minWidth: 0, fontFamily: fonts.semibold }}>
              {entry.name}
            </Text>
            {beside ? figure : null}
          </View>
          {beside ? null : figure}
          <Text variant="caption" color="textSecondary" testID={`session-meta-${entry.id}`}>
            {meta.text}
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
      </PressableScale>
      <IconButton accessibilityLabel={deleteSessionLabel(entry)} tone="clear" testID={`delete-${entry.activityId}`} onPress={onDelete} size={44}>
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
