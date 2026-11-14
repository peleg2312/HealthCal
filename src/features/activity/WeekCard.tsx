import React from 'react';
import { useWindowDimensions, View } from 'react-native';

import { formatDayLabel, formatDuration, weekdayShort } from '@/lib/dates';
import { formatNumber } from '@/lib/units';
import { cup, fonts, useTheme } from '@/theme';
import type { ISODate } from '@/types';
import { Card, CupKey, levelY, MiniCup, Text, Vessel, type VesselLabel } from '@/ui';

import { WHO_WEEKLY_MINUTES, type WeekSummary } from './build';

const VESSEL_H = 168;

/**
 * Train's week: guideline minutes poured into a vessel with the 150-minute
 * guideline drawn as a dashed level line across it (reaching it is the point,
 * so there is no "over"), the week's totals, then a cup per day filled with
 * that day's minutes.
 */
export function WeekCard({ week, dates, today }: { week: WeekSummary; dates: ISODate[]; today: ISODate }) {
  const { colors, spacing } = useTheme();
  const { width: screenW } = useWindowDimensions();
  const narrow = screenW < 360;
  const vesselW = narrow ? 58 : 70;
  const minutes = week.guidelineMinutes;
  // The vessel holds twice the guideline (the upper end of WHO's 150 to 300 minutes), more if needed.
  const max = Math.max(WHO_WEEKLY_MINUTES * 2, minutes);
  const reached = minutes >= WHO_WEEKLY_MINUTES;
  const guideY = levelY(WHO_WEEKLY_MINUTES, max, VESSEL_H - 1.5);

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
            {minutes}
          </Text>
          <Text variant="unit" style={{ fontSize: 14 }}>
            min
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
          {reached ? 'Weekly activity guideline reached' : `${WHO_WEEKLY_MINUTES - minutes} min to the weekly guideline`}
        </Text>
      ),
    },
  ];

  const maxDay = Math.max(60, ...dates.map((d) => week.byDate[d].minutes));

  return (
    <Card testID="train-week-card" padding={18}>
      <View>
        <Vessel
          value={minutes}
          max={max}
          color={colors.exercise}
          width={vesselW}
          height={VESSEL_H}
          labels={[...labels].sort((x, y) => y.at - x.at)}
          labelGap={narrow ? 14 : 16}
          accessibilityLabel={`${minutes} of ${WHO_WEEKLY_MINUTES} guideline minutes this week`}
        />
        {/* The guideline as a dashed level line across the open vessel. */}
        <View
          pointerEvents="none"
          style={{ position: 'absolute', left: -4, width: vesselW + 8, top: guideY - 1, height: 0, borderTopWidth: 2, borderStyle: 'dashed', borderColor: colors.borderStrong }}
        />
      </View>

      <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg }}>
        <Mini label="Sessions" value={String(week.sessions)} />
        <Mini label="Logged in total" value={week.totalMinutes > 0 ? formatDuration(week.totalMinutes) : '0 min'} testID="train-total-time" />
        <Mini label="Net, est." value={formatNumber(week.kcalNet)} unit="kcal" color={colors.exercise} />
      </View>

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
                  height: 22,
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
      <Text variant="caption" color="textSecondary" style={{ marginTop: spacing.md }}>
        WHO suggests 150 minutes of moderate activity a week. Minutes of a session logged as hard (and 6 MET or more) count double; light ones (under 3 MET) are logged but not counted.
      </Text>
    </Card>
  );
}

function Mini({ label, value, unit, color, testID }: { label: string; value: string; unit?: string; color?: string; testID?: string }) {
  return (
    <View style={{ minWidth: 0, flex: 1 }} testID={testID}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {color ? <CupKey color={color} /> : null}
        <Text variant="caption" color="textSecondary" numberOfLines={1}>
          {label}
        </Text>
      </View>
      <Text variant="numM" numberOfLines={1} style={{ fontSize: 18, lineHeight: 23 }}>
        {value}
        {unit ? <Text variant="unit">{` ${unit}`}</Text> : null}
      </Text>
    </View>
  );
}
