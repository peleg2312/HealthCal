import { router } from 'expo-router';
import { ArrowRightLeft, ChevronRight, Plus, Repeat2 } from 'lucide-react-native';
import React, { useState } from 'react';
import { Platform, useWindowDimensions, View, type LayoutChangeEvent } from 'react-native';

import { hasFoodLogged } from '@/features/drinks/via';
import { copyEntries, findPreviousMeal } from '@/features/food/actions';
import { currentKcal } from '@/features/food/usuals';
import { useRecapReady } from '@/features/progress/recapReady';
import { figureWords, otherFigure, setCalorieFigure, useCalorieFigure } from '@/features/today/calorieFigure';
import { DayRingStrip } from '@/features/today/DayRingStrip';
import { cupHeightFor, fitsRoom } from '@/features/today/fit';
import { FitsSheet } from '@/features/today/FitsSheet';
import { MeasureWidth } from '@/features/today/MeasureWidth';
import { mealLine } from '@/features/today/meals';
import { NOW_WORDS } from '@/features/today/now';
import { NowCard, relativeTo, useNowState } from '@/features/today/NowCard';
import { ReadyRim } from '@/features/today/ReadyRim';
import { recapLine } from '@/features/today/recapLine';
import { MorningWatcher } from '@/features/morning/useMorningPage';
import { useBackToToday } from '@/features/today/useBackToToday';
import { startDate } from '@/features/today/week';
import { todayTitle } from '@/features/today/greetingTitle';
import { TabHeader, tabDay, tabTitleRoom, tabTitleSize } from '@/components/TabHeader';
import { MilestoneSheet } from '@/features/streak/MilestoneSheet';
import { AFTER_STRIP_MS, StreakMark } from '@/features/streak/StreakMark';
import { useStreakMoment } from '@/features/streak/useStreakMoment';
import { PillarsCard, WaterRow } from '@/features/today/StatusRail';
import { useReportViewedDay } from '@/features/today/viewedDay';
import { addDays, greeting } from '@/lib/dates';
import { weekRangeLabel } from '@/lib/insights';
import { MEALS, MEAL_LABEL, MEAL_SHARE, mealForTime } from '@/lib/nutrition';
import { formatNumber } from '@/lib/units';
import { useStore } from '@/store';
import { useNow, useToday } from '@/store/clock';
import { useConsistency, useDay, useDays, useLive, useProfile, type DaySummary } from '@/store/selectors';
import { MAX_CONTENT_WIDTH, motion, useDrawnFontSize, useTheme, useVeryLargeText } from '@/theme';
import type { FoodEntry, ISODate, MealType } from '@/types';
import { AnimatedNumber, Badge, Button, Card, CupKey, figure, IconButton, PressableScale, ProgressBar, Screen, Text, toast, useGrownText, Vessel, type VesselLabel } from '@/ui';


export default function TodayScreen() {
  const { spacing } = useTheme();
  const profile = useProfile();
  const todayDate = useToday();
  // Null follows the clock, so the screen rolls over at midnight unless a day was picked.
  const [picked, setPicked] = useState<ISODate | null>(null);
  const date = picked && picked < todayDate ? picked : todayDate;
  // The + sheet logs to the day being looked at.
  useReportViewedDay(date === todayDate ? null : date);
  const isToday = date === todayDate;
  const day = useDay(date);
  const consistency = useConsistency(todayDate);
  const streak = useStreakMoment(consistency, todayDate);
  const start = startDate(profile.onboardedAt);
  // Day one (or a profile with nothing logged yet): one obvious first action.
  const firstDay = isToday && !hasFoodLogged(day.entries) && consistency.totalDaysLogged === 0;
  const yesterday = useDay(addDays(todayDate, -1));
  const now = useNow();
  // The Now card's words and actions for this hour; Meals tags its meal "Now" and leaves its Repeat to it.
  const nowState = useNowState(day, yesterday.entries.length ? { eaten: yesterday.eaten.kcal, budget: yesterday.budget } : null);
  const recapLink = useRecapLink(isToday && !firstDay);
  // The "What fits" sheet: null when closed, else whether protein is the gap it was opened for.
  const [fits, setFits] = useState<{ proteinFirst: boolean } | null>(null);

  const { width } = useWindowDimensions();
  // Measured as drawn: with text grown the title steps down to keep the name on one line beside the header's cups; with
  // very large text the header stacks and the title has the content's whole width (`TabHeader`).
  const drawn = useDrawnFontSize();
  const veryLarge = useVeryLargeText();
  const titleRoom = veryLarge ? Math.min(width, MAX_CONTENT_WIDTH) - 2 * spacing.xl : tabTitleRoom(width);
  const title = todayTitle(greeting(now), profile.name ?? '', titleRoom, tabTitleSize(width), drawn);
  const select = (d: ISODate) => setPicked(d === todayDate ? null : d);
  // The day changes only from the week strip: no page swipe here, so scrolling or reaching for a
  // row never moves Today to another day. Back in front after five minutes or more away, or on
  // another day, it shows today again.
  useBackToToday(() => setPicked(null));

  return (
    <Screen
      tabs
      testID="today-screen"
      header={<TabHeader tab="today" overline={tabDay(date)} overlineTight={tabDay(date, true)} title={title.text} titleSize={title.size} />}>
      {/* Cards 16 px apart, as on Progress and the check-in. */}
      <View testID="today-swipe" style={{ gap: spacing.lg }}>
      {/* The first visit on a new morning opens yesterday's summary (rule in @/features/morning/rule). Draws nothing. */}
      <MorningWatcher />
      {/* The one date control, the same as the diary's and as slim: the strip, then the week's caption with the streak
          or "Back to today"; on a check-in day "Your week is ready" is the caption's link. */}
      <DayRingStrip
        today={todayDate}
        selected={date}
        onSelect={select}
        start={start}
        slim
        jumpTestID="today-jump-today"
        // 12 px to the day card (the page's 16 less 4), as on the diary, so the content starts at the same height on both tabs.
        style={{ marginBottom: -4 }}
        accessory={streak.streak > 1 ? <StreakMark days={streak.streak} filled={streak.filled} /> : null}
        // Said in the caption's place once the streak cup has poured and its number ticked up, so
        // logging never pushes the page down and the line never runs ahead of the count.
        note={isToday && streak.line ? { text: streak.line, delay: AFTER_STRIP_MS, testID: 'today-streak-line' } : null}
        link={recapLink}
      />

      {/* The day card: the calorie cup, the macros and water with its one-tap glass, the things checked at a glance.
          The glass is in the first view at 360 x 740 and 320 x 640 on every day, day one included. */}
      <EnergyCard day={day} isToday={isToday} firstDay={firstDay} />
      {/* The one thing for this hour: the coach's line, one or two actions, and "Ask the coach" in its corner, the coach's
          worded way in within the thumb's reach in the first view. Day one holds the first-log invite. Today only. */}
      {isToday ? <NowCard day={day} state={nowState} firstDay={firstDay} onFits={(proteinFirst) => setFits({ proteinFirst })} /> : null}

      <MealsSection day={day} nowMeal={isToday ? nowState.plan.meal : null} cardRepeat={isToday ? (nowState.repeat?.meal ?? null) : null} />
      {/* Activity, sleep and weight (or the fast) in a card of their own under Meals. */}
      <PillarsCard day={day} isToday={isToday} />

      <FitsSheet
        visible={fits !== null}
        onClose={() => setFits(null)}
        date={date}
        meal={isToday ? mealForTime(now) : 'snack'}
        kcalLeft={day.remaining}
        proteinFirst={fits?.proteinFirst ?? false}
        proteinLeft={day.macros.proteinG - day.eaten.protein}
      />
      <MilestoneSheet milestone={streak.milestone} onClose={streak.closeMilestone} />
      </View>
    </Screen>
  );
}

/**
 * "Your week is ready" as the week caption's link, early in the new week while last week's check-in is waiting
 * (`useRecapReady`): it opens the check-in (which marks it seen); its X hides it, with Undo. The week's dates and
 * numbers are read out with it and shown on the check-in.
 */
function useRecapLink(enabled: boolean) {
  const recap = useRecapReady();
  const end = addDays(recap.week, 6);
  const days = useDays(7, end);
  if (!enabled || !recap.announce) return null;
  const dismiss = () => {
    const previous = useStore.getState().settings.recapSeenWeek;
    recap.markSeen();
    toast(NOW_WORDS.recapHidden, {
      label: 'Undo',
      onPress: () => useStore.getState().setSettings({ recapSeenWeek: previous }),
    });
  };
  return {
    label: NOW_WORDS.recap,
    short: NOW_WORDS.recapShort,
    hint: `${weekRangeLabel(recap.week, end)}. ${recapLine(days)}. Opens the weekly check-in`,
    testID: 'today-recap-open',
    onPress: () => router.push(`/recap?week=${recap.week}` as never),
    hide: { label: NOW_WORDS.recapHide, testID: 'today-recap-dismiss', onPress: dismiss },
  };
}

// ------------------------------------------------------------- energy hero

/**
 * Tall enough for the cup's three labels (22 px boxes round 17 px numbers, the big number at least 44, 8 px between
 * them) at any value; the macros and water sit under the cup, not beside it. The same on day one, whose empty cup
 * holds the big number alone.
 */
const VESSEL_H = 124;
/**
 * Under 360 px only (320 x 640): a smaller cup and a tighter card, so the water row and its "+ 250 ml" are in the
 * first view there with the Now card's heading and line under them. The cup is as tall as its label column needs
 * (20 px boxes round 17 px numbers, the 42 px number, 4 px apart, which keeps their letters 8 px apart), and the
 * card's padding and inner gaps step down; at 360 and wider nothing changes.
 */
const VESSEL_H_NARROW = 100;
const NARROW = { padding: 12, paddingV: 10, labelSpacing: 4, labelH: 20, macrosTop: 12, macroGap: 4 };
/**
 * Very large text (`VERY_LARGE_TEXT`): the cup beside the label rows under the big number, smaller than the designed one
 * and as tall as those rows are drawn (at least `least`), so the card has no empty band beside a cup taller than its words.
 */
const LARGE_CUP = { width: 60, least: 72 };

/**
 * The day card: the calorie cup with its labels (the big number switches between left and eaten), the three macros
 * and, under a hairline, water with its one-tap glass. Nothing else: no other buttons, so the card is read at a glance.
 */
function EnergyCard({ day, isToday, firstDay }: { day: DaySummary; isToday: boolean; firstDay: boolean }) {
  const { colors, spacing } = useTheme();
  const { width: screenW } = useWindowDimensions();
  const narrow = screenW < 360;
  // Very large text (150% and up, `VERY_LARGE_TEXT`): the labels leave the cup's side column for rows (the `large`
  // layout below). Through the phone's common steps (Android's 1.15 and 1.3, iOS to xxxLarge, the app's 115% and 130%)
  // and under a reader's own text spacing (WCAG 1.4.12) the card keeps its designed shape with larger text (`fit`):
  // each label's box is measured from the text drawn in it (`boxes`), a label wraps at its words where its line is
  // wider than the column, the cup grows to hold the boxes (`cupHeightFor`), and the macros stay side by side unless
  // their names, measured as drawn, are wider than a third of the card (`fitsRoom`). At the designed size nothing changes.
  const grown = useGrownText();
  const large = useVeryLargeText();
  const fit = grown && !large;
  const drawn = useDrawnFontSize();
  // Each label's box as measured (fit only), by key; until measured, the designed box grown as its text is drawn.
  const [boxes, setBoxes] = useState<Record<string, number>>({});
  const measureBox = (key: string) => (e: LayoutChangeEvent) => {
    const h = Math.ceil(e.nativeEvent.layout.height);
    if (Math.abs((boxes[key] ?? 0) - h) >= 1) setBoxes((b) => ({ ...b, [key]: h }));
  };
  // The widest macro name with its key as drawn, and the macros' row, to know whether three fit side by side.
  const [macroNameW, setMacroNameW] = useState(0);
  const [macrosW, setMacrosW] = useState(0);
  // Very large text: the height of the rows beside the smaller cup, as drawn.
  const [rowsH, setRowsH] = useState(0);
  const over = day.remaining < 0;
  const eaten = day.eaten.kcal;
  const budget = Math.max(0, day.budget);
  // A past day with no food is not an intake deficit of the whole budget: it was not logged.
  const notLogged = !isToday && !hasFoodLogged(day.entries);
  // Only drinks from Water that day: their calories are in the cup, so "Nothing logged" would not be true.
  const drinksOnly = notLogged && day.entries.length > 0;
  // Calories workouts add to this day (its own and shares carried from the six days before), drawn as
  // hatched headroom at the top of the vessel. Read from the day's rule, never from budget minus target.
  const headroom = Math.max(0, day.exerciseAdded);
  // Today's old case: all of it is this day's own workouts. Otherwise it holds carried shares (said in the spoken sum).
  const pure = day.exerciseRule === 'day' && day.exerciseCarry === 0;
  // The big figure: what is left (the default) or what was eaten, switched by a tap on it and kept on this device
  // (@/features/today/calorieFigure); the other figure is said once, in the line at the level. Day one shows what is
  // left, the whole budget, and is no switch: there is no line for the other figure, and the invite is the one thing to do.
  const choice = useCalorieFigure();
  const toggle = !firstDay;
  const shown = toggle ? choice.figure : 'left';
  const words = figureWords(shown, { remaining: day.remaining, eaten, isToday });
  // On a phone the number waits for the stored choice (read as the app starts), so it never flips once drawn.
  const hidden = toggle && !choice.ready ? { opacity: 0 } : null;
  // The big number sits in the empty space between the level and the base budget (or the brim).
  const inBand = eaten > budget - headroom;
  const emptyTop = inBand ? budget : budget - headroom;
  // A 6-character figure ("11,480" eaten) steps down once more, so it stays whole beside its unit and the switch's mark.
  const sizeFor = (text: string) => (narrow ? (text.length >= 6 ? 34 : text.length >= 5 ? 40 : 44) : text.length >= 6 ? 42 : text.length >= 5 ? 50 : 60);
  const numSize = sizeFor(words.big.text);
  // The number's box is as tall for either figure, so a tap never moves the labels around it.
  const boxSize = toggle ? Math.max(sizeFor(formatNumber(Math.abs(Math.round(day.remaining)))), sizeFor(formatNumber(Math.round(eaten)))) : numSize;
  const height = narrow ? VESSEL_H_NARROW : VESSEL_H;
  const labelSpacing = narrow ? NARROW.labelSpacing : 8;
  // The label boxes: 22 px round the 17 px numbers (20 on a narrow phone), the big number as tall as it is drawn
  // on a narrow phone (its line height) and at least 44 otherwise.
  const lineH = narrow ? NARROW.labelH : 22;
  const numH = narrow ? 42 : Math.max(44, boxSize - 4);
  const macrosTop = narrow ? NARROW.macrosTop : 14;
  // Text grown (`fit`): a label's box is its measured height, at first the designed one grown as its text is drawn.
  const lineBox = (key: string) => (fit ? (boxes[key] ?? Math.ceil((lineH * drawn(17)) / 17)) : lineH);
  const numBox = fit ? Math.max(44, boxes.left ?? Math.ceil((numH * drawn(boxSize)) / boxSize)) : numH;
  // With text grown each label's content reports its height (its box), and wraps at its words in the column.
  const boxed = (key: string, node: React.ReactNode) => (fit ? <View onLayout={measureBox(key)}>{node}</View> : node);
  const vesselW = narrow ? 66 : 84;
  // Burned in activity but left out of the budget (exercise is not added in Goals).
  const notAdded = day.exerciseRule === 'off' ? Math.max(0, day.exerciseNet) : 0;
  // The whole sum, read out with the "eaten" line that shows the budget.
  const budgetLabel =
    headroom <= 0
      ? `Daily budget ${formatNumber(day.budget)} kilocalories`
      : pure
        ? `Budget ${formatNumber(day.budget)} kilocalories: ${formatNumber(day.target)} target plus about ${formatNumber(headroom)} added by today's workouts`
        : day.exerciseRule === 'week'
          ? `Budget ${formatNumber(day.budget)} kilocalories: ${formatNumber(day.target)} target plus about ${formatNumber(headroom)} added, a seventh of each workout in the last 7 days`
          : `Budget ${formatNumber(day.budget)} kilocalories: ${formatNumber(day.target)} target plus about ${formatNumber(headroom)} added by workouts`;

  // The hatched band's label in words: what the workouts add and where it comes from, as the budget's sum says it.
  const addedLabel = pure
    ? `About ${formatNumber(headroom)} kilocalories added by today's workouts`
    : day.exerciseRule === 'week'
      ? `About ${formatNumber(headroom)} kilocalories added, a seventh of each workout in the last 7 days`
      : `About ${formatNumber(headroom)} kilocalories added by workouts`;

  // The big figure and its unit ("941" "kcal / left"), with the switch's mark (two arrows, the action ink) at its end
  // where a tap switches it. Keyed by the choice, so a switch draws the other figure at once and only a change ticks.
  const unit = (
    <Text variant="unit" style={{ fontSize: 14, lineHeight: 17, marginBottom: numSize * 0.08 }}>
      {`kcal\n${words.big.word}`}
    </Text>
  );
  const mark = toggle ? <ArrowRightLeft size={18} color={colors.actionInk} strokeWidth={2.2} style={{ marginBottom: numSize * 0.08 }} /> : null;
  const bigFigure = (wrap: boolean) => (
    <View style={{ flexDirection: 'row', flexWrap: wrap ? 'wrap' : 'nowrap', alignItems: 'flex-end', columnGap: 6 }}>
      <AnimatedNumber
        key={shown}
        variant="numXL"
        color={words.big.tone}
        testID={words.big.testID}
        numberOfLines={1}
        value={words.big.value}
        format={(n) => formatNumber(Math.abs(Math.round(n)))}
        duration={motion.duration.pour}
        accessibilityLabel={words.bigSpoken}
        style={{ fontSize: numSize, lineHeight: numSize - 2, letterSpacing: -numSize * 0.035 }}
      />
      {wrap ? (
        // Where the row wraps (text grown), the unit and the switch's mark go under the number together.
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', columnGap: 6 }}>
          {unit}
          {mark}
        </View>
      ) : (
        <>
          {unit}
          {mark}
        </>
      )}
    </View>
  );
  // One control: its name is the words it shows, then what a tap does ("941 kcal left. Switch to calories eaten").
  const bigControl = (wrap: boolean, style: object) =>
    toggle ? (
      <PressableScale
        testID="today-figure"
        scaleTo={0.97}
        feedback="select"
        onPress={() => setCalorieFigure(otherFigure(shown))}
        accessibilityLabel={words.name}
        hitSlop={!wrap && numH < 44 ? Math.ceil((44 - numH) / 2) : undefined}
        style={[{ alignSelf: 'flex-start', justifyContent: 'center' }, style, hidden]}>
        {bigFigure(wrap)}
      </PressableScale>
    ) : (
      <View style={[{ alignSelf: 'flex-start', justifyContent: 'center' }, style]}>{bigFigure(wrap)}</View>
    );

  const labels: VesselLabel[] = [];
  if (headroom > 0) {
    labels.push({
      key: 'burned',
      // Beside its hatched band: mid-band, or the very top once eaten has risen into the band,
      // so it always reads above the eaten line.
      at: inBand ? budget : budget - headroom / 2,
      height: lineBox('burned'),
      tick: colors.exercise,
      content: boxed(
        'burned',
        // Never clipped (no numberOfLines): under a reader's own text spacing the label wraps rather than lose its end.
        <Text variant="numM" style={{ fontSize: 17, lineHeight: lineH }} testID="today-added" {...figure(addedLabel)}>
          {`~${formatNumber(headroom)}`}
          <Text variant="unit">{' kcal'}</Text>
          <Text variant="body" color="textSecondary" style={{ fontSize: 14 }}>
            {'  added'}
          </Text>
        </Text>,
      ),
    });
  } else if (notAdded > 0) {
    // Exercise left out of the budget (Goals): said at the brim, where "~290 kcal added" would be. No tick:
    // nothing is poured or hatched for it.
    labels.push({
      key: 'not-added',
      at: budget,
      height: lineBox('not-added'),
      content: boxed(
        'not-added',
        <Text
          variant="numM"
          style={{ fontSize: 17, lineHeight: lineH }}
          testID="today-not-added"
          {...figure(`Workouts: about ${formatNumber(notAdded)} kilocalories, not added to the budget`)}>
          {`~${formatNumber(notAdded)}`}
          <Text variant="unit">{' kcal'}</Text>
          <Text variant="body" color="textSecondary" style={{ fontSize: 14 }}>
            {'  not added'}
          </Text>
        </Text>,
      ),
    });
  }
  if (notLogged) {
    labels.push({
      key: 'left',
      at: budget / 2,
      height: fit ? Math.max(44, boxes.left ?? Math.ceil((52 * drawn(22)) / 22)) : 52,
      content: boxed(
        'left',
        <PressableScale
          testID="today-not-logged"
          scaleTo={0.97}
          onPress={() => router.push(`/diary?date=${day.date}` as never)}
          accessibilityLabel={drinksOnly ? 'Only drinks logged for this day. Open the diary to add what you ate' : 'Nothing logged for this day. Open the diary to add it'}
          style={{ alignSelf: 'flex-start', gap: 2 }}>
          <Text variant="h2" testID="today-remaining">
            {drinksOnly ? 'Drinks only' : 'Nothing logged'}
          </Text>
          <Text variant="label" color="primaryInk">
            Add what you ate
          </Text>
        </PressableScale>,
      ),
    });
  } else {
    labels.push({
      key: 'left',
      at: (Math.min(eaten, budget) + emptyTop) / 2,
      // At least 44 tall to touch: as tall as the number on a narrow phone, its touch area reaching 44 past it. With text
      // grown, as tall as the number is drawn, its unit going under it where the two do not fit the column.
      height: numBox,
      content: fit ? boxed('left', bigControl(true, { minHeight: 44, maxWidth: '100%' })) : bigControl(false, { minHeight: numH }),
    });
    if (!firstDay) {
      labels.push({
        key: 'eaten',
        at: Math.min(eaten, budget),
        height: lineBox('eaten'),
        tick: colors.rim,
        content: boxed(
          'eaten',
          // Text only: it never takes a tap meant for the big number above it. The budget is said here, once, as the
          // diary's summary says it ("1,219 eaten of 2,160" under "941 kcal left", or "941 left of 2,160" under "1,219 kcal
          // eaten", whose unit it shares: " kcal" would not fit its column at 320 px); the whole sum (target plus exercise)
          // is read out. The other figure of the choice, so each figure is said once.
          <View pointerEvents="none" style={hidden} {...figure(`${words.line.spoken}. ${budgetLabel}`)}>
            <AnimatedNumber key={shown} variant="numM" value={words.line.value} format={(n) => formatNumber(Math.abs(Math.round(n)))} style={{ fontSize: 17, lineHeight: lineH }} testID={words.line.testID}>
              <Text variant="body" color="textSecondary" style={{ fontSize: 14 }}>
                {`  ${words.line.words} `}
              </Text>
              <Text variant="numM" style={{ fontSize: 17, lineHeight: lineH }} testID="today-budget">
                {formatNumber(day.budget)}
              </Text>
            </AnimatedNumber>
          </View>,
        ),
      });
    }
  }
  // The cup holds its labels' boxes beside it: the designed height, taller only when grown text needs it.
  const cupH = fit ? cupHeightFor(height, labels.map((l) => l.height), labelSpacing) : height;
  // The macros side by side while their names fit a third of the row as drawn; else one row each (as with very large text).
  const macroGap = narrow ? spacing.md : spacing.lg;
  const macrosStacked = fit && !fitsRoom(macroNameW, (macrosW - 2 * macroGap) / 3);

  // The line at the eaten level (the other figure of the choice and the budget): not on day one, nor on a past day with
  // nothing logged.
  const hasLine = labels.some((l) => l.key === 'eaten');
  // Water under a hairline, the one-tap glass at its end: the last part of the card.
  const water = (
    <>
      <View style={{ height: 1, backgroundColor: colors.border, marginTop: 12, marginBottom: narrow ? 6 : 8 }} />
      <WaterRow day={day} isToday={isToday} quiet={firstDay} />
    </>
  );

  if (large) {
    // Very large text (150% and up, the app's size or the phone's): the side column beside the cup has no room for its
    // labels at the heights they describe (the eaten line alone would take three lines of it), so nothing here is placed
    // by value. The number leads the card, whole; the cup's other labels are rows beside a smaller cup, as tall as they
    // are (`LARGE_CUP`), each with its key (the hatch for workouts, the calorie fill for eaten); the macros and water are
    // rows under it. Every line wraps at its words.
    const remaining = notLogged ? (
      <PressableScale
        testID="today-not-logged"
        scaleTo={0.97}
        onPress={() => router.push(`/diary?date=${day.date}` as never)}
        accessibilityLabel={drinksOnly ? 'Only drinks logged for this day. Open the diary to add what you ate' : 'Nothing logged for this day. Open the diary to add it'}
        style={{ alignSelf: 'flex-start', gap: 2, maxWidth: '100%' }}>
        <Text variant="h2" testID="today-remaining">
          {drinksOnly ? 'Drinks only' : 'Nothing logged'}
        </Text>
        <Text variant="label" color="primaryInk">
          Add what you ate
        </Text>
      </PressableScale>
    ) : (
      bigControl(true, { minHeight: 44, maxWidth: '100%' })
    );
    // The cup is as tall as the rows beside it, never under its least height (an empty day's cup has no rows).
    const largeCupH = Math.max(LARGE_CUP.least, rowsH);
    return (
      <Card testID="today-energy" padding={narrow ? NARROW.padding : 16}>
        {remaining}
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: narrow ? 14 : 16, marginTop: spacing.md }}>
          <View>
            <Vessel value={eaten} max={budget} headroom={headroom} color={colors.calories} width={LARGE_CUP.width} height={largeCupH} memoryKey={`hero-${day.date}`} />
            {firstDay && headroom === 0 ? <ReadyRim width={LARGE_CUP.width} /> : null}
          </View>
          <View onLayout={(e) => setRowsH(Math.ceil(e.nativeEvent.layout.height))} style={{ flex: 1, minWidth: 0, gap: spacing.md }}>
            {headroom > 0 ? (
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm }}>
                <CupKey color={colors.headroom} variant="hatched" size={11} style={{ marginTop: 8 }} />
                <Text variant="numM" style={{ flexShrink: 1, fontSize: 17, lineHeight: 22 }} testID="today-added" {...figure(addedLabel)}>
                  {`~${formatNumber(headroom)}`}
                  <Text variant="unit">{' kcal'}</Text>
                  <Text variant="body" color="textSecondary" style={{ fontSize: 14 }}>
                    {' added'}
                  </Text>
                </Text>
              </View>
            ) : notAdded > 0 ? (
              <Text
                variant="numM"
                style={{ fontSize: 17, lineHeight: 22 }}
                testID="today-not-added"
                {...figure(`Workouts: about ${formatNumber(notAdded)} kilocalories, not added to the budget`)}>
                {`~${formatNumber(notAdded)}`}
                <Text variant="unit">{' kcal'}</Text>
                <Text variant="body" color="textSecondary" style={{ fontSize: 14 }}>
                  {' not added'}
                </Text>
              </Text>
            ) : null}
            {hasLine ? (
              <View style={[{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm }, hidden]}>
                {/* The line's key is what its figure is in the cup: the calorie fill for eaten, the empty cup for what is
                    left, the amber cap for what is above. */}
                {shown === 'left' ? (
                  <CupKey color={colors.calories} size={11} style={{ marginTop: 8 }} />
                ) : over ? (
                  <CupKey color={colors.warning} size={11} style={{ marginTop: 8 }} />
                ) : (
                  <CupKey color={colors.vesselEdge} variant="outline" size={11} style={{ marginTop: 8 }} />
                )}
                <View pointerEvents="none" {...figure(`${words.line.spoken}. ${budgetLabel}`)} style={{ flexShrink: 1 }}>
                  <AnimatedNumber key={shown} variant="numM" value={words.line.value} format={(n) => formatNumber(Math.abs(Math.round(n)))} style={{ fontSize: 17, lineHeight: 22 }} testID={words.line.testID}>
                    <Text variant="body" color="textSecondary" style={{ fontSize: 14 }}>
                      {` ${words.line.words} `}
                    </Text>
                    <Text variant="numM" style={{ fontSize: 17, lineHeight: 22 }} testID="today-budget">
                      {formatNumber(day.budget)}
                    </Text>
                  </AnimatedNumber>
                </View>
              </View>
            ) : null}
          </View>
        </View>
        {firstDay || notLogged ? null : (
          <View style={{ gap: spacing.md, marginTop: spacing.lg }} testID="today-macros">
            <MacroColumn label="Protein" value={day.eaten.protein} target={day.macros.proteinG} color={colors.protein} narrow={narrow} reach stacked />
            <MacroColumn label="Carbs" value={day.eaten.carbs} target={day.macros.carbsG} color={colors.carbs} narrow={narrow} stacked />
            <MacroColumn label="Fat" value={day.eaten.fat} target={day.macros.fatG} color={colors.fat} narrow={narrow} stacked />
          </View>
        )}
        {water}
      </Card>
    );
  }

  return (
    <Card testID="today-energy" padding={narrow ? NARROW.padding : 16} style={narrow ? { paddingVertical: NARROW.paddingV } : undefined}>
      <View>
        <Vessel
          value={eaten}
          max={budget}
          headroom={headroom}
          color={colors.calories}
          width={vesselW}
          height={cupH}
          labels={labels}
          labelGap={narrow ? 14 : 16}
          labelSpacing={labelSpacing}
          memoryKey={`hero-${day.date}`}
        />
        {/* Day one: the empty cup's open top is a dashed level line at the budget, "ready to fill". */}
        {firstDay && headroom === 0 ? <ReadyRim width={vesselW} /> : null}
      </View>
      {/* The macros sit under the cup, not in its side column: beside the cup there is room only for
          the cup's own labels, each at the height it describes, whatever the day's numbers are. */}
      {firstDay || notLogged ? null : (
        <View
          // Always observed: react-native-web watches a view's layout only when it mounts with a handler.
          onLayout={(e) => setMacrosW(Math.floor(e.nativeEvent.layout.width))}
          style={macrosStacked ? { gap: spacing.md, marginTop: macrosTop } : { flexDirection: 'row', gap: macroGap, marginTop: macrosTop }}
          testID="today-macros">
          {fit ? (
            <MeasureWidth onWidth={setMacroNameW}>
              <View style={{ alignItems: 'flex-start' }}>
                {['Protein', 'Carbs', 'Fat'].map((label) => (
                  <MacroName key={label} label={label} color={colors.text} />
                ))}
              </View>
            </MeasureWidth>
          ) : null}
          <MacroColumn label="Protein" value={day.eaten.protein} target={day.macros.proteinG} color={colors.protein} narrow={narrow} reach stacked={macrosStacked} />
          <MacroColumn label="Carbs" value={day.eaten.carbs} target={day.macros.carbsG} color={colors.carbs} narrow={narrow} stacked={macrosStacked} />
          <MacroColumn label="Fat" value={day.eaten.fat} target={day.macros.fatG} color={colors.fat} narrow={narrow} stacked={macrosStacked} />
        </View>
      )}
      {water}
    </Card>
  );
}

/**
 * One macro as a column: its key and name, its bar, then the amount of its target. The same shape as the diary's
 * summary card. `stacked` (large text): one full-width row each, the name and the amount on one line (the amount
 * wraps under the name when both do not fit), the bar under them.
 */
function MacroColumn({ label, value, target, color, reach, narrow, stacked }: { label: string; value: number; target: number; color: string; reach?: boolean; narrow: boolean; stacked?: boolean }) {
  const name = <MacroName label={label} color={color} lines={stacked ? undefined : 1} />;
  const bar = <ProgressBar progress={target > 0 ? value / target : 0} color={color} height={6} goalKind={reach ? 'reach' : 'limit'} />;
  // The target may wrap under the number on a narrow phone, whole ("/ 493 g"); it is never cut.
  const amount = (
    <AnimatedNumber variant="numM" value={Math.round(value)} style={{ fontSize: narrow ? 15 : 17, lineHeight: narrow ? 18 : 22 }}>
      <Text variant="caption" color="textSecondary">{` / ${Math.round(target)} g`}</Text>
    </AnimatedNumber>
  );
  if (stacked) {
    return (
      <View style={{ gap: 8 }} {...figure(`${label}, ${Math.round(value)} of ${Math.round(target)} grams`)}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', columnGap: 12 }}>
          {name}
          {amount}
        </View>
        {bar}
      </View>
    );
  }
  return (
    <View style={{ flex: 1, minWidth: 0, gap: narrow ? NARROW.macroGap : 6 }} {...figure(`${label}, ${Math.round(value)} of ${Math.round(target)} grams`)}>
      {name}
      {bar}
      {amount}
    </View>
  );
}

/** A macro's key and name, as its column draws it (and as the card measures it while text is grown). */
function MacroName({ label, color, lines }: { label: string; color: string; lines?: number }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <CupKey color={color} />
      <Text variant="label" numberOfLines={lines}>
        {label}
      </Text>
    </View>
  );
}

const sentence = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

// ------------------------------------------------------------------ meals

/**
 * The day's four meals, a list under the Now card: each with its calories and a line (its foods, or the last same meal,
 * or its share of the budget), Repeat while it is empty and there is one to repeat, and its "+". The meal the Now card
 * is about wears a small "Now" tag, and its Repeat is the card's (`cardRepeat`), so each action is on the page once.
 */
function MealsSection({ day, nowMeal, cardRepeat }: { day: DaySummary; nowMeal: MealType | null; cardRepeat: MealType | null }) {
  const { colors, spacing } = useTheme();
  const all = useLive('foodEntries');
  // Very large text (150% and up): "Repeat" goes on a row of its own under the meal, so the caption keeps the room it
  // needs and never splits a word. With text grown at all, a meal's name and its calories wrap as two lines where both do
  // not fit (never "Lun…"), and the caption takes its lines rather than be cut; through the phone's common steps the
  // rows keep their shape otherwise.
  const large = useVeryLargeText();
  const grown = useGrownText();
  const wrapName = large || grown;
  const open = (meal: MealType) => router.push(`/food/search?meal=${meal}&date=${day.date}`);
  const web = Platform.OS === 'web';
  return (
    // 4 px over the page's 16 px gap, as SectionTitle's own top margin: 20 px from the card above to the title, as on
    // Train, Water and every other screen.
    <View style={{ gap: spacing.sm, marginTop: spacing.xs }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text variant="h3" accessibilityRole="header" {...({ 'aria-level': 2 } as object)}>
          Meals
        </Text>
        {/* A section's way to another screen: the kit's small ghost Button with a chevron (as Water's "Edit sizes"), its
            44 px touch area from the kit; pulled up and right so the row is no taller and the chevron meets the cards' edge. */}
        <Button
          testID="section-meals-action"
          title="Open diary"
          variant="ghost"
          size="sm"
          full={false}
          iconRight={<ChevronRight size={18} color={colors.primaryInk} strokeWidth={2.2} />}
          onPress={() => router.push(`/diary?date=${day.date}` as never)}
          style={{ marginVertical: -8, marginRight: -6, paddingHorizontal: 6 }}
        />
      </View>
      <Card testID="today-meals" padding={0} style={{ paddingVertical: 2 }}>
        {/* The four meals are a list on the web (role="list", each meal a listitem), as the diary's meal rows are, so a
            screen reader says how many there are and can move through them as a list. */}
        <View {...(web ? { role: 'list' as const } : null)}>
        {MEALS.map((m, i) => {
          const entries = day.byMeal[m.id];
          const line = mealLine(entries);
          const prev = entries.length ? null : findPreviousMeal(all, day.date, m.id, 7);
          // The Now card offers this meal's Repeat: the row keeps its caption ("Yesterday: 744 kcal") and leaves the button.
          const repeat = prev && cardRepeat !== m.id ? prev : null;
          const isNow = nowMeal === m.id;
          const caption = entries.length
            ? line.detail
            : prev
              ? `${sentence(relativeTo(prev.date, day.date))}: ${formatNumber(currentKcal(prev.entries))} kcal`
              : `Around ${formatNumber(Math.round((day.budget * MEAL_SHARE[m.id]) / 10) * 10)} kcal suggested`;
          return (
            <View key={m.id} {...(web ? { role: 'listitem' as const } : null)}>
              {i > 0 ? <View style={{ height: 1, backgroundColor: colors.border, marginLeft: spacing.lg }} /> : null}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingLeft: spacing.lg, paddingRight: spacing.sm, paddingVertical: large ? 10 : 6 }}>
                <PressableScale
                  testID={`today-meal-${m.id}`}
                  scaleTo={0.99}
                  onPress={() => (entries.length ? router.push(`/diary?date=${day.date}&meal=${m.id}` as never) : open(m.id))}
                  // What the row shows, as drawn and in its order (WCAG 2.5.3, label in name), then what it leaves out.
                  accessibilityLabel={`${m.label}${isNow ? `, ${NOW_WORDS.now}` : ''}, ${entries.length ? `${line.approx ? '~' : ''}${formatNumber(line.kcal)} kcal, ${caption}` : `${caption}, not logged yet`}`}
                  style={{ flex: 1, minWidth: 0, minHeight: 44, justifyContent: 'center' }}>
                  <View style={wrapName ? { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', columnGap: spacing.sm } : { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm }}>
                    {/* 2 px under the name, so the caption keeps 6 px from the "Now" tag's box. */}
                    <View style={wrapName ? { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: 2 } : { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: 2 }}>
                      <Text variant="title" style={{ flexShrink: 1 }} numberOfLines={wrapName ? undefined : 1}>
                        {m.label}
                      </Text>
                      {/* The meal the Now card is about: a small label, never a colour alone. */}
                      {isNow ? <Badge label={NOW_WORDS.now} /> : null}
                    </View>
                    {entries.length ? (
                      <Text variant="numM" style={{ fontSize: 17, lineHeight: 22 }}>
                        {`${line.approx ? '~' : ''}${formatNumber(line.kcal)}`}
                        <Text variant="unit">{' kcal'}</Text>
                      </Text>
                    ) : null}
                  </View>
                  <Text variant="caption" color="textSecondary" numberOfLines={large || grown ? undefined : 2}>
                    {caption}
                  </Text>
                </PressableScale>
                {repeat && !large ? <RepeatButton meal={m.id} date={day.date} prev={repeat} /> : null}
                <IconButton testID={`today-add-${m.id}`} accessibilityLabel={`Add food to ${m.label.toLowerCase()}`} onPress={() => open(m.id)}>
                  <Plus size={20} color={colors.text} strokeWidth={2.2} />
                </IconButton>
              </View>
              {repeat && large ? (
                <View style={{ flexDirection: 'row', paddingLeft: spacing.lg, paddingRight: spacing.sm, paddingBottom: 10 }}>
                  <RepeatButton meal={m.id} date={day.date} prev={repeat} />
                </View>
              ) : null}
            </View>
          );
        })}
        </View>
      </Card>
    </View>
  );
}

function RepeatButton({ meal, date, prev }: { meal: MealType; date: ISODate; prev: { date: ISODate; entries: FoodEntry[] } }) {
  const { colors } = useTheme();
  const kcal = currentKcal(prev.entries);
  const label = MEAL_LABEL[meal].toLowerCase();
  const when = relativeTo(prev.date, date);
  return (
    <Button
      testID={`today-repeat-${meal}`}
      title="Repeat"
      accessibilityLabel={`Repeat ${when}'s ${label}, ${Math.round(kcal)} kilocalories`}
      variant="secondary"
      size="sm"
      full={false}
      icon={<Repeat2 size={18} color={colors.text} strokeWidth={2.2} />}
      onPress={() => copyEntries(prev.entries, date, meal, `Copied ${label} from ${when}`)}
      style={{ paddingHorizontal: 10, alignSelf: 'center' }}
    />
  );
}

