import { router, useLocalSearchParams } from 'expo-router';
import { Plus } from 'lucide-react-native';
import React from 'react';
import { useWindowDimensions, View } from 'react-native';

import { hasWaterTracked } from '@/features/drinks/via';
import { fileStepsNote, shownSteps } from '@/features/health-sync/steps';
import { useHealthSync } from '@/features/health-sync/store';
import { coachMessage } from '@/features/morning/coach';
import { dayFacts, isNothing } from '@/features/morning/facts';
import { logMealTitle } from '@/features/morning/figures';
import { morningTitle } from '@/features/morning/greeting';
import { goalMet, morningLine } from '@/features/morning/line';
import { MoveRow } from '@/features/morning/MoveRow';
import { personalLine } from '@/features/morning/personal';
import { targetsLine, todayPlan, weekBeforeYesterday, weekSoFar } from '@/features/morning/plan';
import { PlanCard } from '@/features/morning/PlanCard';
import { QuoteBlock } from '@/features/morning/QuoteBlock';
import { quoteTheme } from '@/features/morning/quotes';
import { NOTHING_CAPTION, NOTHING_LINE, reviewNote, toAdjust, wentWell, type ReviewKind } from '@/features/morning/review';
import { ReviewList } from '@/features/morning/ReviewList';
import { useDayQuote } from '@/features/morning/useDayQuote';
import { WeekBlock } from '@/features/morning/WeekBlock';
import { weekCells, type WeekDayIn } from '@/features/morning/weekCells';
import { YesterdayFigures } from '@/features/morning/YesterdayFigures';
import { ShareDayButton } from '@/features/share';
import { findByDate } from '@/features/trackers/helpers';
import { addDays, diffDays, formatShortDate, greeting, toISODate, weekdayShort } from '@/lib/dates';
import { guidelineMinutes } from '@/lib/exercise';
import { mealForTime } from '@/lib/nutrition';
import { useNow, useToday } from '@/store/clock';
import { useConsistency, useDay, useDays, useLive, useProfile, useWeightSeries, type DaySummary } from '@/store/selectors';
import { useTextSize, useTheme } from '@/theme';
import type { ActivityEntry, ISODate } from '@/types';
import { Button, Card, Divider, FadeUp, Header, Screen, Text, goBack } from '@/ui';

/** Guideline minutes of the activities dated from..to (inclusive). */
function minutesIn(activities: ActivityEntry[], range: { from: ISODate; to: ISODate } | null): number {
  if (!range) return 0;
  return guidelineMinutes(activities.filter((a) => a.date >= range.from && a.date <= range.to));
}

/** What yesterday's card sentence (morningLine) already states whenever the item is listed: within the budget, protein and water reached ... */
const WELL_SAID_BY_CARD: readonly ReviewKind[] = ['budget', 'protein', 'water'];
/** ... and the calories above the day's budget. */
const ADJUST_SAID_BY_CARD: readonly ReviewKind[] = ['cal'];

/** What the week picture needs of one day. */
function weekDay(d: DaySummary): WeekDayIn {
  const f = dayFacts(d);
  return {
    date: d.date,
    kcal: d.eaten.kcal,
    budget: d.budget,
    target: d.target,
    foodLogged: f.foodLogged,
    complete: f.complete,
    approx: f.approx,
    workout: d.activities.length > 0,
  };
}

/**
 * The morning page: a personal start to the day, laid over Today as a task screen. It opens by
 * itself on the first visit of a morning (useMorningPage, rule.ts), or on purpose from Profile at
 * any hour. Opened either way it only reads: it never consults the rule or marks the day (the
 * quote it shows is kept on this device for the day, quotePin.ts, which is not a store write).
 *
 * Top to bottom: the greeting by name in the header over today's date; the week block (WeekBlock:
 * "Your week", the personal line, the week in cups with yesterday large, and the coach in three
 * voices: what went well, the next step, the first step for today); the quote of the day
 * (quotes.ts); yesterday's card (the sentence, four figures for eaten, protein and water yesterday
 * and sleep last night, the movement line); "What went well" and "What to improve" (review.ts) and
 * "For today" (plan.ts), each holding only what the coach and the card do not already say; and the
 * pinned footer with "Today" and "Log <meal>". Every word comes from the pure, tested functions
 * (coach.ts, personal.ts, line.ts, review.ts, plan.ts, quotes.ts, weekLabel.ts); this file gathers
 * the values and places the blocks.
 * At 360 x 740 the whole coach is in the first view, above the footer.
 */
export default function MorningScreen() {
  const { colors, spacing } = useTheme();
  const bigText = useTextSize() >= 1.5;
  const params = useLocalSearchParams<{ first?: string; quote?: string }>();
  const today = useToday();
  const yesterday = addDays(today, -1);
  const now = useNow();
  const width = useWindowDimensions().width;
  const profile = useProfile();
  const day = useDay(yesterday);
  const todayDay = useDay(today);
  const recent = useDays(28, yesterday);
  const sleepAll = useLive('sleep');
  const activities = useLive('activities');
  const weights = useWeightSeries();
  const streak = useConsistency(today).streak;

  // Steps for yesterday, as the movement row has always shown them.
  const syncOn = useHealthSync((s) => s.enabled);
  const synced = useHealthSync((s) => s.steps.days);
  const file = useHealthSync((s) => s.fileSteps);
  const shown = shownSteps(syncOn ? synced : null, file, today);
  const steps = shown.days[yesterday] ?? null;
  const stepsNote = file && shown.fromFile.includes(yesterday) ? fileStepsNote(file.asOfDay) : undefined;

  const y = dayFacts(day);
  const nothing = isNothing(y);
  const sleep = findByDate(sleepAll, today);
  const lastNight = sleep ? { hours: sleep.hours, source: sleep.source, origin: sleep.origin } : null;

  const onboardedDay = profile.onboardedAt ? toISODate(new Date(profile.onboardedAt)) : null;
  const dayN = onboardedDay ? diffDays(onboardedDay, today) + 1 : 0;
  const firstWeek = dayN >= 1 && dayN <= 7;

  const title = morningTitle(greeting(now), profile.name, width);
  const sleepHours: Record<ISODate, number> = {};
  for (const s of sleepAll) sleepHours[s.date] = s.hours;
  const personal = personalLine(
    {
      today,
      onboardedDay,
      streak,
      days: recent.map((d) => dayFacts(d)),
      sleepHours,
    },
    title.nameShown ? null : (profile.name ?? null),
  );

  const { quote, ready: quoteReady } = useDayQuote(today, quoteTheme(y, lastNight ? lastNight.hours : null), params.quote);

  // In the first week the week's minutes count from the setup day, as the week picture and the
  // streak tag do: history from before setup would read "150 active minutes reached" beside "Day 2".
  const fromSetup = (range: { from: ISODate; to: ISODate } | null) =>
    range && firstWeek && onboardedDay && range.from < onboardedDay ? (onboardedDay > range.to ? null : { from: onboardedDay, to: range.to }) : range;
  // Yesterday's card shows its figures on any day with something logged: the lists then leave those numbers to it.
  const review = {
    y,
    weekBefore: minutesIn(activities, fromSetup(weekBeforeYesterday(today))),
    lastNight,
    units: profile.units,
    firstWeek,
    figuresOnCard: !nothing,
  };
  const well = wentWell(review);
  const adjust = toAdjust(review);
  const note = reviewNote(y);
  const plan = todayPlan({
    today,
    waterMl: todayDay.waterMl,
    waterGoalMl: todayDay.waterGoalMl,
    // A day with only drinks from the diary is not water-tracked: the plan reads it as a day with no water.
    waterTracked: hasWaterTracked(todayDay.waterEntries),
    weekMinutes: minutesIn(activities, fromSetup(weekSoFar(today))),
    lastWeighIn: weights.latest?.date ?? null,
    lastNightLogged: !!sleep,
    firstAdjust: adjust[0]?.kind ?? null,
    units: profile.units,
  });
  const todayTargets = {
    budget: todayDay.budget,
    proteinG: todayDay.macros.proteinG,
  };
  const targets = targetsLine(todayTargets);
  const coach = coachMessage({
    today,
    y,
    well,
    adjust,
    plan,
    targets: todayTargets,
    firstWeekDay: firstWeek ? dayN : 0,
  });

  // Each fact is said once: the lists and the plan leave out what the coach already names, and what
  // yesterday's card already says in its sentence (the budget, protein and water reached, calories
  // above the band). The coach's step for today replaces its plan row.
  const wellShown = well.filter((w) => !coach.goodKinds.includes(w.kind) && !WELL_SAID_BY_CARD.includes(w.kind));
  const adjustShown = adjust.filter((a) => a.kind !== coach.improveKind && !ADJUST_SAID_BY_CARD.includes(a.kind));
  const planShown = plan.filter((p) => p.kind !== coach.todayFrom);

  const week = weekCells({
    days: recent.slice(-7).map(weekDay),
    todayDay: weekDay(todayDay),
    setupDay: onboardedDay,
    yesterday,
    today,
  });
  const kcalShown = week.show && !!week.yesterday?.foodLogged;

  const meal = mealForTime(now);
  const close = () => goBack('/');

  // On the first automatic showing, how to turn the page off sits in the pinned footer over the two
  // buttons, so it is in view however long the page is (Screen docks the toast above the footer's real height).
  const footer = (
    <View style={{ gap: spacing.sm }}>
      {params.first === '1' ? (
        <Text variant="caption" color="textSecondary" testID="morning-first">
          This opens on your first visit each morning. Turn it off in Profile.
        </Text>
      ) : null}
      {/* At 150% text and more the two buttons stack, each the footer's width, so neither name is cut short. */}
      <View
        style={{
          flexDirection: bigText ? 'column' : 'row',
          gap: bigText ? spacing.sm : spacing.md,
        }}>
        {/* "Today" always lands on Today, also when the page was opened from Profile; the X goes back to where it was opened. */}
        <Button
          testID="morning-today"
          title="Today"
          accessibilityLabel="Go to Today"
          variant="secondary"
          full={false}
          onPress={() => router.dismissTo('/' as never)}
          style={bigText ? { paddingHorizontal: spacing.md } : { flex: 1, paddingHorizontal: spacing.md }}
        />
        <Button
          testID="morning-log"
          title={logMealTitle(meal)}
          icon={<Plus size={20} color={colors.onPrimary} strokeWidth={2.2} />}
          full={false}
          onPress={() => router.replace(`/food/search?meal=${meal}&date=${today}` as never)}
          style={bigText ? { paddingHorizontal: spacing.md } : { flex: 2, paddingHorizontal: spacing.md }}
        />
      </View>
    </View>
  );

  const dayLabel = (
    <Text variant="overline" color="textSecondary" numberOfLines={1} testID="morning-day">
      {`Yesterday · ${weekdayShort(yesterday)}, ${formatShortDate(yesterday)}`}
    </Text>
  );

  return (
    <Screen
      testID="morning-screen"
      header={<Header title={title.title} subtitle={`${weekdayShort(today)}, ${formatShortDate(today)}`} close onBack={close} right={<ShareDayButton date={yesterday} testID="morning-share" />} />}
      footer={footer}>
      <FadeUp index={0}>
        <WeekBlock cells={week} streak={streak} personal={personal} coach={coach} firstWeek={firstWeek} />
      </FadeUp>

      {/* The quote of the day, second: its first line is in the first view on a strong day at 360 x 740. */}
      <FadeUp index={2}>
        <Card padding={18}>
          <QuoteBlock quote={quote} ready={quoteReady} />
        </Card>
      </FadeUp>

      <FadeUp index={3}>
        <Card testID="morning-card" padding={18}>
          {dayLabel}
          <Text variant="title" testID="morning-line" style={{ marginTop: spacing.sm }}>
            {nothing
              ? NOTHING_LINE
              : morningLine({
                  kcal: day.eaten.kcal,
                  budget: day.budget,
                  complete: y.complete,
                  foodLogged: y.foodLogged,
                  proteinMet: goalMet(day.eaten.protein, day.macros.proteinG),
                  waterMet: y.hasWater && goalMet(day.waterMl, day.waterGoalMl),
                })}
          </Text>
          {nothing ? (
            <Text variant="caption" color="textSecondary" style={{ marginTop: spacing.xs }}>
              {NOTHING_CAPTION}
            </Text>
          ) : (
            <>
              <View style={{ marginTop: spacing.lg }}>
                <YesterdayFigures
                  kcalShown={kcalShown}
                  units={profile.units}
                  sleepHours={sleep ? sleep.hours : null}
                  day={{
                    date: yesterday,
                    kcal: day.eaten.kcal,
                    budget: day.budget,
                    headroom: Math.max(0, day.budget - day.target),
                    protein: day.eaten.protein,
                    proteinG: day.macros.proteinG,
                    waterMl: day.waterMl,
                    waterGoalMl: day.waterGoalMl,
                    foodLogged: y.foodLogged,
                    complete: y.complete,
                    approx: y.approx,
                  }}
                />
              </View>
              <View style={{ marginVertical: spacing.md }}>
                <Divider />
              </View>
              <MoveRow activities={day.activities} exerciseNet={day.exerciseNet} steps={steps} stepsNote={stepsNote} added={day.exerciseRule !== 'off'} />
            </>
          )}
        </Card>
      </FadeUp>

      {note ? (
        <FadeUp index={4} style={{ marginTop: -spacing.xs }}>
          <Text variant="caption" color="textSecondary" testID="morning-note">
            {note}
          </Text>
        </FadeUp>
      ) : null}

      {wellShown.length > 0 ? (
        <FadeUp index={4}>
          <ReviewList variant="well" items={wellShown} />
        </FadeUp>
      ) : null}

      {adjustShown.length > 0 ? (
        <FadeUp index={5}>
          <ReviewList variant="adjust" items={adjustShown} />
        </FadeUp>
      ) : null}

      {targets || planShown.length > 0 ? (
        <FadeUp index={6}>
          <PlanCard today={today} targets={targets} items={planShown} />
        </FadeUp>
      ) : null}
    </Screen>
  );
}
