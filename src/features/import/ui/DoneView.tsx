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
import { savedOnly } from './session';

const MAX_DAYS = 8;

/** "+306" or "−206": an update can lower a day's figure. */
const signed = (n: number) => `${n < 0 ? '−' : '+'}${formatNumber(Math.abs(Math.round(n)))}`;

/** The header's short line after saving: "1 workout added", "2 workouts added, 1 workout updated", "Steps saved", "Sleep saved", or "Import undone". */
export function doneTitle(entries: ImportedEntry[], previous: ActivityEntry[], undone: boolean, stepsDays = 0, nights = 0): string {
  if (undone) return 'Import undone';
  if (!entries.length) return savedOnly(stepsDays > 0, nights > 0) || 'Nothing imported';
  const sum = summarise(entries, previous);
  return [sum.sessions ? `${workouts(sum.sessions)} added` : '', sum.updated ? `${workouts(sum.updated)} updated` : ''].filter(Boolean).join(', ');
}

/** After saving: what was added, to which days. */
export function DoneView({
  entries,
  previous,
  undone,
  stepsDays = 0,
  nights = 0,
  todayDate,
  onStartOver,
}: {
  /** Days of steps a Health export saved on this phone (0: none). */
  stepsDays?: number;
  /** Nights a Health export wrote to the sleep log (0: none). */
  nights?: number;
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
  const stepsLine = stepsDays ? `Steps for ${stepsDays} ${stepsDays === 1 ? 'day' : 'days'} saved on this phone. They show on Train and are never added to your calories.` : null;
  const sleepLine = nights ? `Sleep for ${nights} ${nights === 1 ? 'night' : 'nights'} added to your sleep log.` : null;
  if (undone) {
    const what = n ? `${n === 1 ? 'The workout was' : `The ${workouts(n)} were`} ${previous.length ? 'put back as before' : 'taken out again'}, and every day is as it was.` : '';
    const steps = stepsDays ? `${n ? 'The steps are' : 'The steps were'} taken off this phone again.` : '';
    // A night taken out by Undo is a deleted night, which no file brings back: said plainly, and "import again" is only about the rest.
    const sleep = nights ? `The ${nights === 1 ? 'night was' : 'nights were'} taken out of your sleep log and ${nights === 1 ? 'is' : 'are'} not added from a file again.` : '';
    const them = !nights ? (n === 1 && !stepsDays ? 'it' : 'them') : n && stepsDays ? 'the workouts and steps' : n ? (n === 1 ? 'the workout' : 'the workouts') : 'the steps';
    const again = n || stepsDays ? ` To import ${them} again, choose the files again.` : '';
    return (
      <Card testID="import-undone">
        <EmptyState
          title="Import undone"
          message={`${[what, steps, sleep].filter(Boolean).join(' ')}${again}`}
          action="Import files"
          onAction={onStartOver}
        />
      </Card>
    );
  }
  if (!n) {
    // Only steps or nights were saved (no workouts ticked, or every one already in HealthCal).
    return (
      <View style={{ gap: spacing.lg }} testID="import-done">
        {stepsLine ? (
          <Text variant="body" color="textSecondary" testID="import-done-steps">
            {stepsLine}
          </Text>
        ) : null}
        {sleepLine ? (
          <Text variant="body" color="textSecondary" testID="import-done-sleep">
            {sleepLine}
          </Text>
        ) : null}
        <TextLink testID="import-more" label="Import more files" onPress={onStartOver} />
      </View>
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
      {stepsLine ? (
        <Text variant="body" color="textSecondary" testID="import-done-steps">
          {stepsLine}
        </Text>
      ) : null}
      {sleepLine ? (
        <Text variant="body" color="textSecondary" testID="import-done-sleep">
          {sleepLine}
        </Text>
      ) : null}
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
