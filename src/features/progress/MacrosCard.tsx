import { ChartPie } from 'lucide-react-native';
import React from 'react';
import { View } from 'react-native';

import type { PeriodSummary } from '@/lib/insights';
import { macroPercents } from '@/lib/nutrition';
import { useTheme } from '@/theme';
import { MacroBar, ProgressBar, Text } from '@/ui';

import { Note, SectionCard } from './parts';

export function MacrosCard({ summary }: { summary: PeriodSummary }) {
  const { colors, spacing } = useTheme();
  const m = summary.macros;
  if (!m) return null;
  const rows = [
    { key: 'protein', label: 'Protein', color: colors.protein, ...m.protein },
    { key: 'carbs', label: 'Carbs', color: colors.carbs, ...m.carbs },
    { key: 'fat', label: 'Fat', color: colors.fat, ...m.fat },
    ...(m.fiber ? [{ key: 'fiber', label: 'Fibre', color: colors.weight, ...m.fiber }] : []),
  ];
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
      <View style={{ gap: 6 }}>
        <MacroBar protein={m.protein.avg * 4} carbs={m.carbs.avg * 4} fat={m.fat.avg * 9} height={10} />
        <Note>
          Calories from protein {Math.round(pct.protein * 100)}%, carbs {Math.round(pct.carbs * 100)}%, fat {Math.round(pct.fat * 100)}%.
        </Note>
      </View>
    </SectionCard>
  );
}
