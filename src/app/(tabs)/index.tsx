import { router } from 'expo-router';
import { ChevronRight, Droplets, Flame, Moon, Plus, Timer, Utensils } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';

import { coachTip } from '@/features/today/coach';
import { useToday } from '@/features/today/useToday';
import { formatDuration, formatShortDate, greeting } from '@/lib/dates';
import { nowISO } from '@/lib/id';
import { MEALS, MEAL_SHARE } from '@/lib/nutrition';
import { formatNumber, formatVolume, formatWeight, weightUnit, weightValue } from '@/lib/units';
import { useStore } from '@/store';
import { useConsistency, useDay, useLive, useProfile, useWeightSeries, type DaySummary } from '@/store/selectors';
import { useTheme } from '@/theme';
import type { MealType } from '@/types';
import { Avatar, Card, haptic, IconButton, LargeTitle, PressableScale, ProgressBar, Ring, Screen, SectionTitle, Sparkline, Text, toast } from '@/ui';

export default function TodayScreen() {
  const { colors, spacing } = useTheme();
  const profile = useProfile();
  const date = useToday();
  const day = useDay(date);
  const consistency = useConsistency();

  return (
    <Screen tabs testID="today-screen">
      <LargeTitle
        subtitle={`${greeting()}${profile.name ? `, ${profile.name}` : ''}`}
        title={`Today, ${formatShortDate(date)}`}
        right={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            {consistency.streak > 1 ? (
              <PressableScale
                testID="today-streak"
                onPress={() => router.push('/progress')}
                accessibilityLabel={`${consistency.streak} day logging streak`}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 4, height: 36, paddingHorizontal: 10, borderRadius: 18, backgroundColor: `${colors.exercise}22` }}>
                <Flame size={15} color={colors.exercise} fill={colors.exercise} />
                <Text variant="label" color="exercise" tabular>
                  {consistency.streak}
                </Text>
              </PressableScale>
            ) : null}
            <PressableScale
              testID="today-profile"
              onPress={() => router.push('/profile')}
              accessibilityLabel="Profile and settings"
              style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
              <Text variant="title" color="primary">
                {(profile.name || 'Me').slice(0, 1).toUpperCase()}
              </Text>
            </PressableScale>
          </View>
        }
      />

      <EnergyCard day={day} />
      <CoachCard day={day} />

      <SectionTitle title="Meals" action="Open diary" onAction={() => router.push('/diary')} />
      <MealsCard day={day} />

      <WaterCard day={day} />

      <View style={{ flexDirection: 'row', gap: spacing.md }}>
        <ActivityTile day={day} />
        <WeightTile />
      </View>
      <View style={{ flexDirection: 'row', gap: spacing.md }}>
        <SleepTile date={date} />
        <FastingTile />
      </View>
    </Screen>
  );
}

// ------------------------------------------------------------- energy hero

function EnergyCard({ day }: { day: DaySummary }) {
  const { colors, spacing, dark } = useTheme();
  const profile = useProfile();
  const over = day.remaining < 0;
  const progress = day.budget > 0 ? day.eaten.kcal / day.budget : 0;
  return (
    <Card
      testID="today-energy"
      padding={spacing.xl}
      gradient={dark ? ['#171C25', '#11151C'] : ['#FFFFFF', '#F3F7F1']}
      style={{ gap: spacing.xl }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <SideStat icon={<Utensils size={16} color={colors.textSecondary} />} value={formatNumber(day.eaten.kcal)} label="eaten" />
        <Ring size={176} stroke={15} progress={progress} color={colors.calories} colorEnd={colors.weight} overColor={colors.warning}>
          <Text variant="numXL" tabular color={over ? 'warning' : 'text'} testID="today-remaining">
            {formatNumber(Math.abs(day.remaining))}
          </Text>
          <Text variant="label" color="textSecondary">
            {over ? 'kcal over' : 'kcal left'}
          </Text>
        </Ring>
        <SideStat icon={<Flame size={16} color={colors.exercise} />} value={formatNumber(day.exerciseNet)} label="burned" />
      </View>

      <Text variant="caption" color="textTertiary" align="center">
        {profile.eatBackExercise && day.exerciseNet > 0
          ? `Budget ${formatNumber(day.budget)} = ${formatNumber(day.target)} target + ${formatNumber(day.exerciseNet)} from exercise`
          : `Daily budget ${formatNumber(day.budget)} kcal`}
      </Text>

      <View style={{ flexDirection: 'row', gap: spacing.lg }}>
        <Macro label="Protein" value={day.eaten.protein} target={day.macros.proteinG} color={colors.protein} />
        <Macro label="Carbs" value={day.eaten.carbs} target={day.macros.carbsG} color={colors.carbs} />
        <Macro label="Fat" value={day.eaten.fat} target={day.macros.fatG} color={colors.fat} />
      </View>
    </Card>
  );
}

function SideStat({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <View style={{ alignItems: 'center', gap: 2, minWidth: 64 }}>
      {icon}
      <Text variant="numM" tabular>
        {value}
      </Text>
      <Text variant="caption" color="textSecondary">
        {label}
      </Text>
    </View>
  );
}

function Macro({ label, value, target, color }: { label: string; value: number; target: number; color: string }) {
  return (
    <View style={{ flex: 1, gap: 6 }}>
      <Text variant="caption" color="textSecondary">
        {label}
      </Text>
      <ProgressBar progress={target > 0 ? value / target : 0} color={color} height={6} />
      <Text variant="label" tabular>
        {Math.round(value)}
        <Text variant="caption" color="textTertiary">
          {` / ${target} g`}
        </Text>
      </Text>
    </View>
  );
}

// ------------------------------------------------------------------ coach

function CoachCard({ day }: { day: DaySummary }) {
  const { colors, spacing } = useTheme();
  const profile = useProfile();
  const tip = coachTip(day, profile.units);
  const action = tip.action;
  return (
    <Card
      testID="today-coach"
      tone="alt"
      onPress={action ? () => router.push(action.href as never) : undefined}
      accessibilityLabel={action ? `${tip.title}. ${action.label}` : tip.title}
      style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
      <Avatar emoji={tip.emoji} color={tip.tone === 'positive' ? colors.success : colors.primary} />
      <View style={{ flex: 1 }}>
        <Text variant="bodyStrong">{tip.title}</Text>
        <Text variant="caption" color="textSecondary">
          {tip.body}
        </Text>
      </View>
      {action ? <ChevronRight size={18} color={colors.textTertiary} /> : null}
    </Card>
  );
}

// ------------------------------------------------------------------ meals

function MealsCard({ day }: { day: DaySummary }) {
  const { colors, spacing } = useTheme();
  const open = (meal: MealType) => router.push(`/food/search?meal=${meal}&date=${day.date}`);
  return (
    <Card padding={0} testID="today-meals">
      {MEALS.map((m, i) => {
        const entries = day.byMeal[m.id];
        const kcal = entries.reduce((s, e) => s + e.nutrients.kcal, 0);
        const names = entries.map((e) => e.name).join(', ');
        return (
          <View key={m.id}>
            {i > 0 ? <View style={{ height: 1, backgroundColor: colors.border, marginLeft: 72 }} /> : null}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md }}>
              <PressableScale
                testID={`today-meal-${m.id}`}
                scaleTo={0.99}
                onPress={() => (entries.length ? router.push(`/diary?date=${day.date}`) : open(m.id))}
                accessibilityLabel={`${m.label}, ${entries.length ? `${Math.round(kcal)} kilocalories` : 'not logged yet'}`}
                style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                <Avatar emoji={m.emoji} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text variant="bodyStrong">{m.label}</Text>
                  <Text variant="caption" color="textSecondary" numberOfLines={1}>
                    {entries.length ? names : `Around ${formatNumber(Math.round((day.budget * MEAL_SHARE[m.id]) / 10) * 10)} kcal suggested`}
                  </Text>
                </View>
                {entries.length ? (
                  <Text variant="title" tabular>
                    {formatNumber(kcal)}
                    <Text variant="caption" color="textTertiary">
                      {' kcal'}
                    </Text>
                  </Text>
                ) : null}
              </PressableScale>
              <IconButton testID={`today-add-${m.id}`} accessibilityLabel={`Add food to ${m.label}`} tone="alt" size={36} onPress={() => open(m.id)}>
                <Plus size={18} color={colors.primary} />
              </IconButton>
            </View>
          </View>
        );
      })}
    </Card>
  );
}

// ------------------------------------------------------------------ water

function WaterCard({ day }: { day: DaySummary }) {
  const { colors, spacing, radius } = useTheme();
  const profile = useProfile();
  const presets = useStore((s) => s.settings.waterPresets);
  const quick = [...presets].sort((a, b) => a - b).slice(1, 3);
  const done = day.waterRemainingMl <= 0;

  const add = (ml: number) => {
    const entry = useStore.getState().upsert('water', { date: day.date, ml, beverage: 'water', loggedAt: nowISO() });
    haptic.success();
    toast(`Added ${formatVolume(ml, profile.units)} of water`, { label: 'Undo', onPress: () => useStore.getState().remove('water', entry.id) });
  };

  return (
    <Card testID="today-water" style={{ gap: spacing.md }}>
      <PressableScale
        testID="today-water-open"
        scaleTo={0.99}
        onPress={() => router.push('/water')}
        accessibilityLabel="Water, open hydration"
        style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <Avatar color={colors.water}>
          <Droplets size={20} color={colors.water} />
        </Avatar>
        <View style={{ flex: 1 }}>
          <Text variant="bodyStrong">Water</Text>
          <Text variant="caption" color="textSecondary">
            {done ? 'Goal reached for today' : `${formatVolume(day.waterRemainingMl, profile.units)} left to drink`}
          </Text>
        </View>
        <Text variant="title" tabular>
          {formatVolume(day.waterMl, profile.units)}
          <Text variant="caption" color="textTertiary">{` / ${formatVolume(day.waterGoalMl, profile.units)}`}</Text>
        </Text>
      </PressableScale>
      <ProgressBar progress={day.waterGoalMl > 0 ? day.waterMl / day.waterGoalMl : 0} color={colors.water} height={10} />
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        {quick.map((ml) => (
          <PressableScale
            key={ml}
            testID={`today-water-${ml}`}
            feedback="none"
            onPress={() => add(ml)}
            accessibilityLabel={`Add ${formatVolume(ml, profile.units)} of water`}
            style={{ flex: 1, height: 42, borderRadius: radius.md, backgroundColor: `${colors.water}22`, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 }}>
            <Plus size={15} color={colors.water} strokeWidth={2.6} />
            <Text variant="label" color="water">
              {formatVolume(ml, profile.units)}
            </Text>
          </PressableScale>
        ))}
      </View>
    </Card>
  );
}

// ------------------------------------------------------------------ tiles

function Tile({
  testID,
  title,
  icon,
  onPress,
  children,
}: {
  testID: string;
  title: string;
  icon: React.ReactNode;
  onPress: () => void;
  children: React.ReactNode;
}) {
  return (
    <Card testID={testID} onPress={onPress} accessibilityLabel={title} style={{ flex: 1, gap: 10, minHeight: 124 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {icon}
        <Text variant="label" color="textSecondary">
          {title}
        </Text>
      </View>
      {children}
    </Card>
  );
}

function BigValue({ value, unit }: { value: string; unit?: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
      <Text variant="numL" tabular>
        {value}
      </Text>
      {unit ? (
        <Text variant="label" color="textSecondary">
          {unit}
        </Text>
      ) : null}
    </View>
  );
}

function ActivityTile({ day }: { day: DaySummary }) {
  const { colors } = useTheme();
  const has = day.activities.length > 0;
  return (
    <Tile testID="today-activity" title="Activity" icon={<Flame size={16} color={colors.exercise} />} onPress={() => router.push(has ? '/train' : '/activity/pick')}>
      {has ? (
        <>
          <BigValue value={String(day.activeMinutes)} unit="min" />
          <Text variant="caption" color="textSecondary" numberOfLines={2}>
            {`${day.activities.map((a) => a.name).join(', ')} · about ${formatNumber(day.exerciseNet)} kcal`}
          </Text>
        </>
      ) : (
        <>
          <Text variant="h3">Nothing yet</Text>
          <Text variant="caption" color="primary">
            Log a session
          </Text>
        </>
      )}
    </Tile>
  );
}

function WeightTile() {
  const { colors } = useTheme();
  const profile = useProfile();
  const series = useWeightSeries();
  const rate = series.weeklyRateKg;
  const recent = series.trend.slice(-30).map((t) => t.trend);
  return (
    <Tile testID="today-weight" title="Weight trend" icon={<Sparkline values={recent.length > 1 ? recent : [0, 0]} color={colors.weight} width={34} height={16} />} onPress={() => router.push('/weight')}>
      {series.trendKg !== null ? (
        <>
          <BigValue value={weightValue(series.trendKg, profile.units).toFixed(1)} unit={weightUnit(profile.units)} />
          <Text variant="caption" color="textSecondary" numberOfLines={2}>
            {rate === null
              ? 'Weigh in over a week to see your pace'
              : Math.abs(rate) < 0.05
                ? 'Holding steady'
                : `${rate < 0 ? 'Down' : 'Up'} ${formatWeight(Math.abs(rate), profile.units, 2)} a week`}
          </Text>
        </>
      ) : (
        <>
          <Text variant="h3">No weigh-ins</Text>
          <Text variant="caption" color="primary">
            Add your weight
          </Text>
        </>
      )}
    </Tile>
  );
}

function SleepTile({ date }: { date: string }) {
  const { colors } = useTheme();
  const sleep = useLive('sleep');
  const last = sleep.find((s) => s.date === date);
  return (
    <Tile testID="today-sleep" title="Sleep" icon={<Moon size={16} color={colors.sleep} />} onPress={() => router.push('/sleep')}>
      {last ? (
        <>
          <BigValue value={formatDuration(last.hours * 60).replace(' min', ' m')} />
          <Text variant="caption" color="textSecondary">
            Last night
          </Text>
        </>
      ) : (
        <>
          <Text variant="h3">Not logged</Text>
          <Text variant="caption" color="primary">
            Add last night
          </Text>
        </>
      )}
    </Tile>
  );
}

function FastingTile() {
  const { colors } = useTheme();
  const sessions = useLive('fasting');
  const active = sessions.find((f) => !f.end);
  // Re-render once a minute while a fast is running so the elapsed time stays current.
  const [, tick] = useState(0);
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, [active]);
  const elapsedMin = active ? Math.max(0, (Date.now() - new Date(active.start).getTime()) / 60_000) : 0;
  return (
    <Tile testID="today-fasting" title="Fasting" icon={<Timer size={16} color={colors.fat} />} onPress={() => router.push('/fasting')}>
      {active ? (
        <>
          <BigValue value={formatDuration(elapsedMin).replace(' min', ' m')} />
          <Text variant="caption" color="textSecondary">
            {`of ${active.targetHours} h target`}
          </Text>
        </>
      ) : (
        <>
          <Text variant="h3">Not fasting</Text>
          <Text variant="caption" color="primary">
            Start a fast
          </Text>
        </>
      )}
    </Tile>
  );
}
