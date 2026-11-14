import { CalendarRange, Sparkles } from 'lucide-react-native';
import React from 'react';
import { useWindowDimensions, View } from 'react-native';

import { formatNumber, formatVolume, formatWeight, round } from '@/lib/units';
import { useTheme } from '@/theme';
import { Card, CupKey, Divider, MacroBar, Text, Vessel } from '@/ui';

import { FadeIn } from './components';
import { METHOD_LABEL, type Plan } from './model';
import { projectTo, rangeText, shortDate } from './projection';
import { ProjectionChart } from './ProjectionChart';

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
    p.goal === 'maintain' || Math.abs(t.dailyDelta) < 5
      ? 'Matched to what you burn'
      : `${t.dailyDelta < 0 ? '−' : '+'}${kcal(Math.abs(t.dailyDelta))} kcal a day, about ${formatWeight(Math.abs(t.impliedWeeklyKg), units, 2)} a week`;
  const water = formatVolume(plan.waterMl, units);
  const wi = water.indexOf(' ');
  const waterNum = wi > 0 ? water.slice(0, wi) : water;
  const waterUnit = wi > 0 ? water.slice(wi + 1) : '';
  const projection = p.goal !== 'maintain' ? projectTo(p.weightKg, p.targetWeightKg, t.impliedWeeklyKg) : null;
  const range = projection ? rangeText(projection) : '';
  const methodWhy =
    plan.bmrMethod === 'katch-mcardle' && plan.leanMassKg !== null
      ? `From your lean mass of ${formatWeight(plan.leanMassKg, units)} (body fat ${round(p.bodyFatPct ?? 0, 1)}%)`
      : 'From your height, weight, age and sex';

  return (
    <View style={{ gap: spacing.lg }}>
      <FadeIn style={{ gap: spacing.sm, marginBottom: spacing.xs }}>
        <Text variant="overline">Your plan is ready</Text>
        <Text variant="h1" accessibilityRole="header">
          {p.name ? `Here's your plan, ${p.name}` : "Here's your plan"}
        </Text>
      </FadeIn>

      <FadeIn delay={120}>
        <Card padding={spacing.xl} style={{ gap: spacing.lg }} testID="plan-calories">
          <BudgetVessel target={t.target} tdee={plan.tdee} goal={p.goal} />
          <View style={{ gap: 2, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md }}>
            <Text variant="bodyStrong">{goalLine}</Text>
            <Text variant="caption" color="textSecondary">
              Logged workouts add their calories on top, as hatched headroom in the cup.
            </Text>
          </View>
        </Card>
      </FadeIn>

      <FadeIn delay={240}>
        <Card style={{ gap: spacing.lg }} testID="plan-macros">
          <MacroBar protein={plan.macros.split.protein} carbs={plan.macros.split.carbs} fat={plan.macros.split.fat} height={10} />
          <View style={{ flexDirection: 'row' }}>
            {macros.map((m, i) => (
              <View
                key={m.key}
                style={{ flex: 1, minWidth: 0, gap: 2, paddingLeft: i ? spacing.md : 0, borderLeftWidth: i ? 1 : 0, borderLeftColor: colors.border }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <CupKey color={m.color} />
                  <Text variant="label" color="textSecondary" numberOfLines={1}>
                    {m.label}
                  </Text>
                </View>
                <Text variant="numL" testID={`plan-${m.key}`}>
                  {String(m.grams)}
                  <Text variant="unit"> g</Text>
                </Text>
                <Text variant="caption" color="textSecondary" numberOfLines={1}>
                  {`${Math.round(m.share * 100)}% of calories`}
                </Text>
              </View>
            ))}
          </View>
          <Divider />
          <View style={{ gap: 2 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <CupKey color={colors.water} />
              <Text variant="label" color="textSecondary">
                Water
              </Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: spacing.md }}>
              <Text variant="numL" testID="plan-water">
                {waterNum}
                {waterUnit ? <Text variant="unit">{` ${waterUnit}`}</Text> : null}
              </Text>
              <Text variant="caption" color="textSecondary" align="right" style={{ flexShrink: 1 }}>
                Drinks only; food covers the rest
              </Text>
            </View>
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
              detail={
                t.belowFloor
                  ? 'None planned: your burn is already at the recommended minimum'
                  : t.limitedByFloor
                  ? `Held at the ${formatNumber(plan.floor)} kcal minimum`
                  : `For ${formatWeight(p.weeklyRateKg, units, 2)} a week (${units === 'imperial' ? '3,500 kcal per lb' : '7,700 kcal per kg'})`
              }
              value={`${t.dailyDelta < 0 ? '−' : '+'}${kcal(Math.abs(t.dailyDelta))}`}
            />
          ) : null}
          <Divider />
          <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
            <Text variant="bodyStrong" style={{ flex: 1 }}>
              Daily target
            </Text>
            <Text variant="numM" color="caloriesInk">
              {formatNumber(t.target)}
              <Text variant="unit"> kcal</Text>
            </Text>
          </View>
        </Card>
      </FadeIn>

      {projection ? (
        <FadeIn delay={480}>
          <Card
            style={{ gap: spacing.md }}
            testID="plan-projection"
            accessible
            accessibilityLabel={`Projected to reach ${formatWeight(projection.targetKg, units)} ${range}, about ${shortDate(projection.date)} at this pace. A projection, not a promise.`}>
            <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center' }}>
              <CalendarRange size={22} color={colors.text} strokeWidth={1.9} />
              <View style={{ flex: 1 }}>
                <Text variant="caption" color="textSecondary">
                  {`Projected to reach ${formatWeight(projection.targetKg, units)}`}
                </Text>
                <Text variant="h3" testID="plan-date">
                  {range.charAt(0).toUpperCase() + range.slice(1)}
                </Text>
              </View>
            </View>
            <ProjectionChart projection={projection} units={units} />
            <Text variant="caption" color="textSecondary">
              A projection, not a promise. It redraws from your real trend.
            </Text>
          </Card>
        </FadeIn>
      ) : null}

      <FadeIn delay={600} style={{ flexDirection: 'row', gap: spacing.md, paddingHorizontal: spacing.xs }}>
        <Sparkles size={18} color={colors.textSecondary} strokeWidth={1.9} />
        <Text variant="caption" color="textSecondary" style={{ flex: 1 }}>
          These are starting estimates. As your weigh-ins and food logs come in, HealthCal measures what you actually burn and adapts your targets. You can
          adjust any number in Goals.
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
      <Text variant="numM" style={{ fontSize: 17, lineHeight: 22 }}>
        {value}
        <Text variant="unit"> kcal</Text>
      </Text>
    </View>
  );
}

/**
 * The plan as a cup. Its capacity is what you burn in a day; it fills to the
 * daily budget, with the level line on the budget. For weight loss the space
 * left above the level is the deficit; for gain the cup is the budget and a
 * tick marks what you burn below it. Pours in when the plan appears.
 */
function BudgetVessel({ target, tdee, goal }: { target: number; tdee: number; goal: 'lose' | 'maintain' | 'gain' }) {
  const { colors } = useTheme();
  const top = Math.max(target, tdee);
  const gap = Math.round(tdee - target);
  const showBurn = Math.abs(gap) >= 5;
  const narrow = useWindowDimensions().width < 360;
  return (
    <Vessel
      value={target}
      max={top}
      color={colors.calories}
      width={narrow ? 66 : 80}
      height={210}
      testID="plan-vessel"
      accessibilityLabel={`Daily budget ${formatNumber(target)} kcal${showBurn ? `, against about ${kcal(tdee)} kcal you burn` : ''}`}
      labels={[
        ...(showBurn
          ? [
              {
                key: 'burn',
                at: tdee,
                height: 40,
                tick: colors.vesselEdge,
                content: (
                  <View>
                    <Text variant="numM" style={{ fontSize: 17, lineHeight: 21 }}>
                      {kcal(tdee)}
                      <Text variant="unit"> kcal</Text>
                    </Text>
                    <Text variant="caption" color="textSecondary">
                      what you burn a day
                    </Text>
                  </View>
                ),
              },
            ]
          : []),
        ...(goal === 'lose' && gap >= 5
          ? [
              {
                key: 'gap',
                at: target + gap / 2,
                height: 20,
                content: (
                  <Text variant="caption" color="textSecondary">
                    {`−${kcal(gap)} for your goal`}
                  </Text>
                ),
              },
            ]
          : []),
        {
          key: 'budget',
          at: target,
          height: 74,
          tick: colors.rim,
          content: (
            <View>
              <Text variant="numXL" color="caloriesInk" testID="plan-kcal" style={narrow ? { fontSize: 44, lineHeight: 46 } : { fontSize: 52, lineHeight: 54 }}>
                {formatNumber(target)}
              </Text>
              <Text variant="unit">kcal a day</Text>
            </View>
          ),
        },
      ]}
    />
  );
}
