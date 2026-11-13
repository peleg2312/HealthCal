import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, View, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';

import { diffDays, formatDayLabel, fromISODate, startOfWeek } from '@/lib/dates';
import { useDays } from '@/store/selectors';
import { useTheme } from '@/theme';
import type { ISODate } from '@/types';
import { IconButton, PressableScale, Ring, Text } from '@/ui';

import { dayRing, weekCaption, weekDates } from './week';

const LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
export const STRIP_WEEKS = 8;

/**
 * Monday-to-Sunday strip of day rings, paged back over the last eight weeks.
 * Each ring is eaten kcal over that day's budget; tapping a day selects it.
 */
export function DayRingStrip({ today, selected, onSelect }: { today: ISODate; selected: ISODate; onSelect: (d: ISODate) => void }) {
  const { colors, spacing } = useTheme();
  const ref = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const [width, setWidth] = useState(0);
  // Page index counted back from the current week: 0 is this week.
  const [back, setBack] = useState(() => weeksBetween(selected, today));
  // Every day from the first shown Monday to today; later days are drawn as future.
  const count = diffDays(weekDates(today, STRIP_WEEKS - 1)[0], today) + 1;
  const days = useDays(count, today);
  const byDate = new Map(days.map((d) => [d.date, d]));

  const scrollTo = (b: number, animated: boolean) => {
    if (width > 0) ref.current?.scrollTo({ x: (STRIP_WEEKS - 1 - b) * width, animated });
  };

  // Follow the selection when it moves to another week (the Today chip, a deep link).
  const selectedBack = weeksBetween(selected, today);
  const [followed, setFollowed] = useState(selectedBack);
  if (followed !== selectedBack) {
    setFollowed(selectedBack);
    setBack(selectedBack);
  }
  useEffect(() => {
    if (width > 0) ref.current?.scrollTo({ x: (STRIP_WEEKS - 1 - selectedBack) * width, animated: true });
  }, [selectedBack, width]);

  const onLayout = (e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    if (w !== width) setWidth(w);
  };
  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (width <= 0) return;
    const page = Math.round(e.nativeEvent.contentOffset.x / width);
    setBack(Math.min(STRIP_WEEKS - 1, Math.max(0, STRIP_WEEKS - 1 - page)));
  };
  const page = (b: number) => {
    const next = Math.min(STRIP_WEEKS - 1, Math.max(0, b));
    setBack(next);
    scrollTo(next, true);
  };

  const shownWeek = weekDates(today, back)
    .map((d) => byDate.get(d))
    .filter((d) => d !== undefined);

  return (
    <View style={{ gap: spacing.xs }} testID="today-week">
      <View onLayout={onLayout}>
        {width > 0 ? (
          <ScrollView
            ref={ref}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={onScrollEnd}
            onScrollEndDrag={onScrollEnd}
            contentOffset={{ x: (STRIP_WEEKS - 1 - back) * width, y: 0 }}
            scrollEventThrottle={16}>
            {Array.from({ length: STRIP_WEEKS }, (_, i) => STRIP_WEEKS - 1 - i).map((b) => (
              <View key={b} style={{ width, flexDirection: 'row', gap: 4 }} accessibilityRole="tablist">
                {weekDates(today, b).map((d, i) => {
                  const summary = byDate.get(d);
                  const ring = summary ? dayRing(summary, today) : { date: d, state: 'future' as const, progress: 0 };
                  const isSelected = d === selected;
                  const isToday = d === today;
                  const future = ring.state === 'future';
                  const kcal =
                    summary && summary.entries.length
                      ? `, ${Math.round(summary.eaten.kcal)} of ${summary.budget} kilocalories`
                      : future
                        ? ''
                        : ', nothing logged';
                  return (
                    <PressableScale
                      key={d}
                      testID={`today-day-${d}`}
                      feedback="select"
                      scaleTo={0.94}
                      disabled={future}
                      onPress={() => onSelect(d)}
                      accessibilityRole="tab"
                      accessibilityState={{
                        selected: isSelected,
                        disabled: future,
                      }}
                      accessibilityLabel={`${formatDayLabel(d)}${kcal}`}
                      style={{
                        flex: 1,
                        minHeight: 44,
                        alignItems: 'center',
                        paddingTop: 6,
                        paddingBottom: 4,
                        gap: 4,
                        borderRadius: 14,
                        backgroundColor: isSelected ? colors.primarySoft : 'transparent',
                        opacity: future ? 0.45 : 1,
                      }}>
                      <Text variant="caption" color={isSelected ? 'primary' : 'textTertiary'} style={{ fontSize: 11 }}>
                        {LETTERS[i]}
                      </Text>
                      <Ring size={32} stroke={4} animate={false} progress={ring.progress} color={colors.calories} overColor={colors.warning}>
                        <Text
                          variant="caption"
                          tabular
                          color={isSelected ? 'primary' : isToday ? 'text' : 'textSecondary'}
                          style={{
                            fontSize: 12,
                            fontWeight: isSelected || isToday ? '700' : '500',
                          }}>
                          {fromISODate(d).getDate()}
                        </Text>
                      </Ring>
                      <View
                        style={{
                          width: 4,
                          height: 4,
                          borderRadius: 2,
                          backgroundColor: isToday ? colors.primary : 'transparent',
                        }}
                      />
                    </PressableScale>
                  );
                })}
              </View>
            ))}
          </ScrollView>
        ) : (
          <View style={{ height: 70 }} />
        )}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
        <Text variant="caption" color="textSecondary" style={{ flex: 1 }} numberOfLines={2} testID="today-week-caption">
          {weekCaption(shownWeek, today)}
        </Text>
        <IconButton
          testID="today-week-prev"
          accessibilityLabel="Previous week"
          size={32}
          tone="clear"
          disabled={back >= STRIP_WEEKS - 1}
          onPress={() => page(back + 1)}>
          <ChevronLeft size={18} color={back >= STRIP_WEEKS - 1 ? colors.textTertiary : colors.textSecondary} />
        </IconButton>
        <IconButton testID="today-week-next" accessibilityLabel="Next week" size={32} tone="clear" disabled={back <= 0} onPress={() => page(back - 1)}>
          <ChevronRight size={18} color={back <= 0 ? colors.textTertiary : colors.textSecondary} />
        </IconButton>
      </View>
    </View>
  );
}

function weeksBetween(date: ISODate, today: ISODate): number {
  const w = Math.round(diffDays(startOfWeek(date), startOfWeek(today)) / 7);
  return Math.min(STRIP_WEEKS - 1, Math.max(0, w));
}
