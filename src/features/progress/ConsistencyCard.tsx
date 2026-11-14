import React from 'react';
import { View } from 'react-native';

import { addDays, startOfWeek, weekdayShort } from '@/lib/dates';
import type { InsightDay } from '@/lib/insights';
import type { Consistency } from '@/store/selectors';
import { fonts, useTheme } from '@/theme';
import { MiniCup, Text } from '@/ui';

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
      link="/consistency"
      linkLabel="Calendar">
      <View style={{ flexDirection: 'row', gap: spacing.lg }}>
        <View style={{ flex: 1 }}>
          <BigStat value={`${streak}`} unit={streak === 1 ? 'day' : 'days'} label="Current streak" />
        </View>
        <View style={{ flex: 1 }}>
          <BigStat value={`${thisWeek}`} unit={`of ${elapsed}`} label="Days logged this week" />
        </View>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }} accessible accessibilityLabel={`Logged ${thisWeek} of ${elapsed} days this week`}>
        {week.map((d) => {
          const isLogged = logged.has(d);
          const future = d > today;
          const isToday = d === today;
          return (
            <View key={d} style={{ alignItems: 'center', gap: 6, width: 36 }}>
              <Text variant="caption" color={isToday ? 'text' : 'textSecondary'} style={{ fontFamily: fonts.semibold }}>
                {weekdayShort(d).slice(0, 1)}
              </Text>
              {/* A full cup for a logged day, an empty one for a missed day, a dashed outline for days to come. */}
              <MiniCup progress={isLogged ? 1 : 0} color={colors.calories} future={future} height={30} width={26} />
              <View style={{ width: 8, height: 3, borderRadius: 1, backgroundColor: isToday ? colors.rim : 'transparent' }} />
            </View>
          );
        })}
      </View>
      <Note>
        {streak === 0
          ? 'Log a meal today to start a streak. A single missed day never breaks it; only two in a row do.'
          : 'A single missed day never breaks your streak, however often it happens; only two missed days in a row do.'}
      </Note>
    </SectionCard>
  );
}
