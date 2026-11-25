import { ChevronRight } from 'lucide-react-native';
import React from 'react';
import { View } from 'react-native';

import { plural, type Direction, SLEEP_MAX_HOURS, SLEEP_TARGET_HOURS, WEEKLY_ACTIVE_MINUTES, type PeriodSummary } from '@/lib/insights';
import { hoursFigure, hoursSpoken } from '@/features/trackers/helpers';
import { formatVolume } from '@/lib/units';
import { useTheme } from '@/theme';
import type { UnitSystem } from '@/types';
import { Card, CupKey, Divider, PressableScale, ProgressBar, Text } from '@/ui';

import { changeDirection, changeWords } from './change';
import { spokenUnits } from './chartWords';
import { go, TrendLegend, TrendMark } from './parts';
import { sleepDetail } from './sleepDetail';

function HabitRow({
  testID,
  route,
  color,
  title,
  value,
  unit,
  detail,
  progress,
  trend,
  change,
  period,
  spoken,
}: {
  /** What a screen reader says for the value and its unit, when the drawn words are short ("7 hours 9 minutes a night"). */
  spoken?: string;
  trend?: Direction | null;
  /** The change against the previous period in words, read out with the row. */
  change?: string | null;
  period?: string;
  testID: string;
  route: string;
  color: string;
  title: string;
  value: string | null;
  unit?: string;
  detail: string;
  progress: number;
}) {
  const { colors, spacing } = useTheme();
  return (
    <PressableScale testID={testID} onPress={() => go(route)} scaleTo={0.985} accessibilityLabel={spokenUnits(`${title}: ${spoken ?? `${value ?? 'no data'} ${unit ?? ''}`}. ${detail}.${change ? ` ${change}.` : ''}`)} style={{ gap: spacing.sm, paddingVertical: spacing.xs }}>
      {/* The number shares the title's line and the detail runs the full width under both, so on a
          320 px phone the detail is not squeezed into a narrow column beside the number. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <CupKey color={color} size={10} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: spacing.sm }}>
            <Text variant="bodyStrong" style={{ flexShrink: 1 }}>
              {title}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
              <Text variant="numM" color={value ? 'text' : 'textTertiary'}>
                {value ?? '–'}
                {unit && value ? <Text variant="unit">{`\u00A0${unit.replace(/ /g, '\u00A0')}`}</Text> : null}
              </Text>
              {value ? <TrendMark trend={trend} period={period} /> : null}
            </View>
          </View>
          <Text variant="caption" color="textSecondary">
            {detail}
          </Text>
        </View>
        <ChevronRight size={18} color={colors.textTertiary} strokeWidth={1.9} />
      </View>
      {/* Water, minutes and sleep are goals to reach: at or past one the bar wears the brim tick, never amber. */}
      <ProgressBar progress={progress} color={color} goalKind="reach" height={6} style={{ marginLeft: 22, marginBottom: 4 }} />
    </PressableScale>
  );
}

export function HabitsCard({ summary, previous, units }: { summary: PeriodSummary; previous?: PeriodSummary | null; units: UnitSystem }) {
  const { colors, spacing } = useTheme();
  const w = summary.water;
  const a = summary.activity;
  const s = summary.sleep;
  const weekly = Math.round(a.weeklyMinutes);
  const period = `${summary.totalDays} days`;
  const p = previous;
  // The same figure as the Overview tile (formatVolume: litres, or fl oz), split into number and unit.
  const [waterValue, ...waterUnit] = w ? formatVolume(w.avgMl, units).split(' ') : [];
  /** A number stays on the line of its unit. */
  const keep = (text: string) => text.replace(/(\d) (?=[a-zA-Z])/g, '$1\u00A0');
  return (
    <Card testID="progress-habits" style={{ gap: spacing.md }}>
      <Text variant="h3" accessibilityRole="header" {...({ 'aria-level': 2 } as object)}>
        Water, activity and sleep
      </Text>
      <HabitRow
        testID="progress-habit-water"
        route="/water"
        color={colors.water}
        title="Hydration"
        value={w ? waterValue : null}
        unit={`${waterUnit.join(' ')} / day`}
        detail={w ? keep(`Goal reached on ${w.daysAtGoal} of ${w.daysTracked} days · goal ${formatVolume(w.avgGoalMl, units)}`) : 'No drinks logged in this range yet'}
        progress={w ? w.avgMl / w.avgGoalMl : 0}
        trend={changeDirection('waterMl', w?.avgMl, p?.water?.avgMl)}
        change={changeWords('waterMl', w?.avgMl, p?.water?.avgMl, { period, units })}
        period={period}
      />
      <Divider />
      <HabitRow
        testID="progress-habit-activity"
        route="/train"
        color={colors.exercise}
        title="Activity"
        value={a.minutes ? `${weekly}` : null}
        unit="min / wk"
        detail={
          a.minutes
            ? `${plural(a.sessions, 'session')} · hard ones count double toward the ${WEEKLY_ACTIVE_MINUTES}`
            : 'No workouts logged in this range yet'
        }
        progress={weekly / WEEKLY_ACTIVE_MINUTES}
        trend={p && (a.minutes || p.activity.minutes) ? changeDirection('minutes', weekly, Math.round(p.activity.weeklyMinutes)) : null}
        change={p && (a.minutes || p.activity.minutes) ? changeWords('minutes', weekly, Math.round(p.activity.weeklyMinutes), { period }) : null}
        period={period}
      />
      <Divider />
      <HabitRow
        testID="progress-habit-sleep"
        route="/sleep"
        color={colors.sleep}
        title="Sleep"
        // Hours and minutes, as Sleep and the morning page draw a night ("7 h 9 min / night"), never decimal hours.
        value={s ? hoursFigure(s.avgHours).value : null}
        unit={s ? `${hoursFigure(s.avgHours).unit} / night` : 'h / night'}
        spoken={s ? `${hoursSpoken(s.avgHours)} a night` : undefined}
        detail={s ? keep(sleepDetail(s)) : 'No sleep logged in this range yet'}
        progress={s ? Math.min(s.avgHours, SLEEP_MAX_HOURS) / SLEEP_TARGET_HOURS : 0}
        trend={changeDirection('sleep', s?.avgHours, p?.sleep?.avgHours)}
        change={changeWords('sleep', s?.avgHours, p?.sleep?.avgHours, { period })}
        period={period}
      />
      {p ? <TrendLegend period={period} /> : null}
    </Card>
  );
}
