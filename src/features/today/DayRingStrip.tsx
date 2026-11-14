import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Platform, ScrollView, View, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';

import { diffDays, formatDayLabel, fromISODate, startOfWeek } from '@/lib/dates';
import { useDays } from '@/store/selectors';
import { cup, fonts, useTheme } from '@/theme';
import type { ISODate } from '@/types';
import { FadeUp, IconButton, MiniCup, PressableScale, Text, useReducedMotion } from '@/ui';

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
  note,
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
  /**
   * A line said in the caption's place while the current week is shown (Today's streak line), so
   * it never pushes the page down. It fades in after `delay` ms (at once under reduced motion).
   */
  note?: { text: string; delay: number; testID?: string } | null;
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
  // The first placement jumps; later moves (a new selection) glide. It runs before the browser
  // paints (web ignores contentOffset), so even a slow first paint shows the right week, never
  // the oldest one, and the strip is never hidden while it waits.
  const placed = useRef(false);
  // Where a scroll this component started is heading, so the scroll events on the way do not move `back`.
  const heading = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (width <= 0) return;
    const x = (maxBack - selectedBack) * width;
    heading.current = placed.current ? x : null;
    ref.current?.scrollTo({ x, animated: placed.current });
    placed.current = true;
  }, [selected, selectedBack, width, maxBack]);

  const onLayout = (e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    if (w !== width) setWidth(w);
  };
  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (width <= 0) return;
    const page = Math.round(e.nativeEvent.contentOffset.x / width);
    heading.current = null;
    setBack(Math.min(maxBack, Math.max(0, maxBack - page)));
  };
  // Web has no scroll-end events: whenever the strip comes to rest on a page (a swipe, a trackpad,
  // focus scrolling a day into view) the caption and arrows follow the week that is shown.
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (width <= 0) return;
    const x = e.nativeEvent.contentOffset.x;
    const page = Math.round(x / width);
    if (Math.abs(x - page * width) > 1) return;
    if (heading.current !== null) {
      if (Math.abs(x - heading.current) > 1) return;
      heading.current = null;
    }
    const b = Math.min(maxBack, Math.max(0, maxBack - page));
    if (b !== back) setBack(b);
  };
  const page = (b: number) => {
    const next = Math.min(maxBack, Math.max(0, b));
    setBack(next);
    heading.current = (maxBack - next) * width;
    scrollTo(next, true);
  };

  // The note takes the caption's place once its delay has passed; it shows only on the current week.
  const reduce = useReducedMotion();
  const [noteShown, setNoteShown] = useState<string | null>(null);
  const noteText = note?.text ?? null;
  const noteDelay = note?.delay ?? 0;
  useEffect(() => {
    if (!noteText) return;
    const timer = setTimeout(() => setNoteShown(noteText), reduce ? 0 : noteDelay);
    return () => clearTimeout(timer);
  }, [noteText, noteDelay, reduce]);
  const showNote = noteText !== null && noteShown === noteText && back === 0;

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
            onScroll={onScroll}
            contentOffset={{ x: (maxBack - back) * width, y: 0 }}
            // Native: the content can be laid out after the first placement; place it again, without a frame of the oldest week.
            onContentSizeChange={Platform.OS === 'web' ? undefined : () => ref.current?.scrollTo({ x: (maxBack - back) * width, animated: false })}
            scrollEventThrottle={16}>
            {Array.from({ length: maxBack + 1 }, (_, i) => maxBack - i).map((b) => (
              <View
                key={b}
                style={{ width, flexDirection: 'row', paddingTop: 2 }}
                accessibilityRole="tablist"
                // Only the week on screen is in the tab order and read out; the arrows page to the others.
                accessibilityElementsHidden={b !== back}
                importantForAccessibility={b !== back ? 'no-hide-descendants' : 'auto'}
                {...(Platform.OS === 'web' && b !== back ? ({ 'aria-hidden': true } as object) : null)}>
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
                      // Only the week on screen takes keyboard focus (react-native-web reads tabIndex).
                      focusable={b === back}
                      tabIndex={b === back && !future && !before ? 0 : -1}
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
      {/* With a note slot, two caption lines' height is kept, so a note that wraps moves nothing. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, minHeight: note !== undefined ? 34 : undefined }}>
        {showNote ? (
          <FadeUp key={noteText} style={{ flex: 1 }}>
            <Text variant="caption" color="text" numberOfLines={2} testID={note?.testID} accessibilityLiveRegion="polite">
              {noteText}
            </Text>
          </FadeUp>
        ) : (
          <Text variant="caption" color="textSecondary" style={{ flex: 1 }} numberOfLines={2} testID={`${testIDPrefix}-week-caption`}>
            {weekCaption(shownWeek, today, start)}
          </Text>
        )}
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
