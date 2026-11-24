import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react-native';
import React, { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Platform, ScrollView, useWindowDimensions, View, type AccessibilityActionEvent, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent, type StyleProp, type ViewStyle } from 'react-native';

import { spokenUnits } from '@/features/progress/chartWords';
import { diffDays, formatDayLabel, formatShortDate, fromISODate, startOfWeek } from '@/lib/dates';
import { useDays } from '@/store/selectors';
import { cup, fonts, MAX_CONTENT_WIDTH, useTheme } from '@/theme';
import type { ISODate } from '@/types';
import { Chip, FadeUp, IconButton, ListRow, MiniCup, PressableScale, Sheet, Text, useReducedMotion } from '@/ui';

import { DaySwipeGuard } from './useDaySwipe';
import { dayRing, weekCaption, weekDates } from './week';

const LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
export const STRIP_WEEKS = 8;
/** Each day is a whole touch target, 44 px wide at least. */
const DAY_MIN_W = 44;
/** The row under the strip: two caption lines (2 x 17) or a chip, whichever is taller, so the block is one height on both screens. */
export const CAPTION_ROW_H = 36;
/** The week arrows need this much window as well as a mouse; on a narrow window the caption keeps the room. */
const ARROWS_MIN_W = 400;
/** The week-picker cup: 32 px visible, 44 px to touch, 12 px from what is before it so the two touch areas never overlap. */
const PICK_CUP = 32;

/** A mouse or trackpad on web: where the week arrows show. Everywhere else the week-picker cup does the same with a tap. */
function subscribePointer(cb: () => void) {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || !window.matchMedia) return () => {};
  const mq = window.matchMedia('(pointer: fine)');
  mq.addEventListener?.('change', cb);
  return () => mq.removeEventListener?.('change', cb);
}
function finePointer(): boolean {
  return Platform.OS === 'web' && typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(pointer: fine)').matches;
}
export function useFinePointer(): boolean {
  return useSyncExternalStore(subscribePointer, finePointer, () => false);
}

/**
 * How far the row of days reaches into the screen's side margins: nothing where seven 44 px days
 * fit between them, else just enough (14 px a side on a 320 px phone), as a phone's own calendar
 * strip runs edge to edge. The caption and arrows under it stay in the margins.
 */
function stripBleed(windowW: number, gutter: number): number {
  const inner = Math.min(windowW, MAX_CONTENT_WIDTH) - 2 * gutter;
  return Math.max(0, Math.min(gutter - 4, Math.ceil((7 * DAY_MIN_W - inner) / 2)));
}

/**
 * Monday-to-Sunday strip of mini cups, paged back over the last eight weeks
 * (never further back than the week the profile was made). Each cup is filled
 * to that day's eaten kcal over its budget (an amber lip in proportion when
 * over, a dashed outline for a day still to come), so the strip doubles as a
 * chart. A day before the profile was made is a small dot, not an empty cup:
 * it was not missed. The cups pour left to right, and a past day does not pour
 * again when the strip remounts. The selected day's date is an ink box.
 *
 * It is the one date control at the top of Today and the diary: the strip (tap a
 * day; swipe it for other weeks), and one row under it, CAPTION_ROW_H tall, with
 * the week's caption on the left and on the right a "Back to today" chip when the
 * day shown is not today (else the `accessory`, Today's streak mark). Another week
 * is always one visible tap away, never only a swipe: with a mouse on a window 400 px
 * or wider the week arrows, everywhere else (a finger, a phone, a narrow window) the
 * calendar cup at the row's end (`<prefix>-week-pick`), which opens "Choose a week"
 * with every week the strip holds. Each day also offers "Previous week" and "Next
 * week" as accessibility actions. A swipe that starts on the strip pages weeks, never days.
 */
export function DayRingStrip({
  today,
  selected,
  onSelect,
  testIDPrefix = 'today',
  accessory,
  start,
  note,
  latest,
  jumpTestID,
  style,
}: {
  today: ISODate;
  selected: ISODate;
  onSelect: (d: ISODate) => void;
  /** The last day that can be picked (default today). The diary allows a week ahead, and the strip then shows next week too. */
  latest?: ISODate;
  /** testID of the "Back to today" chip (default `<prefix>-jump-today`). */
  jumpTestID?: string;
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
  /** Placement only (a margin): the block's own height never changes. */
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, spacing } = useTheme();
  const windowW = useWindowDimensions().width;
  const bleed = stripBleed(windowW, spacing.xl);
  const arrows = useFinePointer() && windowW >= ARROWS_MIN_W;
  const last = latest && latest > today ? latest : today;
  const ref = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const [width, setWidth] = useState(0);
  // Page index counted back from the current week: 0 is this week, -1 next week (the diary's week ahead).
  const maxBack = start ? Math.min(STRIP_WEEKS - 1, weeksBetween(start, today)) : STRIP_WEEKS - 1;
  const ahead = Math.max(0, -weeksBetween(last, today, 1));
  const clampBack = (b: number) => Math.min(maxBack, Math.max(-ahead, b));
  const [back, setBack] = useState(() => clampBack(weeksBetween(selected, today, ahead)));
  // Every day from the first shown Monday to today; later days are drawn as future.
  const count = diffDays(weekDates(today, STRIP_WEEKS - 1)[0], today) + 1;
  const days = useDays(count, today);
  const byDate = new Map(days.map((d) => [d.date, d]));

  const scrollTo = (b: number, animated: boolean) => {
    if (width > 0) ref.current?.scrollTo({ x: (maxBack - b) * width, animated });
  };

  // Follow the selection whenever it changes (a tap, the Today chip, midnight), even within the same week.
  const selectedBack = clampBack(weeksBetween(selected, today, ahead));
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
  // Where the strip last reported itself: a scroll to where it already is fires no event, so it heads nowhere.
  const at = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (width <= 0) return;
    const x = (maxBack - selectedBack) * width;
    heading.current = placed.current && (at.current === null || Math.abs(at.current - x) > 1) ? x : null;
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
    setBack(clampBack(maxBack - page));
  };
  // Web has no scroll-end events: whenever the strip comes to rest on a page (a swipe, a trackpad,
  // focus scrolling a day into view) the caption and arrows follow the week that is shown.
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (width <= 0) return;
    const x = e.nativeEvent.contentOffset.x;
    at.current = x;
    const page = Math.round(x / width);
    if (Math.abs(x - page * width) > 1) return;
    if (heading.current !== null) {
      if (Math.abs(x - heading.current) > 1) return;
      heading.current = null;
    }
    const b = clampBack(maxBack - page);
    if (b !== back) setBack(b);
  };
  const page = (b: number) => {
    const next = clampBack(b);
    setBack(next);
    const x = (maxBack - next) * width;
    heading.current = at.current === null || Math.abs(at.current - x) > 1 ? x : null;
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

  const captionFor = (b: number) =>
    b < 0
      ? 'Next week, to plan ahead'
      : weekCaption(
          weekDates(today, b)
            .map((d) => byDate.get(d))
            .filter((d) => d !== undefined),
          today,
          start,
        );
  const caption = captionFor(back);
  // "Choose a week": open while the person picks one of the strip's weeks.
  const [picking, setPicking] = useState(false);
  const weekTitle = (b: number) => {
    const dates = weekDates(today, b);
    return b === 0 ? 'This week' : b === 1 ? 'Last week' : b === -1 ? 'Next week' : `Week of ${formatShortDate(dates[0])}`;
  };
  const narrow = windowW < 360;
  // Natively and on touch the arrows are not drawn: every day offers the same as actions.
  const weekActions = [
    ...(back < maxBack ? [{ name: 'previousWeek', label: 'Previous week' }] : []),
    ...(back > -ahead ? [{ name: 'nextWeek', label: 'Next week' }] : []),
  ];
  const onWeekAction = (e: AccessibilityActionEvent) => {
    if (e.nativeEvent.actionName === 'previousWeek') page(back + 1);
    if (e.nativeEvent.actionName === 'nextWeek') page(back - 1);
  };

  return (
    <View style={[{ gap: spacing.xs }, style]} testID={`${testIDPrefix}-week`}>
      <DaySwipeGuard onLayout={onLayout} style={bleed ? { marginHorizontal: -bleed } : undefined}>
        {width > 0 ? (
          <ScrollView
            ref={ref}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={onScrollEnd}
            onScrollEndDrag={onScrollEnd}
            onScroll={onScroll}
            // A finger or a wheel on the strip wins over any glide this component started.
            onScrollBeginDrag={() => {
              heading.current = null;
            }}
            onTouchStart={() => {
              heading.current = null;
            }}
            contentOffset={{ x: (maxBack - back) * width, y: 0 }}
            // Native: the content can be laid out after the first placement; place it again, without a frame of the oldest week.
            onContentSizeChange={Platform.OS === 'web' ? undefined : () => ref.current?.scrollTo({ x: (maxBack - back) * width, animated: false })}
            scrollEventThrottle={16}>
            {Array.from({ length: maxBack + 1 + ahead }, (_, i) => maxBack - i).map((b) => (
              <View
                key={b}
                style={{ width, flexDirection: 'row' }}
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
                  // A day still to come is drawn dashed; the diary can still open it, up to its last day.
                  const locked = before || d > last;
                  const kcal =
                    summary && summary.entries.length
                      ? `, ${Math.round(summary.eaten.kcal)} of ${summary.budget} kilocalories${ring.state === 'over' ? ', above budget' : ''}`
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
                      tabIndex={b === back && !locked ? 0 : -1}
                      testID={`${testIDPrefix}-day-${d}`}
                      feedback="select"
                      scaleTo={0.94}
                      disabled={locked}
                      onPress={() => onSelect(d)}
                      accessibilityRole="tab"
                      accessibilityState={{
                        selected: isSelected,
                        disabled: locked,
                      }}
                      // react-native-web reads the aria prop, not accessibilityState, for the selected tab.
                      aria-selected={isSelected}
                      accessibilityActions={weekActions}
                      onAccessibilityAction={onWeekAction}
                      // Starts with the words drawn on it ("M 23"), then the day in full: label in name.
                      accessibilityLabel={`${LETTERS[i]} ${fromISODate(d).getDate()}, ${spokenUnits(`${formatDayLabel(d)}${kcal}`)}`}
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
                          color={isSelected ? 'bg' : locked || future ? 'textTertiary' : 'text'}
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
          <View style={{ height: 92 }} />
        )}
      </DaySwipeGuard>
      {/* One height on both screens: two caption lines or the chip. A note that wraps moves nothing. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: CAPTION_ROW_H }}>
        {showNote ? (
          <FadeUp key={noteText} style={{ flex: 1 }}>
            <Text variant="caption" color="text" numberOfLines={2} testID={note?.testID} accessibilityLiveRegion="polite">
              {noteText}
            </Text>
          </FadeUp>
        ) : (
          // Never clamped: a long week ("1,060 kcal a day over budget, 4 full days") fits two lines beside the chip
          // or the streak mark on a 320 px phone, and takes a third rather than lose its end.
          <Text variant="caption" color="textSecondary" style={{ flex: 1 }} testID={`${testIDPrefix}-week-caption`}>
            {caption}
          </Text>
        )}
        {selected !== today ? (
          // "Today" on a narrow phone, so the caption keeps two lines.
          <Chip testID={jumpTestID ?? `${testIDPrefix}-jump-today`} label={narrow ? 'Today' : 'Back to today'} selected onPress={() => onSelect(today)} />
        ) : (
          accessory
        )}
        {arrows ? (
          // 12 apart, so each 32 px arrow's 44 px touch area (6 px each side) ends where its neighbour's begins.
          <View style={{ flexDirection: 'row', gap: spacing.md, marginLeft: spacing.xs }}>
            <IconButton
              testID={`${testIDPrefix}-week-prev`}
              accessibilityLabel="Previous week"
              size={32}
              tone="clear"
              disabled={back >= maxBack}
              onPress={() => page(back + 1)}>
              <ChevronLeft size={20} color={colors.text} strokeWidth={2.2} />
            </IconButton>
            <IconButton testID={`${testIDPrefix}-week-next`} accessibilityLabel="Next week" size={32} tone="clear" disabled={back <= -ahead} onPress={() => page(back - 1)}>
              <ChevronRight size={20} color={colors.text} strokeWidth={2.2} />
            </IconButton>
          </View>
        ) : maxBack + ahead > 0 ? (
          // On touch and narrow windows: one cup, 12 px from the chip or streak before it, that opens every week the
          // strip holds, so another week is a visible tap away (a swipe is never the only way).
          <IconButton
            testID={`${testIDPrefix}-week-pick`}
            accessibilityLabel="Choose a week"
            size={PICK_CUP}
            onPress={() => setPicking(true)}
            style={{ marginLeft: spacing.xs }}>
            <CalendarDays size={18} color={colors.text} strokeWidth={2.2} />
          </IconButton>
        ) : null}
      </View>
      <Sheet visible={picking} onClose={() => setPicking(false)} title="Choose a week">
        <View testID={`${testIDPrefix}-week-pick-sheet`} accessibilityRole="radiogroup">
          {Array.from({ length: maxBack + 1 + ahead }, (_, i) => -ahead + i).map((b) => (
            <ListRow
              key={b}
              testID={`${testIDPrefix}-week-pick-${b}`}
              title={weekTitle(b)}
              // The week's caption without its lead ("That week: "), which the title already says.
              subtitle={sentenceCase(captionFor(b).replace(/^(Week so far|That week): /, ''))}
              value={b === back ? 'Shown' : undefined}
              accessibilityRole="radio"
              accessibilityState={{ checked: b === back }}
              onPress={() => {
                setPicking(false);
                page(b);
              }}
            />
          ))}
        </View>
      </Sheet>
    </View>
  );
}

const sentenceCase = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** Whole weeks from the week holding `date` back to the week holding `today` (negative for a later week, down to -ahead). */
function weeksBetween(date: ISODate, today: ISODate, ahead = 0): number {
  const w = Math.round(diffDays(startOfWeek(date), startOfWeek(today)) / 7);
  return Math.min(STRIP_WEEKS - 1, Math.max(-ahead, w));
}
