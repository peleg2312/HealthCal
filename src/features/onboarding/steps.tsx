import { ArrowRight, BellRing, ChevronDown, ChevronUp, CircleHelp, Droplets, Ruler, Scale, Target, TriangleAlert, Utensils } from 'lucide-react-native';
import React, { useState } from 'react';
import { useWindowDimensions, View, type TextInputProps } from 'react-native';

import { BIRTH_AUTOCOMPLETE } from '@/features/settings/birthDate';
import { Group as SettingsGroup, IconTile, prefers12h, TimeRow } from '@/features/settings/components';
import { ageFromBirthDate, formatClock } from '@/lib/dates';
import { ACTIVITY_LABELS, calorieFloor, KCAL_PER_KG, maxWeeklyRateKg } from '@/lib/energy';
import { formatNumber, kgToLb, lbToKg, round, weightUnit } from '@/lib/units';
import { remindersSupported } from '@/services/notifications';
import { useNow, useToday } from '@/store/clock';
import { cup, useTheme } from '@/theme';
import type { ActivityLevel, GoalType } from '@/types';
import { Card, Divider, MiniCup, PressableScale, ProgressBar, Stepper, Text, ToggleRow } from '@/ui';

import { BigNumberField, BigTextField, ChoiceCard, ErrorText, GoalCup, Note, StepTitle, UnitsToggle, useFieldChain, WhyWeAsk } from './components';
import { birthDateOf, buildPlan, heightRangeText, rateKgOf, tapeEstimate, toMetric, weightRangeText, type BodyFatMode, type Draft, type Errors } from './model';
import { looseDate } from './projection';
import { nudgeExamples, WEIGH_IN_TIME, type NudgeKind, type Routine } from './routine';

export interface StepProps {
  draft: Draft;
  set: (patch: Partial<Draft>) => void;
  /** Errors to show (only after the person tried to continue). */
  errors: Errors;
  /** Advance, used by the keyboard's return key on the last field. */
  submit: () => void;
  /**
   * Move on after a short beat, so the chosen tile is seen to be chosen. Used by
   * single-choice answers; Back still works and typing screens keep Continue.
   */
  advance: () => void;
  /** Call off a wait started by `advance`: for a tile on the same question that needs something typed. */
  hold: () => void;
}

const Group = ({ children, gap }: { children: React.ReactNode; gap?: number }) => {
  const { spacing } = useTheme();
  return <View style={{ gap: gap ?? spacing.md }}>{children}</View>;
};

// ------------------------------------------------------------------ basics

export function BasicsStep({ draft, set, errors, submit }: StepProps) {
  const { spacing } = useTheme();
  return (
    <Group gap={spacing.xl}>
      <StepTitle title="What do we call you?" subtitle="About a minute. Change any answer later." />
      <BigTextField
        label="First name (optional)"
        testID="onb-name-input"
        placeholder="Your first name"
        value={draft.name}
        onChangeText={(name) => set({ name })}
        autoCapitalize="words"
        autoComplete="given-name"
        textContentType="givenName"
        returnKeyType="next"
        maxLength={40}
        onSubmitEditing={submit}
        error={errors.name}
      />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="label" color="textSecondary">
            Units
          </Text>
          <Text variant="caption" color="textSecondary">
            Set from your phone
          </Text>
        </View>
        <UnitsToggle draft={draft} set={set} />
      </View>
    </Group>
  );
}

// -------------------------------------------------------------------- goal

export function GoalStep({ draft, set, errors, advance }: StepProps) {
  const { spacing } = useTheme();
  const options: { value: GoalType; title: string; hint: string }[] = [
    { value: 'lose', title: 'Lose weight', hint: 'A steady calorie deficit, protein kept high' },
    { value: 'maintain', title: 'Maintain', hint: 'Eat to match what you burn' },
    { value: 'gain', title: 'Gain muscle', hint: 'A small surplus to support training' },
  ];
  const name = draft.name.trim();
  return (
    <Group gap={spacing.xl}>
      <StepTitle title={name ? `What's your goal, ${name}?` : "What's your goal?"} subtitle="It sets your calorie target and protein." />
      <Group gap={spacing.sm}>
        {options.map((o, i) => (
          <ChoiceCard
            key={o.value}
            testID={`onb-goal-${o.value}`}
            title={o.title}
            hint={o.hint}
            icon={<GoalCup goal={o.value} index={i} />}
            size="lg"
            selected={draft.goal === o.value}
            onPress={() => {
              set({ goal: o.value });
              advance();
            }}
          />
        ))}
        <ErrorText>{errors.goal}</ErrorText>
      </Group>
    </Group>
  );
}

// --------------------------------------------------------------------- sex

export function SexStep({ draft, set, errors, advance }: StepProps) {
  const { spacing } = useTheme();
  return (
    <Group gap={spacing.xl}>
      <StepTitle title="Which sex should the estimate use?" subtitle="The one closest to your body." />
      <Group gap={spacing.sm}>
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          {(['female', 'male'] as const).map((s) => (
            <View key={s} style={{ flex: 1 }}>
              <ChoiceCard
                compact
                testID={`onb-sex-${s}`}
                title={s === 'female' ? 'Female' : 'Male'}
                selected={draft.sex === s}
                onPress={() => {
                  set({ sex: s });
                  advance();
                }}
              />
            </View>
          ))}
        </View>
        <ErrorText>{errors.sex}</ErrorText>
      </Group>
      <WhyWeAsk testID="onb-sex-why">
        Resting metabolism differs between female and male bodies, so the standard equations (Mifflin-St Jeor, or Katch-McArdle when you know your body fat)
        have a female and a male form. The answer also sets your starting water goal and the lowest calorie target HealthCal suggests. You can change it later
        in Goals.
      </WhyWeAsk>
    </Group>
  );
}

// ------------------------------------------------------------------- about

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Date of birth: three big fields in the order the region writes dates. */
export function AboutStep({ draft, set, errors, submit }: StepProps) {
  const { spacing } = useTheme();
  const today = useToday();
  const iso = birthDateOf(draft);
  const age = iso && iso <= today ? ageFromBirthDate(iso, new Date(`${today}T12:00:00`)) : null;
  // The keyboard's Next key follows the order on screen.
  const monthFirst = draft.units === 'imperial';
  const field = useFieldChain(monthFirst ? [draft.dobMonth, draft.dobDay, draft.dobYear] : [draft.dobDay, draft.dobMonth, draft.dobYear], submit);
  const day = (
    <BigNumberField
      key="d"
      style={{ flex: 1 }}
      label="Day"
      placeholder="DD"
      testID="onb-dob-day"
      autoComplete={BIRTH_AUTOCOMPLETE.day as TextInputProps['autoComplete']}
      decimals={0}
      maxLength={2}
      value={draft.dobDay}
      onChange={(dobDay) => set({ dobDay })}
      error={!!errors.dob}
      {...field(monthFirst ? 1 : 0)}
    />
  );
  const month = (
    <BigNumberField
      key="m"
      style={{ flex: 1 }}
      label="Month"
      placeholder="MM"
      testID="onb-dob-month"
      autoComplete={BIRTH_AUTOCOMPLETE.month as TextInputProps['autoComplete']}
      decimals={0}
      maxLength={2}
      value={draft.dobMonth}
      onChange={(dobMonth) => set({ dobMonth })}
      error={!!errors.dob}
      {...field(monthFirst ? 0 : 1)}
    />
  );
  const year = (
    <BigNumberField
      key="y"
      style={{ flex: 1.45 }}
      label="Year"
      placeholder="YYYY"
      testID="onb-dob-year"
      autoComplete={BIRTH_AUTOCOMPLETE.year as TextInputProps['autoComplete']}
      decimals={0}
      maxLength={4}
      value={draft.dobYear}
      onChange={(dobYear) => set({ dobYear })}
      error={!!errors.dob}
      {...field(2)}
    />
  );
  return (
    <Group gap={spacing.xl}>
      <StepTitle title="When were you born?" subtitle="Age keeps the metabolism estimate current." />
      <Group gap={spacing.sm}>
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>{draft.units === 'imperial' ? [month, day, year] : [day, month, year]}</View>
        {errors.dob ? (
          <ErrorText testID="onb-dob-error">{errors.dob}</ErrorText>
        ) : iso && age !== null ? (
          <Text variant="label" color="textSecondary" testID="onb-dob-summary">
            {`${Number(iso.slice(8))} ${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)} · ${age} years old`}
          </Text>
        ) : null}
      </Group>
    </Group>
  );
}

// -------------------------------------------------------------------- body

/**
 * Height and weight side by side, like the date of birth: with the keyboard up a phone shows
 * about one row of fields above the Continue bar, and a weight field under the height field was
 * out of sight (and out of reach) until the keyboard was closed again.
 */
export function BodyStep({ draft, set, errors, submit }: StepProps) {
  const { spacing } = useTheme();
  const { width } = useWindowDimensions();
  const imp = draft.units === 'imperial';
  // Inches may stay empty (5 ft is 5 ft 0 in), so Continue never sends anyone back to them.
  const field = useFieldChain(imp ? [draft.heightFt, draft.heightIn ?? 0, draft.weight] : [draft.heightCm, draft.weight], submit);
  const heightError = errors.height ? `${errors.height}${errors.height.includes('between') ? '' : ` Between ${heightRangeText(draft.units)}.`}` : null;
  const weightError = errors.weight ? `${errors.weight}${errors.weight.includes('between') ? '' : ` Between ${weightRangeText(draft.units)}.`}` : null;
  return (
    <Group gap={spacing.xl}>
      <StepTitle title="Height and weight" subtitle="A rough figure is fine for now." />
      <View style={{ alignItems: 'flex-end', marginTop: -spacing.md }}>
        <UnitsToggle draft={draft} set={set} idPrefix="onb-body-units" />
      </View>
      <Group gap={spacing.sm}>
        {imp ? (
          // Three in a row: the unit is in each label, so "10.5" and "250.5" fit their cups at 320 px.
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <BigNumberField
              style={{ flex: 1 }}
              size="md"
              label="Height, ft"
              accessibilityLabel="Height, feet"
              testID="onb-height-ft"
              decimals={0}
              maxLength={1}
              value={draft.heightFt}
              onChange={(heightFt) => set({ heightFt })}
              error={!!errors.height}
              {...field(0)}
            />
            <BigNumberField
              style={{ flex: 1 }}
              size="md"
              label="in"
              accessibilityLabel="Height, inches"
              testID="onb-height-in"
              decimals={1}
              maxLength={4}
              value={draft.heightIn}
              onChange={(heightIn) => set({ heightIn })}
              error={!!errors.height}
              {...field(1)}
            />
            <BigNumberField
              style={{ flex: 1.25 }}
              size="md"
              label="Weight, lb"
              accessibilityLabel="Current weight, pounds"
              testID="onb-weight"
              decimals={1}
              maxLength={5}
              value={draft.weight}
              onChange={(weight) => set({ weight })}
              error={!!errors.weight}
              {...field(2)}
            />
          </View>
        ) : (
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <BigNumberField
              style={{ flex: 1 }}
              size={width < 360 ? 'md' : 'lg'}
              label="Height"
              testID="onb-height-cm"
              unit="cm"
              decimals={1}
              maxLength={5}
              value={draft.heightCm}
              onChange={(heightCm) => set({ heightCm })}
              error={!!errors.height}
              {...field(0)}
            />
            <BigNumberField
              style={{ flex: 1 }}
              size={width < 360 ? 'md' : 'lg'}
              label="Weight"
              accessibilityLabel={`Current weight, ${weightUnit(draft.units)}`}
              testID="onb-weight"
              unit={weightUnit(draft.units)}
              decimals={1}
              maxLength={5}
              value={draft.weight}
              onChange={(weight) => set({ weight })}
              error={!!errors.weight}
              {...field(1)}
            />
          </View>
        )}
        <ErrorText testID="onb-height-error">{heightError}</ErrorText>
        <ErrorText testID="onb-weight-error">{weightError}</ErrorText>
      </Group>
      <Text variant="caption" color="textSecondary">
        Your weight is saved on this device as your first weigh-in.
      </Text>
    </Group>
  );
}

// ---------------------------------------------------------------- body fat

export function BodyFatStep({ draft, set, errors, submit, advance, hold }: StepProps) {
  const { colors, spacing } = useTheme();
  // The tape's fields, in order, for the keyboard's Next key and for Continue.
  const tape = useFieldChain(draft.sex === 'female' ? [draft.neck, draft.waist, draft.hip] : [draft.neck, draft.waist], submit);
  const imp = draft.units === 'imperial';
  const lu = imp ? 'in' : 'cm';
  const estimate = draft.bodyFatMode === 'tape' ? tapeEstimate(draft) : null;
  // A mode that needs typing, picked here: its first field takes the focus, which also brings it into view.
  const [picked, setPicked] = useState(false);
  const mark = (Icon: typeof Ruler) => <Icon size={22} color={colors.text} strokeWidth={1.9} />;
  const modes: { value: BodyFatMode; title: string; hint: string; icon: React.ReactNode }[] = [
    { value: 'unknown', title: "I don't know", hint: 'Most people skip this', icon: mark(CircleHelp) },
    { value: 'direct', title: 'I know my body fat %', hint: 'From a smart scale or a scan', icon: mark(Target) },
    { value: 'tape', title: 'Measure with a tape', hint: 'Neck and waist, about two minutes', icon: mark(Ruler) },
  ];
  return (
    <Group gap={spacing.xl}>
      <StepTitle title="Body fat" subtitle="Optional. Helps for lean or muscular bodies." />
      <Group gap={spacing.sm}>
        {modes.map((m) => (
          <ChoiceCard
            key={m.value}
            testID={`onb-bf-${m.value}`}
            title={m.title}
            hint={m.hint}
            icon={m.icon}
            selected={draft.bodyFatMode === m.value}
            onPress={() => {
              set({ bodyFatMode: m.value });
              // Only the answer that needs nothing typed moves on by itself.
              if (m.value === 'unknown') advance();
              else {
                hold();
                setPicked(true);
              }
            }}
          />
        ))}
        <ErrorText>{errors.bodyFatMode}</ErrorText>
      </Group>
      {draft.bodyFatMode === 'direct' ? (
        <View style={{ gap: 6 }}>
          <BigNumberField
            label="Body fat"
            testID="onb-bf-input"
            autoFocus={picked}
            unit="%"
            decimals={1}
            maxLength={4}
            value={draft.bodyFatPct}
            onChange={(bodyFatPct) => set({ bodyFatPct })}
            error={errors.bodyFatPct}
            returnKeyType="done"
            onSubmitEditing={submit}
          />
          {errors.bodyFatPct ? null : (
            <Text variant="caption" color="textSecondary">
              A rough figure is fine; the plan adapts to your real trend.
            </Text>
          )}
        </View>
      ) : null}
      {draft.bodyFatMode === 'tape' ? (
        <Card style={{ gap: spacing.lg }}>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <BigNumberField
              style={{ flex: 1 }}
              label={`Neck, ${lu}`}
              accessibilityLabel={`Neck, ${imp ? 'inches' : 'centimetres'}`}
              testID="onb-neck-input"
              autoFocus={picked}
              size="md"
              decimals={1}
              maxLength={5}
              value={draft.neck}
              onChange={(neck) => set({ neck })}
              error={!!errors.neck}
              {...tape(0)}
            />
            <BigNumberField
              style={{ flex: 1 }}
              label={`Waist, ${lu}`}
              accessibilityLabel={`Waist, ${imp ? 'inches' : 'centimetres'}`}
              testID="onb-waist-input"
              size="md"
              decimals={1}
              maxLength={5}
              value={draft.waist}
              onChange={(waist) => set({ waist })}
              error={!!errors.waist}
              {...tape(1)}
            />
            {draft.sex === 'female' ? (
              <BigNumberField
                style={{ flex: 1 }}
                label={`Hips, ${lu}`}
                accessibilityLabel={`Hips, ${imp ? 'inches' : 'centimetres'}`}
                testID="onb-hip-input"
                size="md"
                decimals={1}
                maxLength={5}
                value={draft.hip}
                onChange={(hip) => set({ hip })}
                error={!!errors.hip}
                {...tape(2)}
              />
            ) : null}
          </View>
          <ErrorText>{errors.neck ?? errors.waist ?? errors.hip ?? errors.tape}</ErrorText>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm }} testID="onb-bf-estimate">
            <Text variant="label" color="textSecondary" style={{ flex: 1 }}>
              Estimated body fat
            </Text>
            <Text variant="numL" color={estimate !== null ? 'text' : 'textTertiary'}>
              {estimate !== null ? String(estimate) : '–'}
              <Text variant="unit"> %</Text>
            </Text>
          </View>
          <WhyWeAsk testID="onb-bf-how" title="How to measure">
            {draft.sex === 'female'
              ? 'Relaxed, tape level and snug: neck below the larynx, waist at the narrowest point, hips at the widest. '
              : 'Relaxed, tape level and snug: neck below the larynx, waist at the navel. '}
            The result is usually within 3 to 4 points. Re-measure any time from the Body screen.
          </WhyWeAsk>
        </Card>
      ) : null}
      <WhyWeAsk testID="onb-bf-why">
        With body fat, HealthCal works out resting metabolism from your lean mass (the Katch-McArdle equation) instead of from weight, height and age
        (Mifflin-St Jeor). The tape estimate uses the US Navy method.
      </WhyWeAsk>
    </Group>
  );
}

// ---------------------------------------------------------------- activity

/** How full a normal day's movement is: each level is a small cup in the exercise colour, filled a step higher. */
const ACTIVITY_LEVEL: Record<ActivityLevel, number> = { sedentary: 0.2, light: 0.4, moderate: 0.6, active: 0.8, athlete: 1 };

export function ActivityStep({ draft, set, errors, advance }: StepProps) {
  const { colors, spacing } = useTheme();
  const levels = Object.keys(ACTIVITY_LABELS) as ActivityLevel[];
  return (
    <Group gap={spacing.xl}>
      <StepTitle title="A normal day, without workouts" subtitle="Your job, chores and getting around." />
      <Group gap={spacing.sm}>
        {levels.map((l, i) => (
          <ChoiceCard
            key={l}
            testID={`onb-activity-${l}`}
            title={ACTIVITY_LABELS[l].title}
            hint={ACTIVITY_LABELS[l].hint}
            icon={<MiniCup progress={ACTIVITY_LEVEL[l]} color={colors.exercise} width={24} height={30} index={i} memoryKey={`onb-activity-${l}`} />}
            selected={draft.activity === l}
            onPress={() => {
              set({ activity: l });
              advance();
            }}
          />
        ))}
        <ErrorText>{errors.activity}</ErrorText>
      </Group>
      <WhyWeAsk testID="onb-activity-why" title="What about workouts?">
        They are logged separately. Each session you log adds only the calories above resting to that day, so nothing is counted twice.
      </WhyWeAsk>
    </Group>
  );
}

// ------------------------------------------------------------------ target

export function TargetStep({ draft, set, errors, submit }: StepProps) {
  const { colors, spacing } = useTheme();
  const now = useNow();
  const imp = draft.units === 'imperial';
  const unit = weightUnit(draft.units);
  const m = toMetric(draft);
  const goal = draft.goal === 'gain' ? 'gain' : 'lose';
  const weightKg = m.weightKg ?? 70;
  const maxKg = maxWeeklyRateKg(goal, weightKg);
  const rateKg = rateKgOf(draft, weightKg);
  const plan = buildPlan(draft, now);

  // The stepper works in the display unit.
  const toDisplay = (kg: number) => (imp ? kgToLb(kg) : kg);
  const step = imp ? 0.25 : 0.05;
  const minDisplay = step * 2;
  // The safe maximum itself is always reachable, even when it is not a whole step.
  const maxDisplay = Math.max(minDisplay, round(toDisplay(maxKg), 2));
  const rateDisplay = Math.min(maxDisplay, Math.max(minDisplay, round(toDisplay(rateKg), 2)));
  const fmtRate = (v: number) => `${formatNumber(v, 2).replace(/\.?0+$/, '')} ${unit}`;
  const fmtW = (v: number) => `${formatNumber(v, 1).replace(/\.0$/, '')}`;

  const delta = plan ? plan.target.dailyDelta : (goal === 'lose' ? -1 : 1) * ((rateKg * KCAL_PER_KG) / 7);
  const requestedDelta = (rateKg * KCAL_PER_KG) / 7;
  const word = goal === 'lose' ? 'deficit' : 'surplus';
  const date = plan?.goalDate ?? null;
  const showTargetSummary = plan && !errors.target && m.targetKg !== null && draft.weight !== null && draft.target !== null;

  return (
    <Group gap={spacing.xl}>
      <StepTitle
        title={goal === 'lose' ? 'Where are you heading?' : 'Set your pace'}
        subtitle={goal === 'lose' ? 'A pace you can keep. Slower is easier.' : 'A small surplus limits fat gain.'}
      />
      <View style={{ gap: 6 }}>
        <BigNumberField
          label={goal === 'lose' ? 'Target weight' : 'Target weight (optional)'}
          testID="onb-target-input"
          unit={unit}
          decimals={1}
          maxLength={5}
          value={draft.target}
          onChange={(target) => set({ target })}
          error={errors.target}
          returnKeyType="done"
          onSubmitEditing={submit}
        />
        {!errors.target && draft.weight !== null ? (
          <Text variant="caption" color="textSecondary">
            {`You're at ${fmtW(draft.weight)} ${unit} today.`}
          </Text>
        ) : null}
      </View>
      <Card style={{ gap: spacing.lg }}>
        <View style={{ gap: 2 }}>
          <Text variant="title">Weekly pace</Text>
          <Text variant="caption" color="textSecondary" testID="onb-pace-max">
            {`Safe maximum ${fmtRate(round(toDisplay(maxKg), 2))} a week (${goal === 'lose' ? '1' : '0.5'}% of body weight)`}
          </Text>
        </View>
        <View style={{ alignItems: 'center' }} testID="onb-pace">
          <Stepper
            label="weekly pace"
            value={rateDisplay}
            step={step}
            min={minDisplay}
            max={maxDisplay}
            format={(v) => fmtRate(v)}
            onChange={(v) => set({ weeklyRateKg: imp ? lbToKg(v) : v })}
          />
        </View>
        <PaceMeter value={rateDisplay / maxDisplay} />
        <Divider />
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: spacing.xs }} testID="onb-pace-delta">
          <Text variant="numM">{`${delta < 0 ? '−' : '+'}${formatNumber(Math.abs(Math.round(delta / 10) * 10))}`}</Text>
          <Text variant="caption" color="textSecondary" style={{ flex: 1 }}>
            {`kcal a day ${word}${plan ? `, from about ${formatNumber(Math.round(plan.tdee / 10) * 10)} kcal burned` : ''}`}
          </Text>
        </View>
      </Card>
      {plan?.target.belowFloor ? (
        <Note tone="warning" icon={<TriangleAlert size={18} color={colors.warningInk} />} testID="onb-floor-note">
          <Text variant="bodyStrong">{`Your plan stays at ${formatNumber(plan.floor)} kcal a day`}</Text>
          <Text variant="caption" color="textSecondary">
            {`You burn about ${formatNumber(plan.floor)} kcal on a normal day, already at or below the ${formatNumber(MIN_KCAL(draft))} kcal HealthCal recommends as a minimum, so no ${word} is planned from food. Logged workouts add room on top.`}
          </Text>
        </Note>
      ) : plan?.target.limitedByFloor ? (
        <Note tone="warning" icon={<TriangleAlert size={18} color={colors.warningInk} />} testID="onb-floor-note">
          <Text variant="bodyStrong">{`Your plan stops at ${formatNumber(plan.floor)} kcal a day`}</Text>
          <Text variant="caption" color="textSecondary">
            {`A ${formatNumber(Math.round(requestedDelta / 10) * 10)} kcal deficit would take you below ${formatNumber(plan.floor)} kcal, the lowest HealthCal recommends. Expect about ${fmtRate(
              round(toDisplay(Math.abs(plan.target.impliedWeeklyKg)), 2),
            )} a week instead. Logged workouts add room on top.`}
          </Text>
        </Note>
      ) : null}
      {showTargetSummary ? (
        <Card tone="alt" style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg }} testID="onb-target-summary">
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <WeightCup label={fmtW(draft.weight!)} level={goal === 'lose' ? 0.8 : 0.55} />
            <View style={{ paddingBottom: 26 }}>
              <ArrowRight size={16} color={colors.textSecondary} strokeWidth={2.2} />
            </View>
            <WeightCup label={fmtW(draft.target!)} level={goal === 'lose' ? 0.55 : 0.8} />
          </View>
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Text variant="title">{date ? `Around ${looseDate(date, now)}` : 'No date yet'}</Text>
            <Text variant="caption" color="textSecondary">
              {date ? `${fmtW(draft.weight!)} to ${fmtW(draft.target!)} ${unit} at this pace. The date moves with your real trend.` : 'At this pace the target is not reached; try a different pace.'}
            </Text>
          </View>
        </Card>
      ) : null}
    </Group>
  );
}

/** A weight as a small cup with its number under it (the target step's before and after). */
function WeightCup({ label, level }: { label: string; level: number }) {
  const { colors } = useTheme();
  return (
    <View style={{ alignItems: 'center', gap: 4 }}>
      <MiniCup progress={level} color={colors.weight} width={26} height={34} animate={false} />
      <Text variant="label" tabular>
        {label}
      </Text>
    </View>
  );
}

const MIN_KCAL = (d: Draft) => calorieFloor(d.sex ?? 'female');

/** The pace as a level bar in the brand colour, with the rim tick (3 x 16) at the chosen pace. */
function PaceMeter({ value }: { value: number }) {
  const { colors, spacing } = useTheme();
  const v = Math.max(0, Math.min(1, value));
  const label = v <= 0.4 ? 'Relaxed' : v <= 0.75 ? 'Steady' : 'Ambitious';
  return (
    <View style={{ gap: spacing.sm }}>
      <ProgressBar progress={v} color={colors.primary} height={8} memoryKey="onb-pace" />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text variant="caption" color="textSecondary">
          Relaxed
        </Text>
        <Text variant="label">{label}</Text>
        <Text variant="caption" color="textSecondary">
          Max
        </Text>
      </View>
    </View>
  );
}

// ----------------------------------------------------------------- routine

const NUDGES: { key: Exclude<NudgeKind, 'checkin'>; title: string; icon: React.ReactNode }[] = [
  { key: 'water', title: 'Water', icon: <Droplets size={20} /> },
  { key: 'meals', title: 'Meals', icon: <Utensils size={20} /> },
  { key: 'weighIn', title: 'Weigh-in', icon: <Scale size={20} /> },
];

export function RoutineStep({ draft, set, errors }: StepProps) {
  const { colors, spacing } = useTheme();
  const now = useNow();
  const [showTimes, setShowTimes] = useState(false);
  const r = draft.routine;
  const hour12 = prefers12h(draft.units);
  const plan = buildPlan(draft, now);
  const setRoutine = (patch: Partial<Routine>) => set({ routine: { ...r, ...patch } });
  const examples = plan ? nudgeExamples(r, { targetKcal: plan.target.target, waterMl: plan.waterMl, macros: plan.macros }, draft.units, hour12) : null;
  const whenFor = (key: NudgeKind): string => {
    if (key === 'weighIn') return `Mon and Thu, ${formatClock(WEIGH_IN_TIME, hour12)}`;
    if (key === 'water') return 'Every 2 hours while awake';
    if (key === 'meals') return 'When a meal is not logged';
    return examples?.checkin?.time ?? formatClock('20:30', hour12);
  };
  const exampleFor = (key: NudgeKind): string | null => {
    const ex = examples?.[key];
    if (ex) return ex.body;
    return plan ? 'With these times this one falls while you sleep, so it stays silent.' : null;
  };
  const timeError = errors.meals || errors.sleep;
  const open = showTimes || !!timeError;
  const Chevron = open ? ChevronUp : ChevronDown;

  return (
    <Group gap={spacing.xl}>
      <StepTitle title="Nudges that help" subtitle="Optional. Silent once the goal is met." />
      <Group gap={spacing.sm}>
        {NUDGES.map((n) => (
          <NudgeCard
            key={n.key}
            title={n.title}
            when={whenFor(n.key)}
            example={exampleFor(n.key)}
            value={r.nudges[n.key]}
            onChange={(on) => setRoutine({ nudges: { ...r.nudges, [n.key]: on } })}
            icon={<IconTile>{n.icon}</IconTile>}
            testID={`onb-nudge-${n.key}`}
          />
        ))}
      </Group>
      <View style={{ gap: spacing.sm }}>
        <PressableScale
          testID="onb-routine-times"
          onPress={() => setShowTimes(!open)}
          feedback="tap"
          scaleTo={0.99}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          accessibilityLabel={`Adjust times and the evening check-in. Awake ${formatClock(r.wake, hour12)} to ${formatClock(r.bed, hour12)}, meals ${formatClock(r.breakfast, hour12)}, ${formatClock(r.lunch, hour12)} and ${formatClock(r.dinner, hour12)}, check-in ${r.nudges.checkin ? whenFor('checkin') : 'off'}`}
          style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 48, paddingHorizontal: spacing.xs }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text variant="title">Adjust times</Text>
            <Text variant="caption" color="textSecondary" tabular>
              {/* The evening check-in lives behind this row, so the row says whether it is on. */}
              {`Meals, awake ${formatClock(r.wake, hour12)} to ${formatClock(r.bed, hour12)}, check-in ${r.nudges.checkin ? whenFor('checkin') : 'off'}`}
            </Text>
          </View>
          <Chevron size={20} color={colors.textSecondary} strokeWidth={2} />
        </PressableScale>
        {open ? (
          // 16 px from the row that opened it, the same as between the groups inside.
          <View style={{ gap: spacing.lg, paddingTop: spacing.sm }}>
            <SettingsGroup title="Usual meal times">
              <TimeRow title="Breakfast" value={r.breakfast} hour12={hour12} onChange={(breakfast) => setRoutine({ breakfast })} testID="onb-routine-breakfast" />
              <TimeRow title="Lunch" value={r.lunch} hour12={hour12} onChange={(lunch) => setRoutine({ lunch })} testID="onb-routine-lunch" />
              <TimeRow title="Dinner" value={r.dinner} hour12={hour12} onChange={(dinner) => setRoutine({ dinner })} testID="onb-routine-dinner" />
            </SettingsGroup>
            <SettingsGroup title="Waking hours" footer="Nothing is sent between bedtime and wake-up.">
              <TimeRow title="Wake up" value={r.wake} hour12={hour12} onChange={(wake) => setRoutine({ wake })} testID="onb-routine-wake" />
              <TimeRow title="Bedtime" value={r.bed} hour12={hour12} onChange={(bed) => setRoutine({ bed })} testID="onb-routine-bed" />
            </SettingsGroup>
            <NudgeCard
              title="Evening check-in"
              when={whenFor('checkin')}
              example={exampleFor('checkin')}
              value={r.nudges.checkin}
              onChange={(on) => setRoutine({ nudges: { ...r.nudges, checkin: on } })}
              icon={<IconTile>{<BellRing size={20} />}</IconTile>}
              testID="onb-nudge-checkin"
            />
          </View>
        ) : null}
        {timeError ? <ErrorText testID="onb-routine-error">{errors.sleep ?? errors.meals}</ErrorText> : null}
      </View>
      {!remindersSupported ? (
        <Text variant="caption" color="textSecondary">
          A browser cannot send reminders; HealthCal on your phone sends them with these choices.
        </Text>
      ) : null}
    </Group>
  );
}

/** A reminder choice as a card: what it is, when it comes, and the message itself written out. */
function NudgeCard({
  title,
  when,
  example,
  value,
  onChange,
  icon,
  testID,
}: {
  title: string;
  when: string;
  example: string | null;
  value: boolean;
  onChange: (on: boolean) => void;
  icon: React.ReactNode;
  testID: string;
}) {
  const { colors, radius, spacing } = useTheme();
  return (
    <View
      style={{
        gap: spacing.sm,
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.md,
        ...cup(radius.card),
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
      }}>
      <ToggleRow title={title} subtitle={when} value={value} onChange={onChange} left={icon} testID={testID} />
      {example ? (
        <View
          testID={`${testID}-example`}
          style={{
            ...cup(radius.buttonSm, 4),
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.sm,
            backgroundColor: colors.surfaceAlt,
          }}>
          <Text variant="caption" color={value ? 'text' : 'textSecondary'}>
            {example}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
