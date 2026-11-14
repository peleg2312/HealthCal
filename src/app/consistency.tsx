import { ChevronLeft, ChevronRight, Dumbbell, Scale, Utensils } from 'lucide-react-native';
import React, { useState } from 'react';
import { View } from 'react-native';

import { formatDayLabel, formatShortDate, startOfWeek } from '@/lib/dates';
import {
  RHYTHM_KINDS,
  monthGrid,
  monthLabel,
  monthOf,
  monthTally,
  rhythmWeeks,
  shiftMonth,
  weeksOnRhythm,
  type CalendarCell,
  type RhythmKind,
} from '@/features/progress/consistency';
import { go } from '@/features/progress/parts';
import { setRhythmTarget, useConsistencyData } from '@/features/progress/useConsistencyData';
import { useTheme } from '@/theme';
import { BarChart, Button, Card, EmptyState, Header, IconButton, Screen, Sheet, Stepper, Text } from '@/ui';

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const RHYTHM_WEEKS = 8;
/** The plural word alone; the number is printed beside it. */
const word = (n: number, one: string) => (n === 1 ? one : `${one}s`);

const RHYTHM_COPY: Record<RhythmKind, { title: string; verb: string }> = {
  food: { title: 'Log food', verb: 'with food logged' },
  train: { title: 'Train', verb: 'with a workout' },
  weigh: { title: 'Weigh in', verb: 'with a weigh-in' },
};

function DayCell({ cell }: { cell: CalendarCell | null }) {
  const { colors } = useTheme();
  if (!cell) return <View style={{ flex: 1, height: 48 }} />;
  const pill = `${colors.primary}22`;
  const label = [
    formatDayLabel(cell.date),
    cell.future ? 'upcoming' : cell.logged ? (cell.onBudget ? 'logged, within 10% of budget' : 'logged') : 'not logged',
    cell.waterMet ? 'water goal met' : '',
    cell.trained ? 'workout logged' : '',
  ]
    .filter(Boolean)
    .join(', ');
  return (
    <View style={{ flex: 1, height: 48, alignItems: 'center' }} accessible accessibilityLabel={label} testID={`consistency-day-${cell.date}`}>
      {cell.logged ? (
        <View
          style={{
            position: 'absolute',
            top: 2,
            height: 34,
            left: cell.joinPrev ? 0 : 3,
            right: cell.joinNext ? 0 : 3,
            backgroundColor: pill,
            borderTopLeftRadius: cell.joinPrev ? 0 : 17,
            borderBottomLeftRadius: cell.joinPrev ? 0 : 17,
            borderTopRightRadius: cell.joinNext ? 0 : 17,
            borderBottomRightRadius: cell.joinNext ? 0 : 17,
          }}
        />
      ) : null}
      <View
        style={{
          marginTop: 4,
          width: 30,
          height: 30,
          borderRadius: 15,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: cell.onBudget ? colors.primary : 'transparent',
          borderWidth: cell.logged && !cell.onBudget ? 1.5 : cell.isToday ? 1 : 0,
          borderColor: cell.logged ? colors.primary : colors.borderStrong,
        }}>
        <Text
          variant="label"
          tabular
          style={{ fontSize: 13 }}
          color={cell.onBudget ? 'onPrimary' : cell.future ? 'textTertiary' : cell.logged || cell.isToday ? 'text' : 'textSecondary'}>
          {cell.day}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 3, height: 5, marginTop: 4 }}>
        {cell.waterMet ? <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: colors.water }} /> : null}
        {cell.trained ? <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: colors.exercise }} /> : null}
      </View>
    </View>
  );
}

function Legend({ swatch, label }: { swatch: React.ReactNode; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      {swatch}
      <Text variant="caption" color="textSecondary">
        {label}
      </Text>
    </View>
  );
}

export default function ConsistencyScreen() {
  const { colors, spacing } = useTheme();
  const d = useConsistencyData();
  const thisMonth = monthOf(d.today);
  const firstMonth = d.firstDate ? monthOf(d.firstDate) : thisMonth;
  const [month, setMonth] = useState(thisMonth);
  const [editing, setEditing] = useState(false);

  const rows = monthGrid(month, d.byDate, d.today);
  const tally = monthTally(month, d.sets.food, d.today);
  const isCurrentMonth = month === thisMonth;
  const total = weeksOnRhythm(d.sets, d.targets, d.firstDate, d.today);
  const streak = d.consistency.streak;
  const longest = Math.max(d.longest.length, streak);
  const startWeek = startOfWeek(d.firstDate ?? d.today);

  const kindColor: Record<RhythmKind, string> = { food: colors.calories, train: colors.exercise, weigh: colors.weight };
  const kindIcon: Record<RhythmKind, React.ReactNode> = {
    food: <Utensils size={18} color={colors.calories} />,
    train: <Dumbbell size={18} color={colors.exercise} />,
    weigh: <Scale size={18} color={colors.weight} />,
  };

  if (!d.consistency.totalDaysLogged) {
    return (
      <Screen header={<Header title="Consistency" />} testID="consistency-screen">
        <Card>
          <EmptyState
            emoji="🗓️"
            title="Your logging rhythm shows here"
            message="Once you log food, this page shows your streak, a month calendar of logged days and how many days a week you log, train and weigh in."
            action="Open diary"
            onAction={() => go('/diary')}
          />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen header={<Header title="Consistency" />} testID="consistency-screen">
      <Card style={{ gap: spacing.md }} testID="consistency-summary">
        <View style={{ flexDirection: 'row', gap: spacing.lg }}>
          <View style={{ flex: 1 }} accessible accessibilityLabel={`Current streak ${streak} ${word(streak, 'day')}`}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
              <Text variant="numXL" tabular color="primary" testID="consistency-streak">
                {streak}
              </Text>
              <Text variant="label" color="textSecondary">
                {word(streak, 'day')}
              </Text>
            </View>
            <Text variant="caption" color="textSecondary">
              Current streak
            </Text>
          </View>
          <View style={{ flex: 1 }} accessible accessibilityLabel={`Longest streak ${longest} ${word(longest, 'day')}`}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
              <Text variant="numXL" tabular testID="consistency-longest">
                {longest}
              </Text>
              <Text variant="label" color="textSecondary">
                {word(longest, 'day')}
              </Text>
            </View>
            <Text variant="caption" color="textSecondary" numberOfLines={1}>
              Longest streak
            </Text>
            {d.longest.start && d.longest.end ? (
              <Text variant="caption" color="textTertiary" numberOfLines={1}>
                {d.longest.length <= streak ? 'Your current run' : `${formatShortDate(d.longest.start)} to ${formatShortDate(d.longest.end)}`}
              </Text>
            ) : null}
          </View>
        </View>
        <Text variant="body" color="textSecondary" testID="consistency-month-tally">
          Logged {tally.logged} of {tally.elapsed} {word(tally.elapsed, 'day')} {isCurrentMonth ? 'this month' : `in ${monthLabel(month)}`}
        </Text>
      </Card>

      <Card style={{ gap: spacing.md }} testID="consistency-calendar">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <Text variant="h3" style={{ flex: 1 }} testID="consistency-month-label">
            {monthLabel(month)}
          </Text>
          <IconButton
            size={44}
            tone="alt"
            testID="consistency-month-prev"
            accessibilityLabel="Previous month"
            disabled={month <= firstMonth}
            onPress={() => setMonth(shiftMonth(month, -1))}>
            <ChevronLeft size={20} color={month <= firstMonth ? colors.textTertiary : colors.text} />
          </IconButton>
          <IconButton
            size={44}
            tone="alt"
            testID="consistency-month-next"
            accessibilityLabel="Next month"
            disabled={isCurrentMonth}
            onPress={() => setMonth(shiftMonth(month, 1))}>
            <ChevronRight size={20} color={isCurrentMonth ? colors.textTertiary : colors.text} />
          </IconButton>
        </View>
        <View>
          <View style={{ flexDirection: 'row', marginBottom: spacing.xs }}>
            {WEEKDAYS.map((w, i) => (
              <Text key={i} variant="caption" color="textTertiary" align="center" style={{ flex: 1 }}>
                {w}
              </Text>
            ))}
          </View>
          {rows.map((row, i) => (
            <View key={i} style={{ flexDirection: 'row' }}>
              {row.map((cell, j) => (
                <DayCell key={cell?.date ?? `pad-${i}-${j}`} cell={cell} />
              ))}
            </View>
          ))}
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing.lg, rowGap: spacing.xs }}>
          <Legend swatch={<View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: colors.primary }} />} label="Within 10% of budget" />
          <Legend swatch={<View style={{ width: 12, height: 12, borderRadius: 6, borderWidth: 1.5, borderColor: colors.primary }} />} label="Logged" />
          <Legend swatch={<View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.water }} />} label="Water goal met" />
          <Legend swatch={<View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.exercise }} />} label="Workout" />
        </View>
        <Text variant="caption" color="textTertiary">
          A single missed day never ends a streak, however often it happens; only two missed days in a row do.
        </Text>
      </Card>

      <Card style={{ gap: spacing.lg }} testID="consistency-rhythm">
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text variant="h3">Weekly rhythm</Text>
            <Text variant="caption" color="textSecondary">
              Days a week you aim to log, train and weigh in
            </Text>
          </View>
          <Button title="Edit" variant="secondary" size="sm" full={false} onPress={() => setEditing(true)} testID="consistency-rhythm-edit" />
        </View>
        <View accessible accessibilityLabel={`${total.total} ${word(total.total, 'week')} on rhythm in total`}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
            <Text variant="numL" tabular testID="consistency-weeks-on-rhythm">
              {total.total}
            </Text>
            <Text variant="label" color="textSecondary">
              {word(total.total, 'week')} on rhythm
            </Text>
          </View>
          <Text variant="caption" color="textSecondary">
            Weeks that met all three of your current targets, in total, not in a row
          </Text>
        </View>
        {RHYTHM_KINDS.map((k) => {
          const target = d.targets[k];
          const weeks = rhythmWeeks(d.sets[k], target, d.today, RHYTHM_WEEKS);
          // Weeks before the first entry are shown empty but not counted.
          const closed = weeks.filter((w) => !w.partial && w.weekStart >= startWeek);
          const met = closed.filter((w) => w.met).length;
          const color = kindColor[k];
          const current = weeks[weeks.length - 1];
          return (
            <View key={k} style={{ gap: spacing.sm }} testID={`consistency-rhythm-${k}`}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                {kindIcon[k]}
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text variant="bodyStrong">
                    {RHYTHM_COPY[k].title} {target} {word(target, 'day')} a week
                  </Text>
                  <Text variant="caption" color="textSecondary">
                    {closed.length ? `On target ${met} of the last ${closed.length} ${word(closed.length, 'week')}` : 'First week'} · {current.count} so far this week
                  </Text>
                </View>
              </View>
              <BarChart
                testID={`consistency-rhythm-${k}-chart`}
                data={weeks.map((w) => ({
                  label: w.partial ? 'Now' : formatShortDate(w.weekStart),
                  value: w.count,
                  color: w.partial ? `${color}66` : color,
                  detail: `Week of ${formatShortDate(w.weekStart)} · ${w.count} ${word(w.count, 'day')} ${RHYTHM_COPY[k].verb}${w.partial ? ' so far' : ''}`,
                }))}
                marks={weeks.map((w) => w.met)}
                goal={target}
                maxValue={7}
                color={color}
                height={110}
                scrub
              />
            </View>
          );
        })}
        <Text variant="caption" color="textTertiary">
          Bars show days per week, Monday to Sunday; the dashed line is your target and a check marks a week that met it. The lighter bar is this week so
          far.
        </Text>
      </Card>

      <Sheet
        visible={editing}
        onClose={() => setEditing(false)}
        title="Weekly rhythm"
        footer={<Button title="Done" onPress={() => setEditing(false)} testID="consistency-rhythm-done" />}>
        <View style={{ gap: spacing.lg }}>
          <Text variant="body" color="textSecondary">
            Pick a pace you can keep most weeks. A missed week costs nothing: it just is not counted. Past weeks are counted against the targets you set here, so raising one can lower the total.
          </Text>
          {RHYTHM_KINDS.map((k) => (
            <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }} testID={`consistency-target-${k}`}>
              {kindIcon[k]}
              <Text variant="bodyStrong" style={{ flex: 1 }}>
                {RHYTHM_COPY[k].title}
              </Text>
              <Stepper
                label={`${RHYTHM_COPY[k].title} days a week`}
                value={d.targets[k]}
                min={1}
                max={7}
                format={(n) => `${n} / wk`}
                onChange={(n) => setRhythmTarget(k, n)}
              />
            </View>
          ))}
        </View>
      </Sheet>
    </Screen>
  );
}
