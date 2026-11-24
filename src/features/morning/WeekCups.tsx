import React from 'react';
import { useWindowDimensions, View } from 'react-native';

import { weekdayShort } from '@/lib/dates';
import { formatNumber } from '@/lib/units';
import { fonts, motion, useTheme, withOpacity } from '@/theme';
import { AnimatedNumber, CupKey, Text, Vessel } from '@/ui';

import type { WeekCell, WeekCells } from './weekCells';
import { weekLabel } from './weekLabel';

/**
 * Column and cup sizes, at 360 px and up / under 360 px. Yesterday's number ("2,062 kcal") sits in
 * its own line over the cups and may be wider than the large column: it then reaches left, over the
 * shorter small cups, so the small cups keep room between them. With no small cups (day 2) the
 * large column is wide enough for the number (`bigColAlone`).
 */
const SIZES = {
  wide: { bigCol: 76, bigColAlone: 118, bigW: 56, bigH: 96, todayCol: 54, todayW: 40, todayH: 64, smallW: 16, smallH: 64 },
  narrow: { bigCol: 66, bigColAlone: 100, bigW: 48, bigH: 88, todayCol: 46, todayW: 34, todayH: 58, smallW: 14, smallH: 56 },
} as const;

/** The number ticks up from this share of its value, so a frame caught at load never reads "0 kcal". */
const TICK_FROM = 0.6;

/** The slot under every cup: the day's letter or name. */
const LABEL_H = 18;
/** Under it, when any drawn day has a workout, the workout mark (8 + 4). */
const MARK_SLOT = 12;

/**
 * The week in cups, the picture at the top of the morning page: a small cup for each drawn day
 * before yesterday (up to six, never before setup), yesterday as the large cup with its number over
 * it, and today at the end, poured with what is logged so far. Every cup is calories against that
 * day's own budget (a limit: hatched exercise headroom, the amber lip when above it, a thin one
 * inside the cup's width on the small cups, pale while partly logged). A workout that day is a small exercise key under the day's letter.
 *
 * Only draws: which days and how each reads come from weekCells (pure, tested). The cups are not
 * pressable; the whole row is one accessible element read as weekLabel. They pour left to right,
 * the large cup after the last small one and today last, once a day (memoryKey by day), and the
 * number ticks up from 60% of its value (never a readable 0); under reduced motion all of it is simply there.
 */
export function WeekCups({ cells, testID }: { cells: WeekCells; testID?: string }) {
  const { colors, spacing, chartFill } = useTheme();
  const narrow = useWindowDimensions().width < 360;
  const s = narrow ? SIZES.narrow : SIZES.wide;
  const { before, yesterday: y, today: t, anyWorkout } = cells;
  if (!y) return null;
  const n = before.length;
  const bigCol = n === 0 ? s.bigColAlone : s.bigCol;
  const fill = (c: WeekCell) => (c.partial ? withOpacity(colors.calories, chartFill) : colors.calories);
  const mark = (c: WeekCell) => (anyWorkout ? <View style={{ height: MARK_SLOT, justifyContent: 'flex-end' }}>{c.workout ? <CupKey color={colors.exercise} size={8} /> : null}</View> : null);

  const cup = (c: WeekCell, w: number, h: number, index: number, rim: number) => (
    <Vessel
      value={c.kcal}
      max={c.budget}
      headroom={c.headroom}
      color={fill(c)}
      width={w}
      height={h}
      rimWidth={rim}
      duration={rim < 3 ? motion.duration.pourSmall : motion.duration.pour}
      delay={index * motion.duration.stagger}
      memoryKey={`morning-week-${c.date}`}
    />
  );

  // A small cup above its budget is drawn full with an amber lip 2 px past each wall and 4 px tall:
  // its shape, not only its colour, tells it from a full cup's level line (a lip inside the walls was
  // the calorie fill's colour and nothing else); yesterday keeps the kit's wider lip and leads.
  // The lip shows once the cup has poured (or at once under reduced motion).
  const smallCup = (c: WeekCell, index: number) =>
    c.over ? (
      <View style={{ width: s.smallW, height: s.smallH }}>
        {cup({ ...c, kcal: c.budget }, s.smallW, s.smallH, index, 2.5)}
        <View pointerEvents="none" style={{ position: 'absolute', left: -2, right: -2, top: -2.5, height: 4, borderRadius: 1.5, backgroundColor: colors.warning }} />
      </View>
    ) : (
      cup(c, s.smallW, s.smallH, index, 2.5)
    );

  const shown = (v: number) => `${y.approx ? '~' : ''}${formatNumber(v)}`;
  // A size down at six characters ("11,480", "~2,062").
  const numVariant = shown(Math.round(y.kcal)).length >= 6 ? 'numM' : 'numL';

  return (
    <View testID={testID}>
      <View accessible accessibilityLabel={weekLabel(cells)}>
        {/* Yesterday's number, centred over the large cup; a wider one reaches left over the small cups. */}
        <View style={{ flexDirection: 'row', justifyContent: n === 0 ? 'center' : 'flex-end', marginBottom: spacing.sm }}>
          <View style={{ minWidth: bigCol, alignItems: 'center' }}>
            {y.foodLogged ? (
              <AnimatedNumber variant={numVariant} color="caloriesInk" numberOfLines={1} value={Math.round(y.kcal)} from={Math.round(y.kcal * TICK_FROM)} delay={n * motion.duration.stagger} memoryKey={`morning-yday-${y.date}`} format={shown}>
                <Text variant="unit" color="textSecondary">
                  {' kcal'}
                </Text>
              </AnimatedNumber>
            ) : (
              <Text variant="caption" color="textSecondary" numberOfLines={1}>
                Not logged
              </Text>
            )}
          </View>
          <View style={{ width: s.todayCol }} />
        </View>

        {/* The cups: every one stands on the same line; the slots under them are the same height. */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: n === 0 ? 'center' : 'flex-start' }}>
          {before.map((c, i) => (
            <View key={c.date} testID={`morning-week-day-${c.date}`} style={{ flex: 1, minWidth: 0, alignItems: 'center' }}>
              {smallCup(c, i)}
              <Text variant="label" color="textSecondary" numberOfLines={1} style={{ height: LABEL_H, marginTop: spacing.xs }}>
                {weekdayShort(c.date).charAt(0)}
              </Text>
              {mark(c)}
            </View>
          ))}

          <View testID="morning-week-yesterday" style={{ width: bigCol, alignItems: 'center' }}>
            {cup(y, s.bigW, s.bigH, n, 3)}
            <Text variant="caption" color="text" numberOfLines={1} style={{ height: LABEL_H, marginTop: spacing.xs, fontFamily: fonts.bold }}>
              Yesterday
            </Text>
            {mark(y)}
          </View>

          <View testID="morning-week-today" style={{ width: s.todayCol, alignItems: 'center' }}>
            {cup(t, s.todayW, s.todayH, n + 1, 2.5)}
            <Text variant="label" color="textSecondary" numberOfLines={1} style={{ height: LABEL_H, marginTop: spacing.xs }}>
              Today
            </Text>
            {mark(t)}
          </View>
        </View>
      </View>

      {anyWorkout ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs }}>
          <CupKey color={colors.exercise} size={8} />
          <Text variant="caption" color="textSecondary">
            A workout that day
          </Text>
        </View>
      ) : null}
    </View>
  );
}
