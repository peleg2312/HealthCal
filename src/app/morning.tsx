import { router, useLocalSearchParams } from 'expo-router';
import { Plus } from 'lucide-react-native';
import React from 'react';
import { useWindowDimensions, View } from 'react-native';

import { fileStepsNote, shownSteps } from '@/features/health-sync/steps';
import { useHealthSync } from '@/features/health-sync/store';
import { dayFacts, isNothing } from '@/features/morning/facts';
import { logMealTitle } from '@/features/morning/figures';
import { morningTitle } from '@/features/morning/greeting';
import { goalMet, morningLine } from '@/features/morning/line';
import { MorningShelf } from '@/features/morning/MorningShelf';
import { MoveRow } from '@/features/morning/MoveRow';
import { personalLine } from '@/features/morning/personal';
import { targetsLine, todayPlan, weekBeforeYesterday, weekSoFar } from '@/features/morning/plan';
import { PlanCard } from '@/features/morning/PlanCard';
import { QuoteBlock } from '@/features/morning/QuoteBlock';
import { quoteTheme } from '@/features/morning/quotes';
import { NOTHING_CAPTION, NOTHING_LINE, reviewNote, toAdjust, wentWell } from '@/features/morning/review';
import { ReviewList } from '@/features/morning/ReviewList';
import { useDayQuote } from '@/features/morning/useDayQuote';
import { ShareDayButton } from '@/features/share';
import { findByDate } from '@/features/trackers/helpers';
import { addDays, diffDays, formatShortDate, greeting, toISODate, weekdayShort } from '@/lib/dates';
import { guidelineMinutes } from '@/lib/exercise';
import { mealForTime } from '@/lib/nutrition';
import { useNow, useToday } from '@/store/clock';
import { useConsistency, useDay, useDays, useLive, useProfile, useWeightSeries } from '@/store/selectors';
import { useTheme } from '@/theme';
import type { ActivityEntry, ISODate } from '@/types';
import { Button, Card, Divider, FadeUp, Header, Screen, Text, goBack } from '@/ui';

/** Guideline minutes of the activities dated from..to (inclusive). */
function minutesIn(activities: ActivityEntry[], range: { from: ISODate; to: ISODate } | null): number {
  if (!range) return 0;
  return guidelineMinutes(activities.filter((a) => a.date >= range.from && a.date <= range.to));
}

/**
 * The morning page: a personal start to the day, laid over Today as a task screen. It opens by
 * itself on the first visit of a morning (useMorningPage, rule.ts), or on purpose from Profile at
 * any hour. Opened either way it only reads: it never consults the rule or marks the day (the
 * quote it shows is kept on this device for the day, quotePin.ts, which is not a store write).
 *
 * Top to bottom: the greeting by name in the header over today's date; one true personal line
 * (personal.ts); the quote of the day (quotes.ts); yesterday's card (the sentence, four cups for
 * eaten, protein and water yesterday and sleep last night, the movement line); "What went well"
 * and "What to improve" (review.ts); "For today" (plan.ts); and the footer with "Today" and
 * "Log <meal>". Every word comes from the pure, tested functions; this file gathers the values
 * and places the blocks.
 *
 * The blocks are one Screen gap (16) apart, with no extra margins, so that at 360 x 740 a quote of
 * up to three lines still leaves the title of the next section above the footer: the first view
 * shows that there is more below.
 */
export default function MorningScreen() {
  const { colors, spacing } = useTheme();
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
    { today, onboardedDay, streak, days: recent.map((d) => dayFacts(d)), sleepHours },
    title.nameShown ? null : (profile.name ?? null),
  );

  const { quote, ready: quoteReady } = useDayQuote(today, quoteTheme(y, lastNight ? lastNight.hours : null), params.quote);

  const review = { y, weekBefore: minutesIn(activities, weekBeforeYesterday(today)), lastNight, units: profile.units, firstWeek };
  const well = wentWell(review);
  const adjust = toAdjust(review);
  const note = reviewNote(y);
  const plan = todayPlan({
    today,
    waterMl: todayDay.waterMl,
    waterGoalMl: todayDay.waterGoalMl,
    weekMinutes: minutesIn(activities, weekSoFar(today)),
    lastWeighIn: weights.latest?.date ?? null,
    lastNightLogged: !!sleep,
    firstAdjust: adjust[0]?.kind ?? null,
    units: profile.units,
  });
  const targets = targetsLine({ budget: todayDay.budget, proteinG: todayDay.macros.proteinG });

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
      <View style={{ flexDirection: 'row', gap: spacing.md }}>
        {/* "Today" always lands on Today, also when the page was opened from Profile; the X goes back to where it was opened. */}
        <Button testID="morning-today" title="Today" accessibilityLabel="Go to Today" variant="secondary" full={false} onPress={() => router.dismissTo('/' as never)} style={{ flex: 1, paddingHorizontal: spacing.md }} />
        <Button
          testID="morning-log"
          title={logMealTitle(meal)}
          icon={<Plus size={20} color={colors.onPrimary} strokeWidth={2.2} />}
          full={false}
          onPress={() => router.replace(`/food/search?meal=${meal}&date=${today}` as never)}
          style={{ flex: 2, paddingHorizontal: spacing.md }}
        />
      </View>
    </View>
  );

  const dayLabel = (
    <Text variant="label" color="textSecondary" numberOfLines={1} testID="morning-day">
      {`Yesterday · ${weekdayShort(yesterday)}, ${formatShortDate(yesterday)}`}
    </Text>
  );

  return (
    <Screen
      testID="morning-screen"
      header={<Header title={title.title} subtitle={`${weekdayShort(today)}, ${formatShortDate(today)}`} close onBack={close} right={<ShareDayButton date={yesterday} testID="morning-share" />} />}
      footer={footer}>
      {personal ? (
        <FadeUp index={0}>
          <Text variant="body" color="text" testID="morning-personal">
            {personal}
          </Text>
        </FadeUp>
      ) : null}

      <FadeUp index={1}>
        <QuoteBlock quote={quote} ready={quoteReady} />
      </FadeUp>

      <FadeUp index={2}>
        {nothing ? (
          <Card testID="morning-card" padding={16}>
            {dayLabel}
            <Text variant="title" testID="morning-line" style={{ marginTop: spacing.xs }}>
              {NOTHING_LINE}
            </Text>
            <Text variant="caption" color="textSecondary" style={{ marginTop: spacing.xs }}>
              {NOTHING_CAPTION}
            </Text>
          </Card>
        ) : (
          <Card testID="morning-card" padding={16}>
            {dayLabel}
            <Text variant="title" testID="morning-line" style={{ marginTop: spacing.xs }}>
              {morningLine({
                kcal: day.eaten.kcal,
                budget: day.budget,
                complete: y.complete,
                foodLogged: y.foodLogged,
                proteinMet: goalMet(day.eaten.protein, day.macros.proteinG),
                waterMet: goalMet(day.waterMl, day.waterGoalMl),
              })}
            </Text>
            <View style={{ marginTop: spacing.md }}>
              <MorningShelf
                compact
                units={profile.units}
                sleepHours={sleep ? sleep.hours : null}
                day={{
                  date: yesterday,
                  kcal: day.eaten.kcal,
                  budget: day.budget,
                  headroom: day.budget - day.target,
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
            <MoveRow activities={day.activities} exerciseNet={day.exerciseNet} steps={steps} stepsNote={stepsNote} />
          </Card>
        )}
      </FadeUp>

      {note ? (
        <FadeUp index={3} style={{ marginTop: -spacing.xs }}>
          <Text variant="caption" color="textSecondary" testID="morning-note">
            {note}
          </Text>
        </FadeUp>
      ) : null}

      {well.length > 0 ? (
        <FadeUp index={3}>
          <ReviewList variant="well" items={well} />
        </FadeUp>
      ) : null}

      {adjust.length > 0 ? (
        <FadeUp index={4}>
          <ReviewList variant="adjust" items={adjust} />
        </FadeUp>
      ) : null}

      {targets || plan.length > 0 ? (
        <FadeUp index={5}>
          <PlanCard today={today} targets={targets} items={plan} />
        </FadeUp>
      ) : null}
    </Screen>
  );
}
