import { ChevronLeft, ChevronRight, Dumbbell, Info, Scale, Utensils } from 'lucide-react-native';
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
import { useTheme, withOpacity } from '@/theme';
import { AnimatedNumber, BarChart, Button, Card, CupKey, EmptyState, FadeUp, Header, IconButton, MiniCup, Screen, Sheet, Stepper, Text } from '@/ui';

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const RHYTHM_WEEKS = 8;
/** The plural word alone; the number is printed beside it. */
const word = (n: number, one: string) => (n === 1 ? one : `${one}s`);

const RHYTHM_COPY: Record<RhythmKind, { title: string; verb: string }> = {
  food: { title: 'Log food', verb: 'with food logged' },
  train: { title: 'Train', verb: 'with a workout' },
  weigh: { title: 'Weigh in', verb: 'with a weigh-in' },
};

/**
 * One day of the month: the date above a small cup. A cup filled solid is a
 * day within 10% of its budget, a lighter fill a day logged outside it, an
 * empty cup a day with nothing logged and a dashed outline a day to come.
 * Below it, cup keys for the water goal and a workout. Today's date is an ink box.
 * The month pours in a diagonal wave from the top left (`index`), and each
 * day remembers its level for the session, so reopening the page or coming
 * back to a month does not pour again.
 */
function DayCell({ cell, index }: { cell: CalendarCell | null; index: number }) {
  const { colors } = useTheme();
  if (!cell) return <View style={{ flex: 1, height: 66 }} />;
  const label = [
    formatDayLabel(cell.date),
    cell.future ? 'upcoming' : cell.logged ? (cell.onBudget ? 'logged, within 10% of budget' : 'logged') : 'not logged',
    cell.waterMet ? 'water goal met' : '',
    cell.trained ? 'workout logged' : '',
  ]
    .filter(Boolean)
    .join(', ');
  return (
    <View style={{ flex: 1, height: 66, alignItems: 'center', gap: 3 }} accessible accessibilityLabel={label} testID={`consistency-day-${cell.date}`}>
      <View
        style={{
          minWidth: 24,
          height: 20,
          paddingHorizontal: 3,
          alignItems: 'center',
          justifyContent: 'center',
          borderTopLeftRadius: 4,
          borderTopRightRadius: 4,
          borderBottomLeftRadius: 8,
          borderBottomRightRadius: 8,
          backgroundColor: cell.isToday ? colors.text : 'transparent',
        }}>
        <Text
          variant="label"
          tabular
          style={{ fontSize: 12.5, lineHeight: 16 }}
          color={cell.isToday ? 'bg' : cell.future ? 'textTertiary' : cell.logged ? 'text' : 'textSecondary'}>
          {cell.day}
        </Text>
      </View>
      <MiniCup
        progress={cell.logged ? 1 : 0}
        color={cell.onBudget ? colors.calories : withOpacity(colors.calories, 0.42)}
        future={cell.future}
        index={index}
        memoryKey={`consistency-${cell.date}`}
        width={22}
        height={26}
      />
      <View style={{ flexDirection: 'row', gap: 3, height: 6 }}>
        {cell.waterMet ? <CupKey color={colors.water} size={6} /> : null}
        {cell.trained ? <CupKey color={colors.exercise} size={6} /> : null}
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
  const [help, setHelp] = useState(false);

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
        <View accessible accessibilityLabel={`Current streak ${streak} ${word(streak, 'day')}. A missed day does not break it; two in a row do.`}>
          <Text variant="overline">Current streak</Text>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: spacing.xs }}>
            {/* Ticks up from zero the first time the page opens this session. */}
            <AnimatedNumber variant="display" value={streak} from={0} memoryKey="consistency-streak" testID="consistency-streak" />
            <Text variant="h3">{word(streak, 'day')}</Text>
          </View>
          <Text variant="title" style={{ marginTop: spacing.xs }}>
            {streak ? 'A missed day will not break it; two in a row will.' : 'Log food today to start a streak.'}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md, rowGap: spacing.md }}>
          <View style={{ flexGrow: 1, flexBasis: 120, paddingRight: spacing.md }} accessible accessibilityLabel={`Longest streak ${longest} ${word(longest, 'day')}`}>
            <Text variant="numL" testID="consistency-longest">
              {longest}
              <Text variant="unit">{` ${word(longest, 'day')}`}</Text>
            </Text>
            <Text variant="caption" color="textSecondary">
              Longest streak
              {d.longest.start && d.longest.end
                ? d.longest.length <= streak
                  ? ', your current run'
                  : `, ${formatShortDate(d.longest.start)} to ${formatShortDate(d.longest.end)}`
                : ''}
            </Text>
          </View>
          <View style={{ flexGrow: 1, flexBasis: 120, paddingLeft: spacing.md, borderLeftWidth: 1, borderLeftColor: colors.border }}>
            <Text variant="numL">
              {tally.logged}
              <Text variant="unit">{` of ${tally.elapsed} ${word(tally.elapsed, 'day')}`}</Text>
            </Text>
            <Text variant="caption" color="textSecondary" testID="consistency-month-tally">
              Logged {isCurrentMonth ? 'this month' : `in ${monthLabel(month)}`}
            </Text>
          </View>
        </View>
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
        <View key={month}>
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
                <DayCell key={cell?.date ?? `pad-${i}-${j}`} cell={cell} index={i + j} />
              ))}
            </View>
          ))}
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing.lg, rowGap: spacing.xs }}>
          <Legend swatch={<CupKey color={colors.calories} />} label="Within 10% of budget" />
          <Legend swatch={<CupKey color={withOpacity(colors.calories, 0.42)} />} label="Logged" />
          <Legend swatch={<CupKey color={colors.water} size={7} />} label="Water goal met" />
          <Legend swatch={<CupKey color={colors.exercise} size={7} />} label="Workout" />
        </View>
      </Card>

      <Card style={{ gap: spacing.lg }} testID="consistency-rhythm">
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text variant="h3">Weekly rhythm</Text>
            <Text variant="caption" color="textSecondary">
              Days a week you aim to log, train and weigh in
            </Text>
          </View>
          <IconButton size={36} tone="clear" testID="consistency-rhythm-help" accessibilityLabel="How to read the weekly bars" onPress={() => setHelp(true)}>
            <Info size={20} color={colors.textSecondary} strokeWidth={1.9} />
          </IconButton>
          <Button title="Edit" variant="secondary" size="sm" full={false} onPress={() => setEditing(true)} testID="consistency-rhythm-edit" />
        </View>
        <View accessible accessibilityLabel={`${total.total} ${word(total.total, 'week')} on rhythm in total`}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
            <Text variant="numL" testID="consistency-weeks-on-rhythm">
              {total.total}
            </Text>
            <Text variant="unit">{word(total.total, 'week')} on rhythm</Text>
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
                  detail: `Week of ${formatShortDate(w.weekStart)} · ${w.count} ${word(w.count, 'day')} ${RHYTHM_COPY[k].verb}${w.partial ? ' so far' : ''}`,
                }))}
                marks={weeks.map((w) => w.met)}
                openIndex={weeks.findIndex((w) => w.partial) >= 0 ? weeks.findIndex((w) => w.partial) : undefined}
                // The target is a shaded zone, not a budget line: more days than the target is never "over".
                band={{ from: target, to: 7, color }}
                maxValue={7}
                color={color}
                height={110}
                scrub
              />
            </View>
          );
        })}
      </Card>

      <Sheet visible={help} onClose={() => setHelp(false)} title="Weekly rhythm">
        <View style={{ gap: spacing.md }} testID="consistency-rhythm-help-text">
          <Text variant="body">Each bar is one week, Monday to Sunday, as tall as the days you logged food, trained or weighed in.</Text>
          <Text variant="body">The shaded zone starts at your target. A check marks a week that reached it, and the hatched bar is this week so far.</Text>
          <Text variant="body" color="textSecondary">A missed week costs nothing: it is simply not counted.</Text>
        </View>
      </Sheet>

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
