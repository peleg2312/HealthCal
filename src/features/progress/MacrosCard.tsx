import { ChartPie } from 'lucide-react-native';
import React from 'react';
import { View } from 'react-native';

import { formatShortDate, weekdayShort } from '@/lib/dates';
import { isCompleteDay, type InsightDay, type PeriodSummary } from '@/lib/insights';
import { macroPercents } from '@/lib/nutrition';
import { useTheme } from '@/theme';
import { BarChart, MacroBar, ProgressBar, Text, type BarDatum } from '@/ui';

import { LegendDot, Note, SectionCard } from './parts';

export function MacrosCard({ summary, days, today }: { summary: PeriodSummary; days: InsightDay[]; today: string }) {
  const { colors, spacing } = useTheme();
  const m = summary.macros;
  if (!m) return null;
  const rows = [
    { key: 'protein', label: 'Protein', color: colors.protein, ...m.protein },
    { key: 'carbs', label: 'Carbs', color: colors.carbs, ...m.carbs },
    { key: 'fat', label: 'Fat', color: colors.fat, ...m.fat },
    ...(m.fiber ? [{ key: 'fiber', label: 'Fibre', color: colors.weight, ...m.fiber }] : []),
  ];
  // Daily stacked macro calories for the last 14 fully logged-or-not days, plus an average column.
  const recent = days.slice(-14);
  const seg = (p: number, c: number, f: number) => [
    { value: p * 4, color: colors.protein },
    { value: c * 4, color: colors.carbs },
    { value: f * 9, color: colors.fat },
  ];
  const bars: BarDatum[] = recent.map((d) => {
    const ok = isCompleteDay(d, today);
    const p = ok ? d.eaten.protein : 0;
    const c = ok ? d.eaten.carbs : 0;
    const f = ok ? d.eaten.fat : 0;
    return {
      label: recent.length <= 7 ? weekdayShort(d.date) : '',
      value: p * 4 + c * 4 + f * 9,
      segments: seg(p, c, f),
      detail: ok ? `${formatShortDate(d.date)} · P ${Math.round(p)} C ${Math.round(c)} F ${Math.round(f)} g` : `${formatShortDate(d.date)} · not fully logged`,
    };
  });
  bars.push({
    label: 'Avg',
    value: m.protein.avg * 4 + m.carbs.avg * 4 + m.fat.avg * 9,
    segments: seg(m.protein.avg, m.carbs.avg, m.fat.avg),
    detail: `Average · P ${Math.round(m.protein.avg)} C ${Math.round(m.carbs.avg)} F ${Math.round(m.fat.avg)} g`,
  });
  const pct = macroPercents({ kcal: 0, protein: m.protein.avg, carbs: m.carbs.avg, fat: m.fat.avg });
  return (
    <SectionCard
      testID="progress-macros"
      title="Macros"
      subtitle="Daily average against your targets"
      color={colors.protein}
      icon={<ChartPie size={18} color={colors.protein} />}>
      <View style={{ gap: spacing.md }}>
        {rows.map((r) => {
          const ratio = r.target > 0 ? r.avg / r.target : 0;
          return (
            <View key={r.key} testID={`progress-macro-${r.key}`} style={{ gap: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: r.color }} />
                <Text variant="bodyStrong" style={{ flex: 1 }}>
                  {r.label}
                </Text>
                <Text variant="bodyStrong" tabular>
                  {Math.round(r.avg)}
                </Text>
                <Text variant="caption" color="textSecondary" tabular>
                  / {Math.round(r.target)} g
                </Text>
                <Text variant="caption" color="textTertiary" tabular style={{ width: 40, textAlign: 'right' }}>
                  {Math.round(ratio * 100)}%
                </Text>
              </View>
              <ProgressBar progress={ratio} color={r.color} height={6} />
            </View>
          );
        })}
      </View>
      <View style={{ gap: spacing.sm }} testID="progress-macros-daily">
        <Text variant="label" color="textSecondary">
          {recent.length >= 14 ? 'Last 14 days, calories by macro' : 'Calories by macro, day by day'}
        </Text>
        <BarChart testID="progress-macros-chart" data={bars} color={colors.protein} height={130} scrub />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing.lg, rowGap: spacing.xs }}>
          <LegendDot color={colors.protein} label="Protein" />
          <LegendDot color={colors.carbs} label="Carbs" />
          <LegendDot color={colors.fat} label="Fat" />
        </View>
      </View>
      <View style={{ gap: 6 }}>
        <MacroBar protein={m.protein.avg * 4} carbs={m.carbs.avg * 4} fat={m.fat.avg * 9} height={10} />
        <Note>
          Calories from protein {Math.round(pct.protein * 100)}%, carbs {Math.round(pct.carbs * 100)}%, fat {Math.round(pct.fat * 100)}%.
        </Note>
      </View>
    </SectionCard>
  );
}
