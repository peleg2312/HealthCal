import { router } from 'expo-router';
import React from 'react';
import { useWindowDimensions, View } from 'react-native';

import { formatNumber } from '@/lib/units';
import { SLEEP_RANGE } from '@/features/trackers/helpers';
import { motion, useTextSize, useTheme, withOpacity } from '@/theme';
import type { ISODate, UnitSystem } from '@/types';
import { AnimatedNumber, CupKey, figure, PressableScale, Text, Trough } from '@/ui';

import { budgetShare, hoursAndMinutes, spokenHours, waterFigures } from './figures';
import { leaveMorningTo } from './leave';

export interface FiguresDay {
  date: ISODate;
  kcal: number;
  budget: number;
  headroom: number;
  protein: number;
  proteinG: number;
  waterMl: number;
  waterGoalMl: number;
  foodLogged: boolean;
  complete: boolean;
  approx: boolean;
}

/**
 * The calorie figure's name: what it shows, as drawn and in its order (WCAG 2.5.3, label in name: "Eaten, 95% of
 * 2,190 kcal"), then the verdict the cell leaves to its trough. `share` is the share of the budget drawn instead of
 * the calories (null when the calories are drawn).
 */
function calorieLabel(d: FiguresDay, share: number | null): string {
  if (!d.foodLogged) return 'Eaten, not logged';
  const shown = `${d.approx ? '~' : ''}${formatNumber(share ?? d.kcal)}${share !== null ? '%' : ''}`;
  if (d.budget <= 0) return `Eaten, ${shown} kcal`;
  if (!d.complete) return `Eaten, ${shown} partly logged`;
  const head = `Eaten, ${shown} of ${formatNumber(d.budget)} kcal`;
  if (d.kcal <= d.budget) return `${head}, within the day's budget`;
  // Above is anything over the budget (`budgetMark`), said with its amount, never "within 10%".
  return `${head}, ${formatNumber(d.kcal - d.budget)} kcal above the day's budget`;
}

/**
 * Yesterday's four figures on the morning page, as a 2 x 2 grid: eaten, protein, water and last
 * night's sleep. Each is its data key and name, one large number, "of <goal> <unit>" and a trough
 * of where it stood, judged against yesterday's own goal (calories a limit, the rest goals to
 * reach). The calorie figure opens yesterday in the diary; a missing night offers "Add".
 *
 * Yesterday's calories are said once on the page: when the week picture shows them over its large
 * cup (`kcalShown`), a fully logged day's Eaten cell shows its share of the budget instead
 * ("95" "%" over "of 2,170 kcal"), so the cell is never an empty band or a caption starting
 * with "of". Sleep is hours and minutes, the form the lists use.
 */
export function YesterdayFigures({ day, sleepHours, units, kcalShown }: { day: FiguresDay; sleepHours: number | null; units: UnitSystem; kcalShown: boolean }) {
  const { colors, spacing, chartFill } = useTheme();
  // From 130% text a figure's name and its "of 2,190 kcal" wrap rather than end in an ellipsis.
  const textSize = useTextSize();
  const lines = textSize >= 1.3 ? undefined : 1;
  const narrow = useWindowDimensions().width < 360;
  const numStyle = narrow ? { fontSize: 26, lineHeight: 30 } : undefined;
  const water = waterFigures(day.waterMl, day.waterGoalMl, units);
  const proteinReached = day.proteinG > 0 && day.protein >= day.proteinG;
  const waterReached = day.waterGoalMl > 0 && day.waterMl >= day.waterGoalMl;
  const key = (id: string) => `morning-${day.date}-${id}`;
  const delay = (i: number) => 4 * motion.duration.stagger + i * motion.duration.stagger;
  // Two figures a line; from 150% text one a line, so "of 2,190 kcal" keeps its number with its unit.
  const tile = { flexBasis: textSize >= 1.5 ? '100%' : '45%', flexGrow: 1, minWidth: 0, minHeight: 44 } as const;
  // With the calories shown over the week's large cup, a fully logged day shows its share of the budget here instead.
  const share = kcalShown && day.foodLogged && day.complete ? budgetShare(day.kcal, day.budget) : null;
  const slept = sleepHours !== null ? hoursAndMinutes(sleepHours) : null;

  const head = (color: string, label: string, variant: 'filled' | 'dashed' = 'filled') => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
      <CupKey color={color} variant={variant} />
      <Text variant="label" color="textSecondary" numberOfLines={lines} style={{ flexShrink: 1 }}>
        {label}
      </Text>
    </View>
  );
  const dash = (
    <Text variant="numL" color="textSecondary" style={numStyle} numberOfLines={1}>
      –
    </Text>
  );
  const caption = (text: string) => (
    <Text variant="caption" color="textSecondary" numberOfLines={lines} style={{ marginBottom: spacing.sm }}>
      {text}
    </Text>
  );

  return (
    <View testID="morning-cups" style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing.xl, rowGap: spacing.xl }}>
      <PressableScale testID="morning-cal" accessibilityRole="link" accessibilityLabel={calorieLabel(day, share)} accessibilityHint="Opens the diary for that day" scaleTo={0.97} onPress={() => leaveMorningTo(`/diary?date=${day.date}`)} style={tile}>
        {head(colors.calories, 'Eaten', day.foodLogged ? 'filled' : 'dashed')}
        {share !== null ? (
          // The calories are over the week's large cup: here, the share of the day's budget, read with the caption ("95% of 2,170 kcal").
          <AnimatedNumber variant="numL" color="caloriesInk" style={numStyle} numberOfLines={1} value={share} delay={delay(0)} memoryKey={key('share')} format={(n) => `${day.approx ? '~' : ''}${formatNumber(n)}`} testID="morning-cal-value">
            <Text variant="unit" color="textSecondary">
              %
            </Text>
          </AnimatedNumber>
        ) : day.foodLogged ? (
          <AnimatedNumber
            variant="numL"
            color="caloriesInk"
            style={numStyle}
            numberOfLines={1}
            value={day.kcal}
            delay={delay(0)}
            memoryKey={key('cal')}
            format={(n) => `${day.approx ? '~' : ''}${formatNumber(n)}`}
            testID="morning-cal-value"
          />
        ) : (
          dash
        )}
        <View>
          {caption(!day.foodLogged ? 'not logged' : day.budget <= 0 ? 'kcal' : !day.complete ? 'partly logged' : `of ${formatNumber(day.budget)} kcal`)}
          <Trough
            value={day.foodLogged ? day.kcal : 0}
            max={Math.max(0, day.budget)}
            headroom={day.headroom}
            color={day.foodLogged && !day.complete ? withOpacity(colors.calories, chartFill) : colors.calories}
            height={10}
            delay={delay(0)}
            memoryKey={key('cal')}
          />
        </View>
      </PressableScale>

      <View testID="morning-protein" {...figure(day.foodLogged ? `Protein, ${Math.round(day.protein)} of ${Math.round(day.proteinG)} grams${proteinReached ? ', goal reached' : ''}` : 'Protein, not logged')} style={tile}>
        {head(colors.protein, 'Protein', day.foodLogged ? 'filled' : 'dashed')}
        {day.foodLogged ? <AnimatedNumber variant="numL" style={numStyle} numberOfLines={1} value={Math.round(day.protein)} delay={delay(1)} memoryKey={key('protein')} /> : dash}
        {caption(day.foodLogged ? `of ${Math.round(day.proteinG)} g` : 'not logged')}
        <Trough value={day.foodLogged ? day.protein : 0} max={day.proteinG} goalKind="reach" color={colors.protein} height={10} delay={delay(1)} memoryKey={key('protein')} />
      </View>

      <View testID="morning-water" {...figure(`Water, ${water.value} of ${water.goal.replace(/\s\S.*$/, '')} ${water.spokenUnit}${waterReached ? ', goal reached' : ''}`)} style={tile}>
        {head(colors.water, 'Water')}
        <AnimatedNumber variant="numL" style={numStyle} numberOfLines={1} value={day.waterMl} delay={delay(2)} memoryKey={key('water')} format={(n) => waterFigures(n, day.waterGoalMl, units).value} />
        {caption(`of ${water.goal}`)}
        <Trough value={day.waterMl} max={day.waterGoalMl} goalKind="reach" color={colors.water} height={10} delay={delay(2)} memoryKey={key('water')} />
      </View>

      {sleepHours !== null ? (
        <View testID="morning-sleep" {...figure(`Sleep last night, ${spokenHours(sleepHours)}`)} style={tile}>
          {head(colors.sleep, 'Sleep')}
          {/* Hours and minutes, as the lists say it ("7 h 30 min"), never a decimal. */}
          <Text variant="numL" style={numStyle} numberOfLines={1} testID="morning-sleep-value">
            {slept!.h > 0 || slept!.m === 0 ? String(slept!.h) : ''}
            {slept!.h > 0 || slept!.m === 0 ? (
              <Text variant="unit" color="textSecondary">
                {' h'}
              </Text>
            ) : null}
            {slept!.m > 0 ? `${slept!.h > 0 ? ' ' : ''}${slept!.m}` : ''}
            {slept!.m > 0 ? (
              <Text variant="unit" color="textSecondary">
                {' min'}
              </Text>
            ) : null}
          </Text>
          {caption(`of ${SLEEP_RANGE[0]} h last night`)}
          <Trough value={sleepHours} max={SLEEP_RANGE[0]} goalKind="reach" color={colors.sleep} height={10} delay={delay(3)} memoryKey={key('sleep')} />
        </View>
      ) : (
        <PressableScale testID="morning-sleep-add" accessibilityRole="button" accessibilityLabel="Sleep, Add last night, not logged" scaleTo={0.97} onPress={() => router.replace('/sleep?log=1' as never)} style={tile}>
          {head(colors.sleep, 'Sleep', 'dashed')}
          <Text variant="numL" color="primaryInk" style={numStyle} numberOfLines={1}>
            Add
          </Text>
          {caption('last night')}
          <Trough value={0} max={SLEEP_RANGE[0]} goalKind="reach" color={colors.sleep} height={10} animate={false} />
        </PressableScale>
      )}
    </View>
  );
}
