import { ChevronRight, Info } from 'lucide-react-native';
import React, { useState } from 'react';
import { useWindowDimensions, View } from 'react-native';

import { formatDayLabel, formatDuration, weekdayShort } from '@/lib/dates';
import { OVERVIEW_ABOUT, type TrainingOverview } from '@/lib/trainingLoad';
import { formatNumber } from '@/lib/units';
import { cup, fonts, useTheme } from '@/theme';
import { useProfile } from '@/store/selectors';
import type { ISODate } from '@/types';
import { Card, CupKey, IconButton, levelY, MiniCup, PressableScale, Text, Vessel, type VesselLabel } from '@/ui';

import { WHO_WEEKLY_MINUTES, type WeekSummary } from './build';
import { LoadMark } from './LoadMark';
import { useTextGrowth } from './textGrowth';
import { TrainingLoadSheet } from './TrainingLoadSheet';

const VESSEL_H = 168;

/**
 * Train's week: active minutes (the guideline's, `guidelineMinutes`) poured into a vessel with the 150-minute
 * guideline drawn as a dashed level line across it (reaching it is the point,
 * so there is no "over"), the week's totals, then a cup per day filled with
 * that day's minutes. Its last line is the training overview (the last 7 days against the
 * person's recent weeks: the sheet's scale drawn small, `LoadMark`, and the state's title) when there is a state and the week
 * shown is the current one: the whole line is one button (`train-load-info`, a chevron at its end)
 * that opens the overview's sheet. Otherwise "Hard minutes count double" as before, whose info cup
 * (`train-guideline-help`) opens the same sheet.
 */
export function WeekCard({
  week,
  dates,
  today,
  extra,
  overview,
  current,
}: {
  week: WeekSummary;
  dates: ISODate[];
  today: ISODate;
  /** A line under the totals (Train's steps). */
  extra?: React.ReactNode;
  /** The last 7 days (`trainingOverview`); its sheet opens from the card's last line. */
  overview: TrainingOverview;
  /** True when the week shown is this week: a past week keeps the old line. */
  current: boolean;
}) {
  const { colors, spacing } = useTheme();
  const { width: screenW } = useWindowDimensions();
  const narrow = screenW < 360;
  const vesselW = narrow ? 58 : 70;
  const minutes = week.guidelineMinutes;
  // The vessel holds twice the guideline (the upper end of WHO's 150 to 300 minutes), more if needed.
  const max = Math.max(WHO_WEEKLY_MINUTES * 2, minutes);
  const reached = minutes >= WHO_WEEKLY_MINUTES;
  const guideY = levelY(WHO_WEEKLY_MINUTES, max, VESSEL_H - 1.5);
  // The overview of the last 7 days: one line on the card, the whole of it (with how minutes count) behind the info cup.
  const [help, setHelp] = useState(false);
  const load = current && overview.state && overview.position && overview.title ? { position: overview.position, title: overview.title } : null;
  // The week's workout calories in the run log's words (`budgetAdds`): "added", or "not added" while adding is off,
  // always "~": the part above resting is an estimate.
  const notAdding = useProfile().eatBackExercise === false;
  const addedWord = notAdding ? 'Not added' : 'Added';
  const addedSpoken = `This week's workouts: about ${formatNumber(week.kcalNet)} kilocalories ${notAdding ? 'not added to your budget' : 'added to your budget'}, an estimate`;

  const status = reached ? 'Weekly activity guideline reached' : `${WHO_WEEKLY_MINUTES - minutes} min to the weekly guideline`;
  // Above 115% text the labels placed at their levels would run into each other (they are 20, 40 and 44 px tall).
  const stacked = useTextGrowth() > 1.15;
  const labels: VesselLabel[] = [
    {
      key: 'guide',
      at: WHO_WEEKLY_MINUTES,
      height: 20,
      tick: colors.borderStrong,
      content: (
        <Text variant="caption" color="textSecondary" numberOfLines={1}>
          {`${WHO_WEEKLY_MINUTES} min guideline`}
        </Text>
      ),
    },
    {
      key: 'done',
      at: Math.min(minutes, max),
      height: 40,
      tick: minutes > 0 ? colors.rim : undefined,
      content: (
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 5 }}>
          <Text variant="numXL" testID="train-guideline-minutes" style={{ fontSize: 40, lineHeight: 42, letterSpacing: -1.2 }}>
            {formatNumber(minutes)}
          </Text>
          <Text variant="unit" style={{ fontSize: 14 }}>
            active min
          </Text>
        </View>
      ),
    },
    {
      key: 'status',
      at: 0,
      height: 44,
      content: (
        <Text variant="label" color="textSecondary" numberOfLines={2}>
          {status}
        </Text>
      ),
    },
  ];

  const maxDay = Math.max(60, ...dates.map((d) => week.byDate[d].minutes));

  return (
    <Card testID="train-week-card" padding={18}>
      {stacked ? (
        // Large text: the labels no longer fit at their levels, so they stand in a column beside the cup, in
        // the order they are read, and wrap; the dashed line in the cup still marks the guideline.
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: narrow ? 14 : 16 }}>
          <View>
            <Vessel
              value={minutes}
              max={max}
              color={colors.exercise}
              width={vesselW}
              height={VESSEL_H}
              accessibilityLabel={`${minutes} active minutes this week, of the ${WHO_WEEKLY_MINUTES} minutes a week guideline`}
            />
            <View
              pointerEvents="none"
              style={{ position: 'absolute', left: -4, width: vesselW + 8, top: guideY - 1, height: 0, borderTopWidth: 2, borderStyle: 'dashed', borderColor: colors.borderStrong }}
            />
          </View>
          <View style={{ flex: 1, minWidth: 0, gap: spacing.sm }}>
            <Text variant="numXL" testID="train-guideline-minutes" style={{ fontSize: 40, lineHeight: 42, letterSpacing: -1.2 }}>
              {formatNumber(minutes)}
              <Text variant="unit" style={{ fontSize: 14 }}>
                {' active min'}
              </Text>
            </Text>
            <Text variant="label" color="textSecondary">
              {status}
            </Text>
            <Text variant="caption" color="textSecondary">
              {`Dashed line: ${WHO_WEEKLY_MINUTES} min guideline`}
            </Text>
          </View>
        </View>
      ) : (
        <View>
          <Vessel
            value={minutes}
            max={max}
            color={colors.exercise}
            width={vesselW}
            height={VESSEL_H}
            labels={[...labels].sort((x, y) => y.at - x.at)}
            labelGap={narrow ? 14 : 16}
            accessibilityLabel={`${minutes} active minutes this week, of the ${WHO_WEEKLY_MINUTES} minutes a week guideline`}
          />
          {/* The guideline as a dashed level line across the open vessel. */}
          <View
            pointerEvents="none"
            style={{ position: 'absolute', left: -4, width: vesselW + 8, top: guideY - 1, height: 0, borderTopWidth: 2, borderStyle: 'dashed', borderColor: colors.borderStrong }}
          />
        </View>
      )}

      {/* Three totals in a row; on a phone too narrow for that the third wraps under the first two, so nothing is cut. */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing.md, rowGap: spacing.sm, marginTop: spacing.lg }}>
        <Mini label="Sessions" value={String(week.sessions)} />
        <Mini label="Total time" value={week.totalMinutes > 0 ? formatDuration(week.totalMinutes) : '0 min'} testID="train-total-time" />
        <Mini label={addedWord} value={`~${formatNumber(week.kcalNet)}`} unit="kcal" color={colors.exercise} spoken={addedSpoken} />
      </View>
      {extra}

      <View style={{ height: 1, backgroundColor: colors.border, marginVertical: spacing.md }} />

      <View style={{ flexDirection: 'row' }} testID="train-week-strip">
        {dates.map((d) => {
          const day = week.byDate[d];
          const isToday = d === today;
          const future = d > today;
          return (
            <View
              key={d}
              style={{ flex: 1, alignItems: 'center', gap: 6 }}
              accessible
              accessibilityLabel={`${formatDayLabel(d)}: ${future ? 'still to come' : `${day.minutes} minutes`}`}>
              <Text variant="label" color={isToday ? 'text' : 'textSecondary'} style={{ fontSize: 12, lineHeight: 16, fontFamily: isToday ? fonts.bold : fonts.semibold }}>
                {weekdayShort(d).slice(0, 1)}
              </Text>
              <MiniCup progress={Math.min(1, day.minutes / maxDay)} over={false} future={future} color={colors.exercise} />
              <View
                style={{
                  minWidth: 32,
                  minHeight: 22,
                  paddingHorizontal: 2,
                  ...cup(9, 4),
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: isToday ? 1.5 : 0,
                  borderColor: colors.text,
                }}>
                <Text variant="numM" color={future ? 'textTertiary' : day.minutes ? 'text' : 'textSecondary'} style={{ fontSize: 13, lineHeight: 18, letterSpacing: 0 }}>
                  {future ? '' : day.minutes ? `${day.minutes}` : '–'}
                </Text>
              </View>
            </View>
          );
        })}
      </View>
      <Text variant="caption" color="textSecondary" align="center" style={{ marginTop: 4 }}>
        Minutes each day
      </Text>
      {load ? (
        // The whole line is the way into the overview: one button, 44 px tall, with a chevron where the info cup was.
        // Its text sits where the old row's did (4 px of the 44 are above and below it), so the card is no taller.
        <PressableScale
          testID="train-load-info"
          scaleTo={0.985}
          accessibilityLabel={overview.cardLabel ?? OVERVIEW_ABOUT}
          accessibilityHint={OVERVIEW_ABOUT}
          onPress={() => setHelp(true)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 44, paddingVertical: spacing.xs, marginTop: spacing.xs, marginBottom: -spacing.md }}>
          <LoadMark position={load.position} />
          {/* The cup above counts Monday to Sunday; this line counts the last 7 days, and says so. */}
          <View testID="train-load" accessibilityLabel={overview.cardLabel ?? undefined} style={{ flex: 1, minWidth: 0 }}>
            <Text variant="caption" color="textSecondary" numberOfLines={1} testID="train-load-span">
              Last 7 days
            </Text>
            <Text variant="label" color="text" numberOfLines={2} testID="train-load-title">
              {load.title}
            </Text>
          </View>
          <ChevronRight size={18} color={colors.textSecondary} strokeWidth={1.9} />
        </PressableScale>
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm, marginBottom: -spacing.sm }}>
          <Text variant="caption" color="textSecondary" numberOfLines={1} style={{ flex: 1 }} testID="train-guideline-line">
            Hard minutes count double
          </Text>
          <IconButton size={36} tone="clear" testID="train-guideline-help" accessibilityLabel="How minutes count toward the guideline" onPress={() => setHelp(true)}>
            <Info size={20} color={colors.textSecondary} strokeWidth={1.9} />
          </IconButton>
        </View>
      )}
      <TrainingLoadSheet overview={overview} visible={help} onClose={() => setHelp(false)} />
    </Card>
  );
}

function Mini({ label, value, unit, color, testID, spoken }: { label: string; value: string; unit?: string; color?: string; testID?: string; spoken?: string }) {
  // The narrowest a total may be grows with the text, so its label never splits inside a word.
  const grow = useTextGrowth();
  return (
    // No shrinking below the number's own width (its spaces do not break): each total is as wide as its number,
    // at least 64 px, and the row wraps instead of cutting one ("20 h 40 min" is wider than a third of the card).
    <View style={{ flexGrow: 1, flexBasis: 'auto', minWidth: 64 * grow }} testID={testID} accessible={!!spoken} accessibilityLabel={spoken}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {color ? <CupKey color={color} /> : null}
        <Text variant="caption" color="textSecondary" style={{ flexShrink: 1 }}>
          {label}
        </Text>
      </View>
      <Text variant="numM" style={{ fontSize: 18, lineHeight: 23 }}>
        {value.replace(/ /g, '\u00A0')}
        {unit ? <Text variant="unit">{`\u00A0${unit}`}</Text> : null}
      </Text>
    </View>
  );
}
