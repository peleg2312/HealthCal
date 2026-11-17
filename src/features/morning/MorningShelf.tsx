import { router } from 'expo-router';
import React from 'react';
import { useWindowDimensions, View, type StyleProp, type ViewStyle } from 'react-native';

import { formatNumber } from '@/lib/units';
import { BUDGET_BAND } from '@/lib/insights';
import { motion, useTheme, withOpacity } from '@/theme';
import type { ISODate, UnitSystem } from '@/types';
import { AnimatedNumber, PressableScale, Text, Vessel } from '@/ui';

import { SLEEP_RANGE } from '@/features/trackers/helpers';

import { spokenHours, waterFigures } from './figures';
import { leaveMorningTo } from './leave';

const CUP_W = 52;
/** Under 360 px a column is about 64 px wide: a narrower cup keeps room between neighbours. */
const CUP_W_NARROW = 44;
const CUP_H = 152;
/** Under 360 px the card is shorter, so a phone of 320 x 568 still shows the whole page with the footer. */
const CUP_H_NARROW = 128;
/** The shelf reaches 4 px into the card's side padding on each side, so the captions have a little more room. */
const SHELF_BLEED = 4;

export interface ShelfDay {
  date: ISODate;
  kcal: number;
  budget: number;
  /** Budget added by exercise (budget - target), hatched at the top of the calorie cup. */
  headroom: number;
  protein: number;
  proteinG: number;
  waterMl: number;
  waterGoalMl: number;
  foodLogged: boolean;
  complete: boolean;
  /** Some entry is an AI estimate or carries a range: the calorie number reads "~". */
  approx: boolean;
}

/** What a screen reader says for the calorie cup. */
function calorieLabel(d: ShelfDay): string {
  if (!d.foodLogged) return 'Eaten, not logged';
  const about = d.approx ? 'about ' : '';
  const kcal = formatNumber(d.kcal);
  if (d.budget <= 0) return `Eaten, ${about}${kcal} kilocalories`;
  const head = `Eaten, ${about}${kcal} of ${formatNumber(d.budget)} kilocalories`;
  if (!d.complete) return `${head}, partly logged`;
  if (d.kcal <= d.budget) return `${head}, within the day's budget`;
  if (d.kcal - d.budget <= d.budget * BUDGET_BAND + 1e-9) return `${head}, within 10% of the budget`;
  return `${head}, ${formatNumber(d.kcal - d.budget)} kilocalories above the day's budget`;
}

/**
 * The four cups of the morning page on one shelf: eaten, protein and water for yesterday,
 * and sleep for last night. Each cup is judged against the day's own goal; calories are a
 * budget (amber lip over it), the others goals to reach (the brim line at the goal). Every
 * column is the same: cup, label, the number alone, then "of <goal> <unit>", so the cups and
 * the numbers line up across the shelf. The cups pour left to right once per day per session.
 */
export function MorningShelf({ day, sleepHours, units }: { day: ShelfDay; sleepHours: number | null; units: UnitSystem }) {
  const { colors, spacing, chartFill } = useTheme();
  const narrow = useWindowDimensions().width < 360;
  const cupW = narrow ? CUP_W_NARROW : CUP_W;
  const cupH = narrow ? CUP_H_NARROW : CUP_H;
  const numStyle = narrow ? { fontSize: 17, lineHeight: 22 } : undefined;
  const numH = narrow ? 22 : 24;
  const key = (id: string) => `morning-${day.date}-${id}`;
  const delay = (i: number) => i * motion.duration.stagger;
  const water = waterFigures(day.waterMl, day.waterGoalMl, units);
  const proteinReached = day.proteinG > 0 && day.protein >= day.proteinG;
  const waterReached = day.waterGoalMl > 0 && day.waterMl >= day.waterGoalMl;

  const dash = (
    <Text variant="numM" color="textTertiary" style={numStyle} numberOfLines={1}>
      –
    </Text>
  );

  const column: StyleProp<ViewStyle> = { flex: 1, minWidth: 0, alignItems: 'center' };

  const body = (o: { label: string; number: React.ReactNode; caption: string }) => (
    <>
      <Text variant="label" color="textSecondary" numberOfLines={1} style={{ marginTop: spacing.sm }}>
        {o.label}
      </Text>
      {/* minHeight, not height: at the phone's text size 1.3 the number grows, and so does every column alike, so the cups stay level. */}
      <View style={{ minHeight: numH, justifyContent: 'center' }}>{o.number}</View>
      {/*
        Four equal columns, so the cups stand evenly on the shelf. Under 360 px a column is too narrow
        for "of 2,190 kcal", "of 112 fl oz" or two "not logged" side by side, so there every caption
        breaks after its first word ("of" / "2,190 kcal", "not" / "logged"), the same in all four
        columns, rather than one column breaking on its own.
      */}
      <Text variant="caption" color="textSecondary" align="center" numberOfLines={2}>
        {narrow ? o.caption.replace(' ', '\n') : o.caption}
      </Text>
    </>
  );

  return (
    <View testID="morning-cups" style={{ flexDirection: 'row', marginHorizontal: -SHELF_BLEED }}>
      {/* Eaten: a budget, opens yesterday in the diary. */}
      <PressableScale
        testID="morning-cal"
        accessibilityRole="link"
        accessibilityLabel={calorieLabel(day)}
        accessibilityHint="Opens the diary for that day"
        scaleTo={0.96}
        onPress={() => leaveMorningTo(`/diary?date=${day.date}`)}
        style={column}>
        <Vessel
          value={day.foodLogged ? day.kcal : 0}
          max={Math.max(0, day.budget)}
          headroom={Math.max(0, day.headroom)}
          color={day.foodLogged && !day.complete ? withOpacity(colors.calories, chartFill) : colors.calories}
          future={!day.foodLogged}
          width={cupW}
          height={cupH}
          rimWidth={3}
          delay={delay(0)}
          memoryKey={key('cal')}
        />
        {body({
          label: 'Eaten',
          number: day.foodLogged ? (
            <AnimatedNumber
              variant="numM"
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
          ),
          caption: !day.foodLogged ? 'not logged' : day.budget <= 0 ? 'kcal' : !day.complete ? 'partly logged' : `of ${formatNumber(day.budget)} kcal`,
        })}
      </PressableScale>

      {/* Protein: a goal to reach. */}
      <View testID="morning-protein" accessible accessibilityLabel={day.foodLogged ? `Protein, ${Math.round(day.protein)} of ${Math.round(day.proteinG)} grams${proteinReached ? ', goal reached' : ''}` : 'Protein, not logged'} style={column}>
        <Vessel
          value={day.foodLogged ? day.protein : 0}
          max={day.proteinG}
          goalKind="reach"
          color={colors.protein}
          future={!day.foodLogged}
          width={cupW}
          height={cupH}
          rimWidth={3}
          delay={delay(1)}
          memoryKey={key('protein')}
        />
        {body({
          label: 'Protein',
          number: day.foodLogged ? <AnimatedNumber variant="numM" style={numStyle} numberOfLines={1} value={Math.round(day.protein)} delay={delay(1)} memoryKey={key('protein')} /> : dash,
          caption: day.foodLogged ? `of ${Math.round(day.proteinG)} g` : 'not logged',
        })}
      </View>

      {/* Water: shown at 0 too, an empty cup reads as empty. */}
      <View
        testID="morning-water"
        accessible
        accessibilityLabel={`Water, ${water.value} of ${water.goal.replace(/\s\S.*$/, '')} ${water.spokenUnit}${waterReached ? ', goal reached' : ''}`}
        style={column}>
        <Vessel value={day.waterMl} max={day.waterGoalMl} goalKind="reach" color={colors.water} width={cupW} height={cupH} rimWidth={3} delay={delay(2)} memoryKey={key('water')} />
        {body({
          label: 'Water',
          number: (
            <AnimatedNumber
              variant="numM"
              style={numStyle}
              numberOfLines={1}
              value={day.waterMl}
              delay={delay(2)}
              memoryKey={key('water')}
              format={(n) => waterFigures(n, day.waterGoalMl, units).value}
            />
          ),
          caption: `of ${water.goal}`,
        })}
      </View>

      {/* Sleep last night (the night dated today). Missing: one tap opens the sleep sheet. */}
      {sleepHours !== null ? (
        <View testID="morning-sleep" accessible accessibilityLabel={`Sleep last night, ${spokenHours(sleepHours)}`} style={column}>
          <Vessel value={sleepHours} max={SLEEP_RANGE[0]} goalKind="reach" color={colors.sleep} width={cupW} height={cupH} rimWidth={3} delay={delay(3)} memoryKey={key('sleep')} />
          {body({
            label: 'Sleep',
            number: <AnimatedNumber variant="numM" style={numStyle} numberOfLines={1} value={sleepHours} decimals={1} delay={delay(3)} memoryKey={key('sleep')} />,
            caption: `of ${SLEEP_RANGE[0]} h`,
          })}
        </View>
      ) : (
        <PressableScale
          testID="morning-sleep-add"
          accessibilityRole="button"
          accessibilityLabel="Sleep last night, not logged. Add it"
          scaleTo={0.96}
          onPress={() => router.replace('/sleep?log=1' as never)}
          style={column}>
          <Vessel value={0} max={SLEEP_RANGE[0]} goalKind="reach" color={colors.sleep} future width={cupW} height={cupH} rimWidth={3} animate={false} />
          {body({
            label: 'Sleep',
            number: (
              <Text variant="label" color="primaryInk" numberOfLines={1} style={{ textDecorationLine: 'underline' }}>
                Add
              </Text>
            ),
            caption: 'last night',
          })}
        </PressableScale>
      )}
    </View>
  );
}
