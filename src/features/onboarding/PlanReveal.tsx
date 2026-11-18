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
  const winW = useWindowDimensions().width;
  const narrow = winW < 360;
  const [showMath, setShowMath] = useState(false);
  const p = plan.profile;
  const units = p.units;
  const t = plan.target;
  const macros = [
    { key: 'protein', label: 'Protein', grams: plan.macros.proteinG, share: plan.macros.split.protein, color: colors.protein },
    { key: 'carbs', label: 'Carbs', grams: plan.macros.carbsG, share: plan.macros.split.carbs, color: colors.carbs },
    { key: 'fat', label: 'Fat', grams: plan.macros.fatG, share: plan.macros.split.fat, color: colors.fat },
  ];
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
  // A long name goes to the overline, so the headline stays three or four lines on a small phone.
  const nameInTitle = name.length > 0 && name.length <= 12;
  // The overline keeps the name only while it fits one line (about 8.6 px a capital at 11.5 px with its
  // letter spacing), so no word of it is left alone on a second line ("… YOUR PLAN IS" / "READY").
  const withName = `${name}, your plan is ready`;
  const overline = name && !nameInTitle && withName.length * 8.6 <= Math.min(winW, 560) - 40 ? withName : 'Your plan is ready';
  // The goal and its dates lead; without a road to draw (maintaining, or no target weight) the day itself does.
  // A no-break space keeps the weight and its unit on one line.
  const title = projection
    ? `${nameInTitle ? `${name}, you` : 'You'} could reach ${formatWeight(projection.targetKg, units).replace(/ /g, '\u00A0')}`
    : `${nameInTitle ? `${name}, here's` : "Here's"} your day`;
  const pace = formatWeight(Math.abs(t.impliedWeeklyKg), units, 2);
  // Beside the foot of the cup: what the cup cannot show. The pace is on the road card when there is a road, and a matched budget has none.
  const budgetNote = projection || Math.abs(t.dailyDelta) < 5 ? '' : `About ${pace} a week. `;
  // The rest arrives as the pour lands, one piece after another.
  const landed = reduce ? 0 : POUR_DELAY + ARRIVAL_POUR;

  // A light confirmation when the cup lands.
  useEffect(() => {
    const id = setTimeout(() => haptic.success(), reduce ? 0 : POUR_DELAY + ARRIVAL_POUR);
    return () => clearTimeout(id);
  }, [reduce]);

  return (
    <View style={{ gap: spacing.lg }} testID="plan-reveal">
      <FadeUp style={{ gap: spacing.xs, marginBottom: spacing.xs }}>
        <Text variant="overline" color="textSecondary" style={{ marginBottom: spacing.xs }}>
          {overline}
        </Text>
        {/* One heading in two sizes: the claim, then its dates in the brand ink. A screen reader gets one sentence. */}
        <View accessible accessibilityRole="header" accessibilityLabel={projection ? `${title} ${range}` : title} testID="plan-title">
          <Text variant="h1" style={narrow ? undefined : { fontSize: 32, lineHeight: 36 }}>
            {title}
          </Text>
          {projection ? (
            <Text variant="h2" color="primaryInk" testID="plan-when" style={narrow ? undefined : { fontSize: 24, lineHeight: 30, letterSpacing: -0.4 }}>
              {range}
            </Text>
          ) : null}
        </View>
        {projection ? (
          <Text variant="body" color="textSecondary">
            {t.limitedByFloor ? 'An estimate at this budget.' : 'An estimate at the pace you chose.'}
          </Text>
        ) : null}
      </FadeUp>

      <FadeUp delay={60}>
        <Card padding={spacing.xl} style={{ gap: spacing.lg }} testID="plan-calories">
          <Text variant="overline" color="textSecondary">
            Your daily budget
          </Text>
          <BudgetVessel target={t.target} tdee={plan.tdee} goal={p.goal} note={`${budgetNote}Each workout you log adds its calories on top, shared over 7 days, as hatched headroom.`} />
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
                {/* The dates are the title's; this line says what the line and the band are. */}
                {`About ${pace} a week, ${t.limitedByFloor ? 'the pace this budget gives' : 'the pace you chose'}. The band is a little faster or slower.`}
              </Text>
            </View>
            {/* The road draws once its card has arrived. */}
            <ProjectionChart projection={projection} units={units} delay={landed + 160} />
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
                <Text variant="caption" color="textSecondary" numberOfLines={1} accessibilityLabel={`${Math.round(m.share * 100)}% of calories`}>
                  {/* Three columns on a small phone have no room for the words; the bar above them says what the share is of. */}
                  {narrow ? `${Math.round(m.share * 100)}%` : `${Math.round(m.share * 100)}% of calories`}
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
            <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', columnGap: spacing.md, flexWrap: 'wrap' }}>
              {/* The number and its unit never part; on a small phone the note drops under them. */}
              <Text variant="numL" testID="plan-water" numberOfLines={1} style={{ flexShrink: 0 }}>
                {waterNum}
                {waterUnit ? <Text variant="unit">{` ${waterUnit}`}</Text> : null}
              </Text>
              <Text variant="caption" color="textSecondary">
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
            </FadeUp>
          ) : null}
        </Card>
      </FadeUp>

      {/* Always in view, not folded away with the working: these numbers are where the plan starts. */}
      <FadeUp delay={landed + (projection ? 260 : 140)} style={{ flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.xs }}>
        <Sparkles size={16} color={colors.textSecondary} strokeWidth={1.9} />
        <Text variant="caption" color="textSecondary" style={{ flex: 1 }} testID="plan-estimates-note">
          Starting estimates: they adapt to what you really burn as you log. Change any number in Goals.
        </Text>
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
 * A budget equal to the burn fills the cup and says so. `note` sits beside the
 * foot of the cup, under the labels.
 */
function BudgetVessel({ target, tdee, goal, note }: { target: number; tdee: number; goal: 'lose' | 'maintain' | 'gain'; note: string }) {
  const { colors } = useTheme();
  // The burn as it is printed (to the nearest 10, like the budget), so the three numbers add up on screen.
  const burn = Math.round(tdee / 10) * 10;
  const top = Math.max(target, burn);
  const gap = burn - target;
  const showBurn = gap !== 0;
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
          {formatNumber(burn)}
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
        // 10 px between labels keeps 8 px between their letters at every plan (keeping weight puts
        // "Matches your burn" right under the number; gaining puts the surplus over the burn).
        labelSpacing={10}
        accessibilityLabel={`Daily budget ${formatNumber(target)} kcal${showBurn ? `, against about ${formatNumber(burn)} kcal you burn` : ', matched to what you burn'}`}
        labels={[
          ...(showBurn ? [{ key: 'burn', at: burn, height: 40, tick: burnInside ? undefined : colors.vesselEdge, content: burnLabel }] : []),
          ...(showBurn && goal !== 'maintain'
            ? [
                {
                  key: 'gap',
                  at: (target + burn) / 2,
                  height: 22,
                  content: (
                    <Text variant="label" color="textSecondary" testID="plan-gap">
                      {`${gap > 0 ? '−' : '+'}${formatNumber(Math.abs(gap))} for your goal`}
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
          // A budget equal to the burn fills the cup to the top; say so right under the number.
          ...(showBurn
            ? []
            : [
                {
                  key: 'match',
                  at: target * 0.98,
                  height: 22,
                  content: (
                    <Text variant="label" color="textSecondary" testID="plan-matched">
                      Matches your burn
                    </Text>
                  ),
                },
              ]),
        ]}>
        {/* The room beside the foot of the cup holds the one thing the cup does not show yet. */}
        <Text variant="caption" color="textSecondary" testID="plan-budget-note">
          {note}
        </Text>
      </Vessel>
      {burnInside ? (
        // What you burn, as a dashed mark across the cup at its level (the key beside the label matches it).
        <View
          pointerEvents="none"
          style={{ position: 'absolute', left: 5, width: width - 10, top: Math.round(levelY(burn, top, height - 1.5)), height: 0, borderTopWidth: 1.5, borderStyle: 'dashed', borderColor: colors.text }}
        />
      ) : null}
    </View>
  );
}
