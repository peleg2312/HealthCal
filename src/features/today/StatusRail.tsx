import { router, useIsFocused } from 'expo-router';
import { Plus } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { useWindowDimensions, View } from 'react-native';

import { waterAddedShort, waterAddedToast } from '@/features/food/addedTo';
import { useOneTap } from '@/features/food/oneTap';
import { hoursFigure, hoursParts } from '@/features/trackers/helpers';
import { startOfWeek, today } from '@/lib/dates';
import { guidelineMinutes } from '@/lib/exercise';
import { effectiveMl } from '@/lib/hydration';
import { WEEKLY_ACTIVE_MINUTES } from '@/lib/insights';
import { spokenUnits } from '@/lib/spokenUnits';
import { formatNumber, formatVolume, weightUnit, weightValue } from '@/lib/units';
import { useFriends } from '@/services/friends';
import { useStore } from '@/store';
import { useNow } from '@/store/clock';
import { live, useLive, useProfile, useWeightSeries, type DaySummary } from '@/store/selectors';
import { isReducedMotion, motion, useLargeText, useTheme } from '@/theme';
import type { ISODate } from '@/types';
import { AnimatedNumber, Button, Card, CupKey, haptic, PressableScale, ProgressBar, Text, toast } from '@/ui';

import { cheersLabel, recentCheerCount } from './cheers';
import { logPlainGlass } from './glass';
import { crossesGoal, defaultGlass, volumeNumber, volumeUnitFor, waterOfGoal } from './volume';
import { weightCell } from './weightCell';

/** "1.23 L" -> ["1.23", "L"], "84 fl oz" -> ["84", "fl oz"]. */
function split(s: string): [string, string] {
  const i = s.indexOf(' ');
  return i < 0 ? [s, ''] : [s.slice(0, i), s.slice(i + 1)];
}

/**
 * How long the toast waits when a glass reaches the goal: the bar's pour, its brim flash and the
 * settle, so the toast (which rests over the foot of Today's first screen, where the water bar
 * often is) never covers the moment. The glass itself is stored at once.
 */
const REACHED_TOAST_WAIT = motion.duration.pourSmall + motion.duration.fade + motion.duration.settle;

/**
 * One glass, with Undo. Reaching the goal is marked by the bar itself (its `onReached` adds the
 * success haptic). Pass the day's goal so the toast names the day's new total against it (on Today
 * the toast rests over the water row, so the number it covers is in the toast) and so the glass
 * that reaches it says so, after the bar's flash.
 */
export function addWater(date: ISODate, ml: number, units: 'metric' | 'imperial', goalMl?: number) {
  // Counted as the day's total is (`useDay`: each drink by its hydration factor), so the toast's total and
  // the glass that reaches the goal agree with the water row.
  const before = Math.round(
    live(useStore.getState().water)
      .filter((w) => w.date === date)
      .reduce((sum, w) => sum + effectiveMl(w.ml, w.beverage), 0),
  );
  const entry = logPlainGlass(date, ml);
  // A glass logged is a log, like a food: the success pattern (a light tap is a removal's).
  haptic.success();
  const reaches = goalMl !== undefined && crossesGoal(before, ml, goalMl);
  const total = goalMl !== undefined && goalMl > 0 ? waterOfGoal(before + ml, goalMl, units) : undefined;
  // "250 ml added to Water · 1.48 of 3.3 L", in the order of the food toasts ("Banana added to breakfast").
  const show = () =>
    toast(waterAddedToast(formatVolume(ml, units), date, today(), reaches, total), {
      label: 'Undo',
      tint: 'water',
      short: waterAddedShort(formatVolume(ml, units), date, today(), reaches, total),
      onPress: () => useStore.getState().remove('water', entry.id),
    });
  if (reaches && !isReducedMotion()) setTimeout(show, REACHED_TOAST_WAIT);
  else show();
}

/** One calm line when a goal to reach is crossed on screen; it belongs to the day it was said for. */
function useReachedNote(date: ISODate) {
  // Haptics only for the screen in front: the tab stays mounted while water is added elsewhere.
  const focused = useIsFocused();
  const [note, setNote] = useState<{ date: ISODate; text: string } | null>(null);
  const reached = (text: string) => {
    if (focused) haptic.success();
    setNote({ date, text });
  };
  return { note: note && note.date === date ? note.text : null, reached };
}

function ReachedNote({ text, testID }: { text: string | null; testID: string }) {
  const { colors } = useTheme();
  if (!text) return null;
  return (
    <View style={{ borderTopWidth: 1, borderTopColor: colors.border, marginTop: 12, paddingTop: 10 }}>
      <Text variant="caption" color="textSecondary" testID={testID}>
        {text}
      </Text>
    </View>
  );
}

/**
 * Water in Today's day card, under the macros: the key and "Water", the day's amount of its goal ("1.23 of 3.3 L",
 * on one line with them where it fits, else under them) and the one-tap glass ("+ 250 ml") at the row's end, then the
 * level bar. Water is a goal to reach: past the goal the bar wears the brim tick, never amber, and crossing it on
 * screen adds one calm line under the bar. A quick second tap on the glass (within ONE_TAP_GUARD_MS) logs nothing.
 */
export function WaterRow({ day, isToday, quiet = false }: { day: DaySummary; isToday: boolean; /** First day: the glass is a ghost button so the first-log button is the only filled one. */ quiet?: boolean }) {
  const { colors, spacing } = useTheme();
  // Large text (130% and up): the glass may go under the amount, and every word stays whole (`useLargeText`, `@/theme`).
  const large = useLargeText();
  const profile = useProfile();
  const units = profile.units;
  const presets = useStore((s) => s.settings.waterPresets);
  const glass = defaultGlass(presets);
  // One tap, one glass: a quick second tap on "+ 250 ml" (within ONE_TAP_GUARD_MS) does not log a second one.
  const oneTap = useOneTap();
  const { note, reached } = useReachedNote(day.date);

  const goal = formatVolume(day.waterGoalMl, units);
  const [goalValue, goalUnit] = split(goal);
  const waterUnit = volumeUnitFor(day.waterMl, units);
  // "1.23 of 3.3 L": the unit is said once when both amounts share it ("250 ml of 2.55 L" otherwise).
  const sameUnit = goalUnit === waterUnit;
  const dateQuery = isToday ? '' : `?date=${day.date}`;
  // The water figure as drawn: "1.23 of 3.3 L", "250 ml of 2.55 L".
  const waterShown = `${volumeNumber(day.waterMl, day.waterMl, units)}${!sameUnit ? ` ${waterUnit}` : ''} of ${goalValue} ${goalUnit}`;

  return (
    <View testID="today-rail-water">
      <View style={{ flexDirection: 'row', flexWrap: large ? 'wrap' : 'nowrap', alignItems: 'center', gap: spacing.md }}>
        <PressableScale
          testID="today-water"
          onPress={() => router.push(`/water${dateQuery}` as never)}
          accessibilityLabel={`Water, ${waterShown}`}
          scaleTo={0.98}
          // As tall as the glass beside it, 44 to touch; the key and its word, then the amount on the same line where both
          // fit, else under them (a narrow phone, fl oz).
          hitSlop={4}
          style={{ flex: 1, minWidth: large ? 150 : 0, minHeight: 36, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 10 }}>
          <KeyLabel color={colors.water} label="Water" />
          <AnimatedNumber
            variant="numM"
            numberOfLines={large ? undefined : 1}
            value={day.waterMl}
            format={(ml) => volumeNumber(ml, day.waterMl, units)}
            accessibilityLabel={spokenUnits(`${formatVolume(day.waterMl, units)} of ${goal}`)}>
            <Text variant="unit">{`${!sameUnit ? ` ${waterUnit}` : ''} of ${goalValue} ${goalUnit}`}</Text>
          </AnimatedNumber>
        </PressableScale>
        <Button
          testID={`today-water-${glass}`}
          title={formatVolume(glass, units)}
          // The glass's words as drawn ("250 ml"; label in name), then what it does.
          accessibilityLabel={`Add ${formatVolume(glass, units)} of water`}
          variant={quiet ? 'ghost' : 'secondary'}
          tint={quiet ? undefined : colors.water}
          size="sm"
          full={false}
          icon={<Plus size={18} color={quiet ? colors.text : colors.water} strokeWidth={2.2} />}
          onPress={oneTap(() => addWater(day.date, glass, units, day.waterGoalMl))}
        />
      </View>
      <ProgressBar
        progress={day.waterGoalMl > 0 ? day.waterMl / day.waterGoalMl : 0}
        color={colors.water}
        goalKind="reach"
        memoryKey={`rail-water-${day.date}`}
        onReached={() => reached(isToday ? 'Water goal reached for today.' : 'Water goal reached for the day.')}
        style={{ marginTop: 8 }}
      />
      <ReachedNote text={note} testID="today-rail-reached" />
    </View>
  );
}

/**
 * Activity, sleep and weight (or the running fast) in one card of their own, under Meals: three cells on one row
 * (stacked rows with large text), each opening its screen. The week's activity minutes are a goal to reach: past the
 * guideline its bar wears the brim tick, never amber, and crossing it on screen adds one calm line at the card's foot.
 */
export function PillarsCard({ day, isToday }: { day: DaySummary; isToday: boolean }) {
  const { colors, spacing } = useTheme();
  const { width: screenW } = useWindowDimensions();
  const narrow = screenW < 360;
  // Large text (130% and up): the three cells stack as rows, so every label and value keeps its words whole.
  const large = useLargeText();
  const profile = useProfile();
  const units = profile.units;
  const sleep = useLive('sleep');
  const night = sleep.find((s) => s.date === day.date);
  // Last night in hours and minutes: the minutes under the hours in the narrow cell (see the sleep cell).
  const nightHm = night ? hoursParts(night.hours) : null;
  const nightTwoLines = !large && nightHm !== null && nightHm.h > 0 && nightHm.m > 0;
  const fasting = useLive('fasting');
  const fast = isToday ? fasting.find((f) => !f.end) : undefined;
  const series = useWeightSeries();
  const weight = weightCell(series.entries, series.trend, day.date, isToday);
  const activities = useLive('activities');
  const weekStart = startOfWeek(day.date);
  const weekMinutes = Math.round(guidelineMinutes(activities.filter((a) => a.date >= weekStart && a.date <= day.date)));
  const friendsStatus = useFriends((s) => s.status);
  const friends = useFriends((s) => s.overview);
  const now = useNow();
  const cheers = isToday ? recentCheerCount(friendsStatus, friends, now.getTime()) : 0;
  const { note, reached } = useReachedNote(day.date);

  const dateQuery = isToday ? '' : `?date=${day.date}`;
  // With guideline minutes this week the cell is the week's: "Activity" over the week's minutes, the
  // bar toward the guideline and one short caption that says whose minutes they are and the day's
  // own ("this week, 75 today"). Every label in the row is one line, so the three values share a
  // baseline at 320, 360 and 390 px.
  const week = weekMinutes > 0;
  const thisWeek = isToday ? 'this week' : 'that week';
  const dayWord = isToday ? 'today' : 'that day';
  // Every cell is named by what it shows, as drawn and in its order (WCAG 2.5.3, label in name: "Activity, 195 min
  // this week, 75 today"), then what it leaves out: the guideline its minutes count toward, whose cheers, where it leads.
  const activityShown = week
    ? `Activity, ${formatNumber(weekMinutes)} min ${thisWeek}${day.activities.length ? `, ${formatNumber(day.activeMinutes)} ${dayWord}` : ''}`
    : day.activities.length
      ? `Activity, ${day.activeMinutes} min`
      : 'Activity, Add';
  const activityLabel = [
    cheers ? `${activityShown}, ${cheersLabel(cheers)}` : activityShown,
    week ? `Active minutes toward the ${WEEKLY_ACTIVE_MINUTES} minutes a week guideline` : '',
    cheers ? 'From friends. Open friends' : day.activities.length ? '' : 'Nothing logged. Log a session',
  ]
    .filter(Boolean)
    .join('. ');

  return (
    <Card testID="today-rail" padding={0}>
      <View style={{ flexDirection: large ? 'column' : 'row', paddingHorizontal: narrow ? spacing.md : spacing.lg, paddingTop: 12, paddingBottom: 14, gap: narrow ? 8 : 12 }}>
        <Cell
          testID="today-activity"
          narrow={narrow}
          large={large}
          flex={narrow ? ACTIVITY_FLEX_NARROW : 1}
          label="Activity"
          color={colors.exercise}
          accessibilityLabel={activityLabel}
          onPress={() => router.push(cheers ? ('/friends' as never) : day.activities.length ? '/train' : (`/activity/pick?date=${day.date}` as never))}
          value={week ? formatNumber(weekMinutes) : day.activities.length ? String(day.activeMinutes) : null}
          unit="min">
          {week ? (
            <View style={{ marginTop: 6, gap: 5 }}>
              <ProgressBar
                progress={weekMinutes / WEEKLY_ACTIVE_MINUTES}
                color={colors.exercise}
                height={4}
                goalKind="reach"
                memoryKey={`rail-week-${weekStart}`}
                onReached={() => reached(`${WEEKLY_ACTIVE_MINUTES} active minutes ${thisWeek}. That meets the weekly guideline.`)}
              />
              <Text variant="caption" color="textSecondary" numberOfLines={large ? undefined : 2} testID="today-activity-week">
                {`${thisWeek}${day.activities.length ? `, ${formatNumber(day.activeMinutes)} ${dayWord}` : ''}`}
              </Text>
            </View>
          ) : null}
          {cheers ? (
            <Text variant="label" color="text" numberOfLines={large ? undefined : 1} testID="today-cheers" style={{ marginTop: 4, fontSize: 13 }}>
              {cheersLabel(cheers)}
            </Text>
          ) : null}
        </Cell>
        <Hairline across={large} />
        <Cell
          testID="today-sleep"
          narrow={narrow}
          large={large}
          flex={narrow ? SLEEP_FLEX_NARROW : 0.8}
          label="Sleep"
          color={colors.sleep}
          accessibilityLabel={night ? `Sleep, ${nightTwoLines ? `${nightHm!.h} h ${nightHm!.m} min` : `${hoursFigure(night.hours).value} ${hoursFigure(night.hours).unit}`}` : 'Sleep, Add a night: not logged'}
          onPress={() => router.push(`/sleep${dateQuery}` as never)}
          // Hours and minutes, as Sleep, the morning page and Progress draw a night, never decimal hours. The
          // cell is too narrow for "7 h 45 min" on one line at 320 to 390 px, so the minutes go under the hours
          // ("7 h" over "45 min") and the three values keep one baseline; stacked rows (large text) hold one line.
          value={night ? (nightTwoLines ? String(nightHm!.h) : hoursFigure(night.hours).value) : null}
          unit={night ? (nightTwoLines ? 'h' : hoursFigure(night.hours).unit) : 'h'}>
          {nightTwoLines ? (
            <Text variant="numM" numberOfLines={1} testID="today-sleep-minutes">
              {nightHm!.m}
              <Text variant="unit"> min</Text>
            </Text>
          ) : null}
        </Cell>
        <Hairline across={large} />
        {fast ? (
          <FastCell start={fast.start} targetHours={fast.targetHours} narrow={narrow} large={large} />
        ) : (
          <Cell
            testID="today-weight"
            narrow={narrow}
            large={large}
            flex={narrow ? LAST_FLEX_NARROW : 1.2}
            label={weight?.label ?? 'Weight trend'}
            color={colors.weight}
            accessibilityLabel={weight ? `${weight.label}, ${weightValue(weight.kg, units).toFixed(1)} ${weightUnit(units)}` : 'Weight trend, Add your weight: no weigh-ins'}
            onPress={() => router.push(`/weight${dateQuery}` as never)}
            value={weight ? weightValue(weight.kg, units).toFixed(1) : null}
            unit={weightUnit(units)}
          />
        )}
      </View>
      {note ? (
        <View style={{ marginHorizontal: spacing.lg, marginTop: -12, paddingBottom: 12 }}>
          <ReachedNote text={note} testID="today-rail-week-reached" />
        </View>
      ) : null}
    </Card>
  );
}

/**
 * On a narrow phone (under 360 px) the row is about 220 px: the last cell ("Weight trend", "Fast of
 * 16 h") takes the most, so every label keeps one line and the three values stay level.
 */
const ACTIVITY_FLEX_NARROW = 1;
const SLEEP_FLEX_NARROW = 0.7;
const LAST_FLEX_NARROW = 1.35;

/**
 * A cup-key square in the data colour, then the label: data colours mark, text
 * stays text. Every label in the rail is one line (the week's words are in the
 * activity cell's caption), so the values under them share one baseline.
 */
function KeyLabel({ color, label }: { color: string; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
      <CupKey color={color} size={10} style={{ marginTop: 4 }} />
      {/* One line at every width by its words and the cells' shares (never clipped): under a reader's own text
          spacing it wraps rather than lose its end. */}
      <Text variant="label" color="textSecondary" style={{ fontSize: 13, lineHeight: 17, flexShrink: 1 }}>
        {label}
      </Text>
    </View>
  );
}

/** The line between two cells: upright between columns, across between stacked rows (`across`, large text). */
function Hairline({ across = false }: { across?: boolean }) {
  const { colors } = useTheme();
  return <View style={across ? { height: 1, alignSelf: 'stretch', backgroundColor: colors.border } : { width: 1, alignSelf: 'stretch', backgroundColor: colors.border }} />;
}

function Cell({
  testID,
  label,
  color,
  accessibilityLabel,
  onPress,
  value,
  unit,
  children,
  narrow,
  large = false,
  flex = 1,
}: {
  testID: string;
  narrow?: boolean;
  /** Large text: a full-width row of a stacked list, its value free to wrap at its words. */
  large?: boolean;
  flex?: number;
  label: string;
  color: string;
  accessibilityLabel: string;
  onPress: () => void;
  value: string | null;
  unit: string;
  children?: React.ReactNode;
}) {
  return (
    <PressableScale testID={testID} onPress={onPress} accessibilityLabel={accessibilityLabel} scaleTo={0.96} style={large ? { minHeight: 44 } : { flex, minWidth: 0, minHeight: 44 }}>
      <KeyLabel color={color} label={label} />
      {value !== null ? (
        // A four-digit week ("1,240 min") steps down on a narrow phone, so it is never cut.
        <Text variant="numM" numberOfLines={large ? undefined : 1} style={[{ marginTop: 3 }, narrow && value.length > 4 ? { fontSize: 17, lineHeight: 24 } : null]}>
          {value}
          <Text variant="unit">{unit ? ` ${unit}` : ''}</Text>
        </Text>
      ) : (
        <Text variant="label" color="primaryInk" style={{ marginTop: 3, lineHeight: 24 }}>
          Add
        </Text>
      )}
      {children}
    </PressableScale>
  );
}

function FastCell({ start, targetHours, narrow, large }: { start: string; targetHours: number; narrow: boolean; large: boolean }) {
  const { colors } = useTheme();
  // The clock lives in state so rendering stays pure; it ticks while the fast runs.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  const elapsedH = Math.max(0, (now - new Date(start).getTime()) / 3_600_000);
  const h = Math.floor(elapsedH);
  const m = Math.floor((elapsedH - h) * 60);
  return (
    <Cell
      testID="today-fasting"
      narrow={narrow}
      large={large}
      flex={narrow ? LAST_FLEX_NARROW : 1.2}
      label={`Fast of ${targetHours} h`}
      color={colors.fat}
      accessibilityLabel={`Fast of ${targetHours} h, ${h}:${String(m).padStart(2, '0')} h: ${h} hours ${m} minutes of ${targetHours} hours`}
      onPress={() => router.push('/fasting')}
      value={`${h}:${String(m).padStart(2, '0')}`}
      unit="h"
    />
  );
}
