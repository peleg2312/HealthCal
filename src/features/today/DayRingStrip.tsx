import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react-native';
import React, { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Platform, ScrollView, useWindowDimensions, View, type AccessibilityActionEvent, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent, type StyleProp, type ViewStyle } from 'react-native';

import { diffDays, formatShortDate, fromISODate, startOfWeek } from '@/lib/dates';
import { useDays } from '@/store/selectors';
import { cup, fonts, MAX_CONTENT_WIDTH, useTheme, useVeryLargeText } from '@/theme';
import type { ISODate } from '@/types';
import { Chip, FadeUp, IconButton, ListRow, MiniCup, PressableScale, Sheet, Text, useGrownText, useReducedMotion } from '@/ui';

import { fitsRoom } from './fit';
import { MeasureWidth } from './MeasureWidth';
import { DaySwipeGuard } from './useDaySwipe';
import { dayCellLabel, dayRing, weekCaption, weekDates } from './week';

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
/** The link's chevron and the 2 px before it, beside its words. */
const LINK_MARK = 18;
/** The chosen day's level line under its date. */
const SELECTED_MARK_W = 18;
/**
 * The slim strip (`slim`, the diary's): the same days, letters, dates and caption row with smaller cups and tighter
 * gaps, so the day's meals lead its first view. Its days are 62 px tall (16 letter, 2, the 20 px cup, 2, the
 * 22 px date), the whole block 102 (Today's 132).
 */
const SLIM_CUP = { width: 16, height: 20 };
const SLIM_DAYS_H = 62;

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
 * again when the strip remounts. Today's date is outlined; the selected day's date
 * wears the level line under it (the active tab's mark), never an ink fill that would
 * outweigh the day's numbers.
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
 * `slim` draws it with small cups and tighter gaps (102 px, the same rows and controls), as both tabs do, and says the
 * current week's caption without its lead ("2 full days on budget"). `link` puts a link with its hide X in the
 * caption's place on the current week (Today's "Your week is ready").
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
  slim = false,
  link,
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
  /**
   * The slim strip: small cups (16 x 20) and tighter gaps, the same letters, dates, caption row, chip, note, accessory
   * and week controls, 102 px in all at every width (the full one is 132) at the designed text size. With text grown it
   * stays slim and its rows grow with their text (the date's box, the caption's lines), so the day's content keeps its
   * place in the first view. Today and the diary pass it, 12 px over their first card.
   */
  slim?: boolean;
  /**
   * A link said in the caption's place while the current week is shown, before the note and the caption (Today's
   * "Your week is ready ›", which opens the check-in): its words in the action ink with a chevron, and beside it a
   * clear X that hides it (`hide`). It moves nothing: it sits in the caption row. Under 360 px it shows `short` ("Your
   * week"), named by its whole words, so it keeps one line beside the X, the streak and the week cup.
   */
  link?: { label: string; short?: string; hint: string; testID: string; onPress: () => void; hide?: { label: string; testID: string; onPress: () => void } } | null;
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
  const showLink = !!link && back === 0;
  const showNote = !showLink && noteText !== null && noteShown === noteText && back === 0;

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
  // The slim strip says the current week's caption without its lead ("2 full days on budget"): the strip above it is
  // this week, and the line keeps to one row beside the streak and the week cup. Another week keeps "That week: ".
  const caption = slim && back === 0 ? sentenceCase(captionFor(back).replace(/^Week so far: /, '')) : captionFor(back);
  // "Choose a week": open while the person picks one of the strip's weeks.
  const [picking, setPicking] = useState(false);
  const weekTitle = (b: number) => {
    const dates = weekDates(today, b);
    return b === 0 ? 'This week' : b === 1 ? 'Last week' : b === -1 ? 'Next week' : `Week of ${formatShortDate(dates[0])}`;
  };
  const narrow = windowW < 360;
  // Very large text (`VERY_LARGE_TEXT`): the caption row wraps, the caption first and the chip, the streak and the week
  // cup beside it where they fit, else on a line under it. Up to there (the phone's common steps) the caption row keeps
  // its shape and grows with its text (`grown`); the slim strip stays slim at every size, its date boxes growing.
  const large = useVeryLargeText();
  const grown = useGrownText();
  const thin = slim;
  // With text grown, the caption row's room as measured: the row, and what sits beside the caption as drawn.
  const [rowW, setRowW] = useState(0);
  const [groupW, setGroupW] = useState(0);
  const [linkW, setLinkW] = useState(0);
  const [shortW, setShortW] = useState(0);
  // Beside the caption: the "Back to today" chip ("Today" on a narrow phone, so the caption keeps two lines), else the
  // accessory (Today's streak).
  const side =
    selected !== today ? <Chip testID={jumpTestID ?? `${testIDPrefix}-jump-today`} label={narrow ? 'Today' : 'Back to today'} selected onPress={() => onSelect(today)} /> : accessory;
  // The room for the link's words: the row less what sits beside them (the chip or streak with the week controls, as
  // drawn; its X and its chevron, with the gaps between), the same whichever way the row is laid out, so a choice never
  // flips it.
  const linkRoom = rowW ? rowW - (groupW ? groupW + spacing.sm : 0) - (link?.hide ? PICK_CUP + spacing.sm : 0) - LINK_MARK : 0;
  // "Your week is ready" or its short form: the short one under 360 px, and with text grown wherever the whole label,
  // measured as drawn, is wider than its room (`fitsRoom`), so it keeps one line.
  const linkShort = !!link?.short && (narrow || (grown && !fitsRoom(linkW, linkRoom)));
  // Where even the words shown do not fit beside the streak and the week cup (a 320 px phone at 130%), the row wraps as
  // with very large text, rather than split "Your week" from its chevron.
  const wraps = large || (grown && showLink && !fitsRoom(linkShort ? shortW : linkW, linkRoom));
  // Natively and on touch the arrows are not drawn: every day offers the same as actions.
  const weekActions = [
    ...(back < maxBack ? [{ name: 'previousWeek', label: 'Previous week' }] : []),
    ...(back > -ahead ? [{ name: 'nextWeek', label: 'Next week' }] : []),
  ];
  const onWeekAction = (e: AccessibilityActionEvent) => {
    if (e.nativeEvent.actionName === 'previousWeek') page(back + 1);
    if (e.nativeEvent.actionName === 'nextWeek') page(back - 1);
  };

  // The week arrows (a mouse on a wide window) or the week-picker cup, at the caption row's end.
  const weekControls = arrows ? (
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
  ) : null;

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
                      // Starts with the words drawn on it ("M 23"), then the day in full and its figures as drawn: label in name.
                      accessibilityLabel={dayCellLabel(ring, today, summary)}
                      // A future day is drawn dashed; fading it as well would make its date unreadable.
                      dimDisabled={false}
                      style={{ flex: 1, minHeight: 44, alignItems: 'center', gap: thin ? 2 : 6, paddingBottom: thin ? 0 : 2 }}>
                      <Text variant="label" color={isSelected ? 'text' : 'textSecondary'} style={{ fontSize: 12, lineHeight: 16, fontFamily: isSelected ? fonts.bold : fonts.semibold }}>
                        {LETTERS[i]}
                      </Text>
                      {before ? (
                        <View style={{ width: thin ? SLIM_CUP.width : 30, height: thin ? SLIM_CUP.height : 38, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: thin ? 2 : 4 }}>
                          <View style={{ width: 3, height: 3, borderRadius: 1, backgroundColor: colors.textTertiary }} />
                        </View>
                      ) : (
                        <MiniCup
                          index={i}
                          memoryKey={`cal-${d}`}
                          progress={ring.progress}
                          over={ring.state === 'over'}
                          future={future}
                          color={colors.calories}
                          width={thin ? SLIM_CUP.width : undefined}
                          height={thin ? SLIM_CUP.height : undefined}
                        />
                      )}
                      <View
                        style={{
                          // With text grown, at least the designed box, and as big as its date.
                          ...(grown ? { minWidth: 32, minHeight: thin ? 22 : 24, paddingHorizontal: 2 } : { width: 32, height: thin ? 22 : 24 }),
                          ...cup(9, 4),
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderWidth: isToday ? 1.5 : 0,
                          borderColor: colors.text,
                        }}>
                        <Text
                          variant="numM"
                          color={locked || future ? 'textTertiary' : 'text'}
                          style={{ fontSize: 14, lineHeight: thin ? 18 : 20, letterSpacing: 0 }}>
                          {fromISODate(d).getDate()}
                        </Text>
                        {/* The day shown wears the level line under its date, as the active tab and the chosen segment do:
                            quiet enough that the day's calories, not the date, lead the screen, and still plainly chosen. */}
                        {isSelected ? (
                          <View
                            pointerEvents="none"
                            style={{ position: 'absolute', bottom: isToday ? 1 : 0, alignSelf: 'center', width: SELECTED_MARK_W, height: 3, borderRadius: 1, backgroundColor: colors.rim }}
                          />
                        ) : null}
                      </View>
                    </PressableScale>
                  );
                })}
              </View>
            ))}
          </ScrollView>
        ) : (
          <View style={{ height: thin ? SLIM_DAYS_H : 92 }} />
        )}
      </DaySwipeGuard>
      {/* One height on both screens: two caption lines or the chip. A note that wraps moves nothing. */}
      {/* Very large text (150% and up), or a link that does not fit beside them: the row wraps, the chip, the streak and
          the week cup going to a line under the caption where they do not fit beside it, so neither squeezes the other's words. */}
      <View
        onLayout={grown ? (e) => setRowW(Math.floor(e.nativeEvent.layout.width)) : undefined}
        style={{ flexDirection: 'row', flexWrap: wraps ? 'wrap' : 'nowrap', alignItems: 'center', gap: spacing.sm, minHeight: CAPTION_ROW_H }}>
        {showLink && link ? (
          <View style={wraps ? { flexGrow: 1, flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm } : { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            {grown ? (
              <>
                <MeasureWidth onWidth={setLinkW}>
                  <Text variant="label" style={{ fontSize: 13, lineHeight: 17 }}>
                    {link.label}
                  </Text>
                </MeasureWidth>
                {link.short ? (
                  <MeasureWidth onWidth={setShortW}>
                    <Text variant="label" style={{ fontSize: 13, lineHeight: 17 }}>
                      {link.short}
                    </Text>
                  </MeasureWidth>
                ) : null}
              </>
            ) : null}
            {/* Its touch area reaches 44 px tall; sideways it stops at its own edge, so the X beside it keeps its own. */}
            <PressableScale
              testID={link.testID}
              onPress={link.onPress}
              accessibilityLabel={link.label}
              accessibilityHint={link.hint}
              hitSlop={{ top: 6, bottom: 6, left: 0, right: 0 }}
              style={{ flexShrink: 1, minHeight: 32, flexDirection: 'row', alignItems: 'center', gap: 2 }}>
              <Text variant="label" color="actionInk" style={{ flexShrink: 1, fontSize: 13, lineHeight: 17 }}>
                {linkShort ? link.short : link.label}
              </Text>
              <ChevronRight size={16} color={colors.actionInk} strokeWidth={2.2} />
            </PressableScale>
            {link.hide ? (
              <IconButton testID={link.hide.testID} accessibilityLabel={link.hide.label} tone="clear" size={32} onPress={link.hide.onPress}>
                <X size={18} color={colors.textSecondary} strokeWidth={1.9} />
              </IconButton>
            ) : null}
          </View>
        ) : showNote ? (
          <FadeUp key={noteText} style={wraps ? { flexGrow: 1, flexShrink: 1 } : { flex: 1 }}>
            <Text variant="caption" color="text" numberOfLines={large || grown ? undefined : 2} testID={note?.testID} accessibilityLiveRegion="polite">
              {noteText}
            </Text>
          </FadeUp>
        ) : (
          // Never clamped: a long week ("1,060 kcal a day over budget, 4 full days") fits two lines beside the chip
          // or the streak mark on a 320 px phone, and takes a third rather than lose its end.
          <Text variant="caption" color="textSecondary" style={wraps ? { flexGrow: 1, flexShrink: 1 } : { flex: 1 }} testID={`${testIDPrefix}-week-caption`}>
            {caption}
          </Text>
        )}
        {grown ? (
          // With text grown the chip or streak and the week controls are one group, measured as drawn (the room left to
          // the caption's link), that goes to a line under the caption together when the row wraps.
          <View onLayout={(e) => setGroupW(Math.ceil(e.nativeEvent.layout.width))} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            {side}
            {weekControls}
          </View>
        ) : (
          <>
            {side}
            {weekControls}
          </>
        )}
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
