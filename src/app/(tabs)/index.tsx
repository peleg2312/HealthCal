import { router } from 'expo-router';
import { ChevronRight, Droplets, Flame, Plus, Repeat2 } from 'lucide-react-native';
import React, { useState } from 'react';
import { useWindowDimensions, View } from 'react-native';

import { copyEntries, findPreviousMeal } from '@/features/food/actions';
import { useRecapReady } from '@/features/progress/recapReady';
import { coachTip, rhythmFromReminders } from '@/features/today/coach';
import { DayRingStrip } from '@/features/today/DayRingStrip';
import { FitsSheet } from '@/features/today/FitsSheet';
import { mealLine } from '@/features/today/meals';
import { RecapReadyCard } from '@/features/today/RecapReadyCard';
import { addWater, defaultGlass, StatusRail } from '@/features/today/StatusRail';
import { useReportViewedDay } from '@/features/today/viewedDay';
import { addDays, formatShortDate, fromISODate, greeting, weekdayShort } from '@/lib/dates';
import { MEALS, MEAL_LABEL, MEAL_SHARE, mealForTime } from '@/lib/nutrition';
import { formatNumber, formatVolume } from '@/lib/units';
import { useStore } from '@/store';
import { useNow, useToday } from '@/store/clock';
import { useConsistency, useDay, useLive, useProfile, type DaySummary } from '@/store/selectors';
import { cupFor, useTheme } from '@/theme';
import type { FoodEntry, ISODate, MealType } from '@/types';
import { Button, Card, Chip, CupKey, IconButton, PressableScale, ProgressBar, Screen, Text, Vessel, type VesselLabel } from '@/ui';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const longDay = (date: ISODate) => `${WEEKDAYS[fromISODate(date).getDay()]}, ${formatShortDate(date)}`;

export default function TodayScreen() {
  const { spacing } = useTheme();
  const profile = useProfile();
  const todayDate = useToday();
  // Null follows the clock, so the screen rolls over at midnight unless a day was picked.
  const [picked, setPicked] = useState<ISODate | null>(null);
  const date = picked && picked < todayDate ? picked : todayDate;
  // The + sheet logs to the day being looked at.
  useReportViewedDay(date === todayDate ? null : date);
  const isToday = date === todayDate;
  const day = useDay(date);
  const consistency = useConsistency(todayDate);
  const now = useNow();
  const recap = useRecapReady();
  // The "What fits" sheet: null when closed, else whether protein is the gap it was opened for.
  const [fits, setFits] = useState<{ proteinFirst: boolean } | null>(null);

  return (
    <Screen tabs testID="today-screen" contentStyle={{ gap: spacing.md }}>
      <View style={{ gap: spacing.xs }}>
        <TodayHeader
          overline={isToday ? longDay(date) : 'Looking back'}
          title={isToday ? `${greeting(now)}${profile.name ? `, ${profile.name}` : ''}` : `${weekdayShort(date)}, ${formatShortDate(date)}`}
          isToday={isToday}
          initial={(profile.name || 'Me').slice(0, 1).toUpperCase()}
          onJumpToday={() => setPicked(null)}
        />
        {isToday && !recap.announce ? <CoachLine day={day} onFits={() => setFits({ proteinFirst: true })} /> : null}
      </View>

      <View style={{ marginTop: spacing.xxs }}>
        <DayRingStrip
          today={todayDate}
          selected={date}
          onSelect={(d) => setPicked(d === todayDate ? null : d)}
          accessory={consistency.streak > 1 ? <Streak days={consistency.streak} /> : null}
        />
      </View>

      <EnergyCard day={day} isToday={isToday} onFits={() => setFits({ proteinFirst: false })} />
      <StatusRail day={day} isToday={isToday} />
      {isToday && recap.announce ? <RecapReadyCard /> : null}

      <MealsSection day={day} />

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

// ------------------------------------------------------------------ header

function TodayHeader({
  overline,
  title,
  isToday,
  initial,
  onJumpToday,
}: {
  overline: string;
  title: string;
  isToday: boolean;
  initial: string;
  onJumpToday: () => void;
}) {
  const { colors, spacing } = useTheme();
  const { width } = useWindowDimensions();
  const size = width < 360 ? 23 : 27;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, paddingTop: spacing.sm }}>
      <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
        <Text variant="overline" numberOfLines={1}>
          {overline}
        </Text>
        <Text variant="h1" numberOfLines={2} style={{ fontSize: size, lineHeight: size + 5, letterSpacing: -size * 0.025 }}>
          {title}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
        {!isToday ? (
          <Chip testID="today-jump-today" label="Today" selected onPress={onJumpToday} />
        ) : null}
        <PressableScale
          testID="today-profile"
          onPress={() => router.push('/profile')}
          accessibilityLabel="Profile and settings"
          style={{ width: 44, height: 44, ...cupFor(44), backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
          <Text variant="h3">{initial}</Text>
        </PressableScale>
      </View>
    </View>
  );
}

/** The logging streak, in the week strip's caption row: a flame and the count. */
function Streak({ days }: { days: number }) {
  const { colors } = useTheme();
  return (
    <PressableScale
      testID="today-streak"
      onPress={() => router.push('/consistency' as never)}
      accessibilityLabel={`${days} day logging streak`}
      hitSlop={6}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 3, minHeight: 32, paddingHorizontal: 4 }}>
      <Flame size={16} color={colors.caloriesInk} strokeWidth={2.2} />
      <Text variant="numM" style={{ fontSize: 15, lineHeight: 20 }}>
        {days}
      </Text>
      <Text variant="caption" color="textSecondary">
        {days === 1 ? 'day' : 'days'}
      </Text>
    </PressableScale>
  );
}

// ------------------------------------------------------------- energy hero

const VESSEL_H = 212;

function EnergyCard({ day, isToday, onFits }: { day: DaySummary; isToday: boolean; onFits: () => void }) {
  const { colors } = useTheme();
  const { width: screenW } = useWindowDimensions();
  const narrow = screenW < 360;
  const over = day.remaining < 0;
  const eaten = day.eaten.kcal;
  const budget = Math.max(0, day.budget);
  // Calories added by exercise, drawn as hatched headroom at the top of the vessel.
  const headroom = Math.max(0, day.budget - day.target);
  const left = formatNumber(Math.abs(day.remaining));
  // The big number sits in the empty space between the level and the base budget (or the brim).
  const emptyTop = eaten < budget - headroom ? budget - headroom : budget;
  const numSize = narrow ? 44 : left.length >= 5 ? 50 : 60;

  const labels: VesselLabel[] = [];
  if (headroom > 0) {
    labels.push({
      key: 'burned',
      at: budget - headroom / 2,
      height: 22,
      tick: colors.exercise,
      content: (
        <Text variant="numM" numberOfLines={1} style={{ fontSize: 17, lineHeight: 22 }}>
          {`+${formatNumber(headroom)}`}
          <Text variant="body" color="textSecondary" style={{ fontSize: 14 }}>
            {'  burned, added'}
          </Text>
        </Text>
      ),
    });
  }
  labels.push({
    key: 'left',
    at: (Math.min(eaten, budget) + emptyTop) / 2,
    height: numSize - 4,
    content: (
      <PressableScale
        testID="today-remaining-open"
        scaleTo={0.97}
        onPress={onFits}
        accessibilityLabel={`${left} ${over ? 'kilocalories over' : isToday ? 'kilocalories left' : 'kilocalories under'}. See which of your foods fit`}
        style={{ flexDirection: 'row', alignItems: 'flex-end', alignSelf: 'flex-start', gap: 6 }}>
        <Text
          variant="numXL"
          color={over ? 'warning' : 'caloriesInk'}
          testID="today-remaining"
          numberOfLines={1}
          style={{ fontSize: numSize, lineHeight: numSize - 2, letterSpacing: -numSize * 0.035 }}>
          {left}
        </Text>
        <Text variant="unit" style={{ fontSize: 14, lineHeight: 17, marginBottom: numSize * 0.08 }}>
          {`kcal\n${over ? 'over' : isToday ? 'left' : 'under'}`}
        </Text>
      </PressableScale>
    ),
  });
  labels.push({
    key: 'eaten',
    at: Math.min(eaten, budget),
    height: 22,
    tick: colors.rim,
    content: (
      <Text variant="numM" numberOfLines={1} style={{ fontSize: 17, lineHeight: 22 }}>
        {formatNumber(eaten)}
        <Text variant="body" color="textSecondary" style={{ fontSize: 14 }}>
          {'  eaten'}
        </Text>
      </Text>
    ),
  });

  return (
    <Card testID="today-energy" padding={18}>
      <Vessel value={eaten} max={budget} headroom={headroom} color={colors.calories} width={narrow ? 66 : 84} height={VESSEL_H} labels={labels} labelGap={narrow ? 14 : 16}>
        <View style={{ gap: 10 }}>
          <Macro label="Protein" value={day.eaten.protein} target={day.macros.proteinG} color={colors.protein} />
          <Macro label="Carbs" value={day.eaten.carbs} target={day.macros.carbsG} color={colors.carbs} />
          <Macro label="Fat" value={day.eaten.fat} target={day.macros.fatG} color={colors.fat} />
        </View>
      </Vessel>
      <View style={{ height: 1, backgroundColor: colors.border, marginTop: 16, marginBottom: 12 }} />
      <Text variant="caption" color="textSecondary">
        {headroom > 0 ? (
          <>
            {'Budget '}
            <Text variant="numM" style={{ fontSize: 14, lineHeight: 17 }}>
              {formatNumber(day.budget)}
            </Text>
            {` = ${formatNumber(day.target)} target + ${formatNumber(headroom)} from exercise`}
          </>
        ) : (
          <>
            {'Daily budget '}
            <Text variant="numM" style={{ fontSize: 14, lineHeight: 17 }}>
              {formatNumber(day.budget)}
            </Text>
            {' kcal'}
            {day.exerciseNet > 0 ? `, ${formatNumber(day.exerciseNet)} kcal burned in activity not added` : ''}
          </>
        )}
        {over ? `. ${left} kcal past the budget` : ''}
      </Text>
    </Card>
  );
}

function Macro({ label, value, target, color }: { label: string; value: number; target: number; color: string }) {
  return (
    <View style={{ gap: 5 }} accessible accessibilityLabel={`${label}, ${Math.round(value)} of ${target} grams`}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <CupKey color={color} />
        <Text variant="label" style={{ flex: 1 }} numberOfLines={1}>
          {label}
        </Text>
        <Text variant="numM" style={{ fontSize: 14.5, lineHeight: 18 }}>
          {Math.round(value)}
          <Text variant="caption" color="textSecondary">{` / ${target} g`}</Text>
        </Text>
      </View>
      <ProgressBar progress={target > 0 ? value / target : 0} color={color} height={6} />
    </View>
  );
}

// ------------------------------------------------------------------ coach

const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "yesterday" or "Nov 10", from the date of the day being viewed (never the wall clock). */
function relativeTo(date: ISODate, from: ISODate): string {
  return date === addDays(from, -1) ? 'yesterday' : formatShortDate(date);
}

/**
 * The coach's one line under the greeting ("On track. 941 kcal left and
 * 2.08 L of water to go."), with its quick actions under it as chips.
 */
function CoachLine({ day, onFits }: { day: DaySummary; onFits: () => void }) {
  const { colors, spacing } = useTheme();
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
        icon={<Droplets size={15} color={colors.water} strokeWidth={2.2} />}
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
        icon={<Repeat2 size={15} color={colors.text} strokeWidth={2.2} />}
        label={`Repeat ${relativeTo(prev.date, day.date)}'s ${meal}, ${formatNumber(kcal)} kcal`}
        onPress={() => copyEntries(prev.entries, day.date, quick.meal, `Copied ${meal} from ${relativeTo(prev.date, day.date)}`)}
      />,
    );
    if (open) chips.push(<Chip key="else" testID="today-coach-else" label="Something else" onPress={open} />);
  }

  const line = (
    <Text variant="body" style={{ flex: 1 }}>
      <Text variant="bodyStrong">{/[.!?]$/.test(tip.title) ? tip.title : `${tip.title}.`}</Text>
      <Text variant="body" color="textSecondary">{` ${tip.body}`}</Text>
    </Text>
  );

  return (
    <View testID="today-coach" style={{ gap: spacing.sm }}>
      <PressableScale
        testID="today-coach-open"
        scaleTo={0.99}
        disabled={!open}
        dimDisabled={false}
        feedback={open ? 'tap' : 'none'}
        onPress={open}
        accessibilityLabel={action ? `${tip.title}. ${tip.body} ${action.label}` : `${tip.title}. ${tip.body}`}
        style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, minHeight: open ? 44 : undefined }}>
        {line}
        {open ? <ChevronRight size={18} color={colors.textSecondary} /> : null}
      </PressableScale>
      {chips.length ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>{chips}</View> : null}
    </View>
  );
}

// ------------------------------------------------------------------ meals

function MealsSection({ day }: { day: DaySummary }) {
  const { colors, spacing } = useTheme();
  const all = useLive('foodEntries');
  const open = (meal: MealType) => router.push(`/food/search?meal=${meal}&date=${day.date}`);
  return (
    <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <Text variant="h3">Meals</Text>
        <PressableScale
          testID="section-meals-action"
          onPress={() => router.push(`/diary?date=${day.date}` as never)}
          accessibilityLabel={`Open diary, ${formatNumber(day.eaten.kcal)} kilocalories logged`}
          hitSlop={8}
          style={{ minHeight: 44, justifyContent: 'center', marginVertical: -12, paddingLeft: 12 }}>
          <Text variant="caption" color="textSecondary">
            <Text variant="numM" style={{ fontSize: 14, lineHeight: 17 }} color="textSecondary">
              {formatNumber(day.eaten.kcal)}
            </Text>
            {' kcal · Open diary'}
          </Text>
        </PressableScale>
      </View>
      <Card testID="today-meals" padding={0} style={{ paddingVertical: 2 }}>
        {MEALS.map((m, i) => {
          const entries = day.byMeal[m.id];
          const line = mealLine(entries);
          const prev = entries.length ? null : findPreviousMeal(all, day.date, m.id, 7);
          return (
            <View key={m.id}>
              {i > 0 ? <View style={{ height: 1, backgroundColor: colors.border, marginLeft: spacing.lg }} /> : null}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingLeft: spacing.lg, paddingRight: spacing.sm, paddingVertical: 10 }}>
                <PressableScale
                  testID={`today-meal-${m.id}`}
                  scaleTo={0.99}
                  onPress={() => (entries.length ? router.push(`/diary?date=${day.date}&meal=${m.id}` as never) : open(m.id))}
                  accessibilityLabel={`${m.label}, ${entries.length ? `${line.approx ? 'about ' : ''}${Math.round(line.kcal)} kilocalories, ${line.detail}` : 'not logged yet'}`}
                  style={{ flex: 1, minWidth: 0, minHeight: 44, justifyContent: 'center' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm }}>
                    <Text variant="title" style={{ flex: 1 }} numberOfLines={1}>
                      {m.label}
                    </Text>
                    {entries.length ? (
                      <Text variant="numM" style={{ fontSize: 17, lineHeight: 22 }}>
                        {`${line.approx ? '~' : ''}${formatNumber(line.kcal)}`}
                        <Text variant="unit">{' kcal'}</Text>
                      </Text>
                    ) : null}
                  </View>
                  <Text variant="caption" color="textSecondary" numberOfLines={1}>
                    {entries.length
                      ? line.detail
                      : prev
                        ? `${sentence(relativeTo(prev.date, day.date))}: ${formatNumber(prev.entries.reduce((s, e) => s + e.nutrients.kcal, 0))} kcal`
                        : `Around ${formatNumber(Math.round((day.budget * MEAL_SHARE[m.id]) / 10) * 10)} kcal suggested`}
                  </Text>
                </PressableScale>
                {prev ? <RepeatButton meal={m.id} date={day.date} prev={prev} /> : null}
                <IconButton testID={`today-add-${m.id}`} accessibilityLabel={`Add food to ${m.label}`} onPress={() => open(m.id)}>
                  <Plus size={20} color={colors.text} strokeWidth={2.2} />
                </IconButton>
              </View>
            </View>
          );
        })}
      </Card>
    </View>
  );
}

function RepeatButton({ meal, date, prev }: { meal: MealType; date: ISODate; prev: { date: ISODate; entries: FoodEntry[] } }) {
  const { colors } = useTheme();
  const kcal = prev.entries.reduce((s, e) => s + e.nutrients.kcal, 0);
  const label = MEAL_LABEL[meal].toLowerCase();
  const when = relativeTo(prev.date, date);
  return (
    <Button
      testID={`today-repeat-${meal}`}
      title="Repeat"
      accessibilityLabel={`Repeat ${when}'s ${label}, ${Math.round(kcal)} kilocalories`}
      variant="secondary"
      size="sm"
      full={false}
      icon={<Repeat2 size={16} color={colors.text} strokeWidth={2.2} />}
      onPress={() => copyEntries(prev.entries, date, meal, `Copied ${label} from ${when}`)}
      style={{ paddingHorizontal: 10 }}
    />
  );
}

