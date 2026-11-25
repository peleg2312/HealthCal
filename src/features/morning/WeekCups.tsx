import React from 'react';
import { ScrollView, useWindowDimensions, View, type ScrollViewInstance } from 'react-native';

import { KEPT_LEGEND } from '@/features/streak/kept';
import { KeptKey, KeptMark, useKeptDays } from '@/features/streak/KeptMark';
import { weekdayShort } from '@/lib/dates';
import { formatNumber } from '@/lib/units';
import { fonts, motion, scaledFontSize, useTextSize, useTheme, withOpacity } from '@/theme';
import { AnimatedNumber, CupKey, Text, Vessel } from '@/ui';

import { withKept, type WeekCell, type WeekCells } from './weekCells';
import { weekLabel } from './weekLabel';

/**
 * Column and cup sizes, at 360 px and up / under 360 px. Yesterday's number ("2,062 kcal") sits in
 * its own line over the cups and may be wider than the large column: it then reaches left, over the
 * shorter small cups, so the small cups keep room between them. With no small cups (day 2) the
 * large column is wide enough for the number (`bigColAlone`).
 */
const SIZES = {
  wide: {
    bigCol: 76,
    bigColAlone: 118,
    bigW: 56,
    bigH: 96,
    todayCol: 54,
    todayW: 40,
    todayH: 64,
    smallW: 16,
    smallH: 64,
  },
  narrow: {
    bigCol: 66,
    bigColAlone: 100,
    bigW: 48,
    bigH: 88,
    todayCol: 46,
    todayW: 34,
    todayH: 58,
    smallW: 14,
    smallH: 56,
  },
} as const;

/** The legend's kept key: an empty mini cup with the kept line, as on Consistency's legend. */
const KEPT_KEY = { width: 12, height: 15 } as const;

/** The number ticks up from this share of its value, so a frame caught at load never reads "0 kcal". */
const TICK_FROM = 0.6;

/** The slot under every cup: the day's letter or name. */
const LABEL_H = 18;
/** Under it, when any drawn day has a workout, the workout mark (8 + 4). */
const MARK_SLOT = 12;

/**
 * With the app's text size raised the labels grow (`r`, how much a 13 px label grows): the slot under the
 * cups grows with them, the columns widen to hold "Yesterday" and "Today" whole, each small column to hold
 * its letter, and when the row is then wider than the card it scrolls sideways, opened at its end
 * (yesterday and today), the card's edge cutting the first cups so the scroll shows. At 100% nothing changes.
 */
export function weekCupColumns(r: number, s: { bigCol: number; todayCol: number }, bigCol: number) {
  if (r <= 1) return { labelH: LABEL_H, bigCol, todayCol: s.todayCol, smallMin: 0 };
  return {
    labelH: Math.ceil(LABEL_H * r),
    bigCol: Math.max(bigCol, Math.ceil(68 * r)),
    todayCol: Math.max(s.todayCol, Math.ceil(46 * r)),
    smallMin: Math.ceil(18 * r),
  };
}

/**
 * The week in cups, the picture at the top of the morning page: a small cup for each drawn day
 * before yesterday (up to six, never before setup), yesterday as the large cup with its number over
 * it, and today at the end, poured with what is logged so far. Every cup is calories against that
 * day's own budget (a limit: hatched exercise headroom, the amber lip when above it, a heavier cap
 * inside the cup's width on the small cups, pale while partly logged). A workout that day is a small exercise key under the day's letter.
 * A quiet day the streak kept (`useKeptDays`, the one answer Today's week strip draws from; `withKept`) is its cup
 * with the strip's dashed kept line across it (`KeptMark`), never an empty cup that reads as a break; the legend
 * under the cups then names it (`KeptKey`, "Kept: a quiet day in a streak"), and weekLabel says it.
 *
 * Only draws: which days and how each reads come from weekCells (pure, tested). The cups are not
 * pressable; the whole row is one accessible element read as weekLabel. They pour left to right,
 * the large cup after the last small one and today last, once a day (memoryKey by day), and the
 * number ticks up from 60% of its value (never a readable 0); under reduced motion all of it is simply there.
 */
export function WeekCups({ cells: given, testID }: { cells: WeekCells; testID?: string }) {
  const { colors, spacing, chartFill } = useTheme();
  const narrow = useWindowDimensions().width < 360;
  const textSize = useTextSize();
  const scroller = React.useRef<ScrollViewInstance>(null);
  const s = narrow ? SIZES.narrow : SIZES.wide;
  // The quiet days the streak kept, as Today's week strip draws them (the same rule, from the food on the phone).
  const keptSet = useKeptDays(given.today.date);
  const cells = withKept(given, keptSet);
  const { before, yesterday: y, today: t, anyWorkout, anyKept } = cells;
  if (!y) return null;
  const n = before.length;
  const r = textSize > 1 ? scaledFontSize(13, textSize) / 13 : 1;
  const cols = weekCupColumns(r, s, n === 0 ? s.bigColAlone : s.bigCol);
  const bigCol = cols.bigCol;
  const fill = (c: WeekCell) => (c.partial ? withOpacity(colors.calories, chartFill) : colors.calories);
  const mark = (c: WeekCell) => (anyWorkout ? <View style={{ height: MARK_SLOT, justifyContent: 'flex-end' }}>{c.workout ? <CupKey color={colors.exercise} size={8} /> : null}</View> : null);
  // A kept day: its cup with the dashed kept line across it, as on Today's week strip.
  const withKeptLine = (c: WeekCell, w: number, h: number, node: React.ReactNode) =>
    c.kept ? (
      <View style={{ width: w, height: h }}>
        {node}
        <KeptMark width={w} height={h} />
      </View>
    ) : (
      node
    );

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

  // A small cup above its budget is drawn full with an amber cap 4 px tall across its own width:
  // heavier than a full cup's 2.5 px level line, so its weight, not only its colour, tells it apart,
  // and never past the walls (a line wider than its cup is the brim, which means a goal reached).
  // Yesterday keeps the kit's lip and leads. The cap is drawn at once, over the cup as it pours.
  const smallCup = (c: WeekCell, index: number) =>
    c.over ? (
      <View style={{ width: s.smallW, height: s.smallH }}>
        {cup({ ...c, kcal: c.budget }, s.smallW, s.smallH, index, 2.5)}
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: -2,
            height: 4,
            borderTopLeftRadius: 1,
            borderTopRightRadius: 1,
            backgroundColor: colors.warning,
          }}
        />
      </View>
    ) : (
      withKeptLine(c, s.smallW, s.smallH, cup(c, s.smallW, s.smallH, index, 2.5))
    );

  const shown = (v: number) => `${y.approx ? '~' : ''}${formatNumber(v)}`;
  // A size down at six characters ("11,480", "~2,062").
  const numVariant = shown(Math.round(y.kcal)).length >= 6 ? 'numM' : 'numL';

  // One image to a screen reader, named by `weekLabel` (the days, yesterday's figure and the days above their
  // budget), as the kit's charts are: on the web a name on a role-less div is dropped, so the role carries it,
  // and what the picture draws (the figure, the weekday letters) is not read a second time.
  const week = (
    <View
      testID="morning-week-cups"
      accessible
      accessibilityRole="image"
      accessibilityLabel={weekLabel(cells)}
      style={r > 1 ? { flexGrow: 1 } : undefined}>
      <View aria-hidden importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      {/* Yesterday's number, centred over the large cup; a wider one reaches left over the small cups. */}
      <View
        style={{
          flexDirection: 'row',
          justifyContent: n === 0 ? 'center' : 'flex-end',
          marginBottom: spacing.sm,
        }}>
        <View style={{ minWidth: bigCol, alignItems: 'center' }}>
          {y.foodLogged ? (
            <AnimatedNumber
              variant={numVariant}
              color="caloriesInk"
              numberOfLines={1}
              value={Math.round(y.kcal)}
              from={Math.round(y.kcal * TICK_FROM)}
              delay={n * motion.duration.stagger}
              memoryKey={`morning-yday-${y.date}`}
              format={shown}>
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
        <View style={{ width: cols.todayCol }} />
      </View>

      {/* The cups: every one stands on the same line; the slots under them are the same height. */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-end',
          justifyContent: n === 0 ? 'center' : 'flex-start',
        }}>
        {before.map((c, i) => (
          <View key={c.date} testID={`morning-week-day-${c.date}`} style={{ flex: 1, minWidth: cols.smallMin, alignItems: 'center' }}>
            {smallCup(c, i)}
            <Text variant="label" color="textSecondary" numberOfLines={1} style={{ height: cols.labelH, marginTop: spacing.xs }}>
              {weekdayShort(c.date).charAt(0)}
            </Text>
            {mark(c)}
          </View>
        ))}

        <View testID="morning-week-yesterday" style={{ width: bigCol, alignItems: 'center' }}>
          {withKeptLine(y, s.bigW, s.bigH, cup(y, s.bigW, s.bigH, n, 3))}
          <Text
            variant="caption"
            color="text"
            numberOfLines={1}
            style={{
              height: cols.labelH,
              marginTop: spacing.xs,
              fontFamily: fonts.bold,
            }}>
            Yesterday
          </Text>
          {mark(y)}
        </View>

        <View testID="morning-week-today" style={{ width: cols.todayCol, alignItems: 'center' }}>
          {cup(t, s.todayW, s.todayH, n + 1, 2.5)}
          <Text variant="label" color="textSecondary" numberOfLines={1} style={{ height: cols.labelH, marginTop: spacing.xs }}>
            Today
          </Text>
          {mark(t)}
        </View>
      </View>
      </View>
    </View>
  );

  return (
    <View testID={testID}>
      {r > 1 ? (
        <ScrollView
          ref={scroller}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ flexGrow: 1 }}
          onContentSizeChange={() => scroller.current?.scrollToEnd({ animated: false })}>
          {week}
        </ScrollView>
      ) : (
        week
      )}

      {anyWorkout ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.sm,
            marginTop: spacing.xs,
          }}>
          {/* Beside the kept key's line the workout key stands in a slot as wide as that key, so the two lines' words align. */}
          {anyKept ? (
            <View style={{ width: KEPT_KEY.width, alignItems: 'center' }}>
              <CupKey color={colors.exercise} size={8} />
            </View>
          ) : (
            <CupKey color={colors.exercise} size={8} />
          )}
          <Text variant="caption" color="textSecondary">
            A workout that day
          </Text>
        </View>
      ) : null}
      {anyKept ? (
        <View
          testID="morning-week-kept-key"
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.sm,
            marginTop: spacing.xs,
          }}>
          <KeptKey width={KEPT_KEY.width} height={KEPT_KEY.height} />
          <Text variant="caption" color="textSecondary">
            {KEPT_LEGEND}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
