import { router, useIsFocused } from 'expo-router';
import { Plus } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { useWindowDimensions, View } from 'react-native';

import { waterAddedShort, waterAddedToast } from '@/features/food/addedTo';
import { useOneTap } from '@/features/food/oneTap';
import { hoursFigure, hoursParts, hoursSpoken } from '@/features/trackers/helpers';
import { startOfWeek, today } from '@/lib/dates';
import { guidelineMinutes } from '@/lib/exercise';
import { effectiveMl } from '@/lib/hydration';
import { nowISO } from '@/lib/id';
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
import { crossesGoal, volumeNumber, volumeUnitFor, waterOfGoal } from './volume';
import { weightCell } from './weightCell';

/** "1.23 L" -> ["1.23", "L"], "84 fl oz" -> ["84", "fl oz"]. */
function split(s: string): [string, string] {
  const i = s.indexOf(' ');
  return i < 0 ? [s, ''] : [s.slice(0, i), s.slice(i + 1)];
}

/** The glass size the one-tap button logs: the second smallest preset (250 ml by default). */
export function defaultGlass(presets: number[]): number {
  const sorted = [...presets].filter((p) => p > 0).sort((a, b) => a - b);
  return sorted[1] ?? sorted[0] ?? 250;
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
  const entry = useStore.getState().upsert('water', { date, ml, beverage: 'water', loggedAt: nowISO() });
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

/**
 * Water, activity, sleep and weight (or the running fast) in one card, so
 * every pillar is visible in the first screen of Today. Water leads, with its
 * level bar and the one-tap glass; the other three share a row below a divider.
 * Water and the week's activity minutes are goals to reach: past the goal the
 * bar wears the brim tick, never amber, and crossing it on screen adds one
 * calm line at the foot of the card.
 */
export function StatusRail({ day, isToday, quiet = false }: { day: DaySummary; isToday: boolean; /** First day: the glass is a ghost button so the first-log button is the only filled one. */ quiet?: boolean }) {
  const { colors, spacing } = useTheme();
  const { width: screenW } = useWindowDimensions();
  const narrow = screenW < 360;
  // Large text (130% and up): the water row may put its glass under the amount, and the three cells stack as rows,
  // so every label and value keeps its words whole (`useLargeText`, `@/theme`).
  const large = useLargeText();
  const profile = useProfile();
  const units = profile.units;
  const presets = useStore((s) => s.settings.waterPresets);
  const glass = defaultGlass(presets);
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
  // Haptics only for the screen in front: the tab stays mounted while water is added elsewhere.
  const focused = useIsFocused();
  // One tap, one glass: a quick second tap on "+ 250 ml" (within ONE_TAP_GUARD_MS) does not log a second one.
  const oneTap = useOneTap();

  // One calm line when a goal to reach is crossed on screen; it belongs to the day it was said for.
  const [note, setNote] = useState<{ date: ISODate; text: string } | null>(null);
  const reached = (text: string) => {
    if (focused) haptic.success();
    setNote({ date: day.date, text });
  };

  const goal = formatVolume(day.waterGoalMl, units);
  const [goalValue, goalUnit] = split(goal);
  const waterUnit = volumeUnitFor(day.waterMl, units);
  // "1.23 of 3.3 L": the unit is said once when both amounts share it ("250 ml of 2.55 L" otherwise).
  const sameUnit = goalUnit === waterUnit;
  const dateQuery = isToday ? '' : `?date=${day.date}`;
  // With guideline minutes this week the cell is the week's: "Activity" over the week's minutes, the
  // bar toward the guideline and one short caption that says whose minutes they are and the day's
  // own ("this week, 75 today"). Every label in the row is one line, so the three values share a
  // baseline at 320, 360 and 390 px.
  const week = weekMinutes > 0;
  const thisWeek = isToday ? 'this week' : 'that week';
  const dayWord = isToday ? 'today' : 'that day';
  const activityLabel = [
    week
      ? `Activity ${thisWeek}, ${weekMinutes} active minutes, of the ${WEEKLY_ACTIVE_MINUTES} minutes a week guideline${day.activities.length ? `. ${day.activeMinutes} minutes ${dayWord}` : ''}`
      : day.activities.length
        ? `Activity, ${day.activeMinutes} minutes`
        : 'Activity, nothing logged',
    cheers ? `${cheersLabel(cheers)} from friends. Open friends` : day.activities.length ? '' : 'Log a session',
  ]
    .filter(Boolean)
    .join('. ');

  return (
    <Card testID="today-rail" padding={0}>
      {/* 8 px over the water row on a narrow phone (14 otherwise), so the row and its "+ 250 ml" are in the first view at
          320 x 640, clear of the toast a glass raises. */}
      <View style={{ paddingTop: narrow ? 8 : 14, paddingHorizontal: spacing.lg, paddingBottom: spacing.lg }}>
        <View style={{ flexDirection: 'row', flexWrap: large ? 'wrap' : 'nowrap', alignItems: 'center', gap: spacing.md }}>
          <PressableScale
            testID="today-water"
            onPress={() => router.push(`/water${dateQuery}` as never)}
            accessibilityLabel={spokenUnits(`Water, ${formatVolume(day.waterMl, units)} of ${goal}`)}
            scaleTo={0.98}
            style={{ flex: 1, minWidth: large ? 150 : 0, minHeight: 44 }}>
            <KeyLabel color={colors.water} label="Water" />
            <AnimatedNumber
              variant="numM"
              numberOfLines={large ? undefined : 1}
              style={{ marginTop: 3 }}
              value={day.waterMl}
              format={(ml) => volumeNumber(ml, day.waterMl, units)}
              accessibilityLabel={spokenUnits(`${formatVolume(day.waterMl, units)} of ${goal}`)}>
              <Text variant="unit">{`${!sameUnit ? ` ${waterUnit}` : ''} of ${goalValue} ${goalUnit}`}</Text>
            </AnimatedNumber>
          </PressableScale>
          <Button
            testID={`today-water-${glass}`}
            title={formatVolume(glass, units)}
            accessibilityLabel={spokenUnits(`Add ${formatVolume(glass, units)} of water`)}
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
          style={{ marginTop: 10 }}
        />
      </View>
      <View style={{ height: 1, backgroundColor: colors.border, marginHorizontal: spacing.lg }} />
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
          accessibilityLabel={night ? `Sleep, ${hoursSpoken(night.hours)}` : 'Sleep, not logged. Add a night'}
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
            accessibilityLabel={weight ? spokenUnits(`${weight.label}, ${weightValue(weight.kg, units).toFixed(1)} ${weightUnit(units)}`) : 'Weight, no weigh-ins. Add your weight'}
            onPress={() => router.push(`/weight${dateQuery}` as never)}
            value={weight ? weightValue(weight.kg, units).toFixed(1) : null}
            unit={weightUnit(units)}
          />
        )}
      </View>
      {note && note.date === day.date ? (
        <View style={{ borderTopWidth: 1, borderTopColor: colors.border, marginHorizontal: spacing.lg, paddingTop: 10, paddingBottom: 12 }}>
          <Text variant="caption" color="textSecondary" testID="today-rail-reached">
            {note.text}
          </Text>
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
      accessibilityLabel={`Fasting, ${h} hours ${m} minutes of ${targetHours} hours`}
      onPress={() => router.push('/fasting')}
      value={`${h}:${String(m).padStart(2, '0')}`}
      unit="h"
    />
  );
}
