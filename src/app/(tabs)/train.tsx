import { router, useLocalSearchParams } from 'expo-router';
import { Dumbbell, Plus, Timer } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { View } from 'react-native';

import { TabHeader } from '@/components/TabHeader';
import { ACTIVITY_BY_ID, POPULAR_ACTIVITY_IDS } from '@/data/activities';
import { QuickStartTiles, SessionRow } from '@/features/activity/components';
import { summariseWeek } from '@/features/activity/build';
import { deleteActivity, openSession } from '@/features/activity/session';
import { RoutineCards, useRoutineTemplates } from '@/features/activity/RoutineCards';
import { WeekCard } from '@/features/activity/WeekCard';
import { startRoutineDraft, type RoutineTemplate } from '@/features/activity/routines';
import { draftHasContent, useStrengthDrafts } from '@/features/activity/strengthDraft';
import { StepsLine } from '@/features/health-sync/ui/StepsLine';
import { SyncedFromLine } from '@/features/health-sync/ui/SyncedFromLine';
import { TrainSyncLink } from '@/features/health-sync/ui/TrainSyncLink';
import { addDays, formatDayLabel, formatDuration, formatShortDate, startOfWeek } from '@/lib/dates';
import { formatNumber } from '@/lib/units';
import { useToday } from '@/store/clock';
import { useStore } from '@/store';
import { useLive, useProfile } from '@/store/selectors';
import { useTheme } from '@/theme';
import type { ActivityEntry } from '@/types';
import { Button, Card, Chip, ConfirmSheet, EmptyState, PressableScale, Screen, SectionTitle, Text } from '@/ui';

const DAYS_PER_PAGE = 14;

export default function TrainScreen() {
  const { colors, spacing } = useTheme();
  const profile = useProfile();
  const activities = useLive('activities');
  const recentIds = useStore((s) => s.recentActivityIds);
  const draft = useStrengthDrafts((s) => s.drafts.new);
  const [pages, setPages] = useState(1);

  const t = useToday();
  // ?week=YYYY-MM-DD shows that week (the import screen links to the week it added workouts to); otherwise this week.
  const params = useLocalSearchParams<{ week?: string }>();
  const asked = typeof params.week === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(params.week) && params.week <= t ? params.week : t;
  const weekStart = startOfWeek(asked);
  const weekDates = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const week = useMemo(() => summariseWeek(activities, weekDates), [activities, weekDates]);

  const history = useMemo(() => {
    const sorted = [...activities].sort((a, b) => b.date.localeCompare(a.date) || b.loggedAt.localeCompare(a.loggedAt));
    const groups: { date: string; entries: ActivityEntry[] }[] = [];
    for (const e of sorted) {
      const last = groups[groups.length - 1];
      if (last && last.date === e.date) last.entries.push(e);
      else groups.push({ date: e.date, entries: [e] });
    }
    return groups;
  }, [activities]);

  const quick = useMemo(() => {
    const ids = [...recentIds, ...POPULAR_ACTIVITY_IDS].filter((id, i, all) => ACTIVITY_BY_ID[id] && all.indexOf(id) === i);
    return ids.slice(0, 8).map((id) => ACTIVITY_BY_ID[id]);
  }, [recentIds]);

  const visibleGroups = history.slice(0, pages * DAYS_PER_PAGE);
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

      <WeekCard week={week} dates={weekDates} today={t} extra={<StepsLine dates={weekDates} today={t} />} />

      {/* Side by side when both labels fit (150 px each); stacked on a narrow phone rather than cut. */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
        <Button
          testID="train-log-activity"
          title="Log activity"
          icon={<Plus size={18} color={colors.onPrimary} />}
          onPress={() => router.push('/activity/pick')}
          style={{ flexGrow: 1, flexBasis: 150 }}
        />
        <Button
          testID="train-start-workout"
          title={draftActive ? 'Resume' : 'Workout'}
          variant="secondary"
          icon={draftActive ? <Timer size={18} color={colors.exercise} /> : <Dumbbell size={18} color={colors.text} />}
          onPress={() => router.push('/activity/strength')}
          style={{ flexGrow: 1, flexBasis: 150 }}
        />
      </View>
      {draftActive ? (
        <Text variant="caption" color="textSecondary" style={{ marginTop: -spacing.sm }}>
          A strength workout is in progress with {draft!.exercises.length} {draft!.exercises.length === 1 ? 'exercise' : 'exercises'}.
        </Text>
      ) : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: spacing.lg, marginTop: -spacing.sm }}>
        <PressableScale
          testID="train-import-garmin"
          accessibilityLabel="Import workouts from a Garmin file or a Health export"
          onPress={() => router.push('/activity/import')}
          hitSlop={6}
          style={{ minHeight: 44, justifyContent: 'center' }}>
          <Text variant="label" color="text" style={{ textDecorationLine: 'underline' }}>
            Import workouts
          </Text>
        </PressableScale>
        <TrainSyncLink />
      </View>

      {routines.length > 0 ? (
        <>
          <SectionTitle title="Routines" />
          <RoutineCards onStart={startRoutine} />
        </>
      ) : null}

      <SectionTitle title="Quick start" action="All activities" onAction={() => router.push('/activity/pick')} />
      <QuickStartTiles items={quick} onPick={(id) => router.push(`/activity/log?activityId=${id}`)} />

      <SectionTitle title="History" />
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
        <View style={{ gap: spacing.md }} testID="train-history">
          {visibleGroups.map((g) => {
            const net = g.entries.reduce((s, e) => s + e.kcalNet, 0);
            const minutes = g.entries.reduce((s, e) => s + e.durationMin, 0);
            return (
              <View key={g.date} style={{ gap: spacing.xs }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingHorizontal: spacing.xs }}>
                  <Text variant="overline">
                    {formatDayLabel(g.date)}
                  </Text>
                  {g.entries.length > 1 ? (
                    <Text variant="caption" color="textSecondary" tabular>
                      {formatDuration(minutes)} · ~{formatNumber(net)} kcal
                    </Text>
                  ) : null}
                </View>
                <Card padding={0} style={{ paddingVertical: 2 }}>
                  {g.entries.map((e, i) => (
                    <View key={e.id}>
                      {i > 0 ? <View style={{ height: 1, backgroundColor: colors.border, marginLeft: 18 + 24 + 12 }} /> : null}
                      <SessionRow entry={e} units={profile.units} onPress={() => openSession(e)} onDelete={() => deleteActivity(e)} />
                      <SyncedFromLine entry={e} />
                    </View>
                  ))}
                </Card>
              </View>
            );
          })}
          {history.length > visibleGroups.length ? (
            <PressableScale onPress={() => setPages((p) => p + 1)} accessibilityLabel="Show earlier sessions" testID="train-show-more" style={{ alignItems: 'center', paddingVertical: spacing.md }}>
              <Text variant="label" color="text" style={{ textDecorationLine: 'underline' }}>
                Show earlier sessions
              </Text>
            </PressableScale>
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
