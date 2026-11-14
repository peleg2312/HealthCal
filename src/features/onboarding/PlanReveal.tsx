import { ChevronDown, ChevronUp, RotateCcw, Sparkles } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { useWindowDimensions, View } from 'react-native';

import { formatNumber, formatVolume, formatWeight, round } from '@/lib/units';
import { motion, useTheme } from '@/theme';
import { AnimatedNumber, Button, Card, CupKey, Divider, FadeUp, haptic, MacroBar, PressableScale, Text, useReducedMotion, Vessel } from '@/ui';

import { METHOD_LABEL, type Plan } from './model';
import { looseDate, projectTo, rangeText } from './projection';
import { ProjectionChart } from './ProjectionChart';

const kcal = (n: number) => formatNumber(Math.round(n / 10) * 10);

/**
 * The arrival moments (the plan reveal, the welcome cup) pour a little longer
 * than a screen's cup: once, at a moment that deserves it. Never faster than
 * the kit's pour.
 */
export const ARRIVAL_POUR = Math.round(motion.duration.pour * 1.45);
/** The cup starts pouring once the title has faded up. */
const POUR_DELAY = 220;

/**
 * The payoff: an arrival, not another question. The goal and its dates at
 * the top, the cup pouring the daily budget while the number counts up, the
 * road to the goal drawing itself, then macros and water. How it was worked
 * out is one row that opens in place.
 */
export function PlanReveal({ plan, now, onChangeAnswers }: { plan: Plan; now: Date; onChangeAnswers: () => void }) {
  const { colors, spacing } = useTheme();
  const reduce = useReducedMotion();
  const [showMath, setShowMath] = useState(false);
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
  const projection = p.goal !== 'maintain' ? projectTo(p.weightKg, p.targetWeightKg, t.impliedWeeklyKg, now) : null;
  const range = projection ? rangeText(projection, now) : '';
  const methodWhy =
    plan.bmrMethod === 'katch-mcardle' && plan.leanMassKg !== null
      ? `From your lean mass of ${formatWeight(plan.leanMassKg, units)} (body fat ${round(p.bodyFatPct ?? 0, 1)}%)`
      : 'From your height, weight, age and sex';
  const name = p.name;
  const title = projection
    ? `${name ? `${name}, you` : 'You'} could reach ${formatWeight(projection.targetKg, units)} ${range}`
    : `${name ? `${name}, here's` : "Here's"} your day`;
  // The rest arrives as the pour lands, one piece after another.
  const landed = reduce ? 0 : POUR_DELAY + ARRIVAL_POUR;

  // A light confirmation when the cup lands.
  useEffect(() => {
    const id = setTimeout(() => haptic.success(), reduce ? 0 : POUR_DELAY + ARRIVAL_POUR);
    return () => clearTimeout(id);
  }, [reduce]);

  return (
    <View style={{ gap: spacing.lg }} testID="plan-reveal">
      <FadeUp style={{ gap: spacing.sm, marginBottom: spacing.xs }}>
        <Text variant="overline" color="textSecondary">
          Your plan is ready
        </Text>
        <Text variant="h1" accessibilityRole="header" testID="plan-title" style={{ fontSize: 32, lineHeight: 36 }}>
          {title}
        </Text>
        {projection ? (
          <Text variant="body" color="textSecondary">
            An estimate at the pace you chose.
          </Text>
        ) : null}
      </FadeUp>

      <FadeUp delay={60}>
        <Card padding={spacing.xl} style={{ gap: spacing.lg }} testID="plan-calories">
          <Text variant="overline" color="textSecondary">
            Your daily budget
          </Text>
          <BudgetVessel target={t.target} tdee={plan.tdee} goal={p.goal} />
          <View style={{ gap: 2, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md }}>
            <Text variant="bodyStrong">{goalLine}</Text>
            <Text variant="caption" color="textSecondary">
              Logged workouts add their calories on top, as hatched headroom in the cup.
            </Text>
          </View>
        </Card>
      </FadeUp>

      {projection ? (
        <FadeUp delay={landed}>
          <Card
            style={{ gap: spacing.md }}
            testID="plan-projection"
            accessible
            accessibilityLabel={`Projected to reach ${formatWeight(projection.targetKg, units)} ${range}, around ${looseDate(projection.date, now)} at this pace. A projection, not a promise.`}>
            <View style={{ gap: 2 }}>
              <Text variant="caption" color="textSecondary">
                {`Projected to reach ${formatWeight(projection.targetKg, units)}`}
              </Text>
              <Text variant="h2" testID="plan-date">
                {range.charAt(0).toUpperCase() + range.slice(1)}
              </Text>
            </View>
            <ProjectionChart projection={projection} units={units} delay={reduce ? 0 : 120} />
            <Text variant="caption" color="textSecondary">
              A projection, not a promise. It redraws from your real trend.
            </Text>
          </Card>
        </FadeUp>
      ) : null}

      <FadeUp delay={landed + (projection ? 120 : 0)}>
        <Card style={{ gap: spacing.lg }} testID="plan-macros">
          <MacroBar protein={plan.macros.split.protein} carbs={plan.macros.split.carbs} fat={plan.macros.split.fat} height={10} />
          <View style={{ flexDirection: 'row' }}>
            {macros.map((m, i) => (
              <View key={m.key} style={{ flex: 1, minWidth: 0, gap: 2, paddingLeft: i ? spacing.md : 0, borderLeftWidth: i ? 1 : 0, borderLeftColor: colors.border }}>
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
      </FadeUp>

      <FadeUp delay={landed + (projection ? 200 : 80)}>
        <Card padding={0} style={{ paddingHorizontal: spacing.lg }}>
          <PressableScale
            testID="plan-math-toggle"
            onPress={() => setShowMath(!showMath)}
            feedback="tap"
            scaleTo={0.99}
            accessibilityRole="button"
            accessibilityState={{ expanded: showMath }}
            accessibilityLabel="See how we worked it out"
            style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 56 }}>
            <Text variant="title" style={{ flex: 1 }}>
              See how we worked it out
            </Text>
            {showMath ? <ChevronUp size={20} color={colors.textSecondary} strokeWidth={2} /> : <ChevronDown size={20} color={colors.textSecondary} strokeWidth={2} />}
          </PressableScale>
          {showMath ? (
            <FadeUp style={{ gap: spacing.md, paddingBottom: spacing.lg }} testID="plan-math">
              <Divider />
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
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                <Sparkles size={16} color={colors.textSecondary} strokeWidth={1.9} />
                <Text variant="caption" color="textSecondary" style={{ flex: 1 }}>
                  These are starting estimates. As your weigh-ins and food logs come in, HealthCal measures what you actually burn and adapts your targets. You can
                  adjust any number in Goals.
                </Text>
              </View>
            </FadeUp>
          ) : null}
        </Card>
      </FadeUp>

      <View style={{ alignItems: 'center' }}>
        <Button
          title="Change answers"
          variant="ghost"
          size="sm"
          full={false}
          testID="onb-change-answers"
          icon={<RotateCcw size={16} color={colors.primary} strokeWidth={2.2} />}
          onPress={onChangeAnswers}
        />
      </View>
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
 * The plan as a cup. Its capacity is what you burn in a day; it pours to the
 * daily budget while the number counts up with it, and the level line lands
 * on the budget. For weight loss the space left above the level is the gap
 * to what you burn, labelled with what it is for; for gain the cup is the
 * budget and a tick marks what you burn below it.
 */
function BudgetVessel({ target, tdee, goal }: { target: number; tdee: number; goal: 'lose' | 'maintain' | 'gain' }) {
  const { colors } = useTheme();
  const top = Math.max(target, tdee);
  const gap = Math.round(tdee - target);
  const showBurn = Math.abs(gap) >= 5;
  const narrow = useWindowDimensions().width < 360;
  const fontSize = narrow ? 46 : 58;
  return (
    <Vessel
      value={target}
      max={top}
      color={colors.calories}
      width={narrow ? 92 : 110}
      height={narrow ? 236 : 260}
      duration={ARRIVAL_POUR}
      delay={POUR_DELAY}
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
                    <Text variant="numM" style={{ fontSize: 18, lineHeight: 22 }}>
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
                height: 22,
                tick: colors.borderStrong,
                content: (
                  <Text variant="label" color="textSecondary" testID="plan-gap">
                    {`−${kcal(gap)} for your goal`}
                  </Text>
                ),
              },
            ]
          : []),
        {
          key: 'budget',
          at: target,
          height: fontSize + 22,
          tick: colors.rim,
          content: (
            <View>
              <AnimatedNumber
                variant="numXL"
                color="caloriesInk"
                testID="plan-kcal"
                value={target}
                from={0}
                duration={ARRIVAL_POUR}
                delay={POUR_DELAY}
                format={(n) => formatNumber(Math.round(n))}
                style={{ fontSize, lineHeight: fontSize + 2 }}
              />
              <Text variant="unit">kcal a day</Text>
            </View>
          ),
        },
      ]}
    />
  );
}
