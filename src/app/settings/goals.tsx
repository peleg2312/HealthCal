import { router } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';

import { Group, Hint, OptionRow } from '@/features/settings/components';
import { formatMonthDayYear } from '@/features/settings/format';
import { birthDateError, customSplitError, heightError, rateForGoal, targetWeightError } from '@/features/settings/goalsValidation';
import { ageFromBirthDate } from '@/lib/dates';
import { ACTIVITY_LABELS, macroTargets, maxWeeklyRateKg, projectedGoalDate } from '@/lib/energy';
import { baseWaterGoalMl } from '@/lib/hydration';
import {
  cmToFtIn,
  formatNumber,
  formatVolume,
  formatWeight,
  ftInToCm,
  volumeToMl,
  volumeUnit,
  volumeValue,
  weightToKg,
  weightUnit,
  weightValue,
} from '@/lib/units';
import { useStore } from '@/store';
import { useToday } from '@/store/clock';
import { computeEnergyModel, useLive, useProfile } from '@/store/selectors';
import { useTheme } from '@/theme';
import type { ActivityLevel, GoalType, MacroSplit, Profile, Sex } from '@/types';
import { Button, Card, Chip, CupKey, goBack, Header, MacroBar, NumberField, Screen, Segmented, Stepper, Text, TextField, ToggleRow, toast } from '@/ui';

type MacroMode = 'auto' | 'balanced' | 'protein' | 'lowcarb' | 'custom';

const PRESETS: Record<Exclude<MacroMode, 'auto' | 'custom'>, { label: string; split: MacroSplit }> = {
  balanced: {
    label: 'Balanced',
    split: { protein: 0.3, carbs: 0.4, fat: 0.3 },
  },
  protein: {
    label: 'Higher protein',
    split: { protein: 0.4, carbs: 0.3, fat: 0.3 },
  },
  lowcarb: {
    label: 'Lower carb',
    split: { protein: 0.35, carbs: 0.25, fat: 0.4 },
  },
};

function modeOf(split: MacroSplit | undefined): MacroMode {
  if (!split) return 'auto';
  for (const [k, p] of Object.entries(PRESETS)) {
    if (
      Math.abs(p.split.protein - split.protein) < 0.005 &&
      Math.abs(p.split.carbs - split.carbs) < 0.005 &&
      Math.abs(p.split.fat - split.fat) < 0.005
    ) {
      return k as MacroMode;
    }
  }
  return 'custom';
}

const pct = (x: number) => Math.round(x * 100);

const GOALS: { value: GoalType; label: string }[] = [
  { value: 'lose', label: 'Lose' },
  { value: 'maintain', label: 'Maintain' },
  { value: 'gain', label: 'Gain' },
];

export default function GoalsScreen() {
  const profile = useStore((s) => s.profile);
  if (!profile?.onboardedAt) {
    return (
      <Screen header={<Header title="Goals and targets" subtitle="Budget, macros and water" />}>
        <Text color="textSecondary">Finish setting up your profile first.</Text>
        <Button title="Get started" onPress={() => router.replace('/welcome')} />
      </Screen>
    );
  }
  return <GoalsForm />;
}

function GoalsForm() {
  const { colors, spacing } = useTheme();
  const saved = useProfile();
  const setProfile = useStore((s) => s.setProfile);
  const food = useLive('foodEntries');
  const weights = useLive('weights');
  const activities = useLive('activities');
  const todayDate = useToday();
  const u = saved.units;

  // A plan saved as lose or gain with no pace (an older maintain plan switched over) gets the default pace, so Save fixes it.
  const [draft, setDraft] = useState<Profile>(() =>
    saved.goal !== 'maintain' && !(saved.weeklyRateKg > 0) ? { ...saved, weeklyRateKg: rateForGoal(saved.goal, 0, saved.weightKg) } : saved,
  );
  const patch = (p: Partial<Profile>) => setDraft((d) => ({ ...d, ...p }));

  // Text-backed inputs that need validation before they reach the draft.
  const [birthText, setBirthText] = useState(saved.birthDate);
  const [macroMode, setMacroMode] = useState<MacroMode>(modeOf(saved.macroSplitOverride));
  const initialCustom = saved.macroSplitOverride ?? PRESETS.balanced.split;
  const [custom, setCustom] = useState({
    protein: pct(initialCustom.protein),
    carbs: pct(initialCustom.carbs),
    fat: pct(initialCustom.fat),
  });
  const [manualCalories, setManualCalories] = useState(!!saved.calorieTargetOverride);
  const [manualWater, setManualWater] = useState(!!saved.waterGoalMlOverride);

  const birthError = birthDateError(birthText);
  const birthValid = birthError === null;
  const splitError = customSplitError(custom);
  const macroValid = macroMode !== 'custom' || splitError === null;
  const heightMessage = heightError(draft.heightCm, u);
  const heightValid = heightMessage === null;
  const bodyFatValid = draft.bodyFatPct === undefined || (draft.bodyFatPct >= 3 && draft.bodyFatPct <= 60);
  const caloriesValid =
    !manualCalories || (!!draft.calorieTargetOverride && draft.calorieTargetOverride >= 800 && draft.calorieTargetOverride <= 6000);
  const waterValid = !manualWater || (!!draft.waterGoalMlOverride && draft.waterGoalMlOverride >= 500 && draft.waterGoalMlOverride <= 8000);
  const targetMessage = targetWeightError(draft.goal, draft.weightKg, draft.targetWeightKg, u);
  const targetValid = targetMessage === null;

  // The profile the preview and Save use.
  const effective: Profile = {
    ...draft,
    birthDate: birthValid ? birthText : saved.birthDate,
    calorieTargetOverride: manualCalories ? draft.calorieTargetOverride : undefined,
    waterGoalMlOverride: manualWater ? draft.waterGoalMlOverride : undefined,
    macroSplitOverride:
      macroMode === 'auto'
        ? undefined
        : macroMode === 'custom'
          ? {
              protein: custom.protein / 100,
              carbs: custom.carbs / 100,
              fat: custom.fat / 100,
            }
          : PRESETS[macroMode].split,
  };

  const model = computeEnergyModel(effective, food, weights, todayDate, activities);
  const macros = macroTargets(effective, model.target.target);
  const water = effective.waterGoalMlOverride ?? baseWaterGoalMl(effective.weightKg, effective.sex);
  const projected = draft.goal === 'maintain' ? null : projectedGoalDate(effective.weightKg, effective.targetWeightKg, model.target.impliedWeeklyKg);
  const maxRate = maxWeeklyRateKg(draft.goal, draft.weightKg);
  const floor = model.target.floor;

  const valid = birthValid && macroValid && heightValid && bodyFatValid && caloriesValid && waterValid && targetValid;
  const dirty = JSON.stringify(effective) !== JSON.stringify(saved);

  const save = () => {
    if (!valid) return;
    const { updatedAt: _ignored, ...rest } = effective;
    void _ignored;
    setProfile({
      ...rest,
      weeklyRateKg: Math.min(rest.weeklyRateKg, maxRate || rest.weeklyRateKg),
    });
    toast('Plan saved');
    goBack('/profile');
  };

  const rateStep = u === 'imperial' ? weightToKg(0.1, 'imperial') : 0.05;
  const { ft, inch } = cmToFtIn(draft.heightCm);

  return (
    <Screen
      header={<Header title="Goals and targets" subtitle="Budget, macros and water" />}
      footer={<Button testID="goals-save" title={dirty ? 'Save plan' : 'No changes'} disabled={!valid || !dirty} onPress={save} />}>
      {/* Live preview */}
      <Card testID="goals-preview">
        <Text variant="overline">Your plan</Text>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'baseline',
            gap: 6,
            marginTop: spacing.sm,
          }}>
          <Text variant="numXL" color="caloriesInk" testID="goals-preview-kcal">
            {formatNumber(model.target.target)}
          </Text>
          <Text variant="unit">kcal a day</Text>
        </View>
        <Text variant="caption" color="textSecondary">
          {model.target.source === 'override'
            ? `Set by you. Estimated expenditure is ${formatNumber(Math.round(model.tdee))} kcal.`
            : `Expenditure ${formatNumber(Math.round(model.tdee))} kcal${model.usingAdaptive ? ' (the formula blended with your logs and weigh-ins)' : ''}, ${
                model.target.dailyDelta < -5
                  ? `${formatNumber(Math.round(-model.target.dailyDelta))} kcal below`
                  : model.target.dailyDelta > 5
                    ? `${formatNumber(Math.round(model.target.dailyDelta))} kcal above`
                    : 'matched'
              }.`}
        </Text>
        {model.target.belowFloor && draft.goal === 'lose' && model.target.source !== 'override' ? (
          <Text variant="caption" color="warningInk" style={{ marginTop: 4 }}>
            Your estimated expenditure is already at the recommended minimum, so the plan holds at maintenance.
          </Text>
        ) : model.target.limitedByFloor ? (
          <Text variant="caption" color="warningInk" style={{ marginTop: 4 }}>
            Held at the {formatNumber(floor)} kcal minimum, so the pace will be slower than chosen.
          </Text>
        ) : null}
        <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
          <MacroBar protein={macros.proteinG * 4} carbs={macros.carbsG * 4} fat={macros.fatG * 9} />
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <PreviewStat label="Protein" value={`${macros.proteinG} g`} color={colors.protein} />
            <PreviewStat label="Carbs" value={`${macros.carbsG} g`} color={colors.carbs} />
            <PreviewStat label="Fat" value={`${macros.fatG} g`} color={colors.fat} />
            <PreviewStat label="Water" value={formatVolume(water, u)} color={colors.water} />
          </View>
          <Text variant="caption" color="textSecondary" testID="goals-preview-note">
            {effective.eatBackExercise
              ? 'For a day without workouts. A logged workout adds its calories to that day, which raises the carbs, fat and water for it.'
              : 'For a day without workouts. A logged workout raises that day’s water goal.'}
          </Text>
        </View>
        {draft.goal !== 'maintain' ? (
          <Text variant="label" color="text" style={{ marginTop: spacing.md }}>
            {projected
              ? `Reaching ${formatWeight(effective.targetWeightKg ?? 0, u)} around ${formatMonthDayYear(projected)}, at ${formatWeight(Math.abs(model.target.impliedWeeklyKg), u, 2)} a week.`
              : effective.targetWeightKg
                ? 'At this target the weight would not move toward your goal.'
                : 'Add a target weight to see a projected date.'}
          </Text>
        ) : null}
      </Card>

      <Group title="Goal">
        <View style={{ paddingVertical: spacing.md, gap: spacing.md }}>
          <Segmented<GoalType>
            value={draft.goal}
            onChange={(goal) =>
              patch({
                goal,
                weeklyRateKg: rateForGoal(goal, draft.weeklyRateKg, draft.weightKg),
              })
            }
            options={GOALS}
          />
          {draft.goal !== 'maintain' ? (
            <>
              <NumberField
                testID="goals-target-weight"
                label="Target weight"
                suffix={weightUnit(u)}
                value={draft.targetWeightKg ? Math.round(weightValue(draft.targetWeightKg, u) * 10) / 10 : null}
                onChange={(v) => patch({ targetWeightKg: v ? weightToKg(v, u) : undefined })}
                error={targetMessage}
                hint={`Now ${formatWeight(draft.weightKg, u)}. Log new weigh-ins on the weight screen.`}
              />
              <View style={{ gap: spacing.sm }}>
                <Text variant="label" color="textSecondary">
                  Weekly pace
                </Text>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}>
                  <Stepper
                    label="weekly pace"
                    value={draft.weeklyRateKg}
                    step={rateStep}
                    min={rateStep}
                    max={maxRate}
                    format={(n) => formatWeight(n, u, 2)}
                    onChange={(weeklyRateKg) => patch({ weeklyRateKg })}
                  />
                </View>
                <Hint>
                  Safe maximum {formatWeight(maxRate, u, 2)} a week ({draft.goal === 'lose' ? '1%' : '0.5%'} of body weight). Slower is easier to keep
                  {draft.goal === 'lose' ? ' and protects muscle' : ' and limits fat gain'}.
                </Hint>
              </View>
            </>
          ) : (
            <Hint>Your budget matches your estimated expenditure, so weight stays steady.</Hint>
          )}
        </View>
      </Group>

      <Group title="Everyday activity" footer="Movement outside logged workouts. Workouts are added on top, so do not count them here.">
        {(Object.keys(ACTIVITY_LABELS) as ActivityLevel[]).map((level) => (
          <OptionRow
            key={level}
            testID={`goals-activity-${level}`}
            title={ACTIVITY_LABELS[level].title}
            subtitle={ACTIVITY_LABELS[level].hint}
            selected={draft.activityLevel === level}
            onPress={() => patch({ activityLevel: level })}
          />
        ))}
      </Group>

      <Group title="Body details" footer="These feed the resting metabolism equation. Body fat is optional; when known, lean mass is used.">
        <View style={{ paddingVertical: spacing.md, gap: spacing.md }}>
          <Segmented<Sex>
            value={draft.sex}
            onChange={(sex) => patch({ sex })}
            options={[
              { value: 'female', label: 'Female' },
              { value: 'male', label: 'Male' },
            ]}
          />
          {u === 'imperial' ? (
            <View style={{ gap: spacing.xs }}>
              <View style={{ flexDirection: 'row', gap: spacing.md }}>
                <NumberField
                  testID="goals-height-ft"
                  label="Height"
                  suffix="ft"
                  decimals={0}
                  style={{ flex: 1 }}
                  value={ft}
                  onChange={(v) => v !== null && patch({ heightCm: ftInToCm(Math.round(v), inch) })}
                />
                <NumberField
                  testID="goals-height-in"
                  label=" "
                  suffix="in"
                  decimals={0}
                  style={{ flex: 1 }}
                  value={inch}
                  onChange={(v) =>
                    v !== null &&
                    patch({
                      heightCm: ftInToCm(ft, Math.min(11, Math.max(0, Math.round(v)))),
                    })
                  }
                />
              </View>
              {/* One message under both fields, so it is not squeezed into the narrow ft column. */}
              {heightMessage ? (
                <Text variant="caption" color="danger" testID="goals-height-error">
                  {heightMessage}
                </Text>
              ) : null}
            </View>
          ) : (
            <NumberField
              testID="goals-height"
              label="Height"
              suffix="cm"
              decimals={0}
              value={Math.round(draft.heightCm)}
              onChange={(v) => v !== null && patch({ heightCm: v })}
              error={heightMessage}
            />
          )}
          <TextField
            testID="goals-birth-date"
            label="Birth date"
            placeholder="YYYY-MM-DD"
            value={birthText}
            onChangeText={setBirthText}
            autoCapitalize="none"
            inputMode="numeric"
            error={birthError}
            hint={birthValid ? `${ageFromBirthDate(birthText)} years old` : undefined}
          />
          <NumberField
            testID="goals-body-fat"
            label="Body fat (optional)"
            suffix="%"
            value={draft.bodyFatPct ?? null}
            onChange={(v) => patch({ bodyFatPct: v ?? undefined })}
            error={bodyFatValid ? null : 'Enter a value between 3 and 60 %, or leave it empty.'}
            hint="Smart scales and tape estimates vary by a few points. The result stays close to the standard equation either way."
          />
        </View>
      </Group>

      <Group title="Calorie target">
        <View style={{ paddingVertical: spacing.md, gap: spacing.md }}>
          <Segmented
            value={manualCalories ? 'manual' : 'auto'}
            onChange={(v) => {
              setManualCalories(v === 'manual');
              if (v === 'manual' && !draft.calorieTargetOverride) patch({ calorieTargetOverride: model.target.target });
            }}
            options={[
              { value: 'auto', label: 'Automatic' },
              { value: 'manual', label: 'Set my own' },
            ]}
          />
          {manualCalories ? (
            <NumberField
              testID="goals-calories"
              label="Daily calories"
              suffix="kcal"
              decimals={0}
              value={draft.calorieTargetOverride ?? null}
              onChange={(v) => patch({ calorieTargetOverride: v ?? undefined })}
              error={caloriesValid ? null : 'Enter a value between 800 and 6,000 kcal.'}
            />
          ) : null}
          {manualCalories && draft.calorieTargetOverride && draft.calorieTargetOverride < floor && caloriesValid ? (
            <Text variant="caption" color="warningInk">
              This is below {formatNumber(floor)} kcal, the lowest HealthCal recommends without medical supervision.
            </Text>
          ) : null}
          <Hint>
            {manualCalories
              ? 'Use this if a dietitian or coach gave you a number.'
              : 'Worked out from your body, activity and pace. Updates as your weight changes.'}
          </Hint>
        </View>
      </Group>

      <Group title="Macros">
        <View style={{ paddingVertical: spacing.md, gap: spacing.md }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            <Chip testID="goals-macro-auto" label="Automatic" selected={macroMode === 'auto'} onPress={() => setMacroMode('auto')} />
            {(Object.keys(PRESETS) as (keyof typeof PRESETS)[]).map((k) => (
              <Chip key={k} testID={`goals-macro-${k}`} label={PRESETS[k].label} selected={macroMode === k} onPress={() => setMacroMode(k)} />
            ))}
            <Chip testID="goals-macro-custom" label="Custom" selected={macroMode === 'custom'} onPress={() => setMacroMode('custom')} />
          </View>
          {macroMode === 'custom' ? (
            <>
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                <NumberField
                  testID="goals-pct-protein"
                  label="Protein"
                  suffix="%"
                  decimals={0}
                  style={{ flex: 1 }}
                  value={custom.protein}
                  onChange={(v) => setCustom((c) => ({ ...c, protein: v ?? 0 }))}
                />
                <NumberField
                  testID="goals-pct-carbs"
                  label="Carbs"
                  suffix="%"
                  decimals={0}
                  style={{ flex: 1 }}
                  value={custom.carbs}
                  onChange={(v) => setCustom((c) => ({ ...c, carbs: v ?? 0 }))}
                />
                <NumberField
                  testID="goals-pct-fat"
                  label="Fat"
                  suffix="%"
                  decimals={0}
                  style={{ flex: 1 }}
                  value={custom.fat}
                  onChange={(v) => setCustom((c) => ({ ...c, fat: v ?? 0 }))}
                />
              </View>
              <Text variant="caption" color={splitError ? 'warningInk' : 'textSecondary'} testID="goals-pct-total">
                {splitError ?? 'Total 100%'}
              </Text>
            </>
          ) : null}
          <Hint>
            {macroMode === 'auto'
              ? `Protein from your body weight and goal (${macros.proteinG} g), fat at about 28%, the rest from carbs.`
              : macroMode === 'custom'
                ? 'Your own split of daily calories.'
                : `${pct(PRESETS[macroMode].split.protein)}% protein, ${pct(PRESETS[macroMode].split.carbs)}% carbs, ${pct(PRESETS[macroMode].split.fat)}% fat.`}
          </Hint>
        </View>
      </Group>

      <Group title="Water">
        <View style={{ paddingVertical: spacing.md, gap: spacing.md }}>
          <Segmented
            value={manualWater ? 'manual' : 'auto'}
            onChange={(v) => {
              setManualWater(v === 'manual');
              if (v === 'manual' && !draft.waterGoalMlOverride)
                patch({
                  waterGoalMlOverride: baseWaterGoalMl(draft.weightKg, draft.sex),
                });
            }}
            options={[
              { value: 'auto', label: 'Automatic' },
              { value: 'manual', label: 'Set my own' },
            ]}
          />
          {manualWater ? (
            <NumberField
              testID="goals-water"
              label="Daily drinks"
              suffix={volumeUnit(u)}
              decimals={0}
              value={draft.waterGoalMlOverride ? Math.round(volumeValue(draft.waterGoalMlOverride, u)) : null}
              onChange={(v) =>
                patch({
                  waterGoalMlOverride: v ? Math.round(volumeToMl(v, u)) : undefined,
                })
              }
              error={waterValid ? null : `Enter between ${formatVolume(500, u)} and ${formatVolume(8000, u)}.`}
            />
          ) : null}
          <Hint>
            {manualWater
              ? 'A fixed goal; workouts no longer add to it.'
              : `From your body weight, ${formatVolume(baseWaterGoalMl(draft.weightKg, draft.sex), u)} on rest days, more on days you log exercise.`}
          </Hint>
        </View>
      </Group>

      <Group
        title="How the budget works"
        footer={
          model.adaptive.observed === null
            ? `Learn from my data compares what you log with a straight line through your weigh-ins of the last four weeks. It needs ${model.adaptive.needs ?? 'a little more data'}.`
            : undefined
        }>
        <ToggleRow
          testID="goals-eat-back"
          title="Add exercise to my budget"
          subtitle="Workouts add only the calories burned above resting."
          value={draft.eatBackExercise}
          onChange={(eatBackExercise) => patch({ eatBackExercise })}
        />
        <ToggleRow
          testID="goals-adaptive"
          title="Learn from my data"
          subtitle={
            model.adaptive.observed !== null
              ? `Your logs and weigh-ins suggest you use ${formatNumber(model.adaptive.observed)} kcal a day.`
              : 'Compares what you log with your weight trend.'
          }
          value={draft.useAdaptiveTdee}
          onChange={(useAdaptiveTdee) => patch({ useAdaptiveTdee })}
        />
      </Group>
    </Screen>
  );
}

/** A cup key and label over the number; data colours mark, numbers stay in the text colour. */
function PreviewStat({ label, value, color }: { label: string; value: string; color: string }) {
  const i = value.lastIndexOf(' ');
  return (
    <View style={{ flex: 1, minWidth: 0 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <CupKey color={color} />
        <Text variant="caption" color="textSecondary" numberOfLines={1} style={{ flexShrink: 1 }}>
          {label}
        </Text>
      </View>
      <Text variant="numM" numberOfLines={1} style={{ fontSize: 18, lineHeight: 23 }}>
        {i > 0 ? value.slice(0, i) : value}
        {i > 0 ? <Text variant="unit">{` ${value.slice(i + 1)}`}</Text> : null}
      </Text>
    </View>
  );
}
