import { Activity, Dumbbell, Info, Ruler, Scale, TrendingDown, TrendingUp, TriangleAlert } from 'lucide-react-native';
import React from 'react';
import { View } from 'react-native';

import { ageFromBirthDate, formatLongDate, toISODate } from '@/lib/dates';
import { ACTIVITY_LABELS, KCAL_PER_KG, maxWeeklyRateKg } from '@/lib/energy';
import { formatNumber, kgToLb, lbToKg, round, weightUnit } from '@/lib/units';
import { useTheme } from '@/theme';
import type { ActivityLevel, GoalType } from '@/types';
import { Card, NumberField, PressableScale, Stepper, Text, TextField } from '@/ui';

import { ChoiceCard, ErrorText, Note, StepTitle } from './components';
import { birthDateOf, buildPlan, convertUnits, rateKgOf, tapeEstimate, toMetric, type BodyFatMode, type Draft, type Errors } from './model';

export interface StepProps {
  draft: Draft;
  set: (patch: Partial<Draft>) => void;
  /** Errors to show (only after the person tried to continue). */
  errors: Errors;
  /** Advance, used by the keyboard's return key on the last field. */
  submit: () => void;
}

const Group = ({ children, gap }: { children: React.ReactNode; gap?: number }) => {
  const { spacing } = useTheme();
  return <View style={{ gap: gap ?? spacing.md }}>{children}</View>;
};

// ------------------------------------------------------------------ basics

export function BasicsStep({ draft, set, errors, submit }: StepProps) {
  const { spacing } = useTheme();
  return (
    <Group gap={spacing.xxl}>
      <StepTitle title="Let's set up your plan" subtitle="A few questions about you. It takes about a minute, and every answer can be changed later." />
      <Group gap={spacing.sm}>
        <Text variant="label" color="textSecondary">
          Units
        </Text>
        <UnitsSwitch draft={draft} set={set} />
      </Group>
      <TextField
        label="First name"
        testID="onb-name-input"
        placeholder="What should we call you?"
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
    </Group>
  );
}

function UnitsSwitch({ draft, set }: Pick<StepProps, 'draft' | 'set'>) {
  const { colors, radius, spacing } = useTheme();
  const opts = [
    { value: 'metric' as const, title: 'Metric', hint: 'kg, cm, ml' },
    { value: 'imperial' as const, title: 'Imperial', hint: 'lb, ft/in, fl oz' },
  ];
  return (
    <View style={{ flexDirection: 'row', gap: spacing.sm }}>
      {opts.map((o) => {
        const active = draft.units === o.value;
        return (
          <View key={o.value} style={{ flex: 1 }}>
            <ChoiceTile
              testID={`onb-units-${o.value}`}
              active={active}
              onPress={() => set(convertUnits(draft, o.value))}
              title={o.title}
              hint={o.hint}
              colors={colors}
              radius={radius.lg}
            />
          </View>
        );
      })}
    </View>
  );
}

function ChoiceTile({
  active,
  onPress,
  title,
  hint,
  testID,
  colors,
  radius,
}: {
  active: boolean;
  onPress: () => void;
  title: string;
  hint: string;
  testID: string;
  colors: ReturnType<typeof useTheme>['colors'];
  radius: number;
}) {
  return (
    <ChoiceCardCompact testID={testID} active={active} onPress={onPress} colors={colors} radius={radius}>
      <Text variant="title" color={active ? 'text' : 'textSecondary'}>
        {title}
      </Text>
      <Text variant="caption" color="textTertiary">
        {hint}
      </Text>
    </ChoiceCardCompact>
  );
}

function ChoiceCardCompact({
  active,
  onPress,
  children,
  testID,
  colors,
  radius,
}: {
  active: boolean;
  onPress: () => void;
  children: React.ReactNode;
  testID: string;
  colors: ReturnType<typeof useTheme>['colors'];
  radius: number;
}) {
  return (
    <PressableScale
      testID={testID}
      onPress={onPress}
      feedback="select"
      scaleTo={0.98}
      accessibilityRole="radio"
      accessibilityState={{ checked: active }}
      style={{
        minHeight: 72,
        justifyContent: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        gap: 2,
        borderRadius: radius,
        borderWidth: 1.5,
        borderColor: active ? colors.primary : colors.border,
        backgroundColor: active ? colors.primarySoft : colors.surface,
      }}>
      {children}
    </PressableScale>
  );
}

// -------------------------------------------------------------------- goal

export function GoalStep({ draft, set, errors }: StepProps) {
  const { colors, spacing } = useTheme();
  const options: { value: GoalType; title: string; hint: string; icon: React.ReactNode; color: string }[] = [
    {
      value: 'lose',
      title: 'Lose weight',
      hint: 'A steady calorie deficit, protein kept high',
      icon: <TrendingDown size={22} color={colors.weight} />,
      color: colors.weight,
    },
    { value: 'maintain', title: 'Maintain', hint: 'Eat to match what you burn', icon: <Scale size={22} color={colors.water} />, color: colors.water },
    {
      value: 'gain',
      title: 'Gain muscle',
      hint: 'A small surplus to support training',
      icon: <Dumbbell size={22} color={colors.protein} />,
      color: colors.protein,
    },
  ];
  const name = draft.name.trim();
  return (
    <Group gap={spacing.xxl}>
      <StepTitle
        title={name ? `What's your goal, ${name}?` : "What's your goal?"}
        subtitle="This sets the direction of your calorie target and how much protein you need."
      />
      <Group>
        {options.map((o) => (
          <ChoiceCard
            key={o.value}
            testID={`onb-goal-${o.value}`}
            title={o.title}
            hint={o.hint}
            icon={o.icon}
            color={o.color}
            selected={draft.goal === o.value}
            onPress={() => set({ goal: o.value })}
          />
        ))}
        <ErrorText>{errors.goal}</ErrorText>
      </Group>
    </Group>
  );
}

// ------------------------------------------------------------------- about

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function AboutStep({ draft, set, errors, submit }: StepProps) {
  const { colors, spacing } = useTheme();
  const iso = birthDateOf(draft);
  const age = iso && iso <= toISODate() ? ageFromBirthDate(iso) : null;
  const day = (
    <NumberField
      key="d"
      style={{ flex: 1 }}
      label="Day"
      placeholder="DD"
      testID="onb-dob-day"
      decimals={0}
      maxLength={2}
      value={draft.dobDay}
      onChange={(dobDay) => set({ dobDay })}
      returnKeyType="next"
    />
  );
  const month = (
    <NumberField
      key="m"
      style={{ flex: 1 }}
      label="Month"
      placeholder="MM"
      testID="onb-dob-month"
      decimals={0}
      maxLength={2}
      value={draft.dobMonth}
      onChange={(dobMonth) => set({ dobMonth })}
      returnKeyType="next"
    />
  );
  const year = (
    <NumberField
      key="y"
      style={{ flex: 1.4 }}
      label="Year"
      placeholder="YYYY"
      testID="onb-dob-year"
      decimals={0}
      maxLength={4}
      value={draft.dobYear}
      onChange={(dobYear) => set({ dobYear })}
      returnKeyType="done"
      onSubmitEditing={submit}
    />
  );
  return (
    <Group gap={spacing.xxl}>
      <StepTitle title="A little about you" subtitle="Resting metabolism depends on sex and age, so the energy equations need both." />
      <Group gap={spacing.sm}>
        <Text variant="label" color="textSecondary">
          Sex
        </Text>
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          {(['female', 'male'] as const).map((s) => (
            <View key={s} style={{ flex: 1 }}>
              <ChoiceCardCompact testID={`onb-sex-${s}`} active={draft.sex === s} onPress={() => set({ sex: s })} colors={colors} radius={20}>
                <Text variant="title" color={draft.sex === s ? 'text' : 'textSecondary'}>
                  {s === 'female' ? 'Female' : 'Male'}
                </Text>
              </ChoiceCardCompact>
            </View>
          ))}
        </View>
        {errors.sex ? (
          <ErrorText>{errors.sex}</ErrorText>
        ) : (
          <Text variant="caption" color="textTertiary">
            Used only to pick the right equation. Choose the one closest to your body.
          </Text>
        )}
      </Group>
      <Group gap={spacing.sm}>
        <Text variant="label" color="textSecondary">
          Date of birth
        </Text>
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>{draft.units === 'imperial' ? [month, day, year] : [day, month, year]}</View>
        {errors.dob ? (
          <ErrorText testID="onb-dob-error">{errors.dob}</ErrorText>
        ) : iso && age !== null ? (
          <Text variant="caption" color="textSecondary" testID="onb-dob-summary">
            {`${Number(iso.slice(8))} ${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)} · ${age} years old`}
          </Text>
        ) : (
          <Text variant="caption" color="textTertiary">
            Metabolism slows a little each decade; age keeps the estimate current.
          </Text>
        )}
      </Group>
    </Group>
  );
}

// -------------------------------------------------------------------- body

export function BodyStep({ draft, set, errors, submit }: StepProps) {
  const { colors, spacing } = useTheme();
  const imp = draft.units === 'imperial';
  return (
    <Group gap={spacing.xxl}>
      <StepTitle
        title="Height and weight"
        subtitle="The two biggest inputs to your energy needs. Weigh yourself in the morning if you can; a rough figure is fine for now."
      />
      <Group gap={spacing.lg}>
        {imp ? (
          <View style={{ gap: 6 }}>
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <NumberField
                style={{ flex: 1 }}
                label="Height"
                testID="onb-height-ft"
                placeholder="5"
                suffix="ft"
                decimals={0}
                maxLength={1}
                value={draft.heightFt}
                onChange={(heightFt) => set({ heightFt })}
                error={errors.height ? ' ' : undefined}
                returnKeyType="next"
              />
              <NumberField
                style={{ flex: 1 }}
                label=" "
                accessibilityLabel="Height, inches"
                testID="onb-height-in"
                placeholder="9"
                suffix="in"
                decimals={1}
                maxLength={4}
                value={draft.heightIn}
                onChange={(heightIn) => set({ heightIn })}
                error={errors.height ? ' ' : undefined}
                returnKeyType="next"
              />
            </View>
            {errors.height ? (
              <ErrorText>{errors.height}</ErrorText>
            ) : (
              <Text variant="caption" color="textTertiary">
                {`Between 3'11" and 7'7"`}
              </Text>
            )}
          </View>
        ) : (
          <NumberField
            label="Height"
            testID="onb-height-cm"
            placeholder="175"
            suffix="cm"
            decimals={1}
            maxLength={5}
            value={draft.heightCm}
            onChange={(heightCm) => set({ heightCm })}
            error={errors.height}
            hint="Between 120 and 230 cm"
            returnKeyType="next"
          />
        )}
        <NumberField
          label="Current weight"
          testID="onb-weight"
          placeholder={imp ? '165' : '75'}
          suffix={weightUnit(draft.units)}
          decimals={1}
          maxLength={5}
          value={draft.weight}
          onChange={(weight) => set({ weight })}
          error={errors.weight}
          hint={imp ? 'Between 77 and 661 lb' : 'Between 35 and 300 kg'}
          returnKeyType="done"
          onSubmitEditing={submit}
        />
      </Group>
      <Note icon={<Info size={18} color={colors.textSecondary} />}>
        <Text variant="caption" color="textSecondary">
          Stored privately on this device in metric. Your first weigh-in is saved too, so your trend starts today.
        </Text>
      </Note>
    </Group>
  );
}

// ---------------------------------------------------------------- body fat

export function BodyFatStep({ draft, set, errors, submit }: StepProps) {
  const { colors, spacing } = useTheme();
  const imp = draft.units === 'imperial';
  const lu = imp ? 'in' : 'cm';
  const estimate = draft.bodyFatMode === 'tape' ? tapeEstimate(draft) : null;
  const modes: { value: BodyFatMode; title: string; hint: string; emoji: string }[] = [
    { value: 'unknown', title: "I don't know", hint: 'Skip it. The standard equation works well for most people.', emoji: '🤷' },
    { value: 'direct', title: 'I know my body fat %', hint: 'From a smart scale, DEXA scan or calipers', emoji: '🎯' },
    { value: 'tape', title: 'Estimate it with a tape measure', hint: 'US Navy method, about two minutes', emoji: '📏' },
  ];
  return (
    <Group gap={spacing.xxl}>
      <StepTitle
        title="Body fat, if you know it"
        subtitle="Optional. With it, HealthCal switches to the lean-mass Katch-McArdle equation, which fits muscular and very lean bodies better than weight alone."
      />
      <Group>
        {modes.map((m) => (
          <ChoiceCard
            key={m.value}
            testID={`onb-bf-${m.value}`}
            title={m.title}
            hint={m.hint}
            emoji={m.emoji}
            color={colors.fat}
            selected={draft.bodyFatMode === m.value}
            onPress={() => set({ bodyFatMode: m.value })}
          />
        ))}
        <ErrorText>{errors.bodyFatMode}</ErrorText>
      </Group>
      {draft.bodyFatMode === 'direct' ? (
        <NumberField
          label="Body fat"
          testID="onb-bf-input"
          placeholder="22"
          suffix="%"
          decimals={1}
          maxLength={4}
          value={draft.bodyFatPct}
          onChange={(bodyFatPct) => set({ bodyFatPct })}
          error={errors.bodyFatPct}
          hint="Between 3 and 60%. Home scales can be off by several points; that's fine, the engine allows for it."
          returnKeyType="done"
          onSubmitEditing={submit}
        />
      ) : null}
      {draft.bodyFatMode === 'tape' ? (
        <Card style={{ gap: spacing.lg }}>
          <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center' }}>
            <Ruler size={18} color={colors.fat} />
            <Text variant="caption" color="textSecondary" style={{ flex: 1 }}>
              {draft.sex === 'female'
                ? 'Measure relaxed, tape level and snug: neck below the larynx, waist at the narrowest point, hips at the widest.'
                : 'Measure relaxed, tape level and snug: neck below the larynx, waist at the navel.'}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <NumberField
              style={{ flex: 1 }}
              label="Neck"
              testID="onb-neck-input"
              suffix={lu}
              decimals={1}
              maxLength={5}
              value={draft.neck}
              onChange={(neck) => set({ neck })}
              error={errors.neck ? ' ' : undefined}
            />
            <NumberField
              style={{ flex: 1 }}
              label="Waist"
              testID="onb-waist-input"
              suffix={lu}
              decimals={1}
              maxLength={5}
              value={draft.waist}
              onChange={(waist) => set({ waist })}
              error={errors.waist ? ' ' : undefined}
              onSubmitEditing={draft.sex === 'female' ? undefined : submit}
            />
            {draft.sex === 'female' ? (
              <NumberField
                style={{ flex: 1 }}
                label="Hips"
                testID="onb-hip-input"
                suffix={lu}
                decimals={1}
                maxLength={5}
                value={draft.hip}
                onChange={(hip) => set({ hip })}
                error={errors.hip ? ' ' : undefined}
                onSubmitEditing={submit}
              />
            ) : null}
          </View>
          <ErrorText>{errors.neck ?? errors.waist ?? errors.hip ?? errors.tape}</ErrorText>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm }} testID="onb-bf-estimate">
            <Text variant="caption" color="textSecondary" style={{ flex: 1 }}>
              Estimated body fat
            </Text>
            <Text variant="numL" tabular color={estimate !== null ? 'fat' : 'textTertiary'}>
              {estimate !== null ? String(estimate) : '–'}
            </Text>
            <Text variant="label" color="textSecondary">
              %
            </Text>
          </View>
          <Text variant="caption" color="textTertiary">
            Tape estimates are usually within 3 to 4 points. Re-measure any time from the Body screen.
          </Text>
        </Card>
      ) : null}
    </Group>
  );
}

// ---------------------------------------------------------------- activity

const ACTIVITY_EMOJI: Record<ActivityLevel, string> = { sedentary: '🪑', light: '🚶', moderate: '🛒', active: '🏗️', athlete: '⛏️' };

export function ActivityStep({ draft, set, errors }: StepProps) {
  const { colors, spacing } = useTheme();
  const levels = Object.keys(ACTIVITY_LABELS) as ActivityLevel[];
  return (
    <Group gap={spacing.xxl}>
      <StepTitle title="A normal day, without workouts" subtitle="How much do you move outside of exercise? Think job, chores and getting around." />
      <Group gap={spacing.sm}>
        {levels.map((l) => (
          <ChoiceCard
            key={l}
            testID={`onb-activity-${l}`}
            title={ACTIVITY_LABELS[l].title}
            hint={ACTIVITY_LABELS[l].hint}
            emoji={ACTIVITY_EMOJI[l]}
            color={colors.exercise}
            selected={draft.activity === l}
            onPress={() => set({ activity: l })}
          />
        ))}
        <ErrorText>{errors.activity}</ErrorText>
      </Group>
      <Note icon={<Activity size={18} color={colors.exercise} />}>
        <Text variant="bodyStrong">Workouts are logged separately</Text>
        <Text variant="caption" color="textSecondary">
          Each session you log adds only the calories above resting to that day. Leaving workouts out here is how nothing gets counted twice.
        </Text>
      </Note>
    </Group>
  );
}

// ------------------------------------------------------------------ target

export function TargetStep({ draft, set, errors, submit }: StepProps) {
  const { colors, spacing } = useTheme();
  const imp = draft.units === 'imperial';
  const unit = weightUnit(draft.units);
  const m = toMetric(draft);
  const goal = draft.goal === 'gain' ? 'gain' : 'lose';
  const weightKg = m.weightKg ?? 70;
  const maxKg = maxWeeklyRateKg(goal, weightKg);
  const rateKg = rateKgOf(draft, weightKg);
  const plan = buildPlan(draft);

  // The stepper works in the display unit.
  const toDisplay = (kg: number) => (imp ? kgToLb(kg) : kg);
  const step = imp ? 0.25 : 0.05;
  const minDisplay = step * 2;
  // The safe maximum itself is always reachable, even when it is not a whole step.
  const maxDisplay = Math.max(minDisplay, round(toDisplay(maxKg), 2));
  const rateDisplay = Math.min(maxDisplay, Math.max(minDisplay, round(toDisplay(rateKg), 2)));
  const fmtRate = (v: number) => `${formatNumber(v, 2).replace(/\.?0+$/, '')} ${unit}`;

  const delta = plan ? plan.target.dailyDelta : (goal === 'lose' ? -1 : 1) * ((rateKg * KCAL_PER_KG) / 7);
  const requestedDelta = (rateKg * KCAL_PER_KG) / 7;
  const word = goal === 'lose' ? 'deficit' : 'surplus';
  const date = plan?.goalDate ?? null;
  const showTargetSummary = plan && !errors.target && m.targetKg !== null;

  return (
    <Group gap={spacing.xxl}>
      <StepTitle
        title={goal === 'lose' ? 'Where are you heading?' : 'Set your pace'}
        subtitle={
          goal === 'lose'
            ? 'A target weight and a pace you can live with. Slower is easier to keep.'
            : 'A small surplus builds muscle with less fat gain. A target weight is optional.'
        }
      />
      <NumberField
        label={goal === 'lose' ? 'Target weight' : 'Target weight (optional)'}
        testID="onb-target-input"
        placeholder={draft.weight !== null ? String(round(draft.weight + (goal === 'lose' ? -5 : 4) * (imp ? 2 : 1), 0)) : ''}
        suffix={unit}
        decimals={1}
        maxLength={5}
        value={draft.target}
        onChange={(target) => set({ target })}
        error={errors.target}
        hint={draft.weight !== null ? `You're at ${formatNumber(draft.weight, 1).replace(/\.0$/, '')} ${unit} today.` : undefined}
        returnKeyType="done"
        onSubmitEditing={submit}
      />
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
        <PaceMeter value={rateDisplay / maxDisplay} color={colors.weight} />
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: spacing.xs }} testID="onb-pace-delta">
          <Text variant="numM" tabular color="calories">
            {`${delta < 0 ? '−' : '+'}${formatNumber(Math.abs(Math.round(delta / 10) * 10))}`}
          </Text>
          <Text variant="caption" color="textSecondary" style={{ flex: 1 }}>
            {`kcal a day ${word}${plan ? `, from about ${formatNumber(Math.round(plan.tdee / 10) * 10)} kcal burned` : ''}`}
          </Text>
        </View>
      </Card>
      {plan?.target.limitedByFloor ? (
        <Note tone="warning" icon={<TriangleAlert size={18} color={colors.warning} />} testID="onb-floor-note">
          <Text variant="bodyStrong">{`Your plan stops at ${formatNumber(plan.floor)} kcal a day`}</Text>
          <Text variant="caption" color="textSecondary">
            {`A ${formatNumber(Math.round(requestedDelta / 10) * 10)} kcal deficit would take you below ${formatNumber(plan.floor)} kcal, the lowest HealthCal recommends. Expect about ${fmtRate(
              round(toDisplay(Math.abs(plan.target.impliedWeeklyKg)), 2),
            )} a week instead. Logged workouts add room on top.`}
          </Text>
        </Note>
      ) : null}
      {showTargetSummary ? (
        <Note tone="primary" icon={goal === 'lose' ? <TrendingDown size={18} color={colors.primary} /> : <TrendingUp size={18} color={colors.primary} />}>
          <Text variant="bodyStrong">{date ? `About ${formatLongDate(toISODate(date)).replace(/^\w+, /, '')}` : 'No date yet'}</Text>
          <Text variant="caption" color="textSecondary">
            {date ? 'Projected at this pace. The date updates as your real trend comes in.' : 'At this pace the target is not reached; try a different pace.'}
          </Text>
        </Note>
      ) : null}
    </Group>
  );
}

function PaceMeter({ value, color }: { value: number; color: string }) {
  const { colors, spacing } = useTheme();
  const v = Math.max(0, Math.min(1, value));
  const label = v <= 0.4 ? 'Relaxed' : v <= 0.75 ? 'Steady' : 'Ambitious';
  return (
    <View style={{ gap: spacing.xs }}>
      <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.track, overflow: 'hidden' }}>
        <View style={{ width: `${v * 100}%`, height: 6, borderRadius: 3, backgroundColor: color }} />
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text variant="caption" color="textTertiary">
          Relaxed
        </Text>
        <Text variant="caption" color={color}>
          {label}
        </Text>
        <Text variant="caption" color="textTertiary">
          Max
        </Text>
      </View>
    </View>
  );
}
