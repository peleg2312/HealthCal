import { router } from 'expo-router';
import { Dumbbell, Plus, Timer } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { View } from 'react-native';

import { ACTIVITY_BY_ID, POPULAR_ACTIVITY_IDS } from '@/data/activities';
import { ActivityTile, SessionRow } from '@/features/activity/components';
import { summariseWeek, WHO_WEEKLY_MINUTES } from '@/features/activity/build';
import { deleteActivity, openSession } from '@/features/activity/session';
import { RoutineCards, useRoutineTemplates } from '@/features/activity/RoutineCards';
import { startRoutineDraft, type RoutineTemplate } from '@/features/activity/routines';
import { draftHasContent, useStrengthDrafts } from '@/features/activity/strengthDraft';
import { addDays, formatDayLabel, formatDuration, formatShortDate, startOfWeek, weekdayShort } from '@/lib/dates';
import { formatNumber } from '@/lib/units';
import { useToday } from '@/store/clock';
import { useStore } from '@/store';
import { useLive, useProfile } from '@/store/selectors';
import { useTheme } from '@/theme';
import type { ActivityEntry } from '@/types';
import { Button, Card, ConfirmSheet, EmptyState, LargeTitle, PressableScale, Ring, Screen, SectionTitle, Stat, Text } from '@/ui';

const DAYS_PER_PAGE = 14;

export default function TrainScreen() {
  const { colors, spacing } = useTheme();
  const profile = useProfile();
  const activities = useLive('activities');
  const recentIds = useStore((s) => s.recentActivityIds);
  const draft = useStrengthDrafts((s) => s.drafts.new);
  const [pages, setPages] = useState(1);

  const t = useToday();
  const weekStart = startOfWeek(t);
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

  const progress = week.guidelineMinutes / WHO_WEEKLY_MINUTES;
  const maxDay = Math.max(60, ...weekDates.map((d) => week.byDate[d].minutes));
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
    <Screen tabs testID="train-screen">
      <LargeTitle title="Train" subtitle={`Week of ${formatShortDate(weekStart)}`} />

      <Card testID="train-week-card">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xl }}>
          <Ring size={124} stroke={12} progress={Math.min(progress, 1.5)} color={colors.exercise} overColor={colors.success}>
            <Text variant="numL" tabular testID="train-guideline-minutes">
              {week.guidelineMinutes}
            </Text>
            <Text variant="caption" color="textSecondary">
              of {WHO_WEEKLY_MINUTES} min
            </Text>
          </Ring>
          <View style={{ flex: 1, gap: spacing.md }}>
            <Text variant="label" color="textSecondary">
              {progress >= 1
                ? 'Weekly activity guideline reached'
                : `${WHO_WEEKLY_MINUTES - week.guidelineMinutes} min to the weekly guideline`}
            </Text>
            <View style={{ flexDirection: 'row', gap: spacing.md }}>
              <Stat label="Sessions" value={String(week.sessions)} />
              <Stat label="Net, est." value={formatNumber(week.kcalNet)} unit="kcal" color={colors.exercise} />
            </View>
            <Text variant="caption" color="textSecondary" testID="train-total-time">
              {week.totalMinutes > 0 ? `${formatDuration(week.totalMinutes)} logged in total` : 'Nothing logged yet this week'}
            </Text>
          </View>
        </View>

        <View style={{ flexDirection: 'row', marginTop: spacing.lg, gap: spacing.xs }} testID="train-week-strip">
          {weekDates.map((d) => {
            const day = week.byDate[d];
            const isToday = d === t;
            const future = d > t;
            const h = day.minutes > 0 ? Math.max(6, (day.minutes / maxDay) * 52) : 0;
            return (
              <View key={d} style={{ flex: 1, alignItems: 'center', gap: 4, opacity: future ? 0.45 : 1 }} accessibilityLabel={`${formatDayLabel(d)}: ${day.minutes} minutes`}>
                <Text variant="caption" color={isToday ? 'text' : 'textTertiary'}>
                  {weekdayShort(d).slice(0, 1)}
                </Text>
                <View style={{ width: 22, height: 52, borderRadius: 8, backgroundColor: colors.track, justifyContent: 'flex-end', overflow: 'hidden' }}>
                  {h > 0 ? <View style={{ height: h, borderRadius: 8, backgroundColor: colors.exercise }} /> : null}
                </View>
                <Text style={{ fontSize: 15, lineHeight: 20, opacity: day.sessions.length ? 1 : 0 }}>{day.sessions[0]?.emoji ?? '·'}</Text>
                <Text variant="caption" tabular color={day.minutes ? 'textSecondary' : 'textTertiary'} style={{ fontSize: 11 }}>
                  {day.minutes ? `${day.minutes}m` : '–'}
                </Text>
                {isToday ? <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: colors.primary }} /> : <View style={{ height: 4 }} />}
              </View>
            );
          })}
        </View>
        <Text variant="caption" color="textTertiary" style={{ marginTop: spacing.md }}>
          WHO suggests 150 minutes of moderate activity a week. Minutes of a session logged as hard (and 6 MET or more) count double; light ones (under 3 MET) are logged but not counted.
        </Text>
      </Card>

      <View style={{ flexDirection: 'row', gap: spacing.md }}>
        <Button
          testID="train-log-activity"
          title="Log activity"
          icon={<Plus size={18} color={colors.onPrimary} />}
          onPress={() => router.push('/activity/pick')}
          style={{ flex: 1 }}
        />
        <Button
          testID="train-start-workout"
          title={draftActive ? 'Resume' : 'Workout'}
          variant="secondary"
          icon={draftActive ? <Timer size={18} color={colors.exercise} /> : <Dumbbell size={18} color={colors.text} />}
          onPress={() => router.push('/activity/strength')}
          style={{ flex: 1 }}
        />
      </View>
      {draftActive ? (
        <Text variant="caption" color="textSecondary" style={{ marginTop: -spacing.sm }}>
          A strength workout is in progress with {draft!.exercises.length} {draft!.exercises.length === 1 ? 'exercise' : 'exercises'}.
        </Text>
      ) : null}

      {routines.length > 0 ? (
        <>
          <SectionTitle title="Routines" />
          <RoutineCards onStart={startRoutine} />
        </>
      ) : null}

      <SectionTitle title="Quick start" action="All activities" onAction={() => router.push('/activity/pick')} />
      <View style={{ gap: spacing.sm }}>
        {[quick.slice(0, 4), quick.slice(4, 8)].map((row, i) => (
          <View key={i} style={{ flexDirection: 'row', gap: spacing.sm }}>
            {row.map((a) => (
              <ActivityTile key={a.id} emoji={a.emoji} name={a.name} testID={`quick-${a.id}`} onPress={() => router.push(`/activity/log?activityId=${a.id}`)} />
            ))}
          </View>
        ))}
      </View>

      <SectionTitle title="History" />
      {history.length === 0 ? (
        <Card>
          <EmptyState
            emoji="🏐"
            title="Your sessions will show up here"
            message="Log a game of volleyball, a yoga class or a run, and see your week fill up. Calories are estimated from your weight and the activity's MET value."
            action="Log your first activity"
            onAction={() => router.push('/activity/pick')}
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
                  <Text variant="overline" color="textSecondary">
                    {formatDayLabel(g.date).toUpperCase()}
                  </Text>
                  {g.entries.length > 1 ? (
                    <Text variant="caption" color="textTertiary" tabular>
                      {formatDuration(minutes)} · ~{formatNumber(net)} kcal
                    </Text>
                  ) : null}
                </View>
                <Card padding={spacing.md} style={{ paddingVertical: spacing.xs }}>
                  {g.entries.map((e, i) => (
                    <View key={e.id} style={i > 0 ? { borderTopWidth: 1, borderTopColor: colors.border } : undefined}>
                      <SessionRow entry={e} units={profile.units} onPress={() => openSession(e)} onDelete={() => deleteActivity(e)} />
                    </View>
                  ))}
                </Card>
              </View>
            );
          })}
          {history.length > visibleGroups.length ? (
            <PressableScale onPress={() => setPages((p) => p + 1)} accessibilityLabel="Show earlier sessions" testID="train-show-more" style={{ alignItems: 'center', paddingVertical: spacing.md }}>
              <Text variant="label" color="primary">
                Show earlier sessions
              </Text>
            </PressableScale>
          ) : null}
        </View>
      )}
      <ConfirmSheet
        visible={replace !== null}
        title="Replace the workout in progress?"
        message={`The workout you started has ${draft?.exercises.length ?? 0} ${draft?.exercises.length === 1 ? 'exercise' : 'exercises'} that are not saved yet. Starting ${replace?.name.toLowerCase() ?? 'this routine'} clears them.`}
        confirmLabel="Start routine"
        cancelLabel="Keep my workout"
        destructive
        onConfirm={() => replace && begin(replace)}
        onCancel={() => setReplace(null)}
      />
    </Screen>
  );
}
