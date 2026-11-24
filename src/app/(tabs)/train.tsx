import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { ChevronDown, ChevronRight, Dumbbell, Plus, Timer } from 'lucide-react-native';
import React, { useCallback, useMemo, useState } from 'react';
import { useWindowDimensions, View } from 'react-native';

import { TabHeader } from '@/components/TabHeader';
import { ACTIVITY_BY_ID, POPULAR_ACTIVITY_IDS } from '@/data/activities';
import { BringIn } from '@/features/activity/BringIn';
import { QuickStartTiles, SessionRow } from '@/features/activity/components';
import { summariseWeek } from '@/features/activity/build';
import { deleteActivity, openSession } from '@/features/activity/session';
import { RoutineCards, useRoutineTemplates } from '@/features/activity/RoutineCards';
import { WeekCard } from '@/features/activity/WeekCard';
import { historyDaySpoken, historyDayWord, historyWeekLabel, historyWeeks, WEEKS_PER_PAGE } from '@/features/activity/history';
import { startRoutineDraft, type RoutineTemplate } from '@/features/activity/routines';
import { draftHasContent, useStrengthDrafts } from '@/features/activity/strengthDraft';
import { StepsLine } from '@/features/health-sync/ui/StepsLine';
import { SyncedFromLine } from '@/features/health-sync/ui/SyncedFromLine';
import { isolateRtl } from '@/lib/bidi';
import { addDays, formatDuration, formatShortDate, startOfWeek, weekdayShort } from '@/lib/dates';
import { trainingOverview } from '@/lib/trainingLoad';
import { useToday } from '@/store/clock';
import { useStore } from '@/store';
import { useLive, useProfile } from '@/store/selectors';
import { useTextGrowth, useTheme } from '@/theme';
import type { ActivityEntry } from '@/types';
import { Button, Card, Chip, ConfirmSheet, EmptyState, RestoreRow, Screen, SectionTitle, Text } from '@/ui';

export default function TrainScreen() {
  const { colors, spacing } = useTheme();
  const grow = useTextGrowth();
  const narrow = useWindowDimensions().width < 360;
  const actionStyle = narrow ? { flexGrow: 1, flexBasis: 'auto' as const, paddingHorizontal: 14 } : { flexGrow: 1, flexBasis: 150 * grow };
  const profile = useProfile();
  const activities = useLive('activities');
  const recentIds = useStore((s) => s.recentActivityIds);
  const draft = useStrengthDrafts((s) => s.drafts.new);
  const [pages, setPages] = useState(1);
  // Workouts removed while Train is in front: each keeps a Restore row above History (the second way back after
  // the toast's Undo) until it is restored or the person leaves the tab (Train stays mounted, so focus decides).
  const allActivities = useStore((s) => s.activities);
  const [removedIds, setRemovedIds] = useState<string[]>([]);
  useFocusEffect(useCallback(() => () => setRemovedIds([]), []));
  const removed = removedIds.map((id) => allActivities[id]).filter((a): a is ActivityEntry => !!a && !!a.deleted);
  const removeSession = (e: ActivityEntry) => {
    deleteActivity(e);
    setRemovedIds((cur) => [e.id, ...cur.filter((id) => id !== e.id)]);
  };

  const t = useToday();
  // ?week=YYYY-MM-DD shows that week (the import screen links to the week it added workouts to); otherwise this week.
  const params = useLocalSearchParams<{ week?: string }>();
  const asked = typeof params.week === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(params.week) && params.week <= t ? params.week : t;
  const weekStart = startOfWeek(asked);
  const weekDates = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const week = useMemo(() => summariseWeek(activities, weekDates), [activities, weekDates]);
  // The last 7 days against the recent weeks, from every workout on the phone (today comes from the clock hook).
  const overview = useMemo(() => trainingOverview(activities, t), [activities, t]);

  // One card per calendar week, newest first, its workouts as rows (./history.ts; today from the clock hook).
  const history = useMemo(() => historyWeeks(activities, t), [activities, t]);

  const quick = useMemo(() => {
    const ids = [...recentIds, ...POPULAR_ACTIVITY_IDS].filter((id, i, all) => ACTIVITY_BY_ID[id] && all.indexOf(id) === i);
    return ids.slice(0, 8).map((id) => ACTIVITY_BY_ID[id]);
  }, [recentIds]);

  const visibleWeeks = history.slice(0, pages * WEEKS_PER_PAGE);
  const draftActive = draftHasContent(draft);
  const routines = useRoutineTemplates();
  const [replace, setReplace] = useState<RoutineTemplate | null>(null);

  const begin = (tpl: RoutineTemplate) => {
    setReplace(null);
    useStrengthDrafts.getState().put('new', startRoutineDraft(tpl, t));
    router.push('/activity/strength');
  };
  // Starting a routine never silently throws away a workout in progress.
  const startRoutine = (tpl: RoutineTemplate) => (draftActive ? setReplace(tpl) : begin(tpl));

  return (
    <Screen tabs testID="train-screen" header={<TabHeader tab="train" overline={`Week of ${formatShortDate(weekStart)}`} title="Train" />}>
      {weekStart !== startOfWeek(t) ? (
        <View style={{ flexDirection: 'row' }}>
          <Chip testID="train-this-week" label="Back to this week" onPress={() => router.setParams({ week: undefined })} />
        </View>
      ) : null}

      <WeekCard
        week={week}
        dates={weekDates}
        today={t}
        extra={<StepsLine dates={weekDates} today={t} />}
        overview={overview}
        current={weekStart === startOfWeek(t)}
      />

      {/* Side by side when both labels fit (150 px each, more as text grows); stacked at large text rather than cut.
          Under 360 px each is as wide as its own label with tighter side room, so the two still sit side by side
          at 320 and both are in the first view at 320 x 640 (a label that does not fit wraps the pair, never cut).
          Both are secondary, Log activity with the exercise colour on its edge: the tab bar's + is the screen's
          one filled primary button. */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
        <Button
          testID="train-log-activity"
          title="Log activity"
          variant="secondary"
          tint={colors.exercise}
          icon={<Plus size={18} color={colors.text} strokeWidth={2.2} />}
          onPress={() => router.push('/activity/pick')}
          style={actionStyle}
        />
        <Button
          testID="train-start-workout"
          title={draftActive ? 'Resume' : 'Workout'}
          variant="secondary"
          icon={draftActive ? <Timer size={18} color={colors.exercise} /> : <Dumbbell size={18} color={colors.text} />}
          onPress={() => router.push('/activity/strength')}
          style={actionStyle}
        />
      </View>
      {draftActive ? (
        <Text variant="caption" color="textSecondary" style={{ marginTop: -spacing.sm }}>
          A strength workout is in progress with {draft!.exercises.length} {draft!.exercises.length === 1 ? 'exercise' : 'exercises'}.
        </Text>
      ) : null}
      {/* Every other way in (automatic sync, a file, steps from the Health export) as one row with a sheet. */}
      <BringIn today={t} />

      {routines.length > 0 ? (
        <>
          <SectionTitle title="Routines" />
          <RoutineCards onStart={startRoutine} />
        </>
      ) : null}

      {/* The section title with its way to every activity, a small ghost button (the testID SectionTitle gave it). */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
        <Text variant="h3" accessibilityRole="header" {...({ 'aria-level': 2 } as object)} style={{ flexShrink: 1 }}>
          Quick start
        </Text>
        <Button
          testID="section-quick-start-action"
          title="All activities"
          variant="ghost"
          size="sm"
          full={false}
          iconRight={<ChevronRight size={16} color={colors.primaryInk} strokeWidth={2.2} />}
          onPress={() => router.push('/activity/pick')}
          style={{ marginVertical: -6, paddingRight: 6 }}
        />
      </View>
      <QuickStartTiles items={quick} onPick={(id) => router.push(`/activity/log?activityId=${id}`)} />

      <SectionTitle title="History" />
      {removed.map((e, i) => (
        <RestoreRow
          key={`removed-${e.id}`}
          testID={`train-restore-${i}`}
          label={`${isolateRtl(e.name)} on ${weekdayShort(e.date)}, ${formatShortDate(e.date)} removed`}
          onRestore={() => useStore.getState().restore('activities', e.id)}
        />
      ))}
      {history.length === 0 ? (
        <Card>
          <EmptyState
            emoji="🏐"
            title="Your sessions will show up here"
            // The action that fills it is "Log activity" above: one primary button on the screen, not two.
            message="Log a game of volleyball, a yoga class or a run, and see your week fill up."
          />
        </Card>
      ) : (
        // Stacked cards 16 px apart, as on the diary and Progress.
        <View style={{ gap: spacing.lg }} testID="train-history">
          {visibleWeeks.map((w) => (
            // A week as the diary shows a meal: its title and total time in the card's head, its workouts as rows.
            <Card key={w.start} testID={`train-week-${w.start}`} padding={0} style={{ paddingTop: 12, paddingBottom: 2 }}>
              <View
                accessible
                accessibilityRole="header"
                // A week under "History" (a section title, level 2): level 3, never a second h1.
                {...({ 'aria-level': 3 } as object)}
                accessibilityLabel={historyWeekLabel(w)}
                style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 10, paddingLeft: 18, paddingRight: 18, paddingBottom: 2 }}>
                <Text variant="h3" numberOfLines={1} style={{ flexShrink: 1 }}>
                  {w.title}
                </Text>
                <Text variant="numM" color="textSecondary" testID={`train-week-total-${w.start}`} style={{ fontSize: 15, lineHeight: 20 }}>
                  {formatDuration(w.minutes)
                    .split(' ')
                    .map((part, i) => (/^\d/.test(part) ? `${i ? ' ' : ''}${part}` : <Text key={i} variant="unit">{` ${part}`}</Text>))}
                </Text>
              </View>
              {w.entries.map((e, i) => (
                <View key={e.id}>
                  {i > 0 ? <View style={{ height: 1, backgroundColor: colors.border, marginLeft: 18 + 24 + 12 }} /> : null}
                  <SessionRow
                    entry={e}
                    units={profile.units}
                    day={{ word: historyDayWord(e.date, t), spoken: historyDaySpoken(e.date, t) }}
                    onPress={() => openSession(e)}
                    onDelete={() => removeSession(e)}
                  />
                  <SyncedFromLine entry={e} />
                </View>
              ))}
            </Card>
          ))}
          {history.length > visibleWeeks.length ? (
            <Button
              testID="train-show-more"
              title="Show earlier sessions"
              variant="ghost"
              size="sm"
              full={false}
              icon={<ChevronDown size={16} color={colors.primaryInk} strokeWidth={2.2} />}
              onPress={() => setPages((p) => p + 1)}
              style={{ alignSelf: 'center' }}
            />
          ) : null}
        </View>
      )}
      <ConfirmSheet
        visible={replace !== null}
        title="Replace the workout in progress?"
        message={`The workout you started has ${draft?.exercises.length ?? 0} ${draft?.exercises.length === 1 ? 'exercise that is' : 'exercises that are'} not saved yet. Starting ${replace?.name.toLowerCase() ?? 'this routine'} clears them.`}
        confirmLabel="Start routine"
        cancelLabel="Keep my workout"
        destructive
        onConfirm={() => replace && begin(replace)}
        onCancel={() => setReplace(null)}
      />
    </Screen>
  );
}
