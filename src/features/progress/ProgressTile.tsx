import React, { useEffect, useState } from 'react';
import { useWindowDimensions, View } from 'react-native';

import { MeasureWidth } from '@/features/today/MeasureWidth';
import type { Direction } from '@/lib/insights';
import { useLargeText, useTheme } from '@/theme';
import { CupKey, FadeUp, PressableScale, Text, useGrownText } from '@/ui';

import { allFit, lineFits, wrapFits } from './grownFit';
import { TrendMark } from './parts';
import { WidestRun, WrapProbe } from './Probe';

/**
 * One cell of the overview card: a cup key and title, one large value with
 * its unit small inside it and the Nutrition card's trend mark beside it (a
 * triangle against the previous equal period for a change worth calling, a
 * dash for about the same; explained once under the grid),
 * and one caption line. The comparison in words is read out with the cell and
 * shown in full one tap away. Cells share one card and are divided by hairlines
 * (drawn by the grid). The whole cell is one pressable; it holds nothing else
 * that can be pressed.
 */
export function ProgressTile({
  testID,
  title,
  color,
  value,
  unit,
  caption,
  captionShort,
  spoken,
  compare,
  trend,
  period,
  onPress,
  keyVariant,
  valueColor = 'text',
  borderRight,
  borderTop,
  index = 0,
  oneColumn: oneColumnGiven,
  probe,
}: {
  testID: string;
  title: string;
  color: string;
  /** Null shows a dash. */
  value: string | null;
  unit?: string;
  /** One line of context under the value, e.g. 'a day · budget 2,171 kcal' (two at most). */
  caption?: string;
  /** The same line for a phone under 360 px, where a cell is about 108 px wide. */
  captionShort?: string;
  /** What a screen reader hears after the tile's own words, for what they leave out ("Active minutes toward the 150 minutes a week guideline"). */
  spoken?: string;
  /** Neutral comparison sentence, read out with the cell; null when there is nothing to compare with. */
  compare: string | null;
  /** The triangle beside the value: the shown number against the previous equal period. */
  trend?: Direction | null;
  /** e.g. '30 days', for the triangle's spoken words. */
  period?: string;
  onPress: () => void;
  /** An outlined key marks an estimate (expenditure), as on the designer's board. */
  keyVariant?: 'filled' | 'outline';
  /** Calorie numbers are drawn in `caloriesInk`; every other number in `text`. */
  valueColor?: 'text' | 'caloriesInk';
  borderRight?: boolean;
  borderTop?: boolean;
  /** Position in the grid: tiles fade up in reading order. */
  index?: number;
  /** One tile a row (the grid decides for all its tiles); with large text by default. */
  oneColumn?: boolean;
  /**
   * With text grown, under very large text: the tile's words are measured as drawn two a row, in `room` (the
   * room inside a tile two a row), and whether they fit is reported to `onFit` (`TileProbe`) once they are measured,
   * never before. `key` mounts the probe again when the screen comes back into focus (`useMeasureKey`).
   */
  probe?: { room: number; key: string; onFit: (fits: boolean) => void };
}) {
  const { colors, spacing } = useTheme();
  // At 320 px a tile is about 108 px wide: the number steps down instead of being cut.
  const narrow = useWindowDimensions().width < 360;
  // A tile takes the card's whole width (one column, a hairline between tiles) where the grid says so: with very
  // large text, or through the common steps where one tile's words, measured two a row, do not fit (OverviewGrid),
  // so a number and its unit stay inside it and its line may take more lines.
  const largeText = useLargeText();
  const oneColumn = oneColumnGiven ?? largeText;
  const twoUpLine = narrow && captionShort ? captionShort : caption;
  const line = narrow && captionShort && !oneColumn ? captionShort : caption;
  // Grown text or a reader's own text spacing (`useGrownText`): the line wraps rather than be cut.
  const grown = useGrownText();
  return (
    <FadeUp index={index + 1} style={{ width: oneColumn ? '100%' : '50%' }}>
    <PressableScale
      testID={testID}
      onPress={onPress}
      scaleTo={0.98}
      // What it shows, as drawn and in its order (WCAG 2.5.3, label in name: "Calories, 2,103 kcal, a day · budget
      // 2,171 kcal"), then what it leaves out, the comparison in words and where it leads.
      accessibilityLabel={`${value === null ? title : `${title}, ${value}${unit ? ` ${unit}` : ''}`}${line ? `, ${line}` : ''}.${spoken ? ` ${spoken}.` : ''}${compare ? ` ${compare}.` : ''} Open details.`.replace(/\u00A0/g, ' ')}
      style={{
        flexGrow: 1,
        paddingHorizontal: spacing.lg,
        paddingTop: 14,
        paddingBottom: spacing.lg,
        gap: 4,
        borderRightWidth: borderRight && !oneColumn ? 1 : 0,
        borderTopWidth: borderTop || (oneColumn && index > 0) ? 1 : 0,
        borderColor: colors.border,
      }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
        <CupKey color={color} size={10} variant={keyVariant} />
        <Text variant="label" color="textSecondary" style={{ flex: 1, fontSize: 13.5 }}>
          {title}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
        <Text variant="numL" color={value === null ? 'textTertiary' : valueColor} style={[{ flexShrink: 1 }, narrow ? { fontSize: 24, lineHeight: 28 } : null]}>
          {value ?? '–'}
          {unit && value !== null ? <Text variant="unit">{` ${unit}`}</Text> : null}
        </Text>
        {value !== null ? <TrendMark trend={trend} period={period} /> : null}
      </View>
      {line ? (
        // What the number counts, with its unit: one line, or two where the unit needs the room (the Calories
        // tile's "budget 2,171 kcal" at 360 px). The comparison is the triangle, and in full one tap away.
        <Text variant="caption" color="textSecondary" numberOfLines={oneColumn || grown ? 3 : 2}>
          {line}
        </Text>
      ) : null}
    </PressableScale>
    {probe && probe.room > 0 ? (
      <TileProbe
        key={probe.key}
        room={probe.room}
        title={title}
        color={color}
        keyVariant={keyVariant}
        value={value}
        unit={unit}
        valueColor={valueColor}
        narrow={narrow}
        trend={trend}
        period={period}
        line={twoUpLine}
        onFit={probe.onFit}
      />
    ) : null}
    </FadeUp>
  );
}

/** A tile's caption may take three lines with text grown, as it is drawn (numberOfLines). */
const CAPTION_LINES_GROWN = 3;

/**
 * A tile's words drawn unseen as they would be two a row, in `room`: the title line (its key, the title on one line),
 * the number line (the number with its unit and the mark beside it, on one line) and the caption wrapped in the room
 * (no word wider than it, measured on one line as well, since a phone splits such a word rather than widen the box;
 * three lines at most). Whether all of them fit goes to `onFit` once all are measured, and only then: this probe is
 * mounted again, with nothing measured, each time the screen comes into focus or leaves it, and the grid keeps the
 * last verdict it was given, so the screen comes back drawn as it left (as `MeasureWidth`'s last good width does).
 */
function TileProbe({
  room,
  title,
  color,
  keyVariant,
  value,
  unit,
  valueColor,
  narrow,
  trend,
  period,
  line,
  onFit,
}: {
  room: number;
  title: string;
  color: string;
  keyVariant?: 'filled' | 'outline';
  value: string | null;
  unit?: string;
  valueColor: 'text' | 'caloriesInk';
  narrow: boolean;
  trend?: Direction | null;
  period?: string;
  line?: string;
  onFit: (fits: boolean) => void;
}) {
  const [titleW, setTitleW] = useState(0);
  const [valueW, setValueW] = useState(0);
  const [cap, setCap] = useState({ width: 0, height: 0 });
  const [lineH, setLineH] = useState(0);
  const [wordW, setWordW] = useState(0);
  const fits = allFit([
    lineFits(titleW, room),
    lineFits(valueW, room),
    line ? wrapFits({ ...cap, lineHeight: lineH, room, maxLines: CAPTION_LINES_GROWN, word: wordW }) : true,
  ]);
  // Null is "not measured yet" (a probe just mounted again): never passed on, so the last verdict stays.
  useEffect(() => {
    if (fits !== null) onFit(fits);
  }, [fits, onFit]);
  return (
    <>
      <MeasureWidth onWidth={setTitleW}>
        <CupKey color={color} size={10} variant={keyVariant} />
        <View style={{ width: 7 }} />
        <Text variant="label" color="textSecondary" numberOfLines={1} style={{ fontSize: 13.5 }}>
          {title}
        </Text>
      </MeasureWidth>
      <MeasureWidth onWidth={setValueW}>
        <Text variant="numL" color={value === null ? 'textTertiary' : valueColor} numberOfLines={1} style={narrow ? { fontSize: 24, lineHeight: 28 } : null}>
          {value ?? '–'}
          {unit && value !== null ? <Text variant="unit">{` ${unit}`}</Text> : null}
        </Text>
        {value !== null && trend ? (
          <>
            <View style={{ width: 6 }} />
            <TrendMark trend={trend} period={period} />
          </>
        ) : null}
      </MeasureWidth>
      {line ? (
        <>
          <WrapProbe room={room} onSize={(width, height) => setCap({ width, height })}>
            <Text variant="caption" color="textSecondary">
              {line}
            </Text>
          </WrapProbe>
          <WrapProbe room={room} onSize={(_w, h) => setLineH(h)}>
            <Text variant="caption" color="textSecondary">
              x
            </Text>
          </WrapProbe>
          <WidestRun
            text={line}
            onWidth={setWordW}
            draw={(run) => (
              <Text variant="caption" color="textSecondary">
                {run}
              </Text>
            )}
          />
        </>
      ) : null}
    </>
  );
}
