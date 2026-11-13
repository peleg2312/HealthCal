import { router, useLocalSearchParams } from 'expo-router';
import { ChevronDown, ChevronUp, Droplets, Info, Minus, Plus, Trash2 } from 'lucide-react-native';
import React, { useState } from 'react';
import { View } from 'react-native';

import { ACTIVITY_BY_ID, MET_SOURCES } from '@/data/activities';
import { estimateSession, formatPace, paceModeFor } from '@/features/activity/build';
import { DateStepper } from '@/features/activity/components';
import { deleteActivity, leaveFlow, saveActivity } from '@/features/activity/session';
import { formatDayLabel, today } from '@/lib/dates';
import { formulaTdee } from '@/lib/energy';
import { INTENSITY_LABELS } from '@/lib/exercise';
import { exerciseWaterMl } from '@/lib/hydration';
import { distanceToKm, distanceUnit, distanceValue, formatNumber, formatVolume, formatWeight, round } from '@/lib/units';
import { useStore } from '@/store';
import { useLive, useProfile } from '@/store/selectors';
import { useTheme } from '@/theme';
import type { Intensity } from '@/types';
import { Button, Card, Chip, EmptyState, Header, IconButton, NumberField, PressableScale, Screen, Text, TextField, goBack } from '@/ui';

const INTENSITIES: Intensity[] = ['light', 'moderate', 'vigorous'];
const PRESETS = [15, 30, 45, 60, 90];

export default function LogActivityScreen() {
  const params = useLocalSearchParams<{ activityId?: string; entryId?: string; date?: string }>();
  const entry = useStore((s) => (params.entryId ? s.activities[params.entryId] : undefined));
  const activityId = entry?.activityId ?? params.activityId;
  const activity = activityId ? ACTIVITY_BY_ID[activityId] : undefined;

  if (!activity || (params.entryId && (!entry || entry.deleted))) {
    return (
      <Screen header={<Header title="Log activity" />}>
        <EmptyState
          emoji="🤷"
          title={params.entryId ? 'This session is no longer here' : 'Choose an activity first'}
          message={params.entryId ? 'It may have been deleted on this or another device.' : 'Pick what you did and how long it took.'}
          action="Browse activities"
          onAction={() => router.replace('/activity/pick')}
        />
      </Screen>
    );
  }
  return <LogForm key={entry?.id ?? activity.id} activityId={activity.id} entryId={entry?.id} dateParam={params.date} />;
}

function LogForm({ activityId, entryId, dateParam }: { activityId: string; entryId?: string; dateParam?: string }) {
  const { colors, radius, spacing } = useTheme();
  const profile = useProfile();
  const activities = useLive('activities');
  const activity = ACTIVITY_BY_ID[activityId];
  const entry = useStore((s) => (entryId ? s.activities[entryId] : undefined));
  const units = profile.units;

  // A new session starts from what the user did last time for this activity.
  const [last] = useState(() =>
    entry ? undefined : [...activities].filter((a) => a.activityId === activityId).sort((a, b) => b.loggedAt.localeCompare(a.loggedAt))[0],
  );
  const singleMet = activity.met.light === activity.met.moderate && activity.met.moderate === activity.met.vigorous;
  const [duration, setDuration] = useState<number | null>(entry?.durationMin ?? last?.durationMin ?? 30);
  const [intensity, setIntensity] = useState<Intensity>(entry?.intensity ?? (singleMet ? 'moderate' : last?.intensity ?? 'moderate'));
  const [distance, setDistance] = useState<number | null>(entry?.distanceKm ? round(distanceValue(entry.distanceKm, units), 2) : null);
  const [date, setDate] = useState(entry?.date ?? (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) && dateParam <= today() ? dateParam : today()));
  const [notes, setNotes] = useState(entry?.notes ?? '');
  const [showSource, setShowSource] = useState(false);

  const minutes = Math.max(0, Math.round(duration ?? 0));
  const met = activity.met[intensity];
  const tdee = formulaTdee(profile);
  const est = estimateSession(met, profile.weightKg, minutes, tdee);
  const water = exerciseWaterMl([{ durationMin: minutes, intensity }]);
  const dayWord = date === today() ? "today's" : `${formatDayLabel(date).toLowerCase()}'s`;
  const restingShare = Math.round((tdee / 1440) * minutes);

  const unit = distanceUnit(units);
  const mode = paceModeFor(activity);
  let paceText: string | null = null;
  if (distance && distance > 0 && minutes > 0) {
    if (mode === 'speed') paceText = `${formatNumber(distance / (minutes / 60), 1)} ${unit}/h average`;
    else if (mode === 'swim') {
      const per100 = units === 'imperial' ? minutes / ((distanceToKm(distance, units) * 1093.61) / 100) : minutes / (distance * 10);
      paceText = `${formatPace(per100)} per 100 ${units === 'imperial' ? 'yd' : 'm'}`;
    } else paceText = `${formatPace(minutes / distance)} per ${unit}`;
  }

  const canSave = minutes > 0 && minutes <= 24 * 60;
  const save = () => {
    if (!canSave) return;
    saveActivity({
      activityId,
      intensity,
      durationMin: minutes,
      distanceKm: distance && distance > 0 ? distanceToKm(distance, units) : null,
      notes,
      date,
      exercises: entry?.exercises ?? null,
      entryId,
    });
    leaveFlow();
  };

  const sentence = profile.eatBackExercise
    ? `About ${formatNumber(est.gross)} kcal, of which ${formatNumber(est.net)} is above what your day already includes; ${formatNumber(est.net)} is added to ${dayWord} budget.`
    : `About ${formatNumber(est.gross)} kcal, of which ${formatNumber(est.net)} is above what your day already includes. Your budget stays the same, because adding exercise calories back is turned off in your goals.`;

  return (
    <Screen
      header={
        <Header
          title={`${activity.emoji}  ${activity.name}`}
          subtitle={entryId ? 'Edit session' : 'New session'}
          right={
            entryId && entry ? (
              <IconButton
                accessibilityLabel="Delete session"
                testID="log-activity-delete"
                onPress={() => {
                  deleteActivity(entry);
                  leaveFlow();
                }}>
                <Trash2 size={18} color={colors.danger} />
              </IconButton>
            ) : null
          }
        />
      }
      footer={<Button testID="log-activity-save" title={entryId ? 'Save changes' : 'Log session'} onPress={save} disabled={!canSave} />}>
      {/* Live result */}
      <Card testID="log-activity-result" style={{ gap: spacing.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: spacing.md }}>
          <View>
            <Text variant="overline" color="textSecondary">
              ESTIMATED BURN
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
              <Text variant="numXL" tabular color={colors.exercise} testID="log-activity-gross">
                {formatNumber(est.gross)}
              </Text>
              <Text variant="label" color="textSecondary">
                kcal
              </Text>
            </View>
            <Text variant="caption" color="textSecondary" tabular>
              likely {formatNumber(est.grossRange[0])}–{formatNumber(est.grossRange[1])} kcal
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end', backgroundColor: `${colors.exercise}22`, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm }}>
            <Text variant="numM" tabular testID="log-activity-net">
              {profile.eatBackExercise ? '+' : ''}
              {formatNumber(est.net)}
            </Text>
            <Text variant="caption" color="textSecondary">
              {profile.eatBackExercise ? 'to budget' : 'above resting'}
            </Text>
          </View>
        </View>
        <Text variant="body" color="textSecondary" testID="log-activity-sentence">
          {sentence}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <Droplets size={16} color={colors.water} />
          <Text variant="label" color="textSecondary" style={{ flex: 1 }}>
            {water > 0
              ? profile.waterGoalMlOverride
                ? `Drink about ${formatVolume(water, units)} extra; your fixed water goal is not changed`
                : `Adds ${formatVolume(water, units)} to ${dayWord} water goal`
              : 'Too short to change the water goal'}
          </Text>
        </View>
        <PressableScale
          testID="log-activity-source"
          accessibilityLabel="Where this number comes from"
          onPress={() => setShowSource((v) => !v)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 44 }}>
          <Info size={16} color={colors.textTertiary} />
          <Text variant="label" color="textTertiary" style={{ flex: 1 }}>
            Where this number comes from
          </Text>
          {showSource ? <ChevronUp size={16} color={colors.textTertiary} /> : <ChevronDown size={16} color={colors.textTertiary} />}
        </PressableScale>
        {showSource ? (
          <View style={{ gap: spacing.sm, marginTop: -spacing.xs }} testID="log-activity-source-body">
            <Text variant="caption" color="textSecondary">
              {met} MET × 3.5 ml O₂ per kg per minute × {formatWeight(profile.weightKg, 'metric')} × {minutes} min ÷ 200 = {formatNumber(est.gross)} kcal in total. Your
              day already assumes {formatNumber(Math.round(tdee))} kcal for resting and daily life, {formatNumber(restingShare)} kcal of it in these minutes, so{' '}
              {formatNumber(est.net)} kcal is extra. MET values describe an average adult, so the range allows about 20% either way.
            </Text>
            <Text variant="caption" color="textTertiary">
              Source: {MET_SOURCES[activity.id] ?? 'Compendium of Physical Activities.'}
            </Text>
          </View>
        ) : null}
      </Card>

      {/* Duration */}
      <View style={{ gap: spacing.sm }}>
        <Text variant="title">Duration</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <IconButton accessibilityLabel="5 minutes less" testID="duration-minus" size={48} tone="alt" onPress={() => setDuration(Math.max(1, minutes - 5))} disabled={minutes <= 1}>
            <Minus size={20} color={colors.text} />
          </IconButton>
          <NumberField
            testID="duration-input"
            accessibilityLabel="Duration in minutes"
            value={duration}
            onChange={setDuration}
            decimals={0}
            suffix="min"
            style={{ flex: 1 }}
            error={duration !== null && duration > 24 * 60 ? 'That is longer than a day' : null}
          />
          <IconButton accessibilityLabel="5 minutes more" testID="duration-plus" size={48} tone="alt" onPress={() => setDuration(minutes + 5)}>
            <Plus size={20} color={colors.text} />
          </IconButton>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          {PRESETS.map((p) => (
            <Chip key={p} label={p === 60 ? '1 h' : `${p} min`} selected={minutes === p} onPress={() => setDuration(p)} testID={`duration-${p}`} />
          ))}
        </View>
      </View>

      {/* Intensity */}
      <View style={{ gap: spacing.sm }}>
        <Text variant="title">Effort</Text>
        {singleMet ? (
          <Card tone="alt" padding={spacing.md} testID="intensity-single">
            <Text variant="body" color="textSecondary">
              {activity.name} has a single reference value in the Compendium ({activity.met.moderate} MET), so effort does not change this estimate.
            </Text>
          </Card>
        ) : (
          <>
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              {INTENSITIES.map((i) => {
                const active = intensity === i;
                return (
                  <PressableScale
                    key={i}
                    testID={`intensity-${i}`}
                    feedback="select"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={`${INTENSITY_LABELS[i].title} effort`}
                    onPress={() => setIntensity(i)}
                    style={{
                      flex: 1,
                      minHeight: 104,
                      padding: spacing.md,
                      gap: spacing.xs,
                      borderRadius: radius.md,
                      backgroundColor: active ? `${colors.exercise}22` : colors.surface,
                      borderWidth: 1.5,
                      borderColor: active ? colors.exercise : colors.border,
                    }}>
                    <Text variant="bodyStrong">{INTENSITY_LABELS[i].title}</Text>
                    <Text variant="caption" color="textSecondary" numberOfLines={3} style={{ flex: 1 }}>
                      {activity.intensityHint?.[i] ?? INTENSITY_LABELS[i].hint}
                    </Text>
                    <Text variant="caption" color={active ? colors.exercise : 'textTertiary'} tabular>
                      {activity.met[i]} MET
                    </Text>
                  </PressableScale>
                );
              })}
            </View>
            <Text variant="caption" color="textTertiary">
              Talk test for {INTENSITY_LABELS[intensity].title.toLowerCase()}: {INTENSITY_LABELS[intensity].hint.toLowerCase()}.
            </Text>
          </>
        )}
      </View>

      {/* Distance */}
      {activity.tracksDistance ? (
        <View style={{ gap: spacing.xs }}>
          <NumberField
            testID="distance-input"
            label="Distance (optional)"
            placeholder="0"
            value={distance}
            onChange={setDistance}
            decimals={2}
            suffix={unit}
          />
          {paceText ? (
            <Text variant="caption" color="textSecondary" testID="distance-pace">
              {paceText}
            </Text>
          ) : null}
        </View>
      ) : null}

      {/* Date */}
      <View style={{ gap: spacing.sm }}>
        <Text variant="title">Day</Text>
        <DateStepper date={date} onChange={setDate} testID="log-date" />
      </View>

      <TextField testID="log-notes" label="Notes (optional)" placeholder="How did it feel?" value={notes} onChangeText={setNotes} multiline style={{ marginBottom: spacing.sm }} />
    </Screen>
  );
}
