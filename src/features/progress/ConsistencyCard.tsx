import React from 'react';
import { View } from 'react-native';

import { hasFoodLogged } from '@/features/drinks/via';
import { addDays, startOfWeek, weekdayShort } from '@/lib/dates';
import type { InsightDay } from '@/lib/insights';
import type { Consistency } from '@/store/selectors';
import { fonts, useTheme } from '@/theme';
import { AnimatedNumber, figure, MiniCup, Text } from '@/ui';

import { BigStat, Note, SectionCard } from './parts';

export function ConsistencyCard({ consistency, weekDays, today }: { consistency: Consistency; weekDays: InsightDay[]; today: string }) {
  const { colors, spacing } = useTheme();
  const start = startOfWeek(today);
  // Food logged, as the streak and the total beside it count (drinks from Water alone are not a logged day).
  const logged = new Set(weekDays.filter((d) => hasFoodLogged(d.entries)).map((d) => d.date));
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
          <View {...figure(`Current streak ${streak} ${streak === 1 ? 'day' : 'days'}`)}>
            <AnimatedNumber variant="numL" value={streak} memoryKey="progress-streak">
              <Text variant="unit">{streak === 1 ? ' day' : ' days'}</Text>
            </AnimatedNumber>
            <Text variant="caption" color="textSecondary">
              Current streak
            </Text>
          </View>
        </View>
        <View style={{ flex: 1 }}>
          <BigStat value={`${thisWeek}`} unit={`of ${elapsed}`} label="Days logged this week" />
        </View>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }} {...figure(`Logged ${thisWeek} of ${elapsed} days this week`)}>
        {week.map((d, i) => {
          const isLogged = logged.has(d);
          const future = d > today;
          const isToday = d === today;
          return (
            <View key={d} style={{ alignItems: 'center', gap: 6, width: 36 }}>
              <Text variant="caption" color={isToday ? 'text' : 'textSecondary'} style={{ fontFamily: fonts.semibold }}>
                {weekdayShort(d).slice(0, 1)}
              </Text>
              {/* A full cup for a logged day, an empty one for a missed day, a dashed outline for days to come. */}
              <MiniCup progress={isLogged ? 1 : 0} color={colors.calories} future={future} height={30} width={26} index={i} memoryKey={`logged-${d}`} />
              <View style={{ width: 8, height: 3, borderRadius: 1, backgroundColor: isToday ? colors.rim : 'transparent' }} />
            </View>
          );
        })}
      </View>
      <Note>
        {streak === 0
          ? 'Log a meal today to start a streak. A single day without a log never breaks it; two in a row do.'
          : 'A single day without a log never breaks your streak, however often it happens; two such days in a row do.'}
      </Note>
    </SectionCard>
  );
}
