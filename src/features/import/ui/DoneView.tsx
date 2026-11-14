import React from 'react';
import { View } from 'react-native';

import { formatDuration } from '@/lib/dates';
import { formatNumber } from '@/lib/units';
import { useTheme } from '@/theme';
import type { ISODate } from '@/types';
import { Card, CupKey, Divider, EmptyState, MiniCup, Text } from '@/ui';

import type { ImportedEntry } from '../convert';

import { dayLabel, summarise, workouts } from './format';
import { TextLink } from './ReviewHeader';

const MAX_DAYS = 8;

/** After saving: what was added, to which days. */
export function DoneView({ entries, undone, todayDate, onStartOver }: { entries: ImportedEntry[]; undone: boolean; todayDate: ISODate; onStartOver: () => void }) {
  const { colors, spacing } = useTheme();
  const sum = summarise(entries);
  if (undone) {
    return (
      <Card testID="import-undone">
        <EmptyState
          title="Import undone"
          message={`${sum.sessions === 1 ? 'The workout was' : `The ${workouts(sum.sessions)} were`} taken out again, and every day is as it was. To bring ${sum.sessions === 1 ? 'it' : 'them'} back, choose the files again and restore ${sum.sessions === 1 ? 'it' : 'them'} from the list.`}
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
      <View style={{ gap: spacing.sm }}>
        <Text variant="h1">{workouts(sum.sessions)} added</Text>
        <Text variant="body" color="textSecondary">
          {formatDuration(sum.minutes)} of activity on {sum.days.length === 1 ? 'one day' : `${sum.days.length} days`}. Each day’s budget now includes the calories above resting.
        </Text>
      </View>
      <Card style={{ gap: spacing.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <CupKey color={colors.exercise} />
          <Text variant="label" color="textSecondary" style={{ flex: 1 }}>
            Added to the days
          </Text>
          <Text variant="numM" tabular testID="import-done-kcal">
            +{formatNumber(sum.kcal)}
            <Text variant="unit"> kcal</Text>
          </Text>
        </View>
        <Divider />
        {shown.map((d) => (
          <View key={d.date} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }} testID={`import-done-day-${d.date}`}>
            <MiniCup progress={d.kcal / maxKcal} color={colors.exercise} width={22} height={26} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text variant="bodyStrong" numberOfLines={1}>
                {dayLabel(d.date, todayDate)}
              </Text>
              <Text variant="caption" color="textSecondary">
                {workouts(d.sessions)} · {formatDuration(d.minutes)}
              </Text>
            </View>
            <Text variant="bodyStrong" tabular>
              +{formatNumber(d.kcal)}
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
