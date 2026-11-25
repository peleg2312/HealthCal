import { router } from 'expo-router';
import { ArrowRightLeft, ChevronRight, CookingPot, Plus, Repeat2 } from 'lucide-react-native';
import React, { useState } from 'react';
import { Platform, useWindowDimensions, View } from 'react-native';

import { hasFoodLogged } from '@/features/drinks/via';
import { ShareDayButton } from '@/features/share';
import { copyEntries, findPreviousMeal } from '@/features/food/actions';
import { useOneTap } from '@/features/food/oneTap';
import { currentKcal } from '@/features/food/usuals';
import { useRecapReady } from '@/features/progress/recapReady';
import { figureWords, otherFigure, setCalorieFigure, useCalorieFigure } from '@/features/today/calorieFigure';
import { coachTip, rhythmFromReminders, type ClosedDay } from '@/features/today/coach';
import { DayRingStrip } from '@/features/today/DayRingStrip';
import { FitsSheet } from '@/features/today/FitsSheet';
import { mealLine } from '@/features/today/meals';
import { ReadyRim } from '@/features/today/ReadyRim';
import { SHARE_CUP } from '@/features/today/ShareCup';
import { RecapReadyCard } from '@/features/today/RecapReadyCard';
import { FirstLogInvite } from '@/features/today/FirstLogInvite';
import { AiGlyph } from '@/features/ai/mark';
import { MorningWatcher } from '@/features/morning/useMorningPage';
import { useBackToToday } from '@/features/today/useBackToToday';
import { startDate } from '@/features/today/week';
import { todayTitle } from '@/features/today/greetingTitle';
import { TabHeader, tabDay, tabTitleRoom, tabTitleSize } from '@/components/TabHeader';
import { MilestoneSheet } from '@/features/streak/MilestoneSheet';
import { AFTER_STRIP_MS, StreakMark } from '@/features/streak/StreakMark';
import { useStreakMoment } from '@/features/streak/useStreakMoment';
import { addWater, defaultGlass, StatusRail } from '@/features/today/StatusRail';
import { useReportViewedDay } from '@/features/today/viewedDay';
import { addDays, formatShortDate, greeting } from '@/lib/dates';
import { MEALS, MEAL_LABEL, MEAL_SHARE, mealForTime } from '@/lib/nutrition';
import { spokenUnits } from '@/lib/spokenUnits';
import { formatNumber, formatVolume } from '@/lib/units';
import { useStore } from '@/store';
import { useNow, useToday } from '@/store/clock';
import { useConsistency, useDay, useLive, useProfile, type DaySummary } from '@/store/selectors';
import { motion, useLargeText, useTheme } from '@/theme';
import type { FoodEntry, ISODate, MealType } from '@/types';
import { AnimatedNumber, Button, Card, Chip, CupKey, figure, IconButton, levelY, placeLabels, PressableScale, ProgressBar, Screen, Text, useGrownText, Vessel, type VesselLabel } from '@/ui';


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
  const recap = useRecapReady();
  // The "What fits" sheet: null when closed, else whether protein is the gap it was opened for.
  const [fits, setFits] = useState<{ proteinFirst: boolean } | null>(null);

  const { width } = useWindowDimensions();
  const title = todayTitle(greeting(now), profile.name ?? '', tabTitleRoom(width), tabTitleSize(width));
  const select = (d: ISODate) => setPicked(d === todayDate ? null : d);
  // The day changes only from the week strip: no page swipe here, so scrolling or reaching for a
  // row never moves Today to another day. Back in front after five minutes or more away, or on
  // another day, it shows today again.
  useBackToToday(() => setPicked(null));

  return (
    <Screen
      tabs
      testID="today-screen"
      header={<TabHeader tab="today" overline={tabDay(date)} title={title.text} titleSize={title.size} />}>
      {/* Cards 16 px apart, as on the diary, Progress and the check-in. */}
      <View testID="today-swipe" style={{ gap: spacing.lg }}>
      {/* The first visit on a new morning opens yesterday's summary (rule in @/features/morning/rule). Draws nothing. */}
      <MorningWatcher />
      {/* The one date control, the same as the diary's: the strip, then the week's caption with the streak or "Back to today". */}
      <DayRingStrip
        today={todayDate}
        selected={date}
        onSelect={select}
        start={start}
        jumpTestID="today-jump-today"
        // 16 px to what follows (the page's gap), as on the diary, so the first card starts at the same height on both tabs.
        accessory={streak.streak > 1 ? <StreakMark days={streak.streak} filled={streak.filled} /> : null}
        // Said in the caption's place once the streak cup has poured and its number ticked up, so
        // logging never pushes the page down and the line never runs ahead of the count.
        note={isToday && streak.line ? { text: streak.line, delay: AFTER_STRIP_MS, testID: 'today-streak-line' } : null}
      />

      <EnergyCard
        day={day}
        isToday={isToday}
        firstDay={firstDay}
        meal={mealForTime(now)}
        onFits={() => setFits({ proteinFirst: false })}
      />
      {/* Water and the other pillars directly under the calorie card, so the one-tap glass is in the first
          view at 360 x 740 on every day, day one included. */}
      <StatusRail day={day} isToday={isToday} quiet={firstDay} />
      {/* Early in the week "Your week is ready" first, then the coach's one line with its one action, under the two
          cards whose numbers it talks about. "Ask the coach" is in the calorie card's action row, so the coach has a
          worded way in within the thumb's reach in the first view, not only the header's cup. Day one has neither:
          the invite in the card is the one thing to do. */}
      {isToday && !firstDay && recap.announce ? <RecapReadyCard /> : null}
      {isToday && !firstDay ? (
        <CoachLine
          day={day}
          yesterday={yesterday.entries.length ? { eaten: yesterday.eaten.kcal, budget: yesterday.budget } : null}
          onFits={() => setFits({ proteinFirst: true })}
        />
      ) : null}

      <MealsSection day={day} />

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

// ------------------------------------------------------------- energy hero

/** Tall enough for the cup's three labels with 8 px between them at any value; the macros sit under the cup, not beside it. */
const VESSEL_H = 150;
/** Day one: a shorter, empty cup, so the first-log invite under it and the water row under the card stay in the first view at 360 x 740. */
const VESSEL_H_FIRST = 120;
/** Day one under 360 px: shorter still, so the water row and its glass are in the first view at 320 x 640. */
const VESSEL_H_FIRST_NARROW = 100;
/**
 * Under 360 px only (320 x 640): a tighter card, so the water row and its "+ 250 ml" are in the first
 * view there and the toast a glass raises (two lines at that width) rests under the button, not on it.
 * The cup is as tall as its label column needs at the demo's values (the three labels, 20 px boxes
 * round 17 px numbers, and the action row, 4 px apart, which keeps their letters 8 px apart), and the
 * card's padding and inner gaps step down; at 360 and wider nothing changes.
 */
const VESSEL_H_NARROW = 126;
const NARROW = { padding: 12, paddingV: 10, labelSpacing: 4, labelH: 20, macrosTop: 12, macroGap: 4 };
/**
 * The card's action rows, under the "eaten" line in the cup's label column: "Ideas that fit" (a 32 px chip) and the
 * day's share cup, as tall as the chip, at the column's right end; on today, "Ask the coach" (a chip with the coach's
 * glyph) on a row of its own under them, ACTION_GAP lower, so the 44 px touch areas of the two rows meet and never
 * overlap. The coach's worded way in is then in the first view's lower part at 320, 360 and 390 px. The card has no
 * footer row: the budget is said in the "eaten" line ("1,219 eaten of 2,160", as the diary's summary says it), so the
 * water row under the card sits higher and the toast a glass raises rests clear of its "+ 250 ml". The line shares the
 * unit of the number above it ("941 kcal left"): " kcal" needs 27 px more, and at 320 px its column has 26 to spare.
 */
const ACTION_H = Math.max(32, SHARE_CUP);
const ACTION_GAP = 12;

function EnergyCard({
  day,
  isToday,
  firstDay,
  meal,
  onFits,
}: {
  day: DaySummary;
  isToday: boolean;
  firstDay: boolean;
  meal: MealType;
  onFits: () => void;
}) {
  const { colors, spacing } = useTheme();
  const { width: screenW } = useWindowDimensions();
  const narrow = screenW < 360;
  // Large text, or text grown at all (the app's or the phone's size above the designed one, or a reader's own text
  // spacing, WCAG 1.4.12): the labels leave the cup's side column for rows (the `large` layout below). The column places
  // each label at the level it describes in boxes measured at the designed size, so grown letters would run into the
  // labels beside them; the rows wrap at their words instead. At the designed size nothing changes.
  const grown = useGrownText();
  const large = useLargeText() || grown;
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
  const height = firstDay ? (narrow ? VESSEL_H_FIRST_NARROW : VESSEL_H_FIRST) : narrow ? VESSEL_H_NARROW : VESSEL_H;
  const labelSpacing = narrow ? NARROW.labelSpacing : 8;
  // The label boxes: 22 px round the 17 px numbers (20 on a narrow phone), the big number as tall as it is drawn
  // on a narrow phone (its line height) and at least 44 otherwise.
  const lineH = narrow ? NARROW.labelH : 22;
  const numH = narrow ? 42 : Math.max(44, boxSize - 4);
  const macrosTop = narrow ? NARROW.macrosTop : spacing.lg;
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
      <Text variant="unit" style={{ fontSize: 14, lineHeight: 17, marginBottom: numSize * 0.08 }}>
        {`kcal\n${words.big.word}`}
      </Text>
      {toggle ? <ArrowRightLeft size={18} color={colors.actionInk} strokeWidth={2.2} style={{ marginBottom: numSize * 0.08 }} /> : null}
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
      height: lineH,
      tick: colors.exercise,
      content: (
        // Never clipped (no numberOfLines): under a reader's own text spacing the label wraps rather than lose its end.
        <Text variant="numM" style={{ fontSize: 17, lineHeight: lineH }} testID="today-added" {...figure(addedLabel)}>
          {`~${formatNumber(headroom)}`}
          <Text variant="unit">{' kcal'}</Text>
          <Text variant="body" color="textSecondary" style={{ fontSize: 14 }}>
            {'  added'}
          </Text>
        </Text>
      ),
    });
  } else if (notAdded > 0) {
    // Exercise left out of the budget (Goals): said at the brim, where "~290 kcal added" would be. No tick:
    // nothing is poured or hatched for it.
    labels.push({
      key: 'not-added',
      at: budget,
      height: lineH,
      content: (
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
        </Text>
      ),
    });
  }
  if (notLogged) {
    labels.push({
      key: 'left',
      at: budget / 2,
      height: 52,
      content: (
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
        </PressableScale>
      ),
    });
  } else {
    labels.push({
      key: 'left',
      at: (Math.min(eaten, budget) + emptyTop) / 2,
      // At least 44 tall to touch: as tall as the number on a narrow phone, its touch area reaching 44 past it.
      height: numH,
      content: bigControl(false, { minHeight: numH }),
    });
    if (!firstDay) {
      labels.push({
        key: 'eaten',
        at: Math.min(eaten, budget),
        height: lineH,
        tick: colors.rim,
        content: (
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
          </View>
        ),
      });
    }
  }

  // The action row, 8 px under the "eaten" line in the cup's label column, placed as the cup places its labels
  // (placeLabels), so the cup, the number and every label above it stay where they are: "Ideas that fit" (opens What
  // fits, ideas first; not over the budget, where What fits has no ideas) and the day's share cup at the column's
  // right end. Only where there is an "eaten" line: day one ends with its invite and a past day with nothing logged
  // has nothing to share (as on the diary).
  const sorted = [...labels].sort((a, b) => b.at - a.at);
  const tops = placeLabels(
    sorted.map((l) => levelY(l.at, budget, height - 1.5) - l.height / 2),
    sorted.map((l) => l.height),
    height,
    labelSpacing,
  );
  const eatenIdx = sorted.findIndex((l) => l.key === 'eaten');
  const actions = eatenIdx >= 0;
  const ideasChip = actions && isToday && day.remaining >= 0;
  // "Ask the coach" on today (the coach card is today's too): a row of its own under "Ideas that fit" and the share,
  // or in the chip's place beside the share when there is no "Ideas that fit" (over the budget) and the column holds
  // both (360 px and wider; at 320 it keeps its own row).
  const coachAsk = actions && isToday;
  const askBeside = coachAsk && !ideasChip && !narrow;
  const actionsH = coachAsk && !askBeside ? 2 * ACTION_H + ACTION_GAP : ACTION_H;
  const actionsTop = actions ? tops[eatenIdx] + sorted[eatenIdx].height + labelSpacing : 0;
  // Room the rows take below the cup, keeping 12 px to the macros (16 under the cup, 12 on a narrow phone).
  const actionsRoom = actions ? Math.max(0, actionsTop + actionsH + 12 - (height + macrosTop)) : 0;
  const askChip = coachAsk ? (
    <Chip
      testID="today-coach-ask"
      label="Ask the coach"
      icon={<AiGlyph name="coach" size={18} color={colors.text} strokeWidth={2.2} />}
      onPress={() => router.push('/coach' as never)}
    />
  ) : null;
  const labelLeft = vesselW + (narrow ? 14 : 16);

  if (large) {
    // Large text (130% and up, the app's size or the phone's), or text grown at all: the side column beside the cup has
    // no room for its labels at the heights they describe (the eaten line alone is wider than it at 130%, and a reader's
    // text spacing widens every label), so nothing here is placed by value. The number leads the card, whole; the cup's other labels are rows beside the cup, each with its key
    // (the hatch for workouts, the calorie fill for eaten); the actions and the macros are rows under it. Every line
    // wraps at its words.
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
    return (
      <Card testID="today-energy" padding={narrow ? NARROW.padding : 18}>
        {remaining}
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: narrow ? 14 : 16, marginTop: spacing.md }}>
          <View>
            <Vessel value={eaten} max={budget} headroom={headroom} color={colors.calories} width={vesselW} height={height} memoryKey={`hero-${day.date}`} />
            {firstDay && headroom === 0 ? <ReadyRim width={vesselW} /> : null}
          </View>
          <View style={{ flex: 1, minWidth: 0, gap: spacing.md }}>
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
            {actions ? (
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
        {actions ? (
          <View testID="today-actions" style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, marginTop: spacing.md }}>
            {ideasChip ? (
              <Chip
                testID="today-ideas"
                label="Ideas that fit"
                accessibilityLabel="Ideas that fit: meals and foods for what is left"
                icon={<CookingPot size={18} color={colors.text} strokeWidth={2.2} />}
                onPress={onFits}
              />
            ) : null}
            {askChip}
            {ideasChip || askChip ? null : <View />}
            <ShareDayButton date={day.date} size={SHARE_CUP} />
          </View>
        ) : null}
        {firstDay || notLogged ? null : (
          <View style={{ gap: spacing.md, marginTop: spacing.lg }} testID="today-macros">
            <MacroColumn label="Protein" value={day.eaten.protein} target={day.macros.proteinG} color={colors.protein} narrow={narrow} reach stacked />
            <MacroColumn label="Carbs" value={day.eaten.carbs} target={day.macros.carbsG} color={colors.carbs} narrow={narrow} stacked />
            <MacroColumn label="Fat" value={day.eaten.fat} target={day.macros.fatG} color={colors.fat} narrow={narrow} stacked />
          </View>
        )}
        {firstDay ? (
          <View style={{ marginTop: narrow ? 12 : 18 }}>
            <FirstLogInvite meal={meal} date={day.date} budget={day.budget} narrow={narrow} />
          </View>
        ) : null}
      </Card>
    );
  }

  return (
    <Card testID="today-energy" padding={narrow ? NARROW.padding : 18} style={narrow ? { paddingVertical: NARROW.paddingV } : undefined}>
      <View style={actionsRoom ? { marginBottom: actionsRoom } : undefined}>
        <Vessel
          value={eaten}
          max={budget}
          headroom={headroom}
          color={colors.calories}
          width={vesselW}
          height={height}
          labels={labels}
          labelGap={narrow ? 14 : 16}
          labelSpacing={labelSpacing}
          memoryKey={`hero-${day.date}`}
        />
        {/* Day one: the empty cup's open top is a dashed level line at the budget, "ready to fill". */}
        {firstDay && headroom === 0 ? <ReadyRim width={vesselW} /> : null}
        {/* After the cup in the tree, so the cup's label column never sits over the rows and takes their taps. */}
        {actions ? (
          <View testID="today-actions" style={{ position: 'absolute', left: labelLeft, right: 0, top: actionsTop, height: actionsH, gap: ACTION_GAP }}>
            <View style={{ height: ACTION_H, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }}>
              {/* A pot, not the AI mark: these ideas are worked out on the phone from the person's own meals and fixed plates. */}
              {ideasChip ? (
                <Chip
                  testID="today-ideas"
                  label="Ideas that fit"
                  accessibilityLabel="Ideas that fit: meals and foods for what is left"
                  icon={<CookingPot size={18} color={colors.text} strokeWidth={2.2} />}
                  onPress={onFits}
                />
              ) : askBeside ? (
                askChip
              ) : (
                <View />
              )}
              <ShareDayButton date={day.date} size={SHARE_CUP} />
            </View>
            {/* The coach's worded way in, with its own glyph (the AI's speech cup): it leads to the AI coach. */}
            {askChip && !askBeside ? <View style={{ height: ACTION_H, flexDirection: 'row', alignItems: 'center' }}>{askChip}</View> : null}
          </View>
        ) : null}
      </View>
      {/* The macros sit under the cup, not in its side column: beside the cup there is room only for
          the cup's own labels, each at the height it describes, whatever the day's numbers are. */}
      {firstDay || notLogged ? null : (
        <View style={{ flexDirection: 'row', gap: narrow ? spacing.md : spacing.lg, marginTop: macrosTop }} testID="today-macros">
          <MacroColumn label="Protein" value={day.eaten.protein} target={day.macros.proteinG} color={colors.protein} narrow={narrow} reach />
          <MacroColumn label="Carbs" value={day.eaten.carbs} target={day.macros.carbsG} color={colors.carbs} narrow={narrow} />
          <MacroColumn label="Fat" value={day.eaten.fat} target={day.macros.fatG} color={colors.fat} narrow={narrow} />
        </View>
      )}
      {firstDay ? (
        <View style={{ marginTop: narrow ? 12 : 18 }}>
          <FirstLogInvite meal={meal} date={day.date} budget={day.budget} narrow={narrow} />
        </View>
      ) : null}
    </Card>
  );
}

/**
 * One macro as a column: its key and name, its bar, then the amount of its target. The same shape as the diary's
 * summary card. `stacked` (large text): one full-width row each, the name and the amount on one line (the amount
 * wraps under the name when both do not fit), the bar under them.
 */
function MacroColumn({ label, value, target, color, reach, narrow, stacked }: { label: string; value: number; target: number; color: string; reach?: boolean; narrow: boolean; stacked?: boolean }) {
  const name = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <CupKey color={color} />
      <Text variant="label" numberOfLines={stacked ? undefined : 1}>
        {label}
      </Text>
    </View>
  );
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
    <View style={{ flex: 1, minWidth: 0, gap: narrow ? NARROW.macroGap : 8 }} {...figure(`${label}, ${Math.round(value)} of ${Math.round(target)} grams`)}>
      {name}
      {bar}
      {amount}
    </View>
  );
}

// ------------------------------------------------------------------ coach

const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "yesterday" or "Nov 10", from the date of the day being viewed (never the wall clock). */
function relativeTo(date: ISODate, from: ISODate): string {
  return date === addDays(from, -1) ? 'yesterday' : formatShortDate(date);
}

/**
 * The coach's line under the water card, in a card of its own: one sentence pair in at most two lines ("Had dinner
 * yet? It is not in today's log.") and its one action as a small button directly under it
 * (a glass of water, repeat a meal, see what fits, or where the tip points). No chevron, no chips:
 * one thing to read, one thing to tap. "Ask the coach" (`today-coach-ask`) is in the calorie card's action row.
 */
function CoachLine({ day, yesterday, onFits }: { day: DaySummary; yesterday: ClosedDay | null; onFits: () => void }) {
  const { colors, spacing } = useTheme();
  const profile = useProfile();
  const now = useNow();
  const entries = useLive('foodEntries');
  const presets = useStore((s) => s.settings.waterPresets);
  const reminders = useStore((s) => s.settings.reminders);
  const tip = coachTip(day, profile.units, now, rhythmFromReminders(reminders), yesterday);
  const action = tip.action;
  const quick = tip.quick;
  const prev = quick?.kind === 'repeat' ? findPreviousMeal(entries, day.date, quick.meal, 7) : null;
  const glass = defaultGlass(presets);
  // One tap, one glass: a quick second tap on "Add 250 ml" does not log a second one.
  const oneTap = useOneTap();

  // Never wider than the card (large text): a long action ("Repeat yesterday's breakfast") stays inside its edges.
  const small = { size: 'sm' as const, variant: 'secondary' as const, full: false, style: { alignSelf: 'flex-start' as const, maxWidth: '100%' as const } };
  let button: React.ReactNode = null;
  if (quick?.kind === 'water') {
    button = (
      <Button
        {...small}
        testID="today-coach-water"
        tint={colors.water}
        icon={<Plus size={18} color={colors.water} strokeWidth={2.2} />}
        title={`Add ${formatVolume(glass, profile.units)}`}
        // Its words as drawn ("Add 250 ml"; label in name), then what it adds to and whose tip it is, so it is never
        // named as the water row's glass above it is.
        accessibilityLabel={`Add ${formatVolume(glass, profile.units)} of water, as the coach suggests`}
        onPress={oneTap(() => addWater(day.date, glass, profile.units, day.waterGoalMl))}
      />
    );
  } else if (quick?.kind === 'repeat' && prev) {
    // What the tap stores: a bundled food at today's values (currentKcal, the rule copyEntries logs by).
    const kcal = currentKcal(prev.entries);
    const meal = MEAL_LABEL[quick.meal].toLowerCase();
    const when = relativeTo(prev.date, day.date);
    button = (
      <Button
        {...small}
        testID="today-coach-repeat"
        icon={<Repeat2 size={18} color={colors.text} strokeWidth={2.2} />}
        title={`Repeat ${when}'s ${meal}`}
        accessibilityLabel={`Repeat ${when}'s ${meal}, ${formatNumber(kcal)} kilocalories`}
        onPress={() => copyEntries(prev.entries, day.date, quick.meal, `Copied ${meal} from ${when}`)}
      />
    );
  } else if (quick?.kind === 'fits' || action) {
    button = (
      <Button
        {...small}
        testID="today-coach-action"
        title={action?.label ?? 'See what fits'}
        onPress={quick?.kind === 'fits' ? onFits : () => router.push(action!.href as never)}
      />
    );
  }

  return (
    // A card line like the cards around it, not a loose paragraph between them: the tip and its action in one quiet card.
    <Card testID="today-coach" style={{ gap: spacing.md }}>
      <Text variant="body" {...figure(spokenUnits(`${tip.title}. ${tip.body}`))}>
        <Text variant="bodyStrong">{/[.!?]$/.test(tip.title) ? tip.title : `${tip.title}.`}</Text>
        <Text variant="body" color="textSecondary">{` ${tip.body}`}</Text>
      </Text>
      {/* "Ask the coach" is in the calorie card's action row, in the first view; the card keeps the tip's one action. */}
      {button}
    </Card>
  );
}

// ------------------------------------------------------------------ meals

function MealsSection({ day }: { day: DaySummary }) {
  const { colors, spacing } = useTheme();
  const all = useLive('foodEntries');
  // Large text: a meal's name and its calories wrap as two lines when both do not fit, and "Repeat" goes on a row of
  // its own under the meal, so the caption keeps the room it needs and never splits a word.
  const large = useLargeText();
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
          const caption = entries.length
            ? line.detail
            : prev
              ? `${sentence(relativeTo(prev.date, day.date))}: ${formatNumber(currentKcal(prev.entries))} kcal`
              : `Around ${formatNumber(Math.round((day.budget * MEAL_SHARE[m.id]) / 10) * 10)} kcal suggested`;
          return (
            <View key={m.id} {...(web ? { role: 'listitem' as const } : null)}>
              {i > 0 ? <View style={{ height: 1, backgroundColor: colors.border, marginLeft: spacing.lg }} /> : null}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingLeft: spacing.lg, paddingRight: spacing.sm, paddingVertical: 10 }}>
                <PressableScale
                  testID={`today-meal-${m.id}`}
                  scaleTo={0.99}
                  onPress={() => (entries.length ? router.push(`/diary?date=${day.date}&meal=${m.id}` as never) : open(m.id))}
                  // What the row shows, as drawn and in its order (WCAG 2.5.3, label in name), then what it leaves out.
                  accessibilityLabel={entries.length ? `${m.label}, ${line.approx ? '~' : ''}${formatNumber(line.kcal)} kcal, ${caption}` : `${m.label}, ${caption}, not logged yet`}
                  style={{ flex: 1, minWidth: 0, minHeight: 44, justifyContent: 'center' }}>
                  <View style={large ? { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', columnGap: spacing.sm } : { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm }}>
                    <Text variant="title" style={large ? undefined : { flex: 1 }} numberOfLines={large ? undefined : 1}>
                      {m.label}
                    </Text>
                    {entries.length ? (
                      <Text variant="numM" style={{ fontSize: 17, lineHeight: 22 }}>
                        {`${line.approx ? '~' : ''}${formatNumber(line.kcal)}`}
                        <Text variant="unit">{' kcal'}</Text>
                      </Text>
                    ) : null}
                  </View>
                  <Text variant="caption" color="textSecondary" numberOfLines={large ? undefined : 2}>
                    {caption}
                  </Text>
                </PressableScale>
                {prev && !large ? <RepeatButton meal={m.id} date={day.date} prev={prev} /> : null}
                <IconButton testID={`today-add-${m.id}`} accessibilityLabel={`Add food to ${m.label.toLowerCase()}`} onPress={() => open(m.id)}>
                  <Plus size={20} color={colors.text} strokeWidth={2.2} />
                </IconButton>
              </View>
              {prev && large ? (
                <View style={{ flexDirection: 'row', paddingLeft: spacing.lg, paddingRight: spacing.sm, paddingBottom: 10 }}>
                  <RepeatButton meal={m.id} date={day.date} prev={prev} />
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

