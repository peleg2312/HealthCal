import { CalendarDays, Check } from 'lucide-react-native';
import React from 'react';
import { View } from 'react-native';

import { addDays, startOfWeek, weekdayShort } from '@/lib/dates';
import type { InsightDay } from '@/lib/insights';
import type { Consistency } from '@/store/selectors';
import { useTheme } from '@/theme';
import { Text } from '@/ui';

import { BigStat, Note, SectionCard } from './parts';

export function ConsistencyCard({ consistency, weekDays, today }: { consistency: Consistency; weekDays: InsightDay[]; today: string }) {
  const { colors, spacing } = useTheme();
  const start = startOfWeek(today);
  const logged = new Set(weekDays.filter((d) => d.entries.length > 0).map((d) => d.date));
  const week = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const elapsed = week.filter((d) => d <= today).length;
  const thisWeek = week.filter((d) => logged.has(d)).length;
  const streak = consistency.streak;

  return (
    <SectionCard
      testID="progress-consistency"
      title="Consistency"
      subtitle={`${consistency.totalDaysLogged} ${consistency.totalDaysLogged === 1 ? 'day' : 'days'} logged in total`}
      color={colors.primary}
      icon={<CalendarDays size={18} color={colors.primary} />}>
      <View style={{ flexDirection: 'row', gap: spacing.lg }}>
        <View style={{ flex: 1 }}>
          <BigStat value={`${streak}`} unit={streak === 1 ? 'day' : 'days'} label="Current streak" color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <BigStat value={`${thisWeek}`} unit={`of ${elapsed}`} label="Days logged this week" />
        </View>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }} accessibilityLabel={`Logged ${thisWeek} of ${elapsed} days this week`}>
        {week.map((d) => {
          const isLogged = logged.has(d);
          const future = d > today;
          const isToday = d === today;
          return (
            <View key={d} style={{ alignItems: 'center', gap: 6 }}>
              <View
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 17,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: isLogged ? colors.primary : future ? 'transparent' : colors.surfaceAlt,
                  borderWidth: isToday && !isLogged ? 1.5 : future ? 1 : 0,
                  borderColor: isToday ? colors.primary : colors.border,
                  borderStyle: future ? 'dashed' : 'solid',
                }}>
                {isLogged ? <Check size={16} color={colors.onPrimary} strokeWidth={3} /> : null}
              </View>
              <Text variant="caption" color={isToday ? 'text' : 'textTertiary'}>
                {weekdayShort(d).slice(0, 2)}
              </Text>
            </View>
          );
        })}
      </View>
      <Note>
        {streak === 0
          ? 'Log a meal today to start a streak. A single missed day never breaks it.'
          : 'A single missed day never breaks your streak, so a busy day costs nothing.'}
      </Note>
    </SectionCard>
  );
}
