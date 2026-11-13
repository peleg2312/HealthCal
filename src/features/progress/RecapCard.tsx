import { CalendarCheck, Star, Target, Trophy } from 'lucide-react-native';
import React from 'react';
import { View } from 'react-native';

import { formatDayLabel } from '@/lib/dates';
import { weekRangeLabel, type WeeklyRecap } from '@/lib/insights';
import { formatNumber } from '@/lib/units';
import { useTheme } from '@/theme';
import { Text } from '@/ui';

import { SectionCard, StatStrip } from './parts';

function Line({ icon, color, label, text }: { icon: React.ReactNode; color: string; label: string; text: string }) {
  const { spacing, radius } = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' }}>
      <View style={{ width: 28, height: 28, borderRadius: radius.sm, backgroundColor: `${color}22`, alignItems: 'center', justifyContent: 'center' }}>{icon}</View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="overline" color="textTertiary">
          {label.toUpperCase()}
        </Text>
        <Text variant="body" style={{ fontSize: 14, lineHeight: 20 }}>
          {text}
        </Text>
      </View>
    </View>
  );
}

export function RecapCard({ recap }: { recap: WeeklyRecap }) {
  const { colors, spacing } = useTheme();
  const s = recap.summary;
  return (
    <SectionCard
      testID="progress-recap"
      title="Weekly recap"
      subtitle={`${recap.label} · ${weekRangeLabel(recap.weekStart, recap.weekEnd)}`}
      color={colors.carbs}
      icon={<CalendarCheck size={18} color={colors.carbs} />}>
      <StatStrip
        items={[
          { label: 'Avg kcal', value: s.calories ? formatNumber(Math.round(s.calories.avgKcal)) : '–' },
          { label: 'Protein g', value: s.macros ? `${Math.round(s.macros.protein.avg)}` : '–' },
          { label: 'Active min', value: `${s.activity.minutes}` },
          { label: 'Water goal days', value: s.water ? `${s.water.daysAtGoal}/${s.water.daysTracked}` : '–' },
        ]}
      />
      <View style={{ gap: spacing.md }}>
        {recap.bestDay ? (
          <Line icon={<Star size={15} color={colors.carbs} />} color={colors.carbs} label={`Best day · ${formatDayLabel(recap.bestDay.date)}`} text={recap.bestDay.detail} />
        ) : null}
        <Line icon={<Trophy size={15} color={colors.success} />} color={colors.success} label="Win" text={recap.win} />
        <Line icon={<Target size={15} color={colors.water} />} color={colors.water} label="Focus for next week" text={recap.focus} />
      </View>
    </SectionCard>
  );
}
