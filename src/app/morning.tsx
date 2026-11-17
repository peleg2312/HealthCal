import { router, useLocalSearchParams } from 'expo-router';
import { Plus } from 'lucide-react-native';
import React from 'react';
import { View } from 'react-native';

import { fileStepsNote, shownSteps } from '@/features/health-sync/steps';
import { useHealthSync } from '@/features/health-sync/store';
import { logMealTitle } from '@/features/morning/figures';
import { goalMet, morningLine } from '@/features/morning/line';
import { MorningShelf } from '@/features/morning/MorningShelf';
import { MoveRow } from '@/features/morning/MoveRow';
import { ShareDayButton } from '@/features/share';
import { isEstimate } from '@/features/today/meals';
import { findByDate } from '@/features/trackers/helpers';
import { addDays, diffDays, formatShortDate, toISODate, weekdayShort } from '@/lib/dates';
import { mealForTime } from '@/lib/nutrition';
import { isCompleteDay } from '@/lib/trend';
import { useNow, useToday } from '@/store/clock';
import { useDay, useLive, useProfile } from '@/store/selectors';
import { useTheme } from '@/theme';
import { Button, Card, Divider, EmptyState, Header, Screen, Text, goBack } from '@/ui';

/**
 * The morning page ("Yesterday"): yesterday in one view, laid over Today as a task screen.
 * It opens by itself on the first visit of a morning (useMorningPage, rule.ts), or on purpose
 * from Profile. Opened either way it only reads: it never consults the rule or marks the day.
 *
 * One sentence, four cups on one shelf (eaten, protein, water for yesterday; sleep for last
 * night, the night dated today, since a night belongs to the day the person woke up), the
 * movement line, and a footer with "Today" (closes, as the X does) and "Log <meal>" for today.
 */
export default function MorningScreen() {
  const { colors, spacing } = useTheme();
  const params = useLocalSearchParams<{ first?: string }>();
  const night = useToday();
  const date = addDays(night, -1);
  const now = useNow();
  const profile = useProfile();
  const day = useDay(date);
  const sleep = findByDate(useLive('sleep'), night);
  const syncOn = useHealthSync((s) => s.enabled);
  const synced = useHealthSync((s) => s.steps.days);
  const file = useHealthSync((s) => s.fileSteps);
  const shown = shownSteps(syncOn ? synced : null, file, night);
  const steps = shown.days[date] ?? null;
  const stepsNote = file && shown.fromFile.includes(date) ? fileStepsNote(file.asOfDay) : undefined;

  const foodLogged = day.entries.length > 0;
  const complete = isCompleteDay(day.eaten.kcal, day.budget);
  const nothing = !foodLogged && day.activities.length === 0 && day.waterEntries.length === 0;

  const onboardedDay = profile.onboardedAt ? toISODate(new Date(profile.onboardedAt)) : null;
  const dayN = onboardedDay ? diffDays(onboardedDay, date) + 1 : 0;
  const subtitle = `${weekdayShort(date)}, ${formatShortDate(date)}${dayN >= 1 && dayN <= 7 ? ` · day ${dayN}` : ''}`;

  const meal = mealForTime(now);
  const close = () => goBack('/');

  const footer = (
    <View style={{ flexDirection: 'row', gap: spacing.md }}>
      <Button testID="morning-today" title="Today" accessibilityLabel="Go to Today" variant="secondary" full={false} onPress={close} style={{ flex: 1, paddingHorizontal: spacing.md }} />
      <Button
        testID="morning-log"
        title={logMealTitle(meal)}
        icon={<Plus size={20} color={colors.onPrimary} strokeWidth={2.2} />}
        full={false}
        onPress={() => router.replace(`/food/search?meal=${meal}&date=${night}` as never)}
        style={{ flex: 2, paddingHorizontal: spacing.md }}
      />
    </View>
  );

  return (
    <Screen testID="morning-screen" header={<Header title="Yesterday" subtitle={subtitle} close onBack={close} right={<ShareDayButton date={date} testID="morning-share" />} />} footer={footer}>
      {nothing ? (
        <Card testID="morning-card">
          <EmptyState title="Nothing logged yesterday" message="This page sums up the day before: food, water, movement and last night's sleep." />
        </Card>
      ) : (
        <Card testID="morning-card" padding={16}>
          <Text variant="title" testID="morning-line">
            {morningLine({
              kcal: day.eaten.kcal,
              budget: day.budget,
              complete,
              foodLogged,
              proteinMet: goalMet(day.eaten.protein, day.macros.proteinG),
              waterMet: goalMet(day.waterMl, day.waterGoalMl),
            })}
          </Text>
          <View style={{ marginTop: spacing.lg }}>
            <MorningShelf
              units={profile.units}
              sleepHours={sleep ? sleep.hours : null}
              day={{
                date,
                kcal: day.eaten.kcal,
                budget: day.budget,
                headroom: day.budget - day.target,
                protein: day.eaten.protein,
                proteinG: day.macros.proteinG,
                waterMl: day.waterMl,
                waterGoalMl: day.waterGoalMl,
                foodLogged,
                complete,
                approx: day.entries.some(isEstimate),
              }}
            />
          </View>
          <View style={{ marginTop: spacing.lg, marginBottom: spacing.md }}>
            <Divider />
          </View>
          <MoveRow activities={day.activities} exerciseNet={day.exerciseNet} steps={steps} stepsNote={stepsNote} />
        </Card>
      )}
      {params.first === '1' ? (
        <Text variant="caption" color="textSecondary" testID="morning-first" style={{ marginTop: -spacing.xs }}>
          This opens on your first visit each morning. Turn it off in Profile.
        </Text>
      ) : null}
    </Screen>
  );
}
