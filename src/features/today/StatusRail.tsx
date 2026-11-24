import { router, useIsFocused } from 'expo-router';
import { Plus } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { useWindowDimensions, View } from 'react-native';

import { waterAddedToast } from '@/features/food/addedTo';
import { startOfWeek, today } from '@/lib/dates';
import { guidelineMinutes } from '@/lib/exercise';
import { effectiveMl } from '@/lib/hydration';
import { nowISO } from '@/lib/id';
import { WEEKLY_ACTIVE_MINUTES } from '@/lib/insights';
import { formatNumber, formatVolume, weightUnit, weightValue } from '@/lib/units';
import { useFriends } from '@/services/friends';
import { useStore } from '@/store';
import { useNow } from '@/store/clock';
import { live, useLive, useProfile, useWeightSeries, type DaySummary } from '@/store/selectors';
import { isReducedMotion, motion, useTheme } from '@/theme';
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
  haptic.tap();
  const reaches = goalMl !== undefined && crossesGoal(before, ml, goalMl);
  const total = goalMl !== undefined && goalMl > 0 ? waterOfGoal(before + ml, goalMl, units) : undefined;
  // "250 ml added to Water · 1.48 of 3.3 L", in the order of the food toasts ("Banana added to breakfast").
  const show = () =>
    toast(waterAddedToast(formatVolume(ml, units), date, today(), reaches, total), {
      label: 'Undo',
      tint: 'water',
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
  const profile = useProfile();
  const units = profile.units;
  const presets = useStore((s) => s.settings.waterPresets);
  const glass = defaultGlass(presets);
  const sleep = useLive('sleep');
  const night = sleep.find((s) => s.date === day.date);
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
  // With guideline minutes this week the cell is the week's: "Activity this week" over the week's
  // minutes, the bar toward the guideline and one short caption with the guideline and the day's
  // own minutes ("of 150 min, 75 today"), so no line is a three-line wrap at 360 or 320 px.
  const week = weekMinutes > 0;
  const thisWeek = isToday ? 'this week' : 'that week';
  const dayWord = isToday ? 'today' : 'that day';
  const activityLabel = [
    week
      ? `Activity ${thisWeek}, ${weekMinutes} of ${WEEKLY_ACTIVE_MINUTES} guideline minutes${day.activities.length ? `. ${day.activeMinutes} minutes ${dayWord}` : ''}`
      : day.activities.length
        ? `Activity, ${day.activeMinutes} minutes`
        : 'Activity, nothing logged',
    cheers ? `${cheersLabel(cheers)} from friends. Open friends` : day.activities.length ? '' : 'Log a session',
  ]
    .filter(Boolean)
    .join('. ');
  // "Activity / this week" is two lines: every label then keeps two lines' height, as on a narrow phone,
  // so the three values stay level.
  const tall = narrow || week;

  return (
    <Card testID="today-rail" padding={0}>
      <View style={{ paddingTop: 14, paddingHorizontal: spacing.lg, paddingBottom: spacing.lg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <PressableScale
            testID="today-water"
            onPress={() => router.push(`/water${dateQuery}` as never)}
            accessibilityLabel={`Water, ${formatVolume(day.waterMl, units)} of ${goal}`}
            scaleTo={0.98}
            style={{ flex: 1, minWidth: 0, minHeight: 44 }}>
            <KeyLabel color={colors.water} label="Water" />
            <AnimatedNumber
              variant="numM"
              numberOfLines={1}
              style={{ marginTop: 3 }}
              value={day.waterMl}
              format={(ml) => volumeNumber(ml, day.waterMl, units)}
              accessibilityLabel={`${formatVolume(day.waterMl, units)} of ${goal}`}>
              <Text variant="unit">{`${!sameUnit ? ` ${waterUnit}` : ''} of ${goalValue} ${goalUnit}`}</Text>
            </AnimatedNumber>
          </PressableScale>
          <Button
            testID={`today-water-${glass}`}
            title={formatVolume(glass, units)}
            accessibilityLabel={`Add ${formatVolume(glass, units)} of water`}
            variant={quiet ? 'ghost' : 'secondary'}
            tint={quiet ? undefined : colors.water}
            size="sm"
            full={false}
            icon={<Plus size={16} color={quiet ? colors.text : colors.water} strokeWidth={2.6} />}
            onPress={() => addWater(day.date, glass, units, day.waterGoalMl)}
          />
        </View>
        <ProgressBar
          progress={day.waterGoalMl > 0 ? day.waterMl / day.waterGoalMl : 0}
          color={colors.water}
          goalKind="reach"
          memoryKey={`rail-water-${day.date}`}
          onReached={() => reached(isToday ? 'Water goal reached for today. Anything more is a bonus.' : 'Water goal reached for the day.')}
          style={{ marginTop: 10 }}
        />
      </View>
      <View style={{ height: 1, backgroundColor: colors.border, marginHorizontal: spacing.lg }} />
      <View style={{ flexDirection: 'row', paddingHorizontal: narrow ? spacing.md : spacing.lg, paddingTop: 12, paddingBottom: 14, gap: narrow ? 8 : 12 }}>
        <Cell
          testID="today-activity"
          narrow={narrow}
          tall={tall}
          // A little wider on a narrow phone, so "that week" keeps its line at 320 px.
          flex={narrow ? 1.1 : 1}
          label={week ? `Activity\n${thisWeek}` : 'Activity'}
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
              <Text variant="caption" color="textSecondary" numberOfLines={2} testID="today-activity-week">
                {`of ${WEEKLY_ACTIVE_MINUTES} min${day.activities.length ? `, ${formatNumber(day.activeMinutes)} ${dayWord}` : ''}`}
              </Text>
            </View>
          ) : null}
          {cheers ? (
            <Text variant="label" color="text" numberOfLines={1} testID="today-cheers" style={{ marginTop: 4, fontSize: 13 }}>
              {cheersLabel(cheers)}
            </Text>
          ) : null}
        </Cell>
        <Hairline />
        <Cell
          testID="today-sleep"
          narrow={narrow}
          tall={tall}
          flex={0.8}
          label="Sleep"
          color={colors.sleep}
          accessibilityLabel={night ? `Sleep, ${night.hours.toFixed(1)} hours` : 'Sleep, not logged. Add a night'}
          onPress={() => router.push(`/sleep${dateQuery}` as never)}
          value={night ? hoursValue(night.hours) : null}
          unit="h"
        />
        <Hairline />
        {fast ? (
          <FastCell start={fast.start} targetHours={fast.targetHours} narrow={narrow} tall={tall} />
        ) : (
          <Cell
            testID="today-weight"
            narrow={narrow}
            tall={tall}
            flex={narrow ? 1.1 : 1.2}
            label={weight?.label ?? 'Weight trend'}
            color={colors.weight}
            accessibilityLabel={weight ? `${weight.label}, ${weightValue(weight.kg, units).toFixed(1)} ${weightUnit(units)}` : 'Weight, no weigh-ins. Add your weight'}
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
 * A cup-key square in the data colour, then the label: data colours mark, text
 * stays text. It wraps rather than cutting a word; on a narrow phone every
 * label in the row keeps two lines' height so the values stay level.
 */
function KeyLabel({ color, label, tall }: { color: string; label: string; tall?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6, minHeight: tall ? 34 : undefined }}>
      <CupKey color={color} size={10} style={{ marginTop: 4 }} />
      <Text variant="label" color="textSecondary" numberOfLines={2} style={{ fontSize: 13, lineHeight: 17, flexShrink: 1 }}>
        {label}
      </Text>
    </View>
  );
}

function hoursValue(h: number): string {
  return Number.isInteger(h) ? String(h) : h.toFixed(1);
}

function Hairline() {
  const { colors } = useTheme();
  return <View style={{ width: 1, alignSelf: 'stretch', backgroundColor: colors.border }} />;
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
  tall,
  flex = 1,
}: {
  testID: string;
  narrow?: boolean;
  /** Every label in the row keeps two lines' height (a narrow phone, or the week's two-line label). */
  tall?: boolean;
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
    <PressableScale testID={testID} onPress={onPress} accessibilityLabel={accessibilityLabel} scaleTo={0.96} style={{ flex, minWidth: 0, minHeight: 44 }}>
      <KeyLabel color={color} label={label} tall={tall ?? narrow} />
      {value !== null ? (
        // A four-digit week ("1,240 min") steps down on a narrow phone, so it is never cut.
        <Text variant="numM" numberOfLines={1} style={[{ marginTop: 3 }, narrow && value.length > 4 ? { fontSize: 17, lineHeight: 24 } : null]}>
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

function FastCell({ start, targetHours, narrow, tall }: { start: string; targetHours: number; narrow: boolean; tall: boolean }) {
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
      tall={tall}
      flex={narrow ? 1.1 : 1.2}
      label={`Fast of ${targetHours} h`}
      color={colors.fat}
      accessibilityLabel={`Fasting, ${h} hours ${m} minutes of ${targetHours}`}
      onPress={() => router.push('/fasting')}
      value={`${h}:${String(m).padStart(2, '0')}`}
      unit="h"
    />
  );
}
