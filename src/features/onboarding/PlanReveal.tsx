import { CalendarCheck, Droplet, Sparkles } from 'lucide-react-native';
import React from 'react';
import { View } from 'react-native';

import { formatLongDate, toISODate } from '@/lib/dates';
import { formatNumber, formatVolume, formatWeight, round } from '@/lib/units';
import { useTheme } from '@/theme';
import { Card, Divider, Ring, Text } from '@/ui';

import { FadeIn } from './components';
import { METHOD_LABEL, type Plan } from './model';

const kcal = (n: number) => formatNumber(Math.round(n / 10) * 10);

/** The payoff screen: the plan the answers produce, and how each number was reached. */
export function PlanReveal({ plan }: { plan: Plan }) {
  const { colors, spacing } = useTheme();
  const p = plan.profile;
  const units = p.units;
  const t = plan.target;
  const macros = [
    { key: 'protein', label: 'Protein', grams: plan.macros.proteinG, share: plan.macros.split.protein, color: colors.protein },
    { key: 'carbs', label: 'Carbs', grams: plan.macros.carbsG, share: plan.macros.split.carbs, color: colors.carbs },
    { key: 'fat', label: 'Fat', grams: plan.macros.fatG, share: plan.macros.split.fat, color: colors.fat },
  ];
  const goalLine =
    p.goal === 'maintain'
      ? 'Matched to what you burn'
      : `${t.dailyDelta < 0 ? '−' : '+'}${kcal(Math.abs(t.dailyDelta))} kcal a day, about ${formatWeight(Math.abs(t.impliedWeeklyKg), units, 2)} a week`;
  const date = plan.goalDate ? formatLongDate(toISODate(plan.goalDate)).replace(/^\w+, /, '') : null;
  const methodWhy =
    plan.bmrMethod === 'katch-mcardle' && plan.leanMassKg !== null
      ? `From your lean mass of ${formatWeight(plan.leanMassKg, units)} (body fat ${round(p.bodyFatPct ?? 0, 1)}%)`
      : 'From your height, weight, age and sex';

  return (
    <View style={{ gap: spacing.lg }}>
      <FadeIn style={{ gap: spacing.sm, marginBottom: spacing.xs }}>
        <Text variant="overline" color="primary">
          YOUR PLAN IS READY
        </Text>
        <Text variant="h1" accessibilityRole="header">
          {p.name ? `Here's your plan, ${p.name}` : "Here's your plan"}
        </Text>
      </FadeIn>

      <FadeIn delay={120}>
        <Card padding={spacing.xxl} style={{ alignItems: 'center', gap: spacing.lg }} testID="plan-calories">
          <Ring size={196} stroke={16} progress={1} color={colors.calories} colorEnd={colors.weight} trackColor={`${colors.calories}22`}>
            <Text variant="numXL" tabular testID="plan-kcal">
              {formatNumber(t.target)}
            </Text>
            <Text variant="caption" color="textSecondary">
              kcal a day
            </Text>
          </Ring>
          <View style={{ alignItems: 'center', gap: 2 }}>
            <Text variant="bodyStrong" align="center">
              {goalLine}
            </Text>
            <Text variant="caption" color="textSecondary" align="center">
              Logged workouts add their calories on top.
            </Text>
          </View>
        </Card>
      </FadeIn>

      <FadeIn delay={240}>
        <Card style={{ gap: spacing.lg }} testID="plan-macros">
          <View style={{ flexDirection: 'row' }}>
            {macros.map((m) => (
              <View key={m.key} style={{ flex: 1, alignItems: 'center', gap: spacing.sm }}>
                <Ring size={64} stroke={7} progress={m.share} color={m.color} trackColor={`${m.color}22`}>
                  <Text variant="caption" color="textSecondary" tabular>
                    {`${Math.round(m.share * 100)}%`}
                  </Text>
                </Ring>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 2 }}>
                  <Text variant="numM" tabular testID={`plan-${m.key}`}>
                    {String(m.grams)}
                  </Text>
                  <Text variant="caption" color="textSecondary">
                    g
                  </Text>
                </View>
                <Text variant="label" color={m.color}>
                  {m.label}
                </Text>
              </View>
            ))}
          </View>
          <Divider />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <View style={{ width: 40, height: 40, borderRadius: 13, backgroundColor: `${colors.water}22`, alignItems: 'center', justifyContent: 'center' }}>
              <Droplet size={20} color={colors.water} />
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="title">Water</Text>
              <Text variant="caption" color="textSecondary">
                Drinks only; food covers the rest
              </Text>
            </View>
            <Text variant="numM" tabular color="water" testID="plan-water">
              {formatVolume(plan.waterMl, units)}
            </Text>
          </View>
        </Card>
      </FadeIn>

      <FadeIn delay={360}>
        <Card style={{ gap: spacing.md }} testID="plan-math">
          <Text variant="h3">How we worked it out</Text>
          <MathRow label="Resting metabolism" detail={`${METHOD_LABEL[plan.bmrMethod]} equation. ${methodWhy}.`} value={kcal(plan.bmrKcal)} testID="plan-bmr" />
          <MathRow label="Everyday movement" detail={`× ${plan.activityFactor} for your activity level, before workouts`} value={kcal(plan.tdee)} />
          {p.goal !== 'maintain' ? (
            <MathRow
              label={p.goal === 'lose' ? 'Deficit' : 'Surplus'}
              detail={t.limitedByFloor ? `Held at the ${formatNumber(plan.floor)} kcal minimum` : `For ${formatWeight(p.weeklyRateKg, units, 2)} a week (7,700 kcal per kg)`}
              value={`${t.dailyDelta < 0 ? '−' : '+'}${kcal(Math.abs(t.dailyDelta))}`}
            />
          ) : null}
          <Divider />
          <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
            <Text variant="bodyStrong" style={{ flex: 1 }}>
              Daily target
            </Text>
            <Text variant="numM" tabular color="calories">
              {formatNumber(t.target)}
            </Text>
            <Text variant="caption" color="textSecondary">
              {' kcal'}
            </Text>
          </View>
        </Card>
      </FadeIn>

      {date && p.targetWeightKg ? (
        <FadeIn delay={480}>
          <Card style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center' }} testID="plan-date">
            <View style={{ width: 40, height: 40, borderRadius: 13, backgroundColor: `${colors.weight}22`, alignItems: 'center', justifyContent: 'center' }}>
              <CalendarCheck size={20} color={colors.weight} />
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="caption" color="textSecondary">
                {`Projected to reach ${formatWeight(p.targetWeightKg, units)}`}
              </Text>
              <Text variant="h3">{date}</Text>
            </View>
          </Card>
        </FadeIn>
      ) : null}

      <FadeIn delay={600} style={{ flexDirection: 'row', gap: spacing.md, paddingHorizontal: spacing.xs }}>
        <Sparkles size={18} color={colors.primary} />
        <Text variant="caption" color="textSecondary" style={{ flex: 1 }}>
          These are starting estimates. As your weigh-ins and food logs come in, HealthCal measures what you actually burn and adapts your targets. You can adjust any number in Goals.
        </Text>
      </FadeIn>
    </View>
  );
}

function MathRow({ label, detail, value, testID }: { label: string; detail: string; value: string; testID?: string }) {
  const { spacing } = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' }} testID={testID}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="bodyStrong">{label}</Text>
        <Text variant="caption" color="textSecondary">
          {detail}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
        <Text variant="title" tabular>
          {value}
        </Text>
        <Text variant="caption" color="textSecondary">
          {' kcal'}
        </Text>
      </View>
    </View>
  );
}
