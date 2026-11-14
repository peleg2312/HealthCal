import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, View, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';

import { diffDays, formatDayLabel, fromISODate, startOfWeek } from '@/lib/dates';
import { useDays } from '@/store/selectors';
import { cup, fonts, useTheme } from '@/theme';
import type { ISODate } from '@/types';
import { IconButton, MiniCup, PressableScale, Text } from '@/ui';

import { dayRing, weekCaption, weekDates } from './week';

const LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
export const STRIP_WEEKS = 8;

/**
 * Monday-to-Sunday strip of mini cups, paged back over the last eight weeks
 * (never further back than the week the profile was made). Each cup is filled
 * to that day's eaten kcal over its budget (an amber lip in proportion when
 * over, a dashed outline for a day still to come), so the strip doubles as a
 * chart. A day before the profile was made is a small dot, not an empty cup:
 * it was not missed. The cups pour left to right, and a past day does not pour
 * again when the strip remounts. The selected day's date is an ink box.
 */
export function DayRingStrip({
  today,
  selected,
  onSelect,
  testIDPrefix = 'today',
  accessory,
  start,
}: {
  today: ISODate;
  selected: ISODate;
  onSelect: (d: ISODate) => void;
  /** Tab screens stay mounted together, so each place that shows the strip names its own test ids. */
  testIDPrefix?: string;
  /** Shown in the caption row before the week arrows (Today puts the streak there). */
  accessory?: React.ReactNode;
  /** The day the profile was made: earlier days with nothing logged are drawn as a dot and cannot be picked. */
  start?: ISODate;
}) {
  const { colors, spacing } = useTheme();
  const ref = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const [width, setWidth] = useState(0);
  // Page index counted back from the current week: 0 is this week.
  const maxBack = start ? Math.min(STRIP_WEEKS - 1, weeksBetween(start, today)) : STRIP_WEEKS - 1;
  const [back, setBack] = useState(() => Math.min(maxBack, weeksBetween(selected, today)));
  // Every day from the first shown Monday to today; later days are drawn as future.
  const count = diffDays(weekDates(today, STRIP_WEEKS - 1)[0], today) + 1;
  const days = useDays(count, today);
  const byDate = new Map(days.map((d) => [d.date, d]));

  const scrollTo = (b: number, animated: boolean) => {
    if (width > 0) ref.current?.scrollTo({ x: (maxBack - b) * width, animated });
  };

  // Follow the selection whenever it changes (a tap, the Today chip, midnight), even within the same week.
  const selectedBack = Math.min(maxBack, weeksBetween(selected, today));
  const [followed, setFollowed] = useState(selected);
  if (followed !== selected) {
    setFollowed(selected);
    setBack(selectedBack);
  }
  // The first placement jumps; later moves (a new selection) glide.
  const placed = useRef(false);
  // Hidden until the first jump (once the pages have their size), so a slow first paint never shows the oldest week (web ignores contentOffset).
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (width <= 0) return;
    ref.current?.scrollTo({ x: (maxBack - selectedBack) * width, animated: placed.current });
    placed.current = true;
  }, [selected, selectedBack, width, maxBack]);

  const onLayout = (e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    if (w !== width) setWidth(w);
  };
  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (width <= 0) return;
    const page = Math.round(e.nativeEvent.contentOffset.x / width);
    setBack(Math.min(maxBack, Math.max(0, maxBack - page)));
  };
  const page = (b: number) => {
    const next = Math.min(maxBack, Math.max(0, b));
    setBack(next);
    scrollTo(next, true);
  };

  const shownWeek = weekDates(today, back)
    .map((d) => byDate.get(d))
    .filter((d) => d !== undefined);

  return (
    <View style={{ gap: spacing.xs }} testID={`${testIDPrefix}-week`}>
      <View onLayout={onLayout}>
        {width > 0 ? (
          <ScrollView
            ref={ref}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={onScrollEnd}
            onScrollEndDrag={onScrollEnd}
            contentOffset={{ x: (maxBack - back) * width, y: 0 }}
            style={{ opacity: ready ? 1 : 0 }}
            onContentSizeChange={() => {
              if (ready) return;
              ref.current?.scrollTo({ x: (maxBack - selectedBack) * width, animated: false });
              setReady(true);
            }}
            scrollEventThrottle={16}>
            {Array.from({ length: maxBack + 1 }, (_, i) => maxBack - i).map((b) => (
              <View key={b} style={{ width, flexDirection: 'row', paddingTop: 2 }} accessibilityRole="tablist">
                {weekDates(today, b).map((d, i) => {
                  const summary = byDate.get(d);
                  const ring = summary ? dayRing(summary, today, start) : { date: d, state: 'future' as const, progress: 0, close: false };
                  const isSelected = d === selected;
                  const isToday = d === today;
                  const future = ring.state === 'future';
                  const before = ring.state === 'before';
                  const kcal =
                    summary && summary.entries.length
                      ? `, ${Math.round(summary.eaten.kcal)} of ${summary.budget} kilocalories${ring.state === 'over' ? ', over budget' : ''}`
                      : future
                        ? ''
                        : before
                          ? ', before you started'
                          : ', nothing logged';
                  return (
                    <PressableScale
                      key={d}
                      testID={`${testIDPrefix}-day-${d}`}
                      feedback="select"
                      scaleTo={0.94}
                      disabled={future || before}
                      onPress={() => onSelect(d)}
                      accessibilityRole="tab"
                      accessibilityState={{
                        selected: isSelected,
                        disabled: future || before,
                      }}
                      accessibilityLabel={`${formatDayLabel(d)}${kcal}`}
                      // A future day is drawn dashed; fading it as well would make its date unreadable.
                      dimDisabled={false}
                      style={{ flex: 1, minHeight: 44, alignItems: 'center', gap: 6, paddingBottom: 2 }}>
                      <Text variant="label" color={isSelected ? 'text' : 'textSecondary'} style={{ fontSize: 12, lineHeight: 16, fontFamily: isSelected ? fonts.bold : fonts.semibold }}>
                        {LETTERS[i]}
                      </Text>
                      {before ? (
                        <View style={{ width: 30, height: 38, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 4 }}>
                          <View style={{ width: 3, height: 3, borderRadius: 1, backgroundColor: colors.textTertiary }} />
                        </View>
                      ) : (
                        <MiniCup index={i} memoryKey={`cal-${d}`} progress={ring.progress} over={ring.state === 'over'} future={future} color={colors.calories} />
                      )}
                      <View
                        style={{
                          width: 32,
                          height: 24,
                          ...cup(9, 4),
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: isSelected ? colors.text : 'transparent',
                          borderWidth: isToday && !isSelected ? 1.5 : 0,
                          borderColor: colors.text,
                        }}>
                        <Text
                          variant="numM"
                          color={isSelected ? 'bg' : future || before ? 'textTertiary' : 'text'}
                          style={{ fontSize: 14, lineHeight: 20, letterSpacing: 0 }}>
                          {fromISODate(d).getDate()}
                        </Text>
                      </View>
                    </PressableScale>
                  );
                })}
              </View>
            ))}
          </ScrollView>
        ) : (
          <View style={{ height: 96 }} />
        )}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
        <Text variant="caption" color="textSecondary" style={{ flex: 1 }} numberOfLines={2} testID={`${testIDPrefix}-week-caption`}>
          {weekCaption(shownWeek, today, start)}
        </Text>
        {accessory}
        <IconButton
          testID={`${testIDPrefix}-week-prev`}
          accessibilityLabel="Previous week"
          size={32}
          tone="clear"
          disabled={back >= maxBack}
          onPress={() => page(back + 1)}>
          <ChevronLeft size={20} color={colors.text} strokeWidth={2} />
        </IconButton>
        <IconButton testID={`${testIDPrefix}-week-next`} accessibilityLabel="Next week" size={32} tone="clear" disabled={back <= 0} onPress={() => page(back - 1)}>
          <ChevronRight size={20} color={colors.text} strokeWidth={2} />
        </IconButton>
      </View>
    </View>
  );
}

function weeksBetween(date: ISODate, today: ISODate): number {
  const w = Math.round(diffDays(startOfWeek(date), startOfWeek(today)) / 7);
  return Math.min(STRIP_WEEKS - 1, Math.max(0, w));
}
