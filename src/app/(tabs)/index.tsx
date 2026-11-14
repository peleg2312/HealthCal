import { router } from 'expo-router';
import { ChevronRight, Copy, Droplets, Flame, Plus, Utensils } from 'lucide-react-native';
import React, { useState } from 'react';
import { View } from 'react-native';

import { copyEntries, findPreviousMeal } from '@/features/food/actions';
import { coachTip, rhythmFromReminders } from '@/features/today/coach';
import { useRecapReady } from '@/features/progress/recapReady';
import { DayRingStrip } from '@/features/today/DayRingStrip';
import { FitsSheet } from '@/features/today/FitsSheet';
import { mealLine } from '@/features/today/meals';
import { RecapReadyCard } from '@/features/today/RecapReadyCard';
import { addWater, defaultGlass, StatusRail } from '@/features/today/StatusRail';
import { addDays, formatShortDate, greeting, weekdayShort } from '@/lib/dates';
import { MEALS, MEAL_LABEL, MEAL_SHARE, mealForTime } from '@/lib/nutrition';
import { formatNumber, formatVolume } from '@/lib/units';
import { useStore } from '@/store';
import { useNow, useToday } from '@/store/clock';
import { useConsistency, useDay, useLive, useProfile, type DaySummary } from '@/store/selectors';
import { useTheme } from '@/theme';
import type { FoodEntry, ISODate, MealType } from '@/types';
import { Avatar, Card, Chip, IconButton, LargeTitle, PressableScale, ProgressBar, Ring, Screen, SectionTitle, Text } from '@/ui';

export default function TodayScreen() {
  const { colors, spacing } = useTheme();
  const profile = useProfile();
  const todayDate = useToday();
  // Null follows the clock, so the screen rolls over at midnight unless a day was picked.
  const [picked, setPicked] = useState<ISODate | null>(null);
  const date = picked && picked < todayDate ? picked : todayDate;
  const isToday = date === todayDate;
  const day = useDay(date);
  const consistency = useConsistency(todayDate);
  const now = useNow();
  const recap = useRecapReady();
  // The "What fits" sheet: null when closed, else whether protein is the gap it was opened for.
  const [fits, setFits] = useState<{ proteinFirst: boolean } | null>(null);

  return (
    <Screen tabs testID="today-screen" backdrop={colors.calories}>
      <LargeTitle
        subtitle={isToday ? `${greeting(now)}${profile.name ? `, ${profile.name}` : ''}` : 'Looking back'}
        title={isToday ? `Today, ${formatShortDate(date)}` : `${weekdayShort(date)}, ${formatShortDate(date)}`}
        right={
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.sm,
            }}>
            {!isToday ? (
              <Chip testID="today-jump-today" label="Today" selected onPress={() => setPicked(null)} />
            ) : consistency.streak > 1 ? (
              <PressableScale
                testID="today-streak"
                onPress={() => router.push('/consistency' as never)}
                hitSlop={4}
                accessibilityLabel={`${consistency.streak} day logging streak`}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                  height: 36,
                  paddingHorizontal: 10,
                  borderRadius: 18,
                  backgroundColor: `${colors.exercise}22`,
                }}>
                <Flame size={15} color={colors.exercise} fill={colors.exercise} />
                <Text variant="label" color="exercise" tabular>
                  {consistency.streak}
                </Text>
              </PressableScale>
            ) : null}
            <PressableScale
              testID="today-profile"
              onPress={() => router.push('/profile')}
              hitSlop={4}
              accessibilityLabel="Profile and settings"
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                backgroundColor: colors.primarySoft,
                alignItems: 'center',
                justifyContent: 'center',
              }}>
              <Text variant="title" color="primary">
                {(profile.name || 'Me').slice(0, 1).toUpperCase()}
              </Text>
            </PressableScale>
          </View>
        }
      />

      <DayRingStrip today={todayDate} selected={date} onSelect={(d) => setPicked(d === todayDate ? null : d)} />

      <EnergyCard day={day} isToday={isToday} onFits={() => setFits({ proteinFirst: false })} />
      <StatusRail day={day} isToday={isToday} />
      {isToday ? recap.announce ? <RecapReadyCard /> : <CoachCard day={day} onFits={() => setFits({ proteinFirst: true })} /> : null}

      <SectionTitle title="Meals" action="Open diary" onAction={() => router.push(`/diary?date=${date}` as never)} />
      <MealsCard day={day} />

      <FitsSheet
        visible={fits !== null}
        onClose={() => setFits(null)}
        date={date}
        meal={isToday ? mealForTime(now) : 'snack'}
        kcalLeft={day.remaining}
        proteinFirst={fits?.proteinFirst ?? false}
        proteinLeft={day.macros.proteinG - day.eaten.protein}
      />
    </Screen>
  );
}

// ------------------------------------------------------------- energy hero

function EnergyCard({ day, isToday, onFits }: { day: DaySummary; isToday: boolean; onFits: () => void }) {
  const { colors, spacing } = useTheme();
  const profile = useProfile();
  const over = day.remaining < 0;
  const progress = day.budget > 0 ? day.eaten.kcal / day.budget : 0;
  return (
    <Card testID="today-energy" padding={spacing.lg} gradient={[colors.heroStart, colors.heroEnd]} style={{ gap: spacing.lg }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
        <SideStat icon={<Utensils size={16} color={colors.textSecondary} />} value={formatNumber(day.eaten.kcal)} label="eaten" />
        <PressableScale
          testID="today-remaining-open"
          scaleTo={0.97}
          onPress={onFits}
          accessibilityLabel={`${formatNumber(Math.abs(day.remaining))} ${over ? 'kilocalories over' : isToday ? 'kilocalories left' : 'kilocalories under'}. See which of your foods fit`}
          style={{ borderRadius: 80 }}>
          <Ring size={160} stroke={14} progress={progress} color={colors.calories} colorEnd={colors.ringEnd} overColor={colors.warning}>
            <Text variant="numXL" tabular color={over ? 'warning' : 'text'} testID="today-remaining">
              {formatNumber(Math.abs(day.remaining))}
            </Text>
            <Text variant="label" color="textSecondary">
              {over ? 'kcal over' : isToday ? 'kcal left' : 'kcal under'}
            </Text>
          </Ring>
        </PressableScale>
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

/** "yesterday" or "Nov 10", from the date of the day being viewed (never the wall clock). */
const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function relativeTo(date: ISODate, from: ISODate): string {
  return date === addDays(from, -1) ? 'yesterday' : formatShortDate(date);
}

function CoachCard({ day, onFits }: { day: DaySummary; onFits: () => void }) {
  const { colors, spacing, radius } = useTheme();
  const profile = useProfile();
  const now = useNow();
  const entries = useLive('foodEntries');
  const presets = useStore((s) => s.settings.waterPresets);
  const reminders = useStore((s) => s.settings.reminders);
  const tip = coachTip(day, profile.units, now, rhythmFromReminders(reminders));
  const action = tip.action;
  const quick = tip.quick;
  const prev = quick?.kind === 'repeat' ? findPreviousMeal(entries, day.date, quick.meal, 7) : null;
  const glass = defaultGlass(presets);
  const open = quick?.kind === 'fits' ? onFits : action ? () => router.push(action.href as never) : undefined;

  const chips: React.ReactNode[] = [];
  if (quick?.kind === 'water') {
    chips.push(
      <Chip
        key="water"
        testID="today-coach-water"
        icon={<Droplets size={15} color={colors.water} />}
        label={`Add ${formatVolume(glass, profile.units)}`}
        onPress={() => addWater(day.date, glass, profile.units)}
      />,
    );
  }
  if (quick?.kind === 'repeat' && prev) {
    const kcal = prev.entries.reduce((s, e) => s + e.nutrients.kcal, 0);
    const meal = MEAL_LABEL[quick.meal].toLowerCase();
    chips.push(
      <Chip
        key="repeat"
        testID="today-coach-repeat"
        icon={<Copy size={15} color={colors.primary} />}
        label={`Repeat ${relativeTo(prev.date, day.date)}'s ${meal}, ${formatNumber(kcal)} kcal`}
        onPress={() => copyEntries(prev.entries, day.date, quick.meal, `Copied ${meal} from ${relativeTo(prev.date, day.date)}`)}
      />,
    );
    if (open) chips.push(<Chip key="else" testID="today-coach-else" label="Something else" onPress={open} />);
  }

  return (
    <View
      testID="today-coach"
      style={{
        backgroundColor: colors.surfaceAlt,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.border,
        padding: spacing.lg,
        gap: spacing.md,
      }}>
      <PressableScale
        testID="today-coach-open"
        scaleTo={0.99}
        disabled={!open}
        feedback={open ? 'tap' : 'none'}
        onPress={open}
        accessibilityLabel={action ? `${tip.title}. ${action.label}` : tip.title}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
          opacity: 1,
        }}>
        <Avatar emoji={tip.emoji} color={tip.tone === 'positive' ? colors.success : colors.primary} />
        <View style={{ flex: 1 }}>
          <Text variant="bodyStrong">{tip.title}</Text>
          <Text variant="caption" color="textSecondary">
            {tip.body}
          </Text>
        </View>
        {action ? <ChevronRight size={18} color={colors.textTertiary} /> : null}
      </PressableScale>
      {chips.length ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>{chips}</View> : null}
    </View>
  );
}

// ------------------------------------------------------------------ meals

function MealsCard({ day }: { day: DaySummary }) {
  const { colors, spacing, radius } = useTheme();
  const all = useLive('foodEntries');
  const open = (meal: MealType) => router.push(`/food/search?meal=${meal}&date=${day.date}`);
  return (
    <View
      testID="today-meals"
      style={{
        backgroundColor: colors.surface,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.border,
        overflow: 'hidden',
      }}>
      {MEALS.map((m, i) => {
        const entries = day.byMeal[m.id];
        const line = mealLine(entries);
        const prev = entries.length ? null : findPreviousMeal(all, day.date, m.id, 7);
        return (
          <View key={m.id}>
            {i > 0 ? (
              <View
                style={{
                  height: 1,
                  backgroundColor: colors.border,
                  marginLeft: 72,
                }}
              />
            ) : null}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.sm,
                paddingLeft: spacing.lg,
                paddingRight: spacing.md,
                paddingVertical: spacing.md,
              }}>
              <PressableScale
                testID={`today-meal-${m.id}`}
                scaleTo={0.99}
                onPress={() => (entries.length ? router.push(`/diary?date=${day.date}&meal=${m.id}` as never) : open(m.id))}
                accessibilityLabel={`${m.label}, ${entries.length ? `${line.approx ? 'about ' : ''}${Math.round(line.kcal)} kilocalories, ${line.detail}` : 'not logged yet'}`}
                style={{
                  flex: 1,
                  minWidth: 0,
                  minHeight: 44,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: spacing.md,
                }}>
                <Avatar emoji={m.emoji} />
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                    <Text variant="bodyStrong">{m.label}</Text>
                    {entries.length ? <EmojiStack emojis={line.emojis} /> : null}
                  </View>
                  {entries.length ? (
                    <Text variant="caption" color="textSecondary" numberOfLines={1}>
                      {line.detail}
                    </Text>
                  ) : (
                    <Text variant="caption" color="textSecondary" numberOfLines={1}>
                      {prev
                        ? `${sentence(relativeTo(prev.date, day.date))}: ${formatNumber(prev.entries.reduce((s, e) => s + e.nutrients.kcal, 0))} kcal`
                        : `Around ${formatNumber(Math.round((day.budget * MEAL_SHARE[m.id]) / 10) * 10)} kcal suggested`}
                    </Text>
                  )}
                </View>
                {entries.length ? (
                  <Text variant="title" tabular>
                    {`${line.approx ? '~' : ''}${formatNumber(line.kcal)}`}
                    <Text variant="caption" color="textTertiary">
                      {' kcal'}
                    </Text>
                  </Text>
                ) : null}
              </PressableScale>
              {prev ? <RepeatButton meal={m.id} date={day.date} prev={prev} /> : null}
              <IconButton testID={`today-add-${m.id}`} accessibilityLabel={`Add food to ${m.label}`} tone="alt" size={36} onPress={() => open(m.id)}>
                <Plus size={18} color={colors.primary} />
              </IconButton>
            </View>
          </View>
        );
      })}
    </View>
  );
}

function RepeatButton({ meal, date, prev }: { meal: MealType; date: ISODate; prev: { date: ISODate; entries: FoodEntry[] } }) {
  const { colors, radius } = useTheme();
  const kcal = prev.entries.reduce((s, e) => s + e.nutrients.kcal, 0);
  const label = MEAL_LABEL[meal].toLowerCase();
  const when = relativeTo(prev.date, date);
  return (
    <PressableScale
      testID={`today-repeat-${meal}`}
      hitSlop={4}
      onPress={() => copyEntries(prev.entries, date, meal, `Copied ${label} from ${when}`)}
      accessibilityLabel={`Repeat ${when}'s ${label}, ${Math.round(kcal)} kilocalories`}
      style={{
        height: 36,
        paddingHorizontal: 10,
        borderRadius: radius.pill,
        backgroundColor: colors.primarySoft,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
      }}>
      <Copy size={14} color={colors.primary} />
      <Text variant="label" color="primary" style={{ fontSize: 12 }}>
        Repeat
      </Text>
    </PressableScale>
  );
}

function EmojiStack({ emojis }: { emojis: string[] }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row' }} accessible={false}>
      {emojis.map((e, i) => (
        <View
          key={i}
          style={{
            width: 20,
            height: 20,
            borderRadius: 10,
            marginLeft: i === 0 ? 0 : -6,
            backgroundColor: colors.surfaceAlt,
            borderWidth: 1.5,
            borderColor: colors.surface,
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: emojis.length - i,
          }}>
          <Text style={{ fontSize: 11, lineHeight: 14 }}>{e}</Text>
        </View>
      ))}
    </View>
  );
}
