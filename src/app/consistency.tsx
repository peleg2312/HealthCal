import { Check, ChevronLeft, ChevronRight, Dumbbell, Info, Scale, Utensils } from 'lucide-react-native';
import React, { useState } from 'react';
import { useWindowDimensions, View } from 'react-native';

import { formatDayLabel, formatShortDate, startOfWeek } from '@/lib/dates';
import { formatNumber } from '@/lib/units';
import { RHYTHM_KINDS, monthGrid, monthLabel, monthOf, monthTally, rhythmWeeks, shiftMonth, weeksOnRhythm, type CalendarCell, type RhythmKind } from '@/features/progress/consistency';
import { solidBar } from '@/features/progress/calorieBars';
import { spokenUnits } from '@/features/progress/chartWords';
import { go } from '@/features/progress/parts';
import { setRhythmTarget, useConsistencyData } from '@/features/progress/useConsistencyData';
import { useLargeText, useTheme, withOpacity } from '@/theme';
import { AnimatedNumber, BarChart, Button, Card, CupKey, EmptyState, Header, IconButton, MiniCup, Screen, Sheet, Stepper, Text } from '@/ui';

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
 * A week's label under its bar: the day of the month, with the month where it changes ("Sep 21, 28,
 * Oct 5"). Under 360 px a bar is about 30 px wide, so two month labels side by side would run into
 * each other: there the first bar gives up its month when the next bar starts a new one ("28, Oct 5").
 */
function rhythmLabel(starts: string[], i: number, narrow: boolean): string {
  const month = (k: number) => starts[k].slice(5, 7);
  const day = String(Number(starts[i].slice(8)));
  if (i > 0 && month(i - 1) === month(i)) return day;
  if (narrow && i === 0 && starts.length > 1 && month(1) !== month(0)) return day;
  return formatShortDate(starts[i]);
}

/** The lighter fill of a partly logged day, as on the recap and Progress. */
const PARTIAL = 0.45;

/** What a day of the calendar says, in words, for a screen reader. */
function cellLabel(cell: CalendarCell): string {
  // Above the budget says by how much (the amber lip), never a rounded share that could read as on it. A share
  // is rounded as the morning page and the recap round it, so one day reads one figure everywhere.
  const above = Math.round(cell.kcal - cell.budget);
  const share = cell.ratio > 1 ? `${formatNumber(Math.max(1, above))} kcal above the budget` : `${Math.round(cell.ratio * 100)}% of the budget`;
  const food = cell.future ? 'upcoming' : !cell.logged ? 'not logged' : cell.isToday ? `${share} so far` : cell.partial ? `partly logged, ${share}` : `${share}${cell.onBudget ? ', on budget' : ''}`;
  return spokenUnits([formatDayLabel(cell.date), food, cell.waterMet ? 'water goal met' : '', cell.trained ? 'workout logged' : ''].filter(Boolean).join(', '));
}

/**
 * One day of the month: the date above a small cup filled to that day's own
 * budget, in the calorie colour (the recap's rule: the lighter fill is a
 * partly logged day, hatching is today, amber at the top a day above its
 * budget). Below it, a check for a fully logged day on budget (90 to 100% of
 * it, `budgetMark`; never under an amber day), a cup key for the water goal
 * and a small dumbbell for a workout (a shape of its own, so the two marks are
 * told apart without their colours). Today's date is an ink box.
 * The month pours in a diagonal wave from the top left (`index`), and each
 * day remembers its level for the session, so reopening the page or coming
 * back to a month does not pour again.
 */
function DayCell({ cell, index }: { cell: CalendarCell | null; index: number }) {
  const { colors } = useTheme();
  if (!cell) return <View style={{ flex: 1, height: 68 }} />;
  return (
    <View style={{ flex: 1, height: 68, alignItems: 'center', gap: 3 }} accessible accessibilityRole="image" accessibilityLabel={cellLabel(cell)} testID={`consistency-day-${cell.date}`}>
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
        <Text variant="label" tabular style={{ fontSize: 12.5, lineHeight: 16 }} color={cell.isToday ? 'bg' : cell.future ? 'textTertiary' : cell.logged ? 'text' : 'textSecondary'}>
          {cell.day}
        </Text>
      </View>
      {/* The cup and the marks are the cell's picture; its name (cellLabel) says all of it. */}
      <View aria-hidden>
      <MiniCup
        progress={cell.logged ? cell.ratio : 0}
        color={cell.partial ? withOpacity(colors.calories, PARTIAL) : colors.calories}
        hatchFill={cell.isToday}
        future={cell.future}
        index={index}
        memoryKey={`consistency-${cell.date}`}
        width={22}
        height={26}
      />
      </View>
      <View
        aria-hidden
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 3,
          height: 9,
        }}>
        {cell.onBudget ? <Check size={9} color={colors.success} strokeWidth={3.2} /> : null}
        {cell.waterMet ? <CupKey color={colors.water} size={6} /> : null}
        {cell.trained ? <Dumbbell size={9} color={colors.exercise} strokeWidth={2.6} /> : null}
      </View>
    </View>
  );
}

function Legend({ swatch, label }: { swatch: React.ReactNode; label: string }) {
  return (
    // Never wider than the card: at large text a key's words wrap beside its swatch.
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '100%' }}>
      <View aria-hidden>{swatch}</View>
      <Text variant="caption" color="textSecondary" style={{ flexShrink: 1 }}>
        {label}
      </Text>
    </View>
  );
}

export default function ConsistencyScreen() {
  const { colors, spacing } = useTheme();
  const bigText = useLargeText();
  const d = useConsistencyData();
  const thisMonth = monthOf(d.today);
  const firstMonth = d.firstDate ? monthOf(d.firstDate) : thisMonth;
  const [month, setMonth] = useState(thisMonth);
  const [editing, setEditing] = useState(false);
  const [help, setHelp] = useState(false);
  // At 320 px full-size steppers leave the names about 55 px: compact steppers and "5/wk" keep "Log food" and "Weigh in" on one line.
  const narrow = useWindowDimensions().width < 360;

  const rows = monthGrid(month, d.byDate, d.today);
  const tally = monthTally(month, d.sets.food, d.today);
  const isCurrentMonth = month === thisMonth;
  const total = weeksOnRhythm(d.sets, d.targets, d.firstDate, d.today);
  const streak = d.consistency.streak;
  const longest = Math.max(d.longest.length, streak);
  const longestIsCurrent = streak > 0 && d.longest.length <= streak;
  const startWeek = startOfWeek(d.firstDate ?? d.today);

  const kindColor: Record<RhythmKind, string> = {
    food: colors.calories,
    train: colors.exercise,
    weigh: colors.weight,
  };
  const kindIcon: Record<RhythmKind, React.ReactNode> = {
    food: <Utensils size={18} color={colors.calories} />,
    train: <Dumbbell size={18} color={colors.exercise} />,
    weigh: <Scale size={18} color={colors.weight} />,
  };

  if (!d.consistency.totalDaysLogged) {
    return (
      <Screen header={<Header title="Consistency" subtitle="Days you logged" />} testID="consistency-screen">
        <Card>
          <EmptyState
            title="Your logging rhythm shows here"
            message="Your streak, a calendar of logged days and how often you train and weigh in, from your first logged meal."
            action="Open diary"
            onAction={() => go('/diary')}
          />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen header={<Header title="Consistency" subtitle="Days you logged" />} testID="consistency-screen">
      <Card style={{ gap: spacing.md }} testID="consistency-summary">
        <View accessible role="group" accessibilityLabel={`Current streak ${streak} ${word(streak, 'day')}${longestIsCurrent ? ', your longest yet' : ''}. A day without a log does not break it; two in a row do.`}>
          <Text variant="overline">Current streak</Text>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'baseline',
              gap: 6,
              marginTop: spacing.xs,
            }}>
            {/* Ticks up from zero the first time the page opens this session. It reads as "33 days", so the word beside it is hidden from screen readers. */}
            <AnimatedNumber variant="display" value={streak} from={0} memoryKey="consistency-streak" testID="consistency-streak" accessibilityLabel={`${streak} ${word(streak, 'day')}`} />
            <Text variant="h3" aria-hidden>
              {word(streak, 'day')}
            </Text>
          </View>
          <Text variant="title" style={{ marginTop: spacing.xs }}>
            {streak ? (longestIsCurrent ? 'Your longest yet. A day without a log will not break it.' : 'A day without a log will not break it; two in a row will.') : 'Log food today to start a streak.'}
          </Text>
        </View>
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            borderTopWidth: 1,
            borderTopColor: colors.border,
            paddingTop: spacing.md,
            rowGap: spacing.md,
          }}>
          {/* The longest streak only when it is not the one above, so the number is never shown twice. */}
          {longestIsCurrent ? null : (
            <View style={{ flexGrow: 1, flexBasis: 120, paddingRight: spacing.md }} accessible role="group" accessibilityLabel={`Longest streak ${longest} ${word(longest, 'day')}`}>
              <Text variant="numL" testID="consistency-longest">
                {longest}
                <Text variant="unit">{` ${word(longest, 'day')}`}</Text>
              </Text>
              <Text variant="caption" color="textSecondary">
                Longest streak
                {d.longest.start && d.longest.end ? `, ${formatShortDate(d.longest.start)} to ${formatShortDate(d.longest.end)}` : ''}
              </Text>
            </View>
          )}
          <View
            style={{
              flexGrow: 1,
              flexBasis: 120,
              ...(longestIsCurrent ? null : { paddingLeft: spacing.md, borderLeftWidth: 1, borderLeftColor: colors.border }),
            }}>
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
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.sm,
          }}>
          <Text variant="h3" style={{ flex: 1 }} testID="consistency-month-label">
            {monthLabel(month)}
          </Text>
          <IconButton size={44} tone="alt" testID="consistency-month-prev" accessibilityLabel="Previous month" disabled={month <= firstMonth} onPress={() => setMonth(shiftMonth(month, -1))}>
            <ChevronLeft size={20} color={month <= firstMonth ? colors.textTertiary : colors.text} />
          </IconButton>
          <IconButton size={44} tone="alt" testID="consistency-month-next" accessibilityLabel="Next month" disabled={isCurrentMonth} onPress={() => setMonth(shiftMonth(month, 1))}>
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
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            columnGap: spacing.lg,
            rowGap: spacing.xs,
          }}>
          <Legend swatch={<CupKey color={colors.calories} />} label="Filled to that day's budget" />
          <Legend swatch={<Check size={11} color={colors.success} strokeWidth={3} />} label="On budget, 90 to 100%" />
          <Legend swatch={<CupKey color={colors.warning} />} label="Above budget" />
          {rows.some((r) => r.some((c) => c?.partial)) ? <Legend swatch={<CupKey color={withOpacity(colors.calories, PARTIAL)} />} label="Partly logged" /> : null}
          <Legend swatch={<CupKey color={colors.water} size={7} />} label="Water goal met" />
          <Legend swatch={<Dumbbell size={12} color={colors.exercise} strokeWidth={2.4} />} label="Workout" />
        </View>
      </Card>

      <Card style={{ gap: spacing.lg }} testID="consistency-rhythm">
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            alignItems: 'flex-start',
            gap: spacing.md,
          }}>
          {/* Above 115% text the title takes the whole line and its two controls go under it. */}
          <View style={{ flex: 1, minWidth: bigText ? '100%' : 0 }}>
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
        <View accessible role="group" accessibilityLabel={`${total.total} ${word(total.total, 'week')} on rhythm in total`}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
            <Text variant="numL" testID="consistency-weeks-on-rhythm">
              {total.total}
            </Text>
            <Text variant="unit">{word(total.total, 'week')} on rhythm</Text>
          </View>
          <Text variant="caption" color="textSecondary">
            Weeks that met all three aims
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
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: spacing.md,
                }}>
                <View aria-hidden>{kindIcon[k]}</View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text variant="bodyStrong">
                    {RHYTHM_COPY[k].title} {target} {word(target, 'day')} a week
                  </Text>
                  <Text variant="caption" color="textSecondary">
                    {/* "Target" is the calorie number only: a week's aim is "met". */}
                    {closed.length ? `Met ${met} of ${closed.length} ${word(closed.length, 'week')}` : 'First week'} · {current.count} this week
                  </Text>
                </View>
              </View>
              {/* One label for the eight bars: each week and its count, for a screen reader (the chart is one image). */}
              <BarChart
                accessibilityLabel={`${RHYTHM_COPY[k].title}, aim ${target} ${word(target, 'day')} a week. ${weeks
                  .map((w) => `${w.partial ? 'This week so far' : `Week of ${formatShortDate(w.weekStart)}`}: ${w.count} ${word(w.count, 'day')}${w.met ? ', met' : ''}`)
                  .join('. ')}.`}
                  testID={`consistency-rhythm-${k}-chart`}
                  data={weeks.map((w, i) => ({
                    // Eight labels share a row as narrow as 30 px a bar: the month only where it changes ("Sep 21, 28, Oct 5").
                    label: w.partial ? 'Now' : rhythmLabel(weeks.map((x) => x.weekStart), i, narrow),
                    value: w.count,
                    detail: `Week of ${formatShortDate(w.weekStart)} · ${w.count} ${word(w.count, 'day')} ${RHYTHM_COPY[k].verb}${w.partial ? ' so far' : ''}`,
                    // Finished weeks are solid in the habit's own colour; this week stays hatched.
                    ...(w.partial ? null : solidBar(w.count, 0, color, color)),
                    // The target is a goal to reach: a week that met it wears the brim line (the kit's reached mark),
                    // so the check keeps one meaning in the app, a day on budget.
                    goal: target,
                  }))}
                  goalKind="reach"
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
          <Text variant="body">The shaded zone starts at your aim. A week that reached it wears the brim: its level line runs a little wider than the bar. The hatched bar is this week so far.</Text>
          <Text variant="body">Weeks on rhythm met all three of your current aims. They are counted in total, not in a row.</Text>
          <Text variant="body" color="textSecondary">
            A missed week costs nothing: it is simply not counted.
          </Text>
        </View>
      </Sheet>

      <Sheet visible={editing} onClose={() => setEditing(false)} title="Weekly rhythm" footer={<Button title="Done" onPress={() => setEditing(false)} testID="consistency-rhythm-done" />}>
        <View style={{ gap: spacing.lg }}>
          <Text variant="body" color="textSecondary">
            A pace you can keep most weeks. Past weeks count against these aims too.
          </Text>
          {RHYTHM_KINDS.map((k) => (
            <View
              key={k}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: narrow ? spacing.sm : spacing.md,
              }}
              testID={`consistency-target-${k}`}>
              <View aria-hidden>{kindIcon[k]}</View>
              <Text variant="bodyStrong" style={{ flex: 1 }}>
                {RHYTHM_COPY[k].title}
              </Text>
              <Stepper label={`${RHYTHM_COPY[k].title} days a week`} value={d.targets[k]} min={1} max={7} compact={narrow} format={(n) => (narrow ? `${n}/wk` : `${n} / wk`)} onChange={(n) => setRhythmTarget(k, n)} />
            </View>
          ))}
        </View>
      </Sheet>
    </Screen>
  );
}
