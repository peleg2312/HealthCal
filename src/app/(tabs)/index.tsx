import { router } from 'expo-router';
import { Plus, Repeat2 } from 'lucide-react-native';
import React, { useState } from 'react';
import { useWindowDimensions, View } from 'react-native';

import { copyEntries, findPreviousMeal } from '@/features/food/actions';
import { useRecapReady } from '@/features/progress/recapReady';
import { coachTip, rhythmFromReminders, type ClosedDay } from '@/features/today/coach';
import { DayRingStrip, STRIP_WEEKS } from '@/features/today/DayRingStrip';
import { FitsSheet } from '@/features/today/FitsSheet';
import { mealLine } from '@/features/today/meals';
import { ReadyRim } from '@/features/today/ReadyRim';
import { RecapReadyCard } from '@/features/today/RecapReadyCard';
import { FirstLogInvite } from '@/features/today/FirstLogInvite';
import { useDaySwipe } from '@/features/today/useDaySwipe';
import { startDate, weekDates } from '@/features/today/week';
import { ShareDayButton } from '@/features/share';
import { greetingTitle } from '@/features/today/greetingTitle';
import { TabHeader, tabDay, tabTitleRoom, tabTitleSize } from '@/components/TabHeader';
import { MilestoneSheet } from '@/features/streak/MilestoneSheet';
import { AFTER_STRIP_MS, StreakMark } from '@/features/streak/StreakMark';
import { useStreakMoment } from '@/features/streak/useStreakMoment';
import { addWater, defaultGlass, StatusRail } from '@/features/today/StatusRail';
import { useReportViewedDay } from '@/features/today/viewedDay';
import { addDays, formatShortDate, greeting } from '@/lib/dates';
import { MEALS, MEAL_LABEL, MEAL_SHARE, mealForTime } from '@/lib/nutrition';
import { formatNumber, formatVolume } from '@/lib/units';
import { useStore } from '@/store';
import { useNow, useToday } from '@/store/clock';
import { useConsistency, useDay, useLive, useProfile, type DaySummary } from '@/store/selectors';
import { motion, useTheme } from '@/theme';
import type { FoodEntry, ISODate, MealType } from '@/types';
import { AnimatedNumber, Button, Card, CupKey, IconButton, PressableScale, ProgressBar, Screen, Text, Vessel, type VesselLabel } from '@/ui';


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
  const streak = useStreakMoment(consistency, todayDate);
  const start = startDate(profile.onboardedAt);
  // Day one (or a profile with nothing logged yet): one obvious first action.
  const firstDay = isToday && day.entries.length === 0 && consistency.totalDaysLogged === 0;
  const yesterday = useDay(addDays(todayDate, -1));
  const now = useNow();
  const recap = useRecapReady();
  // The "What fits" sheet: null when closed, else whether protein is the gap it was opened for.
  const [fits, setFits] = useState<{ proteinFirst: boolean } | null>(null);

  const { width } = useWindowDimensions();
  const title = greetingTitle(greeting(now), profile.name ?? '', tabTitleRoom(width), tabTitleSize(width));
  const select = (d: ISODate) => setPicked(d === todayDate ? null : d);
  // A sideways swipe on the page moves one day, back as far as the strip goes (never before the profile was made).
  const stripFirst = weekDates(todayDate, STRIP_WEEKS - 1)[0];
  const swipe = useDaySwipe({ date, onChange: select, latest: todayDate, earliest: start && start > stripFirst ? start : stripFirst });

  return (
    <Screen
      tabs
      testID="today-screen"
      header={<TabHeader tab="today" overline={tabDay(date)} title={title} />}>
      <View testID="today-swipe" {...swipe} style={{ gap: spacing.md }}>
      {/* The one date control, the same as the diary's: the strip, then the week's caption with the streak or "Back to today". */}
      <DayRingStrip
        today={todayDate}
        selected={date}
        onSelect={select}
        start={start}
        jumpTestID="today-jump-today"
        // 16 px to what follows, as on the diary, so the first card starts at the same height on both tabs.
        style={{ marginBottom: spacing.xs }}
        accessory={streak.streak > 1 ? <StreakMark days={streak.streak} filled={streak.filled} /> : null}
        // Said in the caption's place once the streak cup has poured and its number ticked up, so
        // logging never pushes the page down and the line never runs ahead of the count.
        note={isToday && streak.line ? { text: streak.line, delay: AFTER_STRIP_MS + motion.duration.pourSmall, testID: 'today-streak-line' } : null}
      />

      <EnergyCard
        day={day}
        isToday={isToday}
        firstDay={firstDay}
        meal={mealForTime(now)}
        onFits={() => setFits({ proteinFirst: false })}
        share={<ShareDayButton date={date} />}
      />
      {/* The coach's one line and its one action, under the card whose numbers it talks about; early in
          the week "Your week is ready" takes its place. Day one has neither: the invite in the card is the one thing to do. */}
      {!isToday || firstDay ? null : recap.announce ? (
        <RecapReadyCard />
      ) : (
        <CoachLine
          day={day}
          yesterday={yesterday.entries.length ? { eaten: yesterday.eaten.kcal, budget: yesterday.budget } : null}
          onFits={() => setFits({ proteinFirst: true })}
        />
      )}
      <StatusRail day={day} isToday={isToday} quiet={firstDay} />

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
      <MilestoneSheet milestone={streak.milestone} onClose={streak.closeMilestone} />
      </View>
    </Screen>
  );
}

// ------------------------------------------------------------- energy hero

/** Tall enough for the cup's three labels with 8 px between them at any value; the macros sit under the cup, not beside it. */
const VESSEL_H = 150;
/** Day one: a shorter, empty cup, so the first-log invite under it stays in the first screen. */
const VESSEL_H_FIRST = 150;

function EnergyCard({
  day,
  isToday,
  firstDay,
  meal,
  onFits,
  share,
}: {
  day: DaySummary;
  isToday: boolean;
  firstDay: boolean;
  meal: MealType;
  onFits: () => void;
  /** The day's share button, at the end of the budget line. */
  share: React.ReactNode;
}) {
  const { colors, spacing } = useTheme();
  const { width: screenW } = useWindowDimensions();
  const narrow = screenW < 360;
  const over = day.remaining < 0;
  const eaten = day.eaten.kcal;
  const budget = Math.max(0, day.budget);
  // A past day with no food is not an intake deficit of the whole budget: it was not logged.
  const notLogged = !isToday && day.entries.length === 0;
  // Calories added by exercise, drawn as hatched headroom at the top of the vessel.
  const headroom = Math.max(0, day.budget - day.target);
  const left = formatNumber(Math.abs(day.remaining));
  // The big number sits in the empty space between the level and the base budget (or the brim).
  const inBand = eaten > budget - headroom;
  const emptyTop = inBand ? budget : budget - headroom;
  const numSize = narrow ? (left.length >= 5 ? 40 : 44) : left.length >= 5 ? 50 : 60;
  const unitWord = over ? 'over' : isToday ? 'left' : 'under';
  const height = firstDay ? VESSEL_H_FIRST : VESSEL_H;
  const vesselW = narrow ? 66 : 84;
  // Burned in activity but left out of the budget (exercise is not added in Goals).
  const notAdded = headroom > 0 ? 0 : Math.max(0, day.exerciseNet);
  const budgetLabel =
    headroom > 0
      ? `Budget ${formatNumber(day.budget)} kilocalories: ${formatNumber(day.target)} target plus ${formatNumber(headroom)} from exercise`
      : `Daily budget ${formatNumber(day.budget)} kilocalories`;

  const labels: VesselLabel[] = [];
  if (headroom > 0) {
    labels.push({
      key: 'burned',
      // Beside its hatched band: mid-band, or the very top once eaten has risen into the band,
      // so it always reads above the eaten line.
      at: inBand ? budget : budget - headroom / 2,
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
  if (notLogged) {
    labels.push({
      key: 'left',
      at: budget / 2,
      height: 52,
      content: (
        <PressableScale
          testID="today-not-logged"
          scaleTo={0.97}
          onPress={() => router.push(`/diary?date=${day.date}` as never)}
          accessibilityLabel="Nothing logged for this day. Open the diary to add it"
          style={{ alignSelf: 'flex-start', gap: 2 }}>
          <Text variant="h2" testID="today-remaining">
            Nothing logged
          </Text>
          <Text variant="label" color="primaryInk">
            Add what you ate
          </Text>
        </PressableScale>
      ),
    });
  } else {
    labels.push({
      key: 'left',
      at: (Math.min(eaten, budget) + emptyTop) / 2,
      // At least 44 tall, so the number is a whole touch target even at its smallest (40 px type on a narrow phone).
      height: Math.max(44, numSize - 4),
      content: (
        <PressableScale
          testID="today-remaining-open"
          scaleTo={0.97}
          onPress={onFits}
          accessibilityLabel={`${left} kilocalories ${unitWord}. See which of your foods fit`}
          style={{ alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6 }}>
            <AnimatedNumber
              variant="numXL"
              color={over ? 'warningInk' : 'caloriesInk'}
              testID="today-remaining"
              numberOfLines={1}
              value={day.remaining}
              format={(n) => formatNumber(Math.abs(Math.round(n)))}
              duration={motion.duration.pour}
              accessibilityLabel={`${left} kilocalories ${unitWord}`}
              style={{ fontSize: numSize, lineHeight: numSize - 2, letterSpacing: -numSize * 0.035 }}
            />
            <Text variant="unit" style={{ fontSize: 14, lineHeight: 17, marginBottom: numSize * 0.08 }}>
              {`kcal\n${unitWord}`}
            </Text>
          </View>
        </PressableScale>
      ),
    });
    if (!firstDay) {
      labels.push({
        key: 'eaten',
        at: Math.min(eaten, budget),
        height: 22,
        tick: colors.rim,
        content: (
          // Text only: it never takes a tap meant for the big number above it.
          <View pointerEvents="none">
            <AnimatedNumber variant="numM" numberOfLines={1} value={eaten} format={(n) => formatNumber(Math.round(n))} style={{ fontSize: 17, lineHeight: 22 }} testID="today-eaten">
              <Text variant="body" color="textSecondary" style={{ fontSize: 14 }}>
                {'  eaten'}
              </Text>
            </AnimatedNumber>
          </View>
        ),
      });
    }
  }

  return (
    <Card testID="today-energy" padding={18}>
      <View>
        <Vessel
          value={eaten}
          max={budget}
          headroom={headroom}
          color={colors.calories}
          width={vesselW}
          height={height}
          labels={labels}
          labelGap={narrow ? 14 : 16}
          labelSpacing={8}
          memoryKey={`hero-${day.date}`}
        />
        {/* Day one: the empty cup's open top is a dashed level line at the budget, "ready to fill". */}
        {firstDay && headroom === 0 ? <ReadyRim width={vesselW} /> : null}
      </View>
      {/* The macros sit under the cup, not in its side column: beside the cup there is room only for
          the cup's own labels, each at the height it describes, whatever the day's numbers are. */}
      {firstDay || notLogged ? null : (
        <View style={{ flexDirection: 'row', gap: narrow ? spacing.md : spacing.lg, marginTop: spacing.lg }} testID="today-macros">
          <MacroColumn label="Protein" value={day.eaten.protein} target={day.macros.proteinG} color={colors.protein} narrow={narrow} reach />
          <MacroColumn label="Carbs" value={day.eaten.carbs} target={day.macros.carbsG} color={colors.carbs} narrow={narrow} />
          <MacroColumn label="Fat" value={day.eaten.fat} target={day.macros.fatG} color={colors.fat} narrow={narrow} />
        </View>
      )}
      {firstDay ? (
        <View style={{ marginTop: 18 }}>
          <FirstLogInvite meal={meal} date={day.date} budget={day.budget} />
        </View>
      ) : null}
      <View style={{ height: 1, backgroundColor: colors.border, marginTop: 16, marginBottom: 8 }} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        {/* One short line: the hatching and its label already say what exercise added; the whole sum is read out.
            When exercise is not added to the budget, a second short line says what was burned and left out. */}
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text variant="caption" color="textSecondary" testID="today-budget" accessibilityLabel={budgetLabel}>
            {firstDay ? (
              'Log the first thing and the cup starts to fill.'
            ) : (
              <>
                {'Budget '}
                <Text variant="numM" style={{ fontSize: 14, lineHeight: 17 }}>
                  {formatNumber(day.budget)}
                </Text>
                {' kcal'}
              </>
            )}
          </Text>
          {notAdded > 0 && !firstDay ? (
            <Text variant="caption" color="textSecondary" testID="today-not-added">
              {`${formatNumber(notAdded)} kcal burned, not added`}
            </Text>
          ) : null}
        </View>
        {share}
      </View>
    </Card>
  );
}

/** One macro as a column: its key and name, its bar, then the amount of its target. The same shape as the diary's summary card. */
function MacroColumn({ label, value, target, color, reach, narrow }: { label: string; value: number; target: number; color: string; reach?: boolean; narrow: boolean }) {
  return (
    <View style={{ flex: 1, minWidth: 0, gap: 8 }} accessible accessibilityLabel={`${label}, ${Math.round(value)} of ${target} grams`}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <CupKey color={color} />
        <Text variant="label" numberOfLines={1}>
          {label}
        </Text>
      </View>
      <ProgressBar progress={target > 0 ? value / target : 0} color={color} height={6} goalKind={reach ? 'reach' : 'limit'} />
      {/* The target may wrap under the number on a narrow phone, whole ("/ 493 g"); it is never cut. */}
      <AnimatedNumber variant="numM" value={Math.round(value)} style={{ fontSize: narrow ? 15 : 17, lineHeight: narrow ? 20 : 22 }}>
        <Text variant="caption" color="textSecondary">{` / ${Math.round(target)} g`}</Text>
      </AnimatedNumber>
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
 * The coach's line under the calorie card: one sentence pair in at most two lines ("Had dinner
 * yet? It is not in today's log.") and its one action as a small button directly under it
 * (a glass of water, repeat a meal, see what fits, or where the tip points). No chevron, no chips:
 * one thing to read, one thing to tap.
 */
function CoachLine({ day, yesterday, onFits }: { day: DaySummary; yesterday: ClosedDay | null; onFits: () => void }) {
  const { colors, spacing } = useTheme();
  const profile = useProfile();
  const now = useNow();
  const entries = useLive('foodEntries');
  const presets = useStore((s) => s.settings.waterPresets);
  const reminders = useStore((s) => s.settings.reminders);
  const tip = coachTip(day, profile.units, now, rhythmFromReminders(reminders), yesterday);
  const action = tip.action;
  const quick = tip.quick;
  const prev = quick?.kind === 'repeat' ? findPreviousMeal(entries, day.date, quick.meal, 7) : null;
  const glass = defaultGlass(presets);

  const small = { size: 'sm' as const, variant: 'secondary' as const, full: false, style: { alignSelf: 'flex-start' as const } };
  let button: React.ReactNode = null;
  if (quick?.kind === 'water') {
    button = (
      <Button
        {...small}
        testID="today-coach-water"
        tint={colors.water}
        icon={<Plus size={16} color={colors.water} strokeWidth={2.6} />}
        title={`Add ${formatVolume(glass, profile.units)}`}
        accessibilityLabel={`Add ${formatVolume(glass, profile.units)} of water`}
        onPress={() => addWater(day.date, glass, profile.units, day.waterGoalMl)}
      />
    );
  } else if (quick?.kind === 'repeat' && prev) {
    const kcal = prev.entries.reduce((sum, e) => sum + e.nutrients.kcal, 0);
    const meal = MEAL_LABEL[quick.meal].toLowerCase();
    const when = relativeTo(prev.date, day.date);
    button = (
      <Button
        {...small}
        testID="today-coach-repeat"
        icon={<Repeat2 size={16} color={colors.text} strokeWidth={2.2} />}
        title={`Repeat ${when}'s ${meal}`}
        accessibilityLabel={`Repeat ${when}'s ${meal}, ${formatNumber(kcal)} kilocalories`}
        onPress={() => copyEntries(prev.entries, day.date, quick.meal, `Copied ${meal} from ${when}`)}
      />
    );
  } else if (quick?.kind === 'fits' || action) {
    button = (
      <Button
        {...small}
        testID="today-coach-open"
        title={action?.label ?? 'See what fits'}
        onPress={quick?.kind === 'fits' ? onFits : () => router.push(action!.href as never)}
      />
    );
  }

  return (
    <View testID="today-coach" style={{ gap: spacing.sm, marginVertical: spacing.xs }}>
      <Text variant="body" accessibilityLabel={`${tip.title}. ${tip.body}`}>
        <Text variant="bodyStrong">{/[.!?]$/.test(tip.title) ? tip.title : `${tip.title}.`}</Text>
        <Text variant="body" color="textSecondary">{` ${tip.body}`}</Text>
      </Text>
      {button}
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
          accessibilityLabel="Open diary"
          hitSlop={8}
          style={{ minHeight: 44, justifyContent: 'center', marginVertical: -12, paddingLeft: 12 }}>
          <Text variant="label" color="textSecondary">
            Open diary
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
                  <Text variant="caption" color="textSecondary" numberOfLines={2}>
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
      style={{ paddingHorizontal: 10, alignSelf: 'center' }}
    />
  );
}

