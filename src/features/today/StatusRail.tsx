import { router } from 'expo-router';
import { Droplets, Flame, Moon, Plus, Timer } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';

import { nowISO } from '@/lib/id';
import { SLEEP_TARGET_HOURS, WEEKLY_ACTIVE_MINUTES } from '@/lib/insights';
import { formatVolume, weightUnit, weightValue } from '@/lib/units';
import { useStore } from '@/store';
import { useLive, useProfile, useWeightSeries, type DaySummary } from '@/store/selectors';
import { useTheme } from '@/theme';
import type { ISODate } from '@/types';
import { haptic, PressableScale, Ring, Sparkline, Text, toast } from '@/ui';

/** Daily share of the WHO 150 minutes a week, so a ring fills on an average active day. */
const DAILY_ACTIVE_MINUTES = WEEKLY_ACTIVE_MINUTES / 7;

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
 * Water, activity, sleep and weight (or the running fast) side by side in one
 * card, so every pillar is visible in the first screen of Today.
 */
export function StatusRail({ day, isToday }: { day: DaySummary; isToday: boolean }) {
  const { colors, spacing, radius } = useTheme();
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
  const dateQuery = isToday ? '' : `?date=${day.date}`;

  return (
    <View
      testID="today-rail"
      style={{
        flexDirection: 'row',
        backgroundColor: colors.surface,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.border,
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.xs,
      }}>
      <View style={{ flex: 1, alignItems: 'center', gap: spacing.sm }}>
        <Column
          testID="today-water"
          label="Water"
          accessibilityLabel={`Water, ${formatVolume(day.waterMl, units)} of ${formatVolume(day.waterGoalMl, units)}`}
          onPress={() => router.push(`/water${dateQuery}` as never)}
          ring={
            <Ring size={44} stroke={5} progress={day.waterGoalMl > 0 ? Math.min(1, day.waterMl / day.waterGoalMl) : 0} color={colors.water}>
              <Droplets size={18} color={colors.water} />
            </Ring>
          }
          value={day.waterMl > 0 ? waterValue : null}
          unit={waterUnit}
        />
        <PressableScale
          testID="today-water-add"
          feedback="none"
          onPress={() => addWater(day.date, glass, units)}
          accessibilityLabel={`Add ${formatVolume(glass, units)} of water`}
          hitSlop={4}
          style={{
            height: 36,
            minWidth: 44,
            paddingHorizontal: 10,
            borderRadius: radius.pill,
            backgroundColor: `${colors.water}22`,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 3,
          }}>
          <Plus size={13} color={colors.water} strokeWidth={2.8} />
          <Text variant="label" color="water" style={{ fontSize: 12 }} numberOfLines={1}>
            {formatVolume(glass, units)}
          </Text>
        </PressableScale>
      </View>
      <Hairline />
      <Column
        testID="today-activity"
        label="Activity"
        accessibilityLabel={day.activities.length ? `Activity, ${day.activeMinutes} minutes` : 'Activity, nothing logged. Log a session'}
        onPress={() => router.push(day.activities.length ? '/train' : (`/activity/pick?date=${day.date}` as never))}
        ring={
          <Ring size={44} stroke={5} progress={Math.min(1, day.activeMinutes / DAILY_ACTIVE_MINUTES)} color={colors.exercise}>
            <Flame size={18} color={colors.exercise} />
          </Ring>
        }
        value={day.activities.length ? String(day.activeMinutes) : null}
        unit="min"
      />
      <Hairline />
      <Column
        testID="today-sleep"
        label="Sleep"
        accessibilityLabel={night ? `Sleep, ${night.hours.toFixed(1)} hours` : 'Sleep, not logged. Add a night'}
        onPress={() => router.push(`/sleep${dateQuery}` as never)}
        ring={
          <Ring size={44} stroke={5} progress={night ? Math.min(1, night.hours / SLEEP_TARGET_HOURS) : 0} color={colors.sleep}>
            <Moon size={18} color={colors.sleep} />
          </Ring>
        }
        value={night ? hoursValue(night.hours) : null}
        unit="h"
      />
      <Hairline />
      {fast ? (
        <FastColumn start={fast.start} targetHours={fast.targetHours} />
      ) : (
        <Column
          testID="today-weight"
          label="Weight"
          accessibilityLabel={
            series.trendKg !== null
              ? `Weight trend, ${weightValue(series.trendKg, units).toFixed(1)} ${weightUnit(units)}`
              : 'Weight, no weigh-ins. Add your weight'
          }
          onPress={() => router.push('/weight')}
          ring={
            <View
              style={{
                width: 44,
                height: 44,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 22,
                backgroundColor: `${colors.weight}22`,
              }}>
              <Sparkline values={trendValues(series.trend, day.date)} color={colors.weight} width={32} height={18} />
            </View>
          }
          value={series.trendKg !== null ? weightValue(series.trendKg, units).toFixed(1) : null}
          unit={weightUnit(units)}
        />
      )}
    </View>
  );
}

function trendValues(trend: { date: string; trend: number }[], upTo: ISODate): number[] {
  const v = trend
    .filter((t) => t.date <= upTo)
    .slice(-30)
    .map((t) => t.trend);
  return v.length > 1 ? v : [0, 0];
}

function hoursValue(h: number): string {
  return Number.isInteger(h) ? String(h) : h.toFixed(1);
}

function Hairline() {
  const { colors } = useTheme();
  return (
    <View
      style={{
        width: 1,
        alignSelf: 'stretch',
        marginVertical: 4,
        backgroundColor: colors.border,
      }}
    />
  );
}

function Column({
  testID,
  label,
  accessibilityLabel,
  onPress,
  ring,
  value,
  unit,
}: {
  testID: string;
  label: string;
  accessibilityLabel: string;
  onPress: () => void;
  ring: React.ReactNode;
  value: string | null;
  unit: string;
}) {
  return (
    <PressableScale
      testID={testID}
      onPress={onPress}
      accessibilityLabel={accessibilityLabel}
      scaleTo={0.95}
      style={{
        flex: 1,
        minWidth: 0,
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 2,
      }}>
      {ring}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'baseline',
          gap: 2,
          marginTop: 2,
        }}>
        {value !== null ? (
          <>
            <Text variant="numM" tabular numberOfLines={1} style={{ fontSize: 18 }}>
              {value}
            </Text>
            <Text variant="caption" color="textSecondary" numberOfLines={1}>
              {unit}
            </Text>
          </>
        ) : (
          <Text variant="label" color="primary" style={{ lineHeight: 24 }}>
            Add
          </Text>
        )}
      </View>
      <Text variant="caption" color="textTertiary" numberOfLines={1}>
        {label}
      </Text>
    </PressableScale>
  );
}

function FastColumn({ start, targetHours }: { start: string; targetHours: number }) {
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
    <Column
      testID="today-fasting"
      label={`Fast of ${targetHours} h`}
      accessibilityLabel={`Fasting, ${h} hours ${m} minutes of ${targetHours}`}
      onPress={() => router.push('/fasting')}
      ring={
        <Ring size={44} stroke={5} progress={targetHours > 0 ? Math.min(1, elapsedH / targetHours) : 0} color={colors.fat}>
          <Timer size={18} color={colors.fat} />
        </Ring>
      }
      value={`${h}:${String(m).padStart(2, '0')}`}
      unit="h"
    />
  );
}
