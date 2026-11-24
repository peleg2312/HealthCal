import { router, useLocalSearchParams } from 'expo-router';
import React, { useRef, useState } from 'react';
import { View, type ScrollView, type ScrollViewProps, type TextInputProps } from 'react-native';

import { Group, Hint, OptionRow } from '@/features/settings/components';
import { planGoalLine } from '@/features/progress/goalDate';
import { spreadChangeNote, spreadRuleNote } from '@/features/settings/spreadWords';
import { BIRTH_AUTOCOMPLETE, BIRTH_INCOMPLETE, birthDateWords, birthIso, birthParts, type BirthParts } from '@/features/settings/birthDate';
import { TARGET_CARE_NOTE } from '@/features/settings/careNote';
import { birthDateError, customSplitError, heightError, rateForGoal, targetWeightError } from '@/features/settings/goalsValidation';
import { markSpreadHintDone } from '@/features/activity/spreadHint';
import { ageFromBirthDate, today } from '@/lib/dates';
import { effectiveFrom, exerciseRuleOf, ruleFieldsOnSave } from '@/lib/exerciseBudget';
import { ACTIVITY_LABELS, macroTargets, maxWeeklyRateKg } from '@/lib/energy';
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
import type { ActivityLevel, ExerciseSpread, GoalType, MacroSplit, Profile, Sex } from '@/types';
import { Button, Card, Chip, ChipWrap, CupKey, goBack, Header, MacroBar, NumberField, Screen, Segmented, Stepper, Text, ToggleRow, toast } from '@/ui';

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

const SPREAD_OPTIONS: { value: ExerciseSpread; label: string }[] = [
  { value: 'week', label: 'Over 7 days' },
  { value: 'day', label: 'Same day' },
];

const GOALS: { value: GoalType; label: string }[] = [
  { value: 'lose', label: 'Lose' },
  { value: 'maintain', label: 'Maintain' },
  { value: 'gain', label: 'Gain' },
];

export default function GoalsScreen() {
  const profile = useStore((s) => s.profile);
  if (!profile?.onboardedAt) {
    return (
      <Screen header={<Header title="Goals and targets" subtitle="Calories, macros and water" />}>
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
  // `?section=exercise` (the "over 7 days" hint) opens the page at "How the budget works", the last block.
  const { section } = useLocalSearchParams<{ section?: string }>();
  const scrollRef = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const scrolledToSection = useRef(false);

  // A plan saved as lose or gain with no pace (an older maintain plan switched over) gets the default pace, so Save fixes it.
  const [draft, setDraft] = useState<Profile>(() =>
    saved.goal !== 'maintain' && !(saved.weeklyRateKg > 0) ? { ...saved, weeklyRateKg: rateForGoal(saved.goal, 0, saved.weightKg) } : saved,
  );
  const patch = (p: Partial<Profile>) => setDraft((d) => ({ ...d, ...p }));

  // Text-backed inputs that need validation before they reach the draft.
  const [birth, setBirth] = useState<BirthParts>(() => birthParts(saved.birthDate));
  const [macroMode, setMacroMode] = useState<MacroMode>(modeOf(saved.macroSplitOverride));
  const initialCustom = saved.macroSplitOverride ?? PRESETS.balanced.split;
  const [custom, setCustom] = useState({
    protein: pct(initialCustom.protein),
    carbs: pct(initialCustom.carbs),
    fat: pct(initialCustom.fat),
  });
  const [manualCalories, setManualCalories] = useState(!!saved.calorieTargetOverride);
  const [manualWater, setManualWater] = useState(!!saved.waterGoalMlOverride);

  const birthText = birthIso(birth);
  const todayNoon = new Date(`${todayDate}T12:00:00`);
  const birthError = birthText === null ? BIRTH_INCOMPLETE : birthDateError(birthText, todayNoon);
  const birthValid = birthError === null && birthText !== null;
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
    // Closed periods are only ever the saved profile's: a draft opened before a pull may hold an older list.
    exerciseRuleHistory: saved.exerciseRuleHistory,
    // With adding off the spread control is hidden, so a choice made there before turning it off is not kept.
    exerciseSpread: draft.eatBackExercise ? draft.exerciseSpread : saved.exerciseSpread,
    birthDate: birthValid && birthText ? birthText : saved.birthDate,
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
  // The plan's date, as the plan reveal says it (a range at the plan's pace); Weight and Progress give the trend's month.
  const planLine =
    draft.goal === 'maintain'
      ? null
      : planGoalLine(
          effective.weightKg,
          effective.targetWeightKg,
          model.target.impliedWeeklyKg,
          u,
          todayNoon,
          model.target.limitedByFloor || model.target.source === 'override',
        );
  const maxRate = maxWeeklyRateKg(draft.goal, draft.weightKg);
  const floor = model.target.floor;

  const valid = birthValid && macroValid && heightValid && bodyFatValid && caloriesValid && waterValid && targetValid;
  const dirty = JSON.stringify(effective) !== JSON.stringify(saved);

  // How workout calories reach the budget: the saved rule and the one on screen.
  const savedRule = exerciseRuleOf(saved);
  const draftRule = exerciseRuleOf(effective);
  const workoutToday = activities.some((a) => a.date === todayDate);
  // A change between "Over 7 days" and "Same day" starts today, or tomorrow when a workout is dated today; turning adding off or on applies at once and needs no words.
  const spreadNote = spreadChangeNote(savedRule, draftRule, effectiveFrom(savedRule, draftRule, todayDate, workoutToday) !== todayDate);

  const save = () => {
    if (!valid) return;
    const { updatedAt: _ignored, ...rest } = effective;
    void _ignored;
    let next: Partial<Profile> = {
      ...rest,
      weeklyRateKg: Math.min(rest.weeklyRateKg, maxRate || rest.weeklyRateKg),
    };
    // An event handler, so the clock is read here. The rule fields come from the saved profile, never the
    // draft (ruleFieldsOnSave): an unchanged rule keeps the saved history as it is now.
    const day = today();
    next = { ...next, ...ruleFieldsOnSave(saved, exerciseRuleOf(effective), day, activities.some((a) => a.date === day)) };
    setProfile(next);
    // The choice was on screen, so the hint that points here has done its job on this device.
    if (effective.eatBackExercise) markSpreadHintDone();
    toast('Plan saved');
    goBack('/profile');
  };

  // One decimal for a weight (0.1 kg or 0.1 lb a step), so the pace never shows a false second decimal.
  const rateStep = u === 'imperial' ? weightToKg(0.1, 'imperial') : 0.1;
  const { ft, inch } = cmToFtIn(draft.heightCm);

  return (
    <Screen
      scrollProps={{ ref: scrollRef } as ScrollViewProps}
      header={<Header title="Goals and targets" subtitle="Calories, macros and water" />}
      footer={<Button testID="goals-save" title={dirty ? 'Save plan' : 'No changes'} disabled={!valid || !dirty} onPress={save} />}>
      {/* Live preview */}
      <Card testID="goals-preview">
        {/* The daily number before workouts is the target everywhere; a day's budget is it plus that day's workouts. */}
        <Text variant="overline">Your daily target</Text>
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
        {/* The explanation, said once: how the number relates to what you burn. 8 px under the big number. */}
        <Text variant="caption" color="textSecondary" style={{ marginTop: spacing.sm }} testID="goals-preview-why">
          {model.target.source === 'override'
            ? `Set by you. You burn about ${formatNumber(Math.round(model.tdee))} kcal a day.`
            : Math.abs(model.target.dailyDelta) <= 5
              ? `Matched to what you burn a day, about ${formatNumber(Math.round(model.tdee))} kcal.`
              : `${formatNumber(Math.round(Math.abs(model.target.dailyDelta)))} kcal ${model.target.dailyDelta < 0 ? 'below' : 'above'} what you burn a day, about ${formatNumber(Math.round(model.tdee))} kcal.`}
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
            {draftRule === 'week'
              ? 'On a day without recent workouts. Each workout adds a seventh of its calories to the budget of its own day and the next six.'
              : effective.eatBackExercise
                ? 'On a day without workouts. A logged workout adds its calories to that day’s budget.'
                : 'On a day without workouts. A workout raises that day’s water.'}
          </Text>
        </View>
        {draft.goal !== 'maintain' ? (
          <Text variant="label" color="text" style={{ marginTop: spacing.md }}>
            {!targetValid
              ? 'Enter a goal weight to see when this plan reaches it.'
              : (planLine ??
                (effective.targetWeightKg ? 'At this calorie target the weight would not move toward your goal.' : 'Add a goal weight to see when this plan reaches it.'))}
          </Text>
        ) : null}
        {/* Where the target is set, said plainly: an estimate, not medical advice, and who checks with a doctor first. */}
        <Text variant="caption" color="textSecondary" style={{ marginTop: spacing.md }} testID="goals-care-note">
          {TARGET_CARE_NOTE}
        </Text>
      </Card>

      <Group title="Goal">
        <View style={{ paddingVertical: spacing.md, gap: spacing.md }}>
          <Segmented<GoalType>
            testID="goals-goal"
            role="radiogroup"
            accessibilityLabel="Goal"
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
                label="Goal weight"
                suffix={weightUnit(u)}
                value={draft.targetWeightKg ? Math.round(weightValue(draft.targetWeightKg, u) * 10) / 10 : null}
                onChange={(v) => patch({ targetWeightKg: v ? weightToKg(v, u) : undefined })}
                error={targetMessage}
                hint={`Now ${formatWeight(draft.weightKg, u)}`}
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
                    format={(n) => formatWeight(n, u, 1)}
                    onChange={(weeklyRateKg) => patch({ weeklyRateKg })}
                  />
                </View>
                <Hint>
                  Safe maximum {formatWeight(maxRate, u, 1)} a week ({draft.goal === 'lose' ? '1%' : '0.5%'} of body weight)
                </Hint>
              </View>
            </>
          ) : (
            <Hint>Your target matches what you burn, so weight stays steady.</Hint>
          )}
        </View>
      </Group>

      <Group title="Everyday activity" footer="Outside workouts, which are added on top." radiogroup>
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

      <Group title="Body details" footer="Used to estimate your resting metabolism.">
        <View style={{ paddingVertical: spacing.md, gap: spacing.md }}>
          <Segmented<Sex>
            testID="goals-sex"
            role="radiogroup"
            accessibilityLabel="Sex for the estimate"
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
          {/* Day, month and year as onboarding asks them (month first in imperial), said back as "May 12, 1994". */}
          <View style={{ gap: spacing.xs }} testID="goals-birth-date">
            <Text variant="label" color="textSecondary">
              Birth date
            </Text>
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              {(u === 'imperial' ? (['month', 'day', 'year'] as const) : (['day', 'month', 'year'] as const)).map((part) => (
                <NumberField
                  key={part}
                  testID={`goals-birth-${part}`}
                  accessibilityLabel={`Birth ${part}`}
                  autoComplete={BIRTH_AUTOCOMPLETE[part] as TextInputProps['autoComplete']}
                  placeholder={part === 'day' ? 'DD' : part === 'month' ? 'MM' : 'YYYY'}
                  decimals={0}
                  maxLength={part === 'year' ? 4 : 2}
                  style={{ flex: part === 'year' ? 1.45 : 1 }}
                  value={birth[part]}
                  onChange={(v) => setBirth((b) => ({ ...b, [part]: v }))}
                />
              ))}
            </View>
            {birthValid && birthText ? (
              <Text variant="caption" color="textSecondary" testID="goals-birth-summary">
                {`${birthDateWords(birthText)} · ${ageFromBirthDate(birthText, todayNoon)} years old`}
              </Text>
            ) : (
              <Text variant="caption" color="danger" testID="goals-birth-error">
                {birthError}
              </Text>
            )}
          </View>
          <NumberField
            testID="goals-body-fat"
            label="Body fat (optional)"
            suffix="%"
            value={draft.bodyFatPct ?? null}
            onChange={(v) => patch({ bodyFatPct: v ?? undefined })}
            error={bodyFatValid ? null : 'Enter a value between 3 and 60 %, or leave it empty.'}
            hint="A rough figure is fine"
          />
        </View>
      </Group>

      <Group title="Calorie target">
        <View style={{ paddingVertical: spacing.md, gap: spacing.md }}>
          <Segmented
            testID="goals-calories-mode"
            role="radiogroup"
            accessibilityLabel="Calorie target"
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
              : 'Follows your weight as it changes.'}
          </Hint>
        </View>
      </Group>

      <Group title="Macros">
        <View style={{ paddingVertical: spacing.md, gap: spacing.md }}>
          {/* The kit's chip rows: 12 px between rows, so each chip keeps a 44 px tap area the row below does not take. */}
          <ChipWrap>
            <Chip testID="goals-macro-auto" label="Automatic" accessibilityLabel="Automatic macros" selected={macroMode === 'auto'} onPress={() => setMacroMode('auto')} />
            {(Object.keys(PRESETS) as (keyof typeof PRESETS)[]).map((k) => (
              <Chip key={k} testID={`goals-macro-${k}`} label={PRESETS[k].label} selected={macroMode === k} onPress={() => setMacroMode(k)} />
            ))}
            <Chip testID="goals-macro-custom" label="Custom" selected={macroMode === 'custom'} onPress={() => setMacroMode('custom')} />
          </ChipWrap>
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
              ? 'Protein from your weight and goal, fat about 28%, the rest carbs.'
              : macroMode === 'custom'
                ? 'Your own split of daily calories.'
                : `${pct(PRESETS[macroMode].split.protein)}% protein, ${pct(PRESETS[macroMode].split.carbs)}% carbs, ${pct(PRESETS[macroMode].split.fat)}% fat.`}
          </Hint>
        </View>
      </Group>

      <Group title="Water">
        <View style={{ paddingVertical: spacing.md, gap: spacing.md }}>
          <Segmented
            testID="goals-water-mode"
            role="radiogroup"
            accessibilityLabel="Water goal"
            value={manualWater ? 'manual' : 'auto'}
            onChange={(v) => {
              setManualWater(v === 'manual');
              if (v === 'manual' && !draft.waterGoalMlOverride)
                patch({
                  waterGoalMlOverride: baseWaterGoalMl(draft.weightKg, draft.sex),
                });
            }}
            // Named apart from the calorie target's "Automatic" and "Set my own", so no two choices on the page share a name.
            options={[
              { value: 'auto', label: 'By weight' },
              { value: 'manual', label: 'Fixed' },
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
              : `From your body weight. More on days you log exercise.`}
          </Hint>
        </View>
        {/* Absent means on. Off stops new pairs; drinks already counted stay (each can be deleted on Water). */}
        <ToggleRow
          testID="goals-diary-drinks"
          title="Count drinks from the diary"
          subtitle="A drink logged as food also adds its volume to Water."
          value={draft.diaryDrinksInWater !== false}
          // Choosing what is saved puts back exactly what is saved (an older profile has no value: on).
          onChange={(v) => patch({ diaryDrinksInWater: v === (saved.diaryDrinksInWater !== false) ? saved.diaryDrinksInWater : v })}
        />
      </Group>

      <View
        testID="goals-budget-section"
        onLayout={(e) => {
          // Once, on the first layout: later layouts (the block growing as the choice opens) never move the page.
          if (section !== 'exercise' || scrolledToSection.current) return;
          scrolledToSection.current = true;
          const y = e.nativeEvent.layout.y;
          scrollRef.current?.scrollTo({ y: Math.max(0, y - spacing.sm), animated: false });
        }}>
        <Group
          title="How the budget works"
          footer={
            model.adaptive.observed === null
              ? `Learning starts after ${model.adaptive.needs ?? 'a little more data'}.`
              : undefined
          }>
          <ToggleRow
            testID="goals-eat-back"
            title="Add exercise to my budget"
            subtitle="Workouts add only their calories above resting."
            value={draft.eatBackExercise}
            onChange={(eatBackExercise) => patch({ eatBackExercise })}
          />
          {draft.eatBackExercise ? (
            <View style={{ paddingVertical: spacing.md, gap: spacing.md }} testID="goals-exercise-block">
              <Text variant="label" color="textSecondary">
                Workout calories
              </Text>
              <Segmented<ExerciseSpread>
                testID="goals-exercise-spread"
                role="radiogroup"
                accessibilityLabel="Workout calories"
                value={draft.exerciseSpread ?? 'day'}
                // Choosing what is saved puts back exactly what is saved (an older profile has no value: "Same day").
                onChange={(v) => patch({ exerciseSpread: v === (saved.exerciseSpread ?? 'day') ? saved.exerciseSpread : v })}
                options={SPREAD_OPTIONS}
              />
              <Hint testID="goals-exercise-note">
                {spreadNote ? `${spreadRuleNote(draftRule)} ${spreadNote}` : spreadRuleNote(draftRule)}
              </Hint>
            </View>
          ) : null}
          <ToggleRow
            testID="goals-adaptive"
            title="Learn from my data"
            subtitle={
              model.adaptive.observed !== null
                ? `Your logs and weigh-ins suggest you burn about ${formatNumber(model.adaptive.observed)} kcal a day. ${draft.useAdaptiveTdee ? 'Your target blends this with the formula.' : 'On, your target blends this with the formula.'}`
                : 'Compares what you log with your weight trend.'
            }
            value={draft.useAdaptiveTdee}
            onChange={(useAdaptiveTdee) => patch({ useAdaptiveTdee })}
          />
        </Group>
      </View>
    </Screen>
  );
}

/**
 * A cup key and label over the number; data colours mark, numbers stay in the text colour. The
 * number is the leading figure and the unit is everything after it, so a two-word unit ("88 fl oz")
 * is set whole in the unit style.
 */
function PreviewStat({ label, value, color }: { label: string; value: string; color: string }) {
  const lead = /^[\d.,\u2212-]+(?= )/.exec(value)?.[0];
  const i = lead ? lead.length : -1;
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
