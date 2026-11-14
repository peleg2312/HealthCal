import { router } from 'expo-router';
import { Plus } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';

import { nowISO } from '@/lib/id';
import { formatVolume, weightUnit, weightValue } from '@/lib/units';
import { useStore } from '@/store';
import { useLive, useProfile, useWeightSeries, type DaySummary } from '@/store/selectors';
import { useTheme } from '@/theme';
import type { ISODate } from '@/types';
import { Button, Card, CupKey, haptic, PressableScale, ProgressBar, Text, toast } from '@/ui';

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

export function addWater(date: ISODate, ml: number, units: 'metric' | 'imperial') {
  const entry = useStore.getState().upsert('water', { date, ml, beverage: 'water', loggedAt: nowISO() });
  haptic.success();
  toast(`Added ${formatVolume(ml, units)} of water`, {
    label: 'Undo',
    onPress: () => useStore.getState().remove('water', entry.id),
  });
}

/**
 * Water, activity, sleep and weight (or the running fast) in one card, so
 * every pillar is visible in the first screen of Today. Water leads, with its
 * level bar and the one-tap glass; the other three share a row below a divider.
 */
export function StatusRail({ day, isToday }: { day: DaySummary; isToday: boolean }) {
  const { colors, spacing } = useTheme();
  const profile = useProfile();
  const units = profile.units;
  const presets = useStore((s) => s.settings.waterPresets);
  const glass = defaultGlass(presets);
  const sleep = useLive('sleep');
  const night = sleep.find((s) => s.date === day.date);
  const fasting = useLive('fasting');
  const fast = isToday ? fasting.find((f) => !f.end) : undefined;
  const series = useWeightSeries();

  const [waterValue, waterUnit] = split(formatVolume(day.waterMl, units));
  const goal = formatVolume(day.waterGoalMl, units);
  // "1.23 of 3.3 L": the unit is said once when both amounts share it ("250 ml of 2.55 L" otherwise).
  const sameUnit = split(goal)[1] === waterUnit;
  const dateQuery = isToday ? '' : `?date=${day.date}`;

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
            <Text variant="numM" numberOfLines={1} style={{ marginTop: 3 }}>
              {waterValue}
              <Text variant="unit">{`${waterUnit && !sameUnit ? ` ${waterUnit}` : ''} of ${goal}`}</Text>
            </Text>
          </PressableScale>
          <Button
            testID={`today-water-${glass}`}
            title={formatVolume(glass, units)}
            accessibilityLabel={`Add ${formatVolume(glass, units)} of water`}
            variant="secondary"
            tint={colors.water}
            size="sm"
            full={false}
            icon={<Plus size={16} color={colors.water} strokeWidth={2.6} />}
            onPress={() => addWater(day.date, glass, units)}
          />
        </View>
        <ProgressBar progress={day.waterGoalMl > 0 ? day.waterMl / day.waterGoalMl : 0} color={colors.water} style={{ marginTop: 10 }} />
      </View>
      <View style={{ height: 1, backgroundColor: colors.border, marginHorizontal: spacing.lg }} />
      <View style={{ flexDirection: 'row', paddingHorizontal: spacing.lg, paddingTop: 12, paddingBottom: 14, gap: 12 }}>
        <Cell
          testID="today-activity"
          label="Activity"
          color={colors.exercise}
          accessibilityLabel={day.activities.length ? `Activity, ${day.activeMinutes} minutes` : 'Activity, nothing logged. Log a session'}
          onPress={() => router.push(day.activities.length ? '/train' : (`/activity/pick?date=${day.date}` as never))}
          value={day.activities.length ? String(day.activeMinutes) : null}
          unit="min"
        />
        <Hairline />
        <Cell
          testID="today-sleep"
          label="Sleep"
          color={colors.sleep}
          accessibilityLabel={night ? `Sleep, ${night.hours.toFixed(1)} hours` : 'Sleep, not logged. Add a night'}
          onPress={() => router.push(`/sleep${dateQuery}` as never)}
          value={night ? hoursValue(night.hours) : null}
          unit="h"
        />
        <Hairline />
        {fast ? (
          <FastCell start={fast.start} targetHours={fast.targetHours} />
        ) : (
          <Cell
            testID="today-weight"
            label="Weight"
            color={colors.weight}
            accessibilityLabel={
              series.trendKg !== null
                ? `Weight trend, ${weightValue(series.trendKg, units).toFixed(1)} ${weightUnit(units)}`
                : 'Weight, no weigh-ins. Add your weight'
            }
            onPress={() => router.push(`/weight${dateQuery}` as never)}
            value={series.trendKg !== null ? weightValue(series.trendKg, units).toFixed(1) : null}
            unit={weightUnit(units)}
          />
        )}
      </View>
    </Card>
  );
}

/** A cup-key square in the data colour, then the label: data colours mark, text stays text. */
function KeyLabel({ color, label }: { color: string; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
      <CupKey color={color} size={10} />
      <Text variant="label" color="textSecondary" numberOfLines={1} style={{ fontSize: 13.5, flexShrink: 1 }}>
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
}: {
  testID: string;
  label: string;
  color: string;
  accessibilityLabel: string;
  onPress: () => void;
  value: string | null;
  unit: string;
}) {
  return (
    <PressableScale testID={testID} onPress={onPress} accessibilityLabel={accessibilityLabel} scaleTo={0.96} style={{ flex: 1, minWidth: 0, minHeight: 44 }}>
      <KeyLabel color={color} label={label} />
      {value !== null ? (
        <Text variant="numM" numberOfLines={1} style={{ marginTop: 3 }}>
          {value}
          <Text variant="unit">{unit ? ` ${unit}` : ''}</Text>
        </Text>
      ) : (
        <Text variant="label" color="primary" style={{ marginTop: 3, lineHeight: 24 }}>
          Add
        </Text>
      )}
    </PressableScale>
  );
}

function FastCell({ start, targetHours }: { start: string; targetHours: number }) {
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
      label={`Fast of ${targetHours} h`}
      color={colors.fat}
      accessibilityLabel={`Fasting, ${h} hours ${m} minutes of ${targetHours}`}
      onPress={() => router.push('/fasting')}
      value={`${h}:${String(m).padStart(2, '0')}`}
      unit="h"
    />
  );
}
