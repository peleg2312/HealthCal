import { useLocalSearchParams } from 'expo-router';
import { BookmarkPlus, Clock, Pause, Play, Plus, Search, Trash2, Trophy } from 'lucide-react-native';
import React, { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useWindowDimensions, View } from 'react-native';

import { ACTIVITY_BY_ID } from '@/data/activities';
import { basisFromEntry, estimateSession } from '@/features/activity/build';
import { DateStepper } from '@/features/activity/components';
import { EXERCISE_GROUPS, searchExercises } from '@/features/activity/exercises';
import { budgetAdds } from '@/features/activity/logWords';
import { RoutineCards, useRoutineTemplates } from '@/features/activity/RoutineCards';
import { formatLiftWeight, formatPreviousSets } from '@/features/activity/strengthFormat';
import { addRoutine, draftFromRoutine, routineExercises } from '@/features/activity/routines';
import { deleteActivity, leaveFlow, saveActivity } from '@/features/activity/session';
import {
  draftDurationMin,
  DEFAULT_REST_SEC,
  draftKey,
  MAX_REST_SEC,
  MIN_REST_SEC,
  draftOnOpen,
  restRemainingMs,
  draftToExercises,
  edits,
  elapsedMs,
  useStrengthDrafts,
  type DraftExercise,
  type StrengthDraft,
} from '@/features/activity/strengthDraft';
import { isolateRtl } from '@/lib/bidi';
import { formatDayLabel, formatDuration, formatShortDate, today } from '@/lib/dates';
import { formulaTdee } from '@/lib/energy';
import { INTENSITY_LABELS, estimateOneRepMax, findStrengthRecords, kcalRange, strengthVolumeKg, type StrengthRecord } from '@/lib/exercise';
import { spokenUnits } from '@/lib/spokenUnits';
import { formatNumber, round, weightToKg, weightUnit, weightValue } from '@/lib/units';
import { cancelTimerAlert, scheduleTimerAlert } from '@/services/notifications';
import { useStore } from '@/store';
import { useDay, useLive, useProfile } from '@/store/selectors';
import { cup, cupFor, useLargeText, useTheme } from '@/theme';
import type { ActivityEntry, Intensity, StrengthSet, UnitSystem } from '@/types';
import {
  Button,
  Card,
  Chip,
  ChipRow,
  ConfirmSheet,
  CupKey,
  Divider,
  EmptyState,
  Header,
  IconButton,
  ListRow,
  NumberField,
  PressableScale,
  Screen,
  Segmented,
  Sheet,
  Text,
  TextField,
  Trough,
  figure,
  goBack,
  haptic,
  toast,
} from '@/ui';

const STRENGTH = ACTIVITY_BY_ID.strength_training;
/** Nothing longer than a day can be saved, as on the log form. */
const MAX_MIN = 24 * 60;
/** A timed workout longer than this asks before saving. */
const LONG_MIN = 4 * 60;

function useDraftsHydrated(): boolean {
  return useSyncExternalStore(
    (cb) => useStrengthDrafts.persist.onFinishHydration(cb),
    () => useStrengthDrafts.persist.hasHydrated(),
  );
}

export default function StrengthScreen() {
  const params = useLocalSearchParams<{ entryId?: string; date?: string }>();
  const entryId = typeof params.entryId === 'string' && params.entryId ? params.entryId : undefined;
  const key = entryId ?? 'new';
  const entry = useStore((s) => (entryId ? s.activities[entryId] : undefined));
  const hydrated = useDraftsHydrated();
  const draft = useStrengthDrafts((s) => s.drafts[key]);

  // Decide once per visit which draft to show. Later renders never re-create a
  // draft, so finishing or discarding (which removes it) cannot leave a fresh
  // one behind with a stale date.
  const [visit] = useState(draftKey);
  const opened = useStrengthDrafts((s) => s.openedBy[key] === visit);
  const [summary, setSummary] = useState<FinishSummary | null>(null);
  useEffect(() => {
    if (!hydrated || opened) return;
    if (entryId && (!entry || entry.deleted)) return;
    const d = typeof params.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(params.date) && params.date <= today() ? params.date : today();
    const next = draftOnOpen(useStrengthDrafts.getState().drafts[key], { entry: entryId ? entry : undefined, date: d });
    useStrengthDrafts.getState().open(key, visit, next);
  }, [hydrated, opened, visit, entryId, entry, key, params.date]);

  if (entryId && (!entry || entry.deleted) && !summary) {
    return (
      <Screen header={<Header title="Strength workout" subtitle="Opening" />}>
        <EmptyState emoji="🤷" title="This workout is no longer here" message="It may have been deleted on this or another device." action="Back to training" onAction={() => goBack('/train')} />
      </Screen>
    );
  }
  if (summary) return <FinishSummaryView summary={summary} />;
  if (!draft || !opened) return <Screen header={<Header title="Strength workout" subtitle="Opening" />}>{null}</Screen>;
  return <Logger draftKey={key} draft={draft} entry={entry} onFinished={setSummary} />;
}

interface PrevRef {
  date: string;
  sets: StrengthSet[];
}

interface FinishSummary {
  entry: ActivityEntry;
  volumeKg: number;
  setsDone: number;
  records: StrengthRecord[];
  exercises: DraftExercise[];
}

function Logger({ draftKey, draft, entry, onFinished }: { draftKey: string; draft: StrengthDraft; entry?: ActivityEntry; onFinished: (s: FinishSummary) => void }) {
  const { colors, radius, spacing } = useTheme();
  const profile = useProfile();
  const activities = useLive('activities');
  const units = profile.units;
  // What reaches the budget, in the run log's words, by the rule of the workout's day (`budgetAdds`).
  const addsRule = useDay(draft.date).exerciseRule;
  const update = (fn: (d: StrengthDraft) => StrengthDraft) => useStrengthDrafts.getState().update(draftKey, fn);

  const [now, setNow] = useState(() => Date.now());
  const [picker, setPicker] = useState(false);
  const [editTime, setEditTime] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [confirmLong, setConfirmLong] = useState(false);
  const [saveRoutine, setSaveRoutine] = useState(false);
  const templates = useRoutineTemplates();

  const resting = !!draft.restEndsAt;
  useEffect(() => {
    if (!draft.startedAt && !resting) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [draft.startedAt, resting]);

  // With the phone locked or the app in the background, the end of a rest arrives as an alert
  // (phones only, and only if notifications were already allowed). Skipping, adjusting or
  // finishing the rest replaces or removes it.
  const restEndsAt = draft.restEndsAt;
  const restExercise = draft.restExercise;
  useEffect(() => {
    if (!restEndsAt) return;
    void scheduleTimerAlert('rest', restEndsAt, {
      title: 'Rest is over',
      body: restExercise ? `Next set of ${restExercise.toLowerCase()}.` : 'Time for the next set.',
    });
    return () => void cancelTimerAlert('rest');
  }, [restEndsAt, restExercise]);

  // The rest ends: a nudge if the user is here to feel it, then the bar goes away.
  useEffect(() => {
    if (!draft.restEndsAt || now < draft.restEndsAt) return;
    if (now - draft.restEndsAt < 3000) haptic.success();
    useStrengthDrafts.getState().update(draftKey, edits.skipRest);
  }, [now, draft.restEndsAt, draftKey]);

  // Most recent earlier numbers for each exercise name.
  const previous = useMemo(() => {
    const out: Record<string, PrevRef> = {};
    const sorted = activities
      .filter((a) => a.exercises?.length && a.id !== draft.entryId)
      .sort((a, b) => b.date.localeCompare(a.date) || b.loggedAt.localeCompare(a.loggedAt));
    for (const a of sorted) for (const ex of a.exercises!) {
      const k = ex.name.toLowerCase();
      if (!out[k]) out[k] = { date: a.date, sets: ex.sets };
    }
    return out;
  }, [activities, draft.entryId]);
  const recentNames = useMemo(() => {
    const seen = new Set<string>();
    const names: string[] = [];
    for (const k of Object.keys(previous)) {
      const name = activities.flatMap((a) => a.exercises ?? []).find((e) => e.name.toLowerCase() === k)?.name;
      if (name && !seen.has(k)) {
        seen.add(k);
        names.push(name);
      }
    }
    return names;
  }, [previous, activities]);

  const exercises = draftToExercises(draft);
  const volume = strengthVolumeKg(exercises);
  let best: { kg: number; name: string } | null = null;
  for (const ex of exercises) for (const s of ex.sets) {
    const e1rm = estimateOneRepMax(s.weightKg, s.reps);
    if (e1rm > 0 && (!best || e1rm > best.kg)) best = { kg: e1rm, name: ex.name };
  }
  const totalSets = draft.exercises.reduce((n, e) => n + e.sets.length, 0);
  const doneSets = draft.exercises.reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0);

  const elapsed = elapsedMs(draft, now);
  const minutes = draftDurationMin(draft, now);
  // An edit is priced at the weight the workout was saved with, not today's.
  const current = { weightKg: profile.weightKg, baselineKcalPerDay: formulaTdee(profile) };
  const basis = entry ? basisFromEntry(entry, current) : current;
  const est = estimateSession(STRENGTH.met[draft.intensity], basis.weightKg, minutes, basis.baselineKcalPerDay);
  const running = !!draft.startedAt;
  const manual = draft.manualMin !== null;

  const finish = (confirmed = false) => {
    if (minutes < 1) {
      setEditTime(true);
      toast('Add how long the workout took');
      return;
    }
    if (minutes > MAX_MIN) {
      setEditTime(true);
      toast('That is longer than a day. Set how long the workout took');
      return;
    }
    // A timer left running overnight would add thousands of kcal; ask first.
    if (!confirmed && !manual && minutes > LONG_MIN) {
      setConfirmLong(true);
      return;
    }
    setConfirmLong(false);
    const saved = saveActivity({
      activityId: STRENGTH.id,
      intensity: draft.intensity,
      durationMin: minutes,
      date: draft.date,
      notes: draft.notes,
      exercises,
      entryId: draft.entryId,
    });
    if (!saved) return;
    useStrengthDrafts.getState().discard(draftKey);
    if (draft.entryId) {
      leaveFlow();
      return;
    }
    // A new workout ends on a short summary with any records against earlier sessions.
    const history = activities.filter((a) => a.id !== saved.id && a.exercises?.length).map((a) => a.exercises!);
    onFinished({
      entry: saved,
      volumeKg: volume,
      setsDone: doneSets,
      records: findStrengthRecords(saved.exercises ?? [], history),
      exercises: draft.exercises,
    });
  };

  const discard = () => {
    setConfirmDiscard(false);
    useStrengthDrafts.getState().discard(draftKey);
    leaveFlow();
  };

  const addExercise = (name: string) => {
    const clean = name.trim();
    if (!clean) return;
    setPicker(false);
    update((d) => edits.addExercise(d, clean));
  };

  return (
    <Screen
      header={
        <Header
          title={draft.entryId ? 'Edit workout' : 'Strength workout'}
          subtitle={formatDayLabel(draft.date)}
          onBack={() => goBack('/train')}
          right={
            draft.entryId && entry ? (
              <IconButton
                accessibilityLabel="Delete workout"
                testID="strength-delete"
                onPress={() => {
                  deleteActivity(entry);
                  useStrengthDrafts.getState().discard(draftKey);
                  leaveFlow();
                }}>
                <Trash2 size={18} color={colors.danger} strokeWidth={1.9} />
              </IconButton>
            ) : (
              // Every trash can is named "Delete …"; a new workout's asks first, since nothing of it is saved yet.
              <IconButton accessibilityLabel="Delete workout" testID="strength-discard" onPress={() => setConfirmDiscard(true)}>
                <Trash2 size={18} color={colors.danger} strokeWidth={1.9} />
              </IconButton>
            )
          }
        />
      }
      footer={
        <View style={{ gap: spacing.md }}>
          {draft.restEndsAt && draft.restEndsAt > now ? <RestBar draft={draft} now={now} update={update} /> : null}
          <Button
            testID="strength-finish"
            title={draft.entryId ? 'Save workout' : 'Finish workout'}
            onPress={() => finish()}
            disabled={draft.exercises.length === 0 && minutes < 1}
          />
        </View>
      }>
      {/* Summary: timer and running totals */}
      <View style={{ backgroundColor: colors.surface, ...cup(radius.card), borderWidth: 1, borderColor: colors.border, padding: 18, gap: spacing.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <View style={{ flex: 1 }}>
            <Text variant="overline">
              {manual ? 'Duration, set by you' : running ? 'Elapsed' : elapsed > 0 ? 'Paused' : 'Timer'}
            </Text>
            <TimerText text={manual ? formatDuration(draft.manualMin!) : formatClock(elapsed)} color={running ? 'text' : 'textSecondary'} />
          </View>
          <IconButton
            accessibilityLabel={running ? 'Pause timer' : 'Start timer'}
            testID="strength-timer-toggle"
            tone={running ? 'surface' : 'primary'}
            size={52}
            style={running ? { borderColor: colors.borderStrong } : undefined}
            onPress={() => update((d) => (d.startedAt ? edits.pause(d) : edits.start(d)))}>
            {running ? <Pause size={22} color={colors.text} /> : <Play size={22} color={colors.onPrimary} />}
          </IconButton>
          <IconButton accessibilityLabel="Set duration" testID="strength-time-edit" tone="surface" size={52} style={{ borderColor: colors.borderStrong }} onPress={() => setEditTime((v) => !v)}>
            <Clock size={20} color={colors.text} />
          </IconButton>
        </View>
        {editTime ? (
          // The overline above already says "Duration": no label here, so the field and "Use timer" share a top edge and an error goes under the field alone.
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm }}>
            <NumberField
              testID="strength-duration-input"
              accessibilityLabel="Duration in minutes"
              value={draft.manualMin ?? (minutes > 0 ? minutes : null)}
              onChange={(n) => update((d) => ({ ...edits.pause(d), manualMin: n && n > 0 ? Math.round(n) : null }))}
              decimals={0}
              suffix="min"
              style={{ flex: 1 }}
              error={draft.manualMin !== null && draft.manualMin > MAX_MIN ? 'That is longer than a day' : null}
            />
            {manual ? (
              <Button
                title="Use timer"
                variant="secondary"
                size="md"
                full={false}
                style={{ height: 50 }}
                onPress={() => update((d) => ({ ...d, manualMin: null }))}
              />
            ) : null}
          </View>
        ) : null}
        <Divider />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
          <Metric label="Volume" value={formatNumber(round(weightValue(volume, units)))} unit={weightUnit(units)} testID="strength-volume" />
          {/* Plain words, not "1RM": the heaviest single lift the sets point to, an estimate (Epley), so "~". */}
          <Metric
            label="Best one-rep max"
            value={best ? `~${formatLiftWeight(best.kg, units)}` : '–'}
            unit={best ? weightUnit(units) : undefined}
            spoken={`Best one-rep max, estimated: ${best ? `about ${formatLiftWeight(best.kg, units)} ${weightUnit(units)}` : 'none yet'}`}
            testID="strength-e1rm"
          />
          <Metric label="Sets done" value={`${doneSets}/${totalSets}`} />
        </View>
        <Text variant="caption" color="textSecondary" testID="strength-kcal">
          {minutes > 0
            ? `~${formatNumber(est.net)} kcal ${budgetAdds(addsRule, est.net).words}, likely ${formatNumber(kcalRange(est.net)[0])}–${formatNumber(kcalRange(est.net)[1])}`
            : running
              ? 'Calories show after the first minute.'
              : 'Start the timer or set a duration to estimate calories.'}
        </Text>
      </View>

      <View style={{ gap: spacing.sm }}>
        <Segmented
          testID="strength-effort"
          value={draft.intensity}
          onChange={(v: Intensity) => update((d) => ({ ...d, intensity: v }))}
          options={(['light', 'moderate', 'vigorous'] as Intensity[]).map((i) => ({ value: i, label: INTENSITY_LABELS[i].title }))}
        />
        <Text variant="caption" color="textSecondary">
          {STRENGTH.intensityHint?.[draft.intensity]} · talk test: {INTENSITY_LABELS[draft.intensity].hint.toLowerCase()}
        </Text>
      </View>

      {draft.exercises.length === 0 && templates.length > 0 ? (
        <View style={{ gap: spacing.md }}>
          <Text variant="title" accessibilityRole="header" {...({ 'aria-level': 2 } as object)}>Start from a routine</Text>
          <RoutineCards onStart={(t) => update((d) => draftFromRoutine(t, d))} testID="strength-routines" />
        </View>
      ) : null}

      {draft.exercises.length === 0 ? (
        <View style={{ ...cup(radius.card), borderWidth: 1, borderStyle: 'dashed', borderColor: colors.borderStrong }}>
          <EmptyState
            emoji="🏋️"
            title="Add your first exercise"
            message="Log weight and reps set by set. Your numbers from last time show up as a guide."
            action="Add exercise"
            actionTestID="strength-add-first"
            onAction={() => setPicker(true)}
          />
        </View>
      ) : (
        draft.exercises.map((ex, i) => (
          <ExerciseCard
            key={ex.key}
            index={i}
            ex={ex}
            units={units}
            prev={previous[ex.name.toLowerCase()]}
            update={update}
          />
        ))
      )}

      {draft.exercises.length > 0 ? (
        <View style={{ gap: spacing.xs }}>
          <Button testID="strength-add-exercise" title="Add exercise" variant="secondary" icon={<Plus size={18} color={colors.text} />} onPress={() => setPicker(true)} />
          <Button
            testID="strength-save-routine"
            title="Save as routine"
            variant="ghost"
            size="md"
            icon={<BookmarkPlus size={18} color={colors.primary} />}
            onPress={() => setSaveRoutine(true)}
          />
        </View>
      ) : null}

      <View style={{ gap: spacing.sm }}>
        <Text variant="title" accessibilityRole="header" {...({ 'aria-level': 2 } as object)}>Day</Text>
        <DateStepper date={draft.date} onChange={(d) => update((x) => ({ ...x, date: d }))} testID="strength-date" />
      </View>
      <TextField
        testID="strength-notes"
        label="Notes (optional)"
        placeholder="How did it go?"
        value={draft.notes}
        onChangeText={(t) => update((d) => ({ ...d, notes: t }))}
        multiline
      />

      <SaveRoutineSheet visible={saveRoutine} onClose={() => setSaveRoutine(false)} exercises={draft.exercises} />
      <ExercisePicker visible={picker} onClose={() => setPicker(false)} onPick={addExercise} recent={recentNames} />
      <ConfirmSheet
        visible={confirmLong}
        title={`Save a ${formatDuration(minutes)} workout?`}
        message={`The timer has been running for ${formatDuration(minutes)}, which would be logged as about ${formatNumber(est.net)} kcal ${budgetAdds(addsRule, est.net).words}. If it was left running, set the real duration instead.`}
        confirmLabel={`Save ${formatDuration(minutes)}`}
        cancelLabel="Set the duration"
        onConfirm={() => finish(true)}
        onCancel={() => {
          setConfirmLong(false);
          update((d) => ({ ...edits.pause(d), manualMin: null }));
          setEditTime(true);
        }}
      />
      <ConfirmSheet
        visible={confirmDiscard}
        title="Delete this workout?"
        message="The exercises and sets you entered will be cleared. Nothing has been saved to your log yet."
        confirmLabel="Delete workout"
        destructive
        onConfirm={discard}
        onCancel={() => setConfirmDiscard(false)}
      />
    </Screen>
  );
}

function RestBar({ draft, now, update }: { draft: StrengthDraft; now: number; update: (fn: (d: StrengthDraft) => StrengthDraft) => void }) {
  const { colors, radius, spacing } = useTheme();
  // `now` can trail a just-started rest by up to a tick; never show more than the rest's length.
  const left = Math.min(restRemainingMs(draft, now), (draft.restTotalSec ?? DEFAULT_REST_SEC) * 1000);
  const name = draft.restExercise ?? '';
  const adjust = (delta: number) => {
    update((d) => edits.adjustRest(d, delta));
    const total = Math.min(MAX_REST_SEC, Math.max(MIN_REST_SEC, (draft.restTotalSec ?? DEFAULT_REST_SEC) + delta));
    if (name) useStrengthDrafts.getState().setRestSec(name, total);
  };
  const small = (label: string, a11y: string, testID: string, onPress: () => void) => (
    <PressableScale
      testID={testID}
      accessibilityLabel={a11y}
      onPress={onPress}
      style={{ minWidth: 52, height: 44, paddingHorizontal: spacing.sm, ...cup(radius.buttonSm, 5), borderWidth: 1.5, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' }}>
      <Text variant="label" tabular>
        {label}
      </Text>
    </PressableScale>
  );
  return (
    <View
      testID="strength-rest"
      accessibilityLiveRegion="polite"
      style={{ gap: spacing.sm, ...cup(radius.tile, 5), backgroundColor: colors.surfaceAlt, paddingVertical: spacing.sm, paddingHorizontal: spacing.md }}>
      {/* The label has the bar's whole width, so a long exercise name is not cut down to "Rest afte…" beside the buttons,
          and keeps 8 px above them. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <CupKey color={colors.exercise} />
        <Text variant="caption" color="textSecondary" numberOfLines={1} style={{ flexShrink: 1 }}>
          Rest{name ? ` after ${name.toLowerCase()}` : ''}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="numL" tabular testID="strength-rest-left">
            {formatClock(Math.ceil(left / 1000) * 1000)}
          </Text>
        </View>
        {small('−15 s', 'Rest 15 seconds less', 'strength-rest-minus', () => adjust(-15))}
        {small('+15 s', 'Rest 15 seconds more', 'strength-rest-plus', () => adjust(15))}
        {small('Skip', 'Skip rest', 'strength-rest-skip', () => update(edits.skipRest))}
      </View>
      {/* The rest drains like a trough emptying toward the next set. */}
      <Trough value={left} max={(draft.restTotalSec ?? DEFAULT_REST_SEC) * 1000} color={colors.exercise} height={10} animate={false} style={{ marginBottom: 4 }} />
    </View>
  );
}

function FinishSummaryView({ summary }: { summary: FinishSummary }) {
  const { colors, spacing } = useTheme();
  const profile = useProfile();
  const units = profile.units;
  const [saveRoutine, setSaveRoutine] = useState(false);
  const e = summary.entry;
  // Undo on the "logged" toast removes the session while this summary is open.
  const undone = useStore((s) => s.activities[e.id]?.deleted !== false);
  const [lo, hi] = kcalRange(e.kcalNet);
  const addsWords = budgetAdds(useDay(e.date).exerciseRule, e.kcalNet).words;
  return (
    <Screen
      // The back cup leaves the finished workout the way Done does (the editor behind it is closed).
      header={<Header title={undone ? 'Workout not saved' : 'Workout saved'} subtitle={formatDayLabel(e.date)} onBack={leaveFlow} />}
      footer={
        <View style={{ gap: spacing.sm }}>
          <Button testID="strength-summary-done" title="Done" onPress={leaveFlow} />
          {summary.exercises.length ? (
            <Button testID="strength-summary-routine" title="Save as routine" variant="ghost" size="md" icon={<BookmarkPlus size={18} color={colors.primary} strokeWidth={2.2} />} onPress={() => setSaveRoutine(true)} />
          ) : null}
        </View>
      }>
      <Card testID="strength-summary">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
          <Metric label="Duration" value={formatDuration(e.durationMin)} testID="strength-summary-duration" />
          <Metric label="Volume" value={formatNumber(round(weightValue(summary.volumeKg, units)))} unit={weightUnit(units)} />
          <Metric label="Sets done" value={String(summary.setsDone)} />
        </View>
        <View style={{ marginVertical: spacing.md }}>
          <Divider />
        </View>
        <Text variant="body" color="textSecondary" testID="strength-summary-kcal">
          {undone
            ? 'You undid this workout, so it is not in your log.'
            : `About ${formatNumber(Math.round(e.kcalNet))} kcal ${addsWords} (likely ${formatNumber(lo)}–${formatNumber(hi)}).`}
        </Text>
      </Card>
      {summary.records.length ? (
        <View style={{ gap: spacing.sm }} testID="strength-summary-records">
          <Text variant="title" accessibilityRole="header" {...({ 'aria-level': 2 } as object)}>Personal records</Text>
          <Card padding={spacing.md} style={{ paddingVertical: spacing.xs }}>
            {summary.records.map((r, i) => (
              <View
                key={r.exercise}
                style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border }}>
                <Trophy size={20} color={colors.text} strokeWidth={1.9} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text variant="bodyStrong" numberOfLines={1}>
                    {r.exercise}
                  </Text>
                  <Text variant="caption" color="textSecondary">
                    {r.kind === 'e1rm' ? 'Best one-rep max ~' : 'Heaviest set '}
                    {formatLiftWeight(r.valueKg, units)} {weightUnit(units)}, up {formatLiftWeight(r.valueKg - r.previousKg, units)} {weightUnit(units)}
                  </Text>
                </View>
              </View>
            ))}
          </Card>
        </View>
      ) : null}
      <SaveRoutineSheet visible={saveRoutine} onClose={() => setSaveRoutine(false)} exercises={summary.exercises} />
    </Screen>
  );
}

function formatClock(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  return `${h > 0 ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`;
}

/**
 * The live timer: as large as fits beside its two buttons, stepping down for a narrow phone or a long time, never cut.
 * A duration typed in ("1 h 30 min") is numbers with their units small beside them, so it stays on one line.
 */
function TimerText({ text, color }: { text: string; color: 'text' | 'textSecondary' }) {
  const { width } = useWindowDimensions();
  // Room left of the two 52 px buttons: the screen (capped at 560) less its padding, the card's and the gaps.
  const room = Math.min(width, 560) - 40 - 36 - 2 * 52 - 2 * 12;
  const parts = /[a-z]/.test(text) ? text.split(/(\d+)/).filter(Boolean) : null;
  // Bricolage's tabular digits are about 0.6 em wide; a space or a colon is narrower, so this errs on the small side.
  // Units are 15 px text, about 8 px a character with their spaces.
  const digits = parts ? parts.filter((p) => /^\d+$/.test(p)).join('').length : text.length;
  const unitWidth = parts ? parts.filter((p) => !/^\d+$/.test(p)).join('').length * 8 : 0;
  const size = Math.max(24, Math.min(60, Math.floor((room - unitWidth) / (digits * 0.6))));
  return (
    <Text variant="numXL" tabular numberOfLines={1} testID="strength-timer" color={color} style={{ fontSize: size, lineHeight: Math.round(size * 0.97), letterSpacing: -size * 0.035 }}>
      {parts
        ? parts.map((p, i) =>
            /^\d+$/.test(p) ? (
              p
            ) : (
              <Text key={i} variant="unit" style={{ fontSize: 15, letterSpacing: 0 }}>
                {p}
              </Text>
            ),
          )
        : text}
    </Text>
  );
}

function Metric({ label, value, unit, testID, spoken }: { label: string; value: string; unit?: string; testID?: string; spoken?: string }) {
  // Three metrics share a row: under 360 px the number steps down a size and the label may take two lines.
  const narrow = useWindowDimensions().width < 360;
  // Above 115% text a metric is at least 120 px wide and its row wraps (two, then one), so no label is cut.
  const big = useLargeText();
  return (
    <View
      style={{ flex: 1, minWidth: big ? 120 : 0 }}
      // Said in full: "Volume: 2,450 kilograms", "Best one-rep max, estimated: about 80 kilograms".
      {...figure(spokenUnits(spoken ?? `${label}: ${value === '–' ? 'none yet' : `${value}${unit ? ` ${unit}` : ''}`}`))}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 3 }}>
        <Text variant="numM" tabular testID={testID} style={narrow ? { fontSize: 17, lineHeight: 21 } : undefined}>
          {value}
        </Text>
        {unit ? <Text variant="unit">{unit}</Text> : null}
      </View>
      <Text variant="caption" color="textSecondary" numberOfLines={big ? undefined : 2}>
        {label}
      </Text>
    </View>
  );
}

function ExerciseCard({
  ex,
  index,
  units,
  prev,
  update,
}: {
  ex: DraftExercise;
  index: number;
  units: UnitSystem;
  prev?: PrevRef;
  update: (fn: (d: StrengthDraft) => StrengthDraft) => void;
}) {
  const { colors, radius, spacing } = useTheme();
  const unit = weightUnit(units);
  const slug = `ex-${index}`;
  const prevText = prev ? formatPreviousSets(prev.sets, units) : null;
  // A set row holds the set number, two fields and two buttons. Under 360 px that leaves a field
  // about 50 px, too little for "62.5" or "137.5": the card's padding, the gaps and the remove button
  // step down and the weight takes the larger share, so both values show in full.
  const narrow = useWindowDimensions().width < 360;
  const gap = narrow ? 6 : spacing.sm;
  const setCol = narrow ? 26 : 28;
  // A set's delete is the trash can every row delete is (Trash2 18 px in a 44 px clear cup). Under 360 px the clear
  // cup is drawn 28 px wide (the same look, still 44 px to touch through hitSlop) so the reps field keeps "10" whole.
  const removeSize = narrow ? 28 : 44;
  return (
    <View testID={slug} style={{ backgroundColor: colors.surface, ...cup(radius.card), borderWidth: 1, borderColor: colors.border, padding: narrow ? 16 : 18, gap: spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="h3" numberOfLines={2} accessibilityRole="header" {...({ 'aria-level': 2 } as object)}>
            {ex.name}
          </Text>
          <Text variant="caption" color="textSecondary" numberOfLines={2} testID={`${slug}-previous`}>
            {prevText ? `Last time, ${formatShortDate(prev!.date)}: ${prevText}` : 'First time logging this exercise'}
          </Text>
        </View>
        <IconButton accessibilityLabel={`Delete ${ex.name}`} testID={`${slug}-remove`} tone="clear" size={44} onPress={() => update((d) => edits.removeExercise(d, ex.key))}>
          <Trash2 size={18} color={colors.textSecondary} strokeWidth={1.9} />
        </IconButton>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap, paddingTop: spacing.xs }}>
        <Text variant="overline" color="textTertiary" style={{ width: setCol, textAlign: 'center' }}>
          SET
        </Text>
        <Text variant="overline" color="textTertiary" style={{ flex: narrow ? 1.5 : 1 }}>
          {unit.toUpperCase()}
        </Text>
        <Text variant="overline" color="textTertiary" style={{ flex: 1 }}>
          REPS
        </Text>
        <View style={{ width: 44 + removeSize + gap }} />
      </View>

      {ex.sets.map((s, i) => {
        const ref = prev?.sets[i];
        return (
          <View
            key={s.key}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap,
              marginHorizontal: -spacing.sm,
              paddingHorizontal: spacing.sm,
              paddingVertical: 2,
              ...cup(radius.buttonSm, 5),
              backgroundColor: s.done ? colors.surfaceAlt : 'transparent',
            }}>
            <Text variant="bodyStrong" color="textSecondary" tabular style={{ width: setCol, textAlign: 'center' }}>
              {i + 1}
            </Text>
            <NumberField
              testID={`${slug}-set-${i}-weight`}
              accessibilityLabel={`Set ${i + 1} weight in ${unit}`}
              placeholder={ref ? formatLiftWeight(ref.weightKg, units) : '0'}
              value={s.weightKg === null ? null : round(weightValue(s.weightKg, units), 2)}
              onChange={(n) => update((d) => edits.updateSet(d, ex.key, s.key, { weightKg: n === null ? null : weightToKg(Math.max(0, n), units) }))}
              decimals={2}
              style={{ flex: narrow ? 1.5 : 1 }}
            />
            <NumberField
              testID={`${slug}-set-${i}-reps`}
              accessibilityLabel={`Set ${i + 1} reps`}
              placeholder={ref ? String(ref.reps) : '0'}
              value={s.reps}
              onChange={(n) => update((d) => edits.updateSet(d, ex.key, s.key, { reps: n === null ? null : Math.max(0, Math.round(n)) }))}
              decimals={0}
              style={{ flex: 1 }}
            />
            <PressableScale
              testID={`${slug}-set-${i}-done`}
              accessibilityLabel={s.done ? `Set ${i + 1} done` : `Mark set ${i + 1} done`}
              accessibilityState={{ checked: s.done }}
              feedback="select"
              onPress={() =>
                update((d) => {
                  const next = edits.updateSet(d, ex.key, s.key, {
                    done: !s.done,
                    // Ticking an empty set takes last session's numbers, as shown in the placeholders.
                    ...(!s.done && s.weightKg === null && ref ? { weightKg: ref.weightKg } : {}),
                    ...(!s.done && s.reps === null && ref ? { reps: ref.reps } : {}),
                  });
                  if (s.done) return next;
                  // Ticking a set starts the rest before the next one, at this exercise's last rest length.
                  const len = useStrengthDrafts.getState().restSec[ex.name.trim().toLowerCase()] ?? DEFAULT_REST_SEC;
                  return edits.startRest(next, ex.name, len);
                })
              }
              style={{
                width: 44,
                height: 44,
                ...cupFor(44),
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'transparent',
                borderWidth: s.done ? 2 : 1.5,
                borderColor: s.done ? colors.text : colors.borderStrong,
              }}>
              {/* Done is the app's done mark, the small filled ink cup in an ink outline; not yet, the same cup empty.
                  Never a check, which means only a day on budget. */}
              <CupKey color={s.done ? colors.text : colors.textSecondary} variant={s.done ? 'filled' : 'outline'} size={14} />
            </PressableScale>
            <IconButton
              accessibilityLabel={`Delete set ${i + 1}`}
              testID={`${slug}-set-${i}-remove`}
              tone="clear"
              size={removeSize}
              onPress={() => update((d) => edits.removeSet(d, ex.key, s.key))}>
              <Trash2 size={18} color={colors.textSecondary} strokeWidth={1.9} />
            </IconButton>
          </View>
        );
      })}

      <Button
        testID={`${slug}-add-set`}
        title="Add set"
        variant="ghost"
        size="sm"
        icon={<Plus size={16} color={colors.primary} />}
        onPress={() => {
          const fallback = prev?.sets[ex.sets.length] ?? prev?.sets[prev.sets.length - 1];
          update((d) => edits.addSet(d, ex.key, fallback ? { weightKg: fallback.weightKg, reps: fallback.reps } : undefined));
        }}
      />
    </View>
  );
}

/** Default routine name from the main muscle group of the exercises ("Legs workout"). */
function suggestedRoutineName(exercises: DraftExercise[]): string {
  const counts = new Map<string, number>();
  for (const ex of exercises) {
    const g = EXERCISE_GROUPS.find((x) => x.exercises.some((n) => n.toLowerCase() === ex.name.toLowerCase()));
    if (g) counts.set(g.label, (counts.get(g.label) ?? 0) + 1);
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  if (!ranked.length) return 'My workout';
  if (ranked.length === 1 || ranked[0][1] > ranked[1][1]) return `${ranked[0][0]} workout`;
  const labels = ranked.map((r) => r[0]);
  if (labels.every((l) => ['Chest', 'Back', 'Shoulders', 'Arms'].includes(l))) return 'Upper body workout';
  if (labels.every((l) => ['Legs', 'Glutes'].includes(l))) return 'Lower body workout';
  return 'Full body workout';
}

function SaveRoutineSheet({ visible, onClose, exercises }: { visible: boolean; onClose: () => void; exercises: DraftExercise[] }) {
  const [name, setName] = useState<string | null>(null);
  const value = name ?? suggestedRoutineName(exercises);
  // Every set in the workout counts, filled in or not: the routine is the plan.
  const list = routineExercises(exercises.map((e) => ({ name: e.name, sets: e.sets.map(() => ({ reps: 1, weightKg: 0 })) })));
  const close = () => {
    setName(null);
    onClose();
  };
  const save = () => {
    if (!list.length || !value.trim()) return;
    const r = addRoutine(value, list);
    haptic.success();
    toast(`Saved ${isolateRtl(r.name)} as a routine`);
    close();
  };
  return (
    <Sheet
      visible={visible}
      onClose={close}
      title="Save as routine"
      footer={<Button testID="routine-save" title="Save routine" onPress={save} disabled={!list.length || !value.trim()} />}>
      <TextField testID="routine-name" label="Name" value={value} onChangeText={setName} maxLength={40} returnKeyType="done" onSubmitEditing={save} />
      <Text variant="caption" color="textSecondary">
        {list.map((e) => `${isolateRtl(e.name)} × ${e.sets}`).join(', ')}. Starting it later adds these exercises with empty sets; your last numbers show as a guide.
      </Text>
    </Sheet>
  );
}

function ExercisePicker({ visible, onClose, onPick, recent }: { visible: boolean; onClose: () => void; onPick: (name: string) => void; recent: string[] }) {
  // At large text a placeholder longer than one word would be cut in the field.
  const bigText = useLargeText();
  const { colors, spacing } = useTheme();
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState<string>('all');
  const q = query.trim();
  const results = q ? searchExercises(q, recent) : [];
  const exact = results.some((r) => r.name.toLowerCase() === q.toLowerCase());
  const pick = (name: string) => {
    setQuery('');
    onPick(name);
  };
  const row = (name: string, sub: string | undefined, key: string) => (
    <ListRow
      key={key}
      testID={`exercise-option-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
      title={name}
      subtitle={sub}
      onPress={() => pick(name)}
      right={<Plus size={18} color={colors.primary} />}
    />
  );
  return (
    <Sheet visible={visible} onClose={onClose} title="Add exercise">
      <TextField
        testID="exercise-search"
        placeholder={bigText ? 'Search' : 'Search bench, squat, row...'}
        value={query}
        onChangeText={setQuery}
        autoCorrect={false}
        left={<Search size={18} color={colors.textTertiary} />}
        returnKeyType="done"
        onSubmitEditing={() => q && pick(results[0]?.name ?? q)}
      />
      {!q ? (
        <ChipRow>
          <Chip label="All" selected={group === 'all'} onPress={() => setGroup('all')} testID="exercise-group-all" />
          {EXERCISE_GROUPS.filter((g) => group === 'all' || g.id === group).map((g) => (
            <Chip key={g.id} label={g.label} selected={group === g.id} onPress={() => setGroup(g.id)} testID={`exercise-group-${g.id}`} />
          ))}
        </ChipRow>
      ) : null}
      {q && !exact ? (
        <ListRow
          testID="exercise-custom"
          title={`Add “${q}”`}
          subtitle="As a custom exercise"
          onPress={() => pick(q)}
          right={<Plus size={18} color={colors.primary} />}
        />
      ) : null}
      {q ? (
        results.map((r) => row(r.name, r.group, `s-${r.name}`))
      ) : (
        <>
          {recent.length && group === 'all' ? (
            <View>
              <Text variant="overline" color="textSecondary" style={{ marginTop: spacing.sm }}>
                RECENT
              </Text>
              {recent.slice(0, 8).map((n) => row(n, undefined, `r-${n}`))}
            </View>
          ) : null}
          {EXERCISE_GROUPS.filter((g) => group === 'all' || g.id === group).map((g) => (
            <View key={g.id}>
              <Text variant="overline" color="textSecondary" style={{ marginTop: spacing.sm }}>
                {g.label.toUpperCase()}
              </Text>
              {g.exercises.map((n) => row(n, undefined, `${g.id}-${n}`))}
            </View>
          ))}
        </>
      )}
    </Sheet>
  );
}
