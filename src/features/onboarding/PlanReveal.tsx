import { ChevronDown, ChevronLeft, ChevronUp, Sparkles } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { useWindowDimensions, View } from 'react-native';

import { formatNumber, formatVolume, formatWeight, round } from '@/lib/units';
import { useTheme } from '@/theme';
import { AnimatedNumber, Card, CupKey, Divider, FadeUp, haptic, levelY, MacroBar, PressableScale, Text, useReducedMotion, Vessel } from '@/ui';

import { ARRIVAL_POUR } from './components';
import { METHOD_LABEL, type Plan } from './model';
import { looseDate, projectTo, rangeText } from './projection';
import { ProjectionChart } from './ProjectionChart';

const kcal = (n: number) => formatNumber(Math.round(n / 10) * 10);

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
  const narrow = useWindowDimensions().width < 360;
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
  // The goal and its dates lead; without a road to draw (maintaining, or no target weight) the day itself does.
  const title = projection
    ? `${name ? `${name}, you` : 'You'} could reach ${formatWeight(projection.targetKg, units)} ${range}`
    : `${name ? `${name}, here's` : "Here's"} your day`;
  const pace = formatWeight(Math.abs(t.impliedWeeklyKg), units, 2);
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
        <Text variant="h1" accessibilityRole="header" testID="plan-title" style={narrow ? undefined : { fontSize: 32, lineHeight: 36 }}>
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
            accessibilityLabel={`The road to ${formatWeight(projection.targetKg, units)}: ${range}, around ${looseDate(projection.date, now)} at about ${pace} a week. A projection, not a promise.`}>
            <View style={{ gap: spacing.xs }}>
              <Text variant="h3">{`The road to ${formatWeight(projection.targetKg, units)}`}</Text>
              <Text variant="caption" color="textSecondary" testID="plan-date">
                {`${range.charAt(0).toUpperCase() + range.slice(1)}. The line is the pace you chose, about ${pace} a week; the band is a little faster or slower.`}
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

      {/* On the page background, so an underlined text link in the text colour, not primary. */}
      <PressableScale
        testID="onb-change-answers"
        onPress={onChangeAnswers}
        feedback="tap"
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Change answers"
        style={{ alignSelf: 'center', minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md }}>
        <ChevronLeft size={16} color={colors.textSecondary} strokeWidth={2.2} />
        <Text variant="label" color="textSecondary" style={{ textDecorationLine: 'underline' }}>
          Change answers
        </Text>
      </PressableScale>
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
 * The plan as a cup. For weight loss its capacity is what you burn in a day:
 * it pours to the daily budget while the number counts up with it, the level
 * line lands on the budget, and the space left above it is the gap to what
 * you burn, labelled with what it is for. For gain the cup is the budget, and
 * what you burn is a dashed mark across it with the surplus labelled above.
 */
function BudgetVessel({ target, tdee, goal }: { target: number; tdee: number; goal: 'lose' | 'maintain' | 'gain' }) {
  const { colors } = useTheme();
  const top = Math.max(target, tdee);
  const gap = Math.round(tdee - target);
  const showBurn = Math.abs(gap) >= 5;
  // The burn level sits inside the cup when the budget is above it (a surplus).
  const burnInside = showBurn && gap < 0;
  const narrow = useWindowDimensions().width < 360;
  const fontSize = narrow ? 46 : 58;
  const width = narrow ? 92 : 110;
  const height = narrow ? 236 : 260;
  const burnLabel = (
    <View style={{ flexDirection: 'row', gap: 6 }}>
      {/* The key for the dashed mark in the cup. */}
      {burnInside ? <View style={{ width: 12, height: 0, marginTop: 10, borderTopWidth: 1.5, borderStyle: 'dashed', borderColor: colors.text }} /> : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="numM" style={{ fontSize: 18, lineHeight: 22 }}>
          {kcal(tdee)}
          <Text variant="unit"> kcal</Text>
        </Text>
        <Text variant="caption" color="textSecondary">
          what you burn a day
        </Text>
      </View>
    </View>
  );
  return (
    <View>
      <Vessel
        value={target}
        max={top}
        color={colors.calories}
        width={width}
        height={height}
        duration={ARRIVAL_POUR}
        delay={POUR_DELAY}
        testID="plan-vessel"
        accessibilityLabel={`Daily budget ${formatNumber(target)} kcal${showBurn ? `, against about ${kcal(tdee)} kcal you burn` : ''}`}
        labels={[
          ...(showBurn ? [{ key: 'burn', at: tdee, height: 40, tick: burnInside ? undefined : colors.vesselEdge, content: burnLabel }] : []),
          ...(showBurn && goal !== 'maintain'
            ? [
                {
                  key: 'gap',
                  at: (target + tdee) / 2,
                  height: 22,
                  content: (
                    <Text variant="label" color="textSecondary" testID="plan-gap">
                      {`${gap > 0 ? '−' : '+'}${kcal(Math.abs(gap))} for your goal`}
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
      {burnInside ? (
        // What you burn, as a dashed mark across the cup at its level (the key beside the label matches it).
        <View
          pointerEvents="none"
          style={{ position: 'absolute', left: 5, width: width - 10, top: Math.round(levelY(tdee, top, height - 1.5)), height: 0, borderTopWidth: 1.5, borderStyle: 'dashed', borderColor: colors.text }}
        />
      ) : null}
    </View>
  );
}
