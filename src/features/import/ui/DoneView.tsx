import React from 'react';
import { View } from 'react-native';

import { formatDuration } from '@/lib/dates';
import { formatNumber } from '@/lib/units';
import { useTheme } from '@/theme';
import type { ActivityEntry, ISODate } from '@/types';
import { Card, CupKey, Divider, EmptyState, MiniCup, Text } from '@/ui';

import type { ImportedEntry } from '../convert';

import { dayLabel, summarise, workouts } from './format';
import { TextLink } from './ReviewHeader';

const MAX_DAYS = 8;

/** "+306" or "−206": an update can lower a day's figure. */
const signed = (n: number) => `${n < 0 ? '−' : '+'}${formatNumber(Math.abs(Math.round(n)))}`;

/** The header's short line after saving: "1 workout added", "2 workouts added, 1 workout updated", or "Import undone". */
export function doneTitle(entries: ImportedEntry[], previous: ActivityEntry[], undone: boolean): string {
  if (undone) return 'Import undone';
  const sum = summarise(entries, previous);
  return [sum.sessions ? `${workouts(sum.sessions)} added` : '', sum.updated ? `${workouts(sum.updated)} updated` : ''].filter(Boolean).join(', ');
}

/** After saving: what was added, to which days. */
export function DoneView({
  entries,
  previous,
  undone,
  todayDate,
  onStartOver,
}: {
  entries: ImportedEntry[];
  /** Stored versions of the workouts this import updated. */
  previous: ActivityEntry[];
  undone: boolean;
  todayDate: ISODate;
  onStartOver: () => void;
}) {
  const { colors, spacing } = useTheme();
  const sum = summarise(entries, previous);
  const n = entries.length;
  if (undone) {
    return (
      <Card testID="import-undone">
        <EmptyState
          title="Import undone"
          message={`${n === 1 ? 'The workout was' : `The ${workouts(n)} were`} ${previous.length ? 'put back as before' : 'taken out again'}, and every day is as it was. To import ${n === 1 ? 'it' : 'them'} again, choose the files again.`}
          action="Import files"
          onAction={onStartOver}
        />
      </Card>
    );
  }
  const maxKcal = Math.max(1, ...sum.days.map((d) => d.kcal));
  const shown = sum.days.slice(0, MAX_DAYS);
  return (
    <View style={{ gap: spacing.lg }} testID="import-done">
      {/* What was done ("1 workout added") is the header's short line: doneTitle. */}
      <Text variant="body" color="textSecondary">
        {sum.sessions
          ? 'Each day’s budget now includes the calories above resting.'
          : `The workouts now carry the numbers from the file. Each day’s budget follows them.`}
      </Text>
      <Card style={{ gap: spacing.md }}>
        {/* The total only when there is more than one day: with one, the day's own row is the total. */}
        {sum.days.length > 1 ? (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <CupKey color={colors.exercise} />
              <Text variant="label" color="textSecondary" style={{ flex: 1 }}>
                {sum.updated ? 'Change to the days' : 'Added to the days'}
              </Text>
              <Text variant="numM" tabular testID="import-done-kcal">
                {signed(sum.kcal)}
                <Text variant="unit"> kcal</Text>
              </Text>
            </View>
            <Divider />
          </>
        ) : null}
        {shown.map((d) => (
          <View key={d.date} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }} testID={`import-done-day-${d.date}`}>
            <MiniCup progress={Math.max(0, d.kcal) / maxKcal} color={colors.exercise} width={22} height={26} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text variant="bodyStrong" numberOfLines={1}>
                {dayLabel(d.date, todayDate)}
              </Text>
              <Text variant="caption" color="textSecondary">
                {[d.sessions ? `${workouts(d.sessions)} · ${formatDuration(d.minutes)}` : '', d.updated ? `${workouts(d.updated)} updated` : ''].filter(Boolean).join(' · ')}
              </Text>
            </View>
            <Text variant="bodyStrong" tabular testID={sum.days.length === 1 ? 'import-done-kcal' : undefined}>
              {signed(d.kcal)}
              <Text variant="unit"> kcal</Text>
            </Text>
          </View>
        ))}
        {sum.days.length > MAX_DAYS ? (
          <Text variant="caption" color="textSecondary">
            and {sum.days.length - MAX_DAYS} earlier {sum.days.length - MAX_DAYS === 1 ? 'day' : 'days'}
          </Text>
        ) : null}
      </Card>
      <TextLink testID="import-more" label="Import more files" onPress={onStartOver} />
    </View>
  );
}
