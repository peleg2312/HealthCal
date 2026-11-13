import { useLocalSearchParams } from 'expo-router';
import { Check, Clock, Pause, Play, Plus, Search, Trash2, X } from 'lucide-react-native';
import React, { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { View } from 'react-native';

import { ACTIVITY_BY_ID } from '@/data/activities';
import { estimateSession } from '@/features/activity/build';
import { DateStepper } from '@/features/activity/components';
import { EXERCISE_GROUPS, searchExercises } from '@/features/activity/exercises';
import { deleteActivity, leaveFlow, saveActivity } from '@/features/activity/session';
import {
  draftDurationMin,
  draftFromEntry,
  draftToExercises,
  edits,
  elapsedMs,
  newDraft,
  useStrengthDrafts,
  type DraftExercise,
  type StrengthDraft,
} from '@/features/activity/strengthDraft';
import { formatDayLabel, formatShortDate, today } from '@/lib/dates';
import { formulaTdee } from '@/lib/energy';
import { INTENSITY_LABELS, estimateOneRepMax, strengthVolumeKg } from '@/lib/exercise';
import { formatNumber, round, weightToKg, weightUnit, weightValue } from '@/lib/units';
import { useStore } from '@/store';
import { useLive, useProfile } from '@/store/selectors';
import { useTheme } from '@/theme';
import type { ActivityEntry, Intensity, StrengthSet, UnitSystem } from '@/types';
import {
  Button,
  Chip,
  ChipRow,
  ConfirmSheet,
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
  goBack,
  toast,
} from '@/ui';

const STRENGTH = ACTIVITY_BY_ID.strength_training;

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

  useEffect(() => {
    if (!hydrated || draft) return;
    if (entryId) {
      if (entry && !entry.deleted) useStrengthDrafts.getState().put(key, draftFromEntry(entry));
    } else {
      const d = typeof params.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(params.date) && params.date <= today() ? params.date : today();
      useStrengthDrafts.getState().put(key, newDraft(d));
    }
  }, [hydrated, draft, entryId, entry, key, params.date]);

  if (entryId && (!entry || entry.deleted)) {
    return (
      <Screen header={<Header title="Workout" />}>
        <EmptyState emoji="🤷" title="This workout is no longer here" message="It may have been deleted on this or another device." action="Back to training" onAction={() => goBack('/train')} />
      </Screen>
    );
  }
  if (!draft) return <Screen header={<Header title="Workout" />}>{null}</Screen>;
  return <Logger draftKey={key} draft={draft} entry={entry} />;
}

interface PrevRef {
  date: string;
  sets: StrengthSet[];
}

function Logger({ draftKey, draft, entry }: { draftKey: string; draft: StrengthDraft; entry?: ActivityEntry }) {
  const { colors, radius, spacing } = useTheme();
  const profile = useProfile();
  const activities = useLive('activities');
  const units = profile.units;
  const update = (fn: (d: StrengthDraft) => StrengthDraft) => useStrengthDrafts.getState().update(draftKey, fn);

  const [now, setNow] = useState(() => Date.now());
  const [picker, setPicker] = useState(false);
  const [editTime, setEditTime] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  useEffect(() => {
    if (!draft.startedAt) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [draft.startedAt]);

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
  const est = estimateSession(STRENGTH.met[draft.intensity], profile.weightKg, minutes, formulaTdee(profile));
  const running = !!draft.startedAt;
  const manual = draft.manualMin !== null;

  const finish = () => {
    if (minutes < 1) {
      setEditTime(true);
      toast('Add how long the workout took');
      return;
    }
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
    leaveFlow();
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
                <Trash2 size={18} color={colors.danger} />
              </IconButton>
            ) : (
              <Button title="Discard" variant="ghost" size="sm" full={false} testID="strength-discard" onPress={() => setConfirmDiscard(true)} />
            )
          }
        />
      }
      footer={
        <Button
          testID="strength-finish"
          title={draft.entryId ? 'Save workout' : 'Finish workout'}
          icon={<Check size={18} color={colors.onPrimary} />}
          onPress={finish}
          disabled={draft.exercises.length === 0 && minutes < 1}
        />
      }>
      {/* Summary: timer and running totals */}
      <View style={{ backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <View style={{ flex: 1 }}>
            <Text variant="overline" color="textSecondary">
              {manual ? 'DURATION, SET BY YOU' : running ? 'ELAPSED' : elapsed > 0 ? 'PAUSED' : 'TIMER'}
            </Text>
            <Text variant="numXL" tabular testID="strength-timer" color={running ? 'text' : 'textSecondary'}>
              {manual ? `${draft.manualMin} min` : formatClock(elapsed)}
            </Text>
          </View>
          <IconButton
            accessibilityLabel={running ? 'Pause timer' : 'Start timer'}
            testID="strength-timer-toggle"
            tone={running ? 'alt' : 'primary'}
            size={52}
            onPress={() => update((d) => (d.startedAt ? edits.pause(d) : edits.start(d)))}>
            {running ? <Pause size={22} color={colors.text} /> : <Play size={22} color={colors.onPrimary} />}
          </IconButton>
          <IconButton accessibilityLabel="Set duration" testID="strength-time-edit" tone="alt" size={52} onPress={() => setEditTime((v) => !v)}>
            <Clock size={20} color={colors.text} />
          </IconButton>
        </View>
        {editTime ? (
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm }}>
            <NumberField
              testID="strength-duration-input"
              label="Duration"
              value={draft.manualMin ?? (minutes > 0 ? minutes : null)}
              onChange={(n) => update((d) => ({ ...edits.pause(d), manualMin: n && n > 0 ? Math.round(n) : null }))}
              decimals={0}
              suffix="min"
              style={{ flex: 1 }}
            />
            {manual ? (
              <Button
                title="Use timer"
                variant="secondary"
                size="md"
                full={false}
                style={{ alignSelf: 'flex-end' }}
                onPress={() => update((d) => ({ ...d, manualMin: null }))}
              />
            ) : null}
          </View>
        ) : null}
        <Divider />
        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          <Metric label="Volume" value={formatNumber(round(weightValue(volume, units)))} unit={weightUnit(units)} testID="strength-volume" />
          <Metric
            label="Best est. 1RM"
            value={best ? formatNumber(round(weightValue(best.kg, units), 1), 1).replace(/\.0$/, '') : '–'}
            unit={best ? weightUnit(units) : undefined}
            testID="strength-e1rm"
          />
          <Metric label="Sets done" value={`${doneSets}/${totalSets}`} />
        </View>
        <Text variant="caption" color="textSecondary" testID="strength-kcal">
          {minutes > 0
            ? `About ${formatNumber(est.gross)} kcal in ${minutes} min (likely ${est.grossRange[0]}–${est.grossRange[1]}), of which ${formatNumber(est.net)} is above resting. Based on ${STRENGTH.met[draft.intensity]} MET.`
            : 'Start the timer or set a duration to estimate calories.'}
        </Text>
      </View>

      <View style={{ gap: spacing.sm }}>
        <Segmented
          value={draft.intensity}
          onChange={(v: Intensity) => update((d) => ({ ...d, intensity: v }))}
          options={(['light', 'moderate', 'vigorous'] as Intensity[]).map((i) => ({ value: i, label: INTENSITY_LABELS[i].title }))}
        />
        <Text variant="caption" color="textTertiary">
          {STRENGTH.intensityHint?.[draft.intensity]} · talk test: {INTENSITY_LABELS[draft.intensity].hint.toLowerCase()}
        </Text>
      </View>

      {draft.exercises.length === 0 ? (
        <View style={{ borderRadius: radius.lg, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.borderStrong }}>
          <EmptyState
            emoji="🏋️"
            title="Add your first exercise"
            message="Log weight and reps set by set. Your numbers from last time show up as a guide."
            action="Add exercise"
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
        <Button testID="strength-add-exercise" title="Add exercise" variant="secondary" icon={<Plus size={18} color={colors.text} />} onPress={() => setPicker(true)} />
      ) : null}

      <View style={{ gap: spacing.sm }}>
        <Text variant="title">Day</Text>
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

      <ExercisePicker visible={picker} onClose={() => setPicker(false)} onPick={addExercise} recent={recentNames} />
      <ConfirmSheet
        visible={confirmDiscard}
        title="Discard this workout?"
        message="The exercises and sets you entered will be cleared. Nothing has been saved to your log yet."
        confirmLabel="Discard workout"
        destructive
        onConfirm={discard}
        onCancel={() => setConfirmDiscard(false)}
      />
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

function Metric({ label, value, unit, testID }: { label: string; value: string; unit?: string; testID?: string }) {
  return (
    <View style={{ flex: 1, minWidth: 0 }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3 }}>
        <Text variant="numM" tabular numberOfLines={1} testID={testID}>
          {value}
        </Text>
        {unit ? (
          <Text variant="caption" color="textSecondary">
            {unit}
          </Text>
        ) : null}
      </View>
      <Text variant="caption" color="textSecondary" numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function fmtW(kg: number, units: UnitSystem): string {
  return formatNumber(round(weightValue(kg, units), 1), 1).replace(/\.0$/, '');
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
  const prevText = prev
    ? prev.sets
        .slice(0, 5)
        .map((s) => (s.weightKg > 0 ? `${fmtW(s.weightKg, units)} × ${s.reps}` : `${s.reps} reps`))
        .join(', ') + (prev.sets.length > 5 ? ` +${prev.sets.length - 5}` : '')
    : null;
  return (
    <View testID={slug} style={{ backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="h3" numberOfLines={1}>
            {ex.name}
          </Text>
          <Text variant="caption" color="textSecondary" numberOfLines={2} testID={`${slug}-previous`}>
            {prevText ? `Last time, ${formatShortDate(prev!.date)}: ${prevText} ${unit}` : 'First time logging this exercise'}
          </Text>
        </View>
        <IconButton accessibilityLabel={`Remove ${ex.name}`} testID={`${slug}-remove`} tone="clear" onPress={() => update((d) => edits.removeExercise(d, ex.key))}>
          <Trash2 size={18} color={colors.textTertiary} />
        </IconButton>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingTop: spacing.xs }}>
        <Text variant="overline" color="textTertiary" style={{ width: 28, textAlign: 'center' }}>
          SET
        </Text>
        <Text variant="overline" color="textTertiary" style={{ flex: 1 }}>
          {unit.toUpperCase()}
        </Text>
        <Text variant="overline" color="textTertiary" style={{ flex: 1 }}>
          REPS
        </Text>
        <View style={{ width: 44 + 32 + spacing.sm }} />
      </View>

      {ex.sets.map((s, i) => {
        const ref = prev?.sets[i];
        return (
          <View
            key={s.key}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.sm,
              marginHorizontal: -spacing.sm,
              paddingHorizontal: spacing.sm,
              paddingVertical: 2,
              borderRadius: radius.sm,
              backgroundColor: s.done ? `${colors.success}22` : 'transparent',
            }}>
            <Text variant="bodyStrong" color="textSecondary" tabular style={{ width: 28, textAlign: 'center' }}>
              {i + 1}
            </Text>
            <NumberField
              testID={`${slug}-set-${i}-weight`}
              accessibilityLabel={`Set ${i + 1} weight in ${unit}`}
              placeholder={ref ? fmtW(ref.weightKg, units) : '0'}
              value={s.weightKg === null ? null : round(weightValue(s.weightKg, units), 2)}
              onChange={(n) => update((d) => edits.updateSet(d, ex.key, s.key, { weightKg: n === null ? null : weightToKg(Math.max(0, n), units) }))}
              decimals={2}
              style={{ flex: 1 }}
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
                update((d) =>
                  edits.updateSet(d, ex.key, s.key, {
                    done: !s.done,
                    // Ticking an empty set takes last session's numbers, as shown in the placeholders.
                    ...(!s.done && s.weightKg === null && ref ? { weightKg: ref.weightKg } : {}),
                    ...(!s.done && s.reps === null && ref ? { reps: ref.reps } : {}),
                  }),
                )
              }
              style={{
                width: 44,
                height: 44,
                borderRadius: radius.sm,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: s.done ? colors.success : colors.surfaceAlt,
              }}>
              <Check size={20} color={s.done ? colors.bg : colors.textTertiary} />
            </PressableScale>
            <IconButton
              accessibilityLabel={`Remove set ${i + 1}`}
              testID={`${slug}-set-${i}-remove`}
              tone="clear"
              size={32}
              onPress={() => update((d) => edits.removeSet(d, ex.key, s.key))}>
              <X size={16} color={colors.textTertiary} />
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

function ExercisePicker({ visible, onClose, onPick, recent }: { visible: boolean; onClose: () => void; onPick: (name: string) => void; recent: string[] }) {
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
        placeholder="Search bench, squat, row..."
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
