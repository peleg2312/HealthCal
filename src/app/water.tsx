import { router, useLocalSearchParams } from 'expo-router';
import { ChevronDown, ChevronUp, GlassWater, Info, Trash2 } from 'lucide-react-native';
import React, { useEffect, useMemo, useState } from 'react';
import { useWindowDimensions, View } from 'react-native';

import { isolateRtl } from '@/lib/bidi';
import { today, toISODate, weekdayShort } from '@/lib/dates';
import { BEVERAGE_LABELS, baseWaterGoalMl, effectiveMl, exerciseWaterMl, glassesLeft, HYDRATION_FACTOR } from '@/lib/hydration';
import { formatVolume, formatWeight, volumeToMl, volumeUnit, volumeValue } from '@/lib/units';
import { useNow, useToday } from '@/store/clock';
import { DEFAULT_SETTINGS, useStore } from '@/store';
import { computeDayFromStore, useDay, useDays, useLive, useProfile } from '@/store/selectors';
import { Note, RequireProfile, splitUnit, Tile } from '@/features/trackers/components';
import { dayTitle, resolveDateParam } from '@/features/trackers/dateParam';
import { keepOrConvert, MAX_PRESET_ML, MIN_PRESET_ML, normalizePresets } from '@/features/trackers/helpers';
import { FadeRow, useLeavingRows } from '@/features/food/rowMotion';
import { mealOnDay } from '@/features/food/addedTo';
import { href } from '@/features/food/helpers';
import { logDrink, removeDrink } from '@/features/food/log';
import { useOneTap } from '@/features/food/oneTap';
import { waterChartLabel } from '@/features/progress/chartWords';
import { customFoodIndex, resolveFood } from '@/features/food/usuals';
import { ENTERED, type DrinkChoice } from '@/features/drinks/choices';
import { DrinkChoices } from '@/features/drinks/DrinkChoices';
import { DrinkKindRow } from '@/features/drinks/DrinkKindRow';
import { DrinkPickSheet } from '@/features/drinks/DrinkPickSheet';
import { DrinkRecentChips } from '@/features/drinks/DrinkRecentChips';
import { DrinkTitleRow } from '@/features/drinks/DrinkTitleRow';
import { pickToast, placePick, yourDrinks } from '@/features/drinks/pick';
import { loadDrinkMemory, rememberDrinkChoice, useDrinkMemory } from '@/features/drinks/memory';
import { diaryWaterCaption, diaryWaterOpenLabel, waterDeleteLabel } from '@/features/drinks/diary';
import { drinkMeal, entryFor, noticeLine, pickedFood, planDrink, rememberedChoice, sameDrinkFoodIds, sameDrinkInDiary, selectChoice, selectFood, waterAfter, waterFromEntry, waterOnlyOffered, waterRowCaption, waterRowTitle, type WaterAfter } from '@/features/drinks/rules';
import { leftLitreDecimals, shownMl, volumeNumber, volumeUnitFor, waterLeftMl } from '@/features/today/volume';
import { useLargeText, useTheme } from '@/theme';
import { pourLandsAt } from '@/theme/motion';
import type { Beverage, Food, WaterEntry } from '@/types';
import { spokenUnits } from '@/lib/spokenUnits';
import {
  AnimatedList,
  AnimatedNumber,
  BarChart,
  Button,
  Card,
  CupKey,
  Divider,
  EmptyState,
  haptic,
  Header,
  IconButton,
  NumberField,
  PressableScale,
  RestoreRow,
  Screen,
  SectionTitle,
  Sheet,
  Text,
  motion,
  toast,
  useReducedMotion,
  Vessel,
} from '@/ui';

const BEVERAGES = Object.keys(BEVERAGE_LABELS) as Beverage[];

function clockTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** When a drink was logged, or "Added later" for one back-filled on another day (its clock time would mislead). */
function loggedLabel(e: WaterEntry): string {
  return toISODate(new Date(e.loggedAt)) === e.date ? clockTime(e.loggedAt) : 'Added later';
}

/** One line on how the chosen drink counts, built from the factors so it never drifts from the maths. */
function factorLine(beverage: Beverage): string {
  const factor = HYDRATION_FACTOR[beverage];
  if (factor < 1) {
    const name = beverage === 'other' ? 'Other drinks count' : `${BEVERAGE_LABELS[beverage].label} counts`;
    return `${name} as ${Math.round(factor * 100)}% toward your goal.`;
  }
  const full = BEVERAGES.filter((b) => HYDRATION_FACTOR[b] >= 1).map((b) => BEVERAGE_LABELS[b].label.toLowerCase().replace(/drink$/, 'drinks'));
  const list = `${full.slice(0, -1).join(', ')} and ${full[full.length - 1]}`;
  return `${list[0].toUpperCase()}${list.slice(1)} count in full.`;
}

/**
 * When "Goal reached" follows a glass that crosses the goal on screen, in ms after it: as the pour lands (when
 * the cup draws its brim line and flashes, `pourLandsAt` of the level's change), or, when the count of the
 * goal's share (`water-percent`, the pour's length and curve) does not read 100% by then, as it first does.
 * `from` and `to` are the day's share of the goal before and after (1 is the goal).
 */
function reachedWordsAfter(from: number, to: number): number {
  const lands = pourLandsAt(Math.min(1, to) - Math.min(1, from));
  // The share of its tick at which the count first reads 100% (it rounds, so at 99.5%).
  const share = to > from ? (0.995 - from) / (to - from) : 1;
  // `pourLandsAt(0.05 / (1 - s))` is the moment of the pour's curve that reaches s, for s from 0.75 to 0.99.
  const counts = share <= 0.75 ? 0 : share >= 0.99 ? 1 : pourLandsAt(0.05 / (1 - share));
  return Math.round(motion.duration.pour * Math.max(lands, counts));
}

/**
 * What follows "Goal reached for today." under the cup, in one line with it: the extra drunk and, for
 * today, that more is a bonus ("430 ml past it, anything more is a bonus."). Null when there is nothing to add.
 */
function reachedNote(extra: string | null, isToday: boolean): string | null {
  const parts = [extra ? `${extra} past it` : null, isToday ? 'anything more is a bonus' : null].filter(Boolean) as string[];
  if (!parts.length) return null;
  const line = parts.join(', ');
  return `${line[0].toUpperCase()}${line.slice(1)}.`;
}

/**
 * The glass tiles in even rows: as many a row as fit at 72 px or more, spread over as few rows as
 * that needs and balanced, so four glasses on a 320 px phone are two and two rather than three and
 * one stretched across the screen. A short last row is padded (-1) so every tile keeps one width.
 */
/** A glass tile's least width with large text: "500 ml" whole at 200%, two tiles a row at 320 px. */
const BIG_TILE = 128;

function tileRows(count: number, screenW: number, minTile = 72): number[][] {
  const content = Math.min(screenW, 560) - 40;
  const fit = Math.max(1, Math.floor((content + 8) / (minTile + 8)));
  const rows = Math.ceil(count / fit);
  const perRow = Math.ceil(count / Math.max(1, rows));
  const out: number[][] = [];
  for (let i = 0; i < count; i += perRow) {
    const row = Array.from({ length: Math.min(perRow, count - i) }, (_, k) => i + k);
    while (row.length < perRow) row.push(-1 - row.length);
    out.push(row);
  }
  return out;
}

function WaterScreen() {
  const { colors, spacing } = useTheme();
  const { width: screenW } = useWindowDimensions();
  const narrow = screenW < 360;
  // Large text (Profile's text size, or the phone's): the cup's words leave the cup's side for a column of
  // their own, the glasses go two a row and "Other amount" says "Amount", so nothing is cut or overlaps.
  const big = useLargeText();
  const profile = useProfile();
  const settings = useStore((s) => s.settings);
  const units = profile.units;
  const todayDate = useToday();
  const params = useLocalSearchParams<{ date?: string }>();
  const date = resolveDateParam(params.date, todayDate);
  const isToday = date === todayDate;
  /** "today" or "Wed, Nov 11", for copy that names the day. */
  const dayName = isToday ? 'today' : dayTitle(date);
  const day = useDay(date);
  const week = useDays(7, date);
  const [beverage, setBeverage] = useState<Beverage>('water');
  const [custom, setCustom] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [showAllLog, setShowAllLog] = useState(false);
  // Drinks removed on this visit: each keeps a Restore row in the log (the second way back after the toast's Undo)
  // until it is restored or the screen is left.
  const [removedIds, setRemovedIds] = useState<string[]>([]);
  // "Water only" (the same drink already in the diary): off by default, off again after each log and on any change.
  const [waterOnly, setWaterOnly] = useState(false);
  // The drink sheet, open with its first search ("juice" for Other juice), and the kind whose chip opened
  // it (Juice, Other), or null for the "Search" button: where a pick with no kind of its own goes (placePick).
  const [pickQuery, setPickQuery] = useState<string | null>(null);
  const [pickFrom, setPickFrom] = useState<Beverage | null>(null);
  // Raised when a pick moves the screen to another kind: the kind row scrolls that kind into view.
  const [reveal, setReveal] = useState(0);
  const now = useNow();
  const memory = useDrinkMemory((s) => s.memory);
  const foodEntries = useStore((s) => s.foodEntries);
  const waterRecords = useStore((s) => s.water);
  const customFoods = useLive('customFoods');
  useEffect(() => {
    void loadDrinkMemory();
  }, []);

  const consumed = day.waterMl;
  const goal = day.waterGoalMl;
  // Left is the goal as shown minus the amount as shown, so the two printed parts add up to it.
  const left = waterLeftMl(consumed, goal, units);
  const reached = goal > 0 && consumed >= goal;
  const progress = goal > 0 ? consumed / goal : 0;
  // The goal crossed with the screen open: the line under the cup keeps "left to drink" while the count runs
  // and says "Goal reached" when the pour lands, with the cup's brim line, or later if the count does not read
  // 100% by then (`reachedWordsAfter`), so the words never come before the number. Under reduced motion, and
  // on a screen that opens on a met goal, it says so at once.
  const reduce = useReducedMotion();
  const [seen, setSeen] = useState({ date, reached, left, progress });
  // While the count runs after the crossing: the ml left before it and when the words come; else null.
  const [landing, setLanding] = useState<{ left: number; after: number } | null>(null);
  if (seen.date !== date || seen.reached !== reached || seen.left !== left || seen.progress !== progress) {
    setSeen({ date, reached, left, progress });
    const crossed = seen.date === date && !seen.reached && reached && !reduce;
    setLanding(crossed ? { left: seen.left, after: reachedWordsAfter(seen.progress, progress) } : reached ? landing : null);
  }
  useEffect(() => {
    if (!landing) return;
    const timer = setTimeout(() => setLanding(null), landing.after);
    return () => clearTimeout(timer);
  }, [landing]);
  const reachedShown = reached && !landing;
  const glassMl = settings.waterPresets.includes(250) ? 250 : (settings.waterPresets[1] ?? settings.waterPresets[0] ?? 250);

  // What the next tap logs for the kind: the choice remembered on this device, else the kind's default (Water: none).
  const customById = useMemo(() => customFoodIndex(customFoods), [customFoods]);
  // "Your drinks": the person's own drinks from the diary (scans every entry, so kept until they change).
  const yours = useMemo(() => yourDrinks(foodEntries, customById), [foodEntries, customById]);
  const resolve = (f: Food) => resolveFood(f, customById);
  const selected = rememberedChoice(memory, beverage, resolve);
  const picked = pickedFood(selected, memory, beverage, resolve);
  // The same food already in the diary within 3 hours: said before the tap, with "Water only" unless that
  // entry already added its water (a drink logged in the diary: the chip would count the same water twice).
  // `now` ticks once a minute, so an entry logged since its last tick is still "before now" with a minute's grace.
  const sameEntry = selected?.food ? sameDrinkInDiary(foodEntries, waterRecords, sameDrinkFoodIds(beverage, selected), date, new Date(now.getTime() + 60_000).toISOString()) : null;
  const sameInWater = sameEntry ? waterFromEntry(waterRecords, sameEntry.id) !== null : false;
  const waterOnlyAllowed = waterOnlyOffered(sameEntry, waterRecords);
  const waterOnlyOn = waterOnly && waterOnlyAllowed;
  const customMl = custom && custom > 0 ? volumeToMl(custom, units) : 0;
  // The words before the tap, from the same plan the tap writes (clock from useNow, never read while rendering).
  const shownPlan = (ml: number, amount: 'glass' | 'custom') => planDrink({ kind: beverage, drink: selected, ml, date, now, today: todayDate, units, waterOnly: waterOnlyOn, amount });
  const line = beverage === 'water' ? '' : customMl > 0 && customMl <= 5000 ? shownPlan(customMl, 'custom').line : shownPlan(glassMl, 'glass').line;

  // The day's water after this glass, read from the store at the tap, so the toast names the new total as
  // every water toast does ("250 ml added to Water · 1.48 of 3.3 L").
  const after = (ml: number, kind: Beverage): WaterAfter | undefined => {
    const d = computeDayFromStore(useStore.getState(), date);
    return d ? waterAfter(d.waterMl, d.waterGoalMl, ml, kind, units) : undefined;
  };
  const add = (ml: number, amount: 'glass' | 'custom' = 'glass') => {
    if (!(ml > 0)) return;
    // Crossing the goal is marked by the vessel itself (its onReached adds the success haptic).
    logDrink(planDrink({ kind: beverage, drink: selected, ml, date, now: new Date(), today: today(), units, waterOnly: waterOnlyOn, amount, after: after(ml, beverage) }));
    setWaterOnly(false);
  };
  // One tap, one glass: a quick second tap on a glass (or on Add) within the guard does nothing.
  const glassTap = useOneTap();
  const addTap = useOneTap();
  const removeRow = (e: WaterEntry) => {
    removeDrink(e);
    setRemovedIds((cur) => [e.id, ...cur.filter((id) => id !== e.id)]);
  };
  const removed = removedIds.map((id) => waterRecords[id]).filter((w): w is WaterEntry => !!w && !!w.deleted && w.date === date);

  const chooseKind = (b: Beverage) => {
    setBeverage(b);
    setWaterOnly(false);
  };
  const choose = (c: DrinkChoice) => {
    rememberDrinkChoice(beverage, selectChoice(c));
    setWaterOnly(false);
  };
  const choosePicked = (food: Food) => {
    rememberDrinkChoice(beverage, selectFood(food));
    setWaterOnly(false);
  };
  const openPick = (query: string, from: Beverage | null) => {
    setPickFrom(from);
    setPickQuery(query);
  };
  // A drink picked in the sheet or from a recent chip: it goes where placePick says (its own kind, the kind
  // that opened the sheet, or Other), is remembered there, and the toast says where. Nothing is logged:
  // the line above the glasses now names it, and a glass adds it.
  const pick = (food: Food, from: Beverage | null) => {
    const placed = placePick(food, from);
    if (placed.kind !== 'water' && placed.selected) rememberDrinkChoice(placed.kind, placed.selected);
    const words = pickToast(food, placed, beverage);
    setBeverage(placed.kind);
    setWaterOnly(false);
    setPickQuery(null);
    toast(words, { tint: 'water' });
    setReveal((n) => n + 1);
  };
  const enterCalories = (amountShown: number, kcal: number) => {
    const ml = volumeToMl(amountShown, units);
    if (ml > 5000) {
      toast(`Add up to ${formatVolume(5000, units)} at a time`);
      return;
    }
    setPickQuery(null);
    logDrink(planDrink({ kind: beverage, drink: { id: ENTERED, food: null }, ml, kcal, date, now: new Date(), today: today(), units, amount: 'custom', after: after(ml, beverage) }));
    setWaterOnly(false);
  };

  // The level crossed the goal while the screen is open: the vessel settles and flashes its brim
  // (with Celebrations on), and this adds the haptic; the line under the cup says it as the count lands.
  const onReached = () => {
    haptic.success();
  };


  const allEntries = [...day.waterEntries].reverse();
  const entries = showAllLog ? allEntries : allEntries.slice(0, 6);
  // A removed drink fades where it is before the rows below glide up into its place.
  const rows = useLeavingRows(entries);
  const extraParts = splitUnit(formatVolume(Math.max(0, shownMl(consumed, units) - shownMl(goal, units)), units));
  const note = reachedNote(extraParts.value === '0' ? null : `${extraParts.value} ${extraParts.unit}`, isToday);

  const baseMl = baseWaterGoalMl(profile.weightKg, profile.sex);
  const exerciseMl = exerciseWaterMl(day.activities);
  const override = !!(profile.waterGoalMlOverride && profile.waterGoalMlOverride > 0);

  const bars = week.map((d, i) => ({
    label: d.date === todayDate ? 'Today' : weekdayShort(d.date),
    value: volumeValue(d.waterMl, units),
    color: colors.water,
  }));
  const daysMet = week.filter((d) => d.waterMl >= d.waterGoalMl && d.waterGoalMl > 0).length;

  // The cup's three words: placed at their levels beside the cup, or with large text in a column of their own.
  const goalWords = (
    <Text variant="caption" color="textSecondary" numberOfLines={1}>
      {`Goal ${formatVolume(goal, units)}`}
    </Text>
  );
  const percentWords = (
    <View>
      <AnimatedNumber
        testID="water-percent"
        variant="numXL"
        value={Math.round(progress * 100)}
        format={(n) => `${Math.round(n)}%`}
        style={{ fontSize: narrow ? 44 : 54, lineHeight: narrow ? 46 : 56, letterSpacing: -1.6 }}
      />
      <Text variant="caption" color="textSecondary">
        {isToday ? 'of today’s goal' : 'of the day’s goal'}
      </Text>
    </View>
  );
  const drunkWords = (oneLine: boolean) => (
    <AnimatedNumber
      variant="numM"
      numberOfLines={oneLine ? 1 : undefined}
      style={{ fontSize: 17, lineHeight: 22 }}
      testID="water-consumed"
      value={consumed}
      format={(ml) => volumeNumber(ml, consumed, units)}
      accessibilityLabel={spokenUnits(`${formatVolume(consumed, units)} drunk`)}>
      <Text variant="unit">{` ${volumeUnitFor(consumed, units)}`}</Text>
      <Text variant="body" color="textSecondary" style={{ fontSize: 14 }}>
        {'  drunk'}
      </Text>
    </AnimatedNumber>
  );

  return (
    <Screen header={<Header title="Water" subtitle={isToday ? 'Today' : dayTitle(date)} />} backdrop={colors.water} testID="water-screen">
      <Card padding={18} style={{ gap: spacing.lg }} testID="water-hero">
        {big ? (
          // The cup, and its three words in a column of their own beside it (under it when they need the width).
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: spacing.lg }}>
            <Vessel
              value={consumed}
              max={goal}
              goalKind="reach"
              onReached={onReached}
              memoryKey={`water-${date}`}
              color={colors.water}
              width={narrow ? 76 : 96}
              height={narrow ? 168 : 220}
              accessibilityLabel={spokenUnits(`${formatVolume(consumed, units)} of ${formatVolume(goal, units)}`)}
            />
            <View style={{ flexGrow: 1, flexBasis: 140, minWidth: 0, gap: spacing.sm }}>
              {goalWords}
              {percentWords}
              {drunkWords(false)}
            </View>
          </View>
        ) : (
          <Vessel
            value={consumed}
            max={goal}
            goalKind="reach"
            onReached={onReached}
            memoryKey={`water-${date}`}
            color={colors.water}
            width={narrow ? 76 : 96}
            // Under 360 px the cup is shorter, so all four glasses stay in the first view at 320 x 640.
            height={narrow ? 168 : 220}
            labelGap={narrow ? 14 : 18}
            // Labels that meet at some level keep 8 px between them, at every value.
            labelSpacing={8}
            accessibilityLabel={spokenUnits(`${formatVolume(consumed, units)} of ${formatVolume(goal, units)}`)}
            labels={[
              {
                key: 'goal',
                at: goal,
                height: 20,
                content: goalWords,
              },
              {
                key: 'percent',
                at: (Math.min(consumed, goal) + goal) / 2,
                height: 72,
                content: percentWords,
              },
              {
                key: 'drunk',
                at: Math.min(consumed, goal),
                height: 24,
                tick: consumed > 0 ? colors.rim : undefined,
                content: drunkWords(true),
              },
            ]}
          />
        )}

        {/* The goal is the cup's top label; under the cup only what is left, or, once the goal is reached, one
            line of plain text that says so with the extra (the brim line on the cup carries the moment: no second
            cup and no check, which means only a day on budget). */}
        {reachedShown ? (
          <Text testID="water-goal-reached" variant="bodyStrong">
            {isToday ? 'Goal reached for today.' : `Goal reached on ${dayName}.`}
            {note ? (
              <Text testID="water-glasses" variant="body" color="textSecondary">
                {` ${note}`}
              </Text>
            ) : null}
          </Text>
        ) : (
          <View style={{ gap: 2 }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
              <AnimatedNumber testID="water-left" variant="numL" value={left} format={(ml) => volumeNumber(ml, left, units, leftLitreDecimals(left))} accessibilityLabel={spokenUnits(`${formatVolume(left, units)} left to drink`)} />
              <Text variant="unit" style={{ fontSize: 15 }}>
                {`${volumeUnitFor(left, units)} left to drink`}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }} testID="water-glasses">
              <CupKey color={colors.water} />
              <Text variant="caption" color="textSecondary" style={{ flexShrink: 1 }}>
                {`About ${glassesLeft(landing?.left ?? left, glassMl)} × ${formatVolume(glassMl, units)} to go`}
              </Text>
            </View>
          </View>
        )}
      </Card>

      <DrinkTitleRow onSearch={() => openPick('', null)} onEditSizes={() => setEditing(true)} />
      <DrinkKindRow kind={beverage} onChoose={chooseKind} reveal={reveal} />
      {beverage === 'water' ? (
        <DrinkRecentChips yours={yours} glassMl={glassMl} units={units} onPick={(food) => pick(food, null)} />
      ) : (
        <DrinkChoices
          kind={beverage}
          selected={selected}
          picked={picked}
          glassMl={glassMl}
          units={units}
          line={line}
          notice={sameEntry && selected?.food ? noticeLine(sameEntry, selected, beverage, sameInWater) : null}
          waterOnlyOffered={waterOnlyAllowed}
          waterOnly={waterOnlyOn}
          onChoose={choose}
          onPicked={choosePicked}
          onOpenPick={(q) => openPick(q, beverage)}
          onWaterOnly={setWaterOnly}
        />
      )}
      <View style={{ gap: spacing.sm }}>
        {tileRows(settings.waterPresets.length, screenW, big ? BIG_TILE : 72).map((row, r) => (
          <View key={r} style={{ flexDirection: 'row', gap: spacing.sm }}>
            {row.map((i) => {
              if (i < 0) return <View key={`pad-${r}-${i}`} style={{ flex: 1 }} />;
              const ml = settings.waterPresets[i];
              const tilePlan = shownPlan(ml, 'glass');
              const title = formatVolume(ml, units);
              const subtitle = tilePlan.tile ?? (i === 0 ? 'Small' : undefined);
              return (
                <Tile
                  key={`${ml}-${i}`}
                  testID={`water-add-${i}`}
                  // The tile's own words first ("150 ml, Small"), then what the tap does.
                  accessibilityLabel={spokenUnits(`${title}${subtitle ? `, ${subtitle}` : ''}. ${tilePlan.label}`)}
                  title={title}
                  subtitle={subtitle}
                  icon={<GlassWater size={Math.min(26, 16 + i * 3)} color={colors.water} strokeWidth={1.9} />}
                  onPress={glassTap(() => add(ml))}
                />
              );
            })}
          </View>
        ))}
      </View>
      {/* With large text the field keeps at least 200 px and Add goes under it when both do not fit one line. */}
      <View style={{ flexDirection: 'row', flexWrap: big ? 'wrap' : 'nowrap', gap: spacing.sm, alignItems: 'flex-end' }}>
        <NumberField
          testID="water-custom-input"
          style={big ? { flexGrow: 1, flexBasis: 200 } : { flex: 1 }}
          placeholder={big ? 'Amount' : 'Other amount'}
          suffix={volumeUnit(units)}
          decimals={0}
          value={custom}
          onChange={setCustom}
          accessibilityLabel={`Other amount in ${volumeUnit(units)}`}
        />
        <Button
          testID="water-custom-add"
          title="Add"
          size="lg"
          variant="secondary"
          full={false}
          // As tall as the field beside it (50), so the two read as one row.
          style={{ height: 50 }}
          disabled={!(custom && custom > 0)}
          onPress={addTap(() => {
            if (!custom) return;
            const ml = volumeToMl(custom, units);
            if (ml > 5000) {
              toast(`Add up to ${formatVolume(5000, units)} at a time`);
              return;
            }
            add(ml, 'custom');
            setCustom(null);
          })}
        />
      </View>
      <Note
        icon={
          <View aria-hidden>
            <Info size={14} color={colors.textSecondary} />
          </View>
        }>
        {factorLine(beverage)}
      </Note>

      <SectionTitle title={isToday ? 'Today’s log' : `Log for ${dayName}`} />
      <Card padding={rows.length ? spacing.md : spacing.lg} testID="water-log">
        {rows.length === 0 ? (
          <EmptyState
            emoji="💧"
            title={isToday ? 'Nothing logged yet' : `Nothing logged for ${dayName}`}
            message={isToday ? 'Tap a glass size above and each drink shows up here.' : 'Tap a glass size above to add what you drank that day.'}
          />
        ) : (
          <AnimatedList key={date}>
          {rows.map(({ item: e, leaving }, i) => {
            const counts = Math.round(effectiveMl(e.ml, e.beverage));
            // A drink whose calories are in the diary (logged on Water), or a drink logged in the diary that added
            // this water: the row opens that entry (the one place to change its amount). The two read apart by
            // their caption: "Milk · 129 kcal in breakfast" against "Energy drink · from lunch".
            const linked = entryFor(e, foodEntries);
            const partner = linked?.entry ?? null;
            const fromDiary = linked?.origin === 'diary';
            const title = waterRowTitle(e, units);
            const text = (
              <>
                <View style={{ width: 24, alignItems: 'center' }}>
                  <Text style={{ fontSize: 17, lineHeight: 24 }}>{BEVERAGE_LABELS[e.beverage].emoji}</Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text variant="bodyStrong" tabular>
                    {title}
                  </Text>
                  <Text variant="caption" color="textSecondary">
                    {loggedLabel(e)}
                    {counts !== e.ml ? ` · counts as ${formatVolume(counts, units)}` : ''}
                  </Text>
                  {partner && fromDiary ? (
                    <Text testID={`water-entry-from-${i}`} variant="caption" color="textSecondary" numberOfLines={2}>
                      {/* "from lunch" stays whole, so a wrap falls after the name and never leaves the meal alone on the last line. */}
                      {diaryWaterCaption({ ...partner, name: isolateRtl(partner.name) }).replace(/from (\S+)$/, 'from\u00A0$1')}
                    </Text>
                  ) : partner ? (
                    <Text testID={`water-entry-kcal-${i}`} variant="caption" color="textSecondary" numberOfLines={2}>
                      {/* "129 kcal in breakfast" stays whole, so a wrap falls after the name and never leaves the meal alone on the last line.
                          The drink's name is drawn isolated (a name in Hebrew keeps the line's order); the label below keeps it raw. */}
                      {waterRowCaption({ ...partner, name: isolateRtl(partner.name) }, e.date).replace(/kcal in (\S+)/, 'kcal\u00A0in\u00A0$1')}
                    </Text>
                  ) : null}
                </View>
              </>
            );
            const rowStyle = { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 56, paddingVertical: 6 } as const;
            return (
              <FadeRow key={e.id} leaving={leaving}>
                {i > 0 ? <Divider inset={36} /> : null}
                <View testID={`water-entry-${i}`} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                  {partner ? (
                    <PressableScale
                      testID={`water-entry-open-${i}`}
                      scaleTo={0.985}
                      accessibilityLabel={spokenUnits(fromDiary ? diaryWaterOpenLabel(title, partner) : `${title}, ${waterRowCaption(partner, e.date).replace(' · ', ', ')}. Edit in diary`)}
                      onPress={() => router.push(href('/food/detail', { entryId: partner.id, meal: partner.meal, date: partner.date }) as never)}
                      style={{ ...rowStyle, flex: 1, minWidth: 0 }}>
                      {text}
                    </PressableScale>
                  ) : (
                    <View style={{ ...rowStyle, flex: 1, minWidth: 0 }}>{text}</View>
                  )}
                  <IconButton
                    testID={`water-delete-${i}`}
                    accessibilityLabel={spokenUnits(waterDeleteLabel(e, loggedLabel(e), units, fromDiary ? partner : null))}
                    tone="clear"
                    size={44}
                    onPress={() => removeRow(e)}>
                    <Trash2 size={18} color={colors.textSecondary} strokeWidth={1.9} />
                  </IconButton>
                </View>
              </FadeRow>
            );
          })}
          </AnimatedList>
        )}
        {/* Drinks removed on this visit, each with Restore: the way back that does not leave with the toast. */}
        {removed.map((w, i) => (
          <React.Fragment key={`removed-${w.id}`}>
            <Divider inset={rows.length ? 36 : 0} />
            <RestoreRow
              testID={`water-restore-${i}`}
              label={`${waterRowTitle(w, units)}, ${loggedLabel(w)}, removed from Water`}
              onRestore={() => useStore.getState().restore('water', w.id)}
            />
          </React.Fragment>
        ))}
      </Card>
      {/* More than six drinks: the rest open under the list, where it ends (the testID is the one SectionTitle gave it). */}
      {allEntries.length > 6 ? (
        <Button
          testID="section-today-s-log-action"
          title={showAllLog ? 'Show less' : `Show all ${allEntries.length}`}
          // The visible words first; the open state is the button's own (aria-expanded on the web).
          accessibilityLabel={showAllLog ? 'Show less' : `Show all ${allEntries.length} drinks`}
          expanded={showAllLog}
          variant="ghost"
          size="sm"
          full={false}
          icon={showAllLog ? <ChevronUp size={16} color={colors.primaryInk} strokeWidth={2.2} /> : <ChevronDown size={16} color={colors.primaryInk} strokeWidth={2.2} />}
          onPress={() => setShowAllLog((v) => !v)}
          style={{ alignSelf: 'center', marginTop: -spacing.xs }}
        />
      ) : null}

      <SectionTitle title={isToday ? 'Last 7 days' : `7 days to ${dayTitle(date)}`} />
      <Card style={{ gap: spacing.md }}>
        <Text variant="caption" color="textSecondary">
          {week.some((d) => d.waterMl > 0) ? `Goal met on ${daysMet} of 7 days.` : 'Bars fill in as you log drinks.'} Dashed line: the goal.
        </Text>
        <BarChart
          // One image for a screen reader: the summary, then every day's amount (chartWords).
          accessibilityLabel={spokenUnits(waterChartLabel(week.map((d) => ({ date: d.date, ml: d.waterMl, goalMl: d.waterGoalMl })), todayDate, units))}
          data={bars}
          color={colors.water}
          goal={volumeValue(goal, units)}
          goalKind="reach"
          highlightIndex={bars.length - 1}
          openIndex={isToday ? bars.length - 1 : undefined}
          // Printed exactly as the hero prints the same amount ("1.23 L", "41"), with no unit for fl oz or ml.
          formatValue={(n) => formatVolume(volumeToMl(n, units), units).replace(/ (fl oz|ml)$/, '')}
        />
      </Card>

      <SectionTitle title="Where your goal comes from" />
      <Card style={{ gap: spacing.md }}>
        {override ? (
          <Text variant="body" color="textSecondary">
            You set a fixed goal of {formatVolume(goal, units)} a day. It stays the same on training days.
          </Text>
        ) : (
          <>
            <GoalLine
              label="Base for your body weight"
              hint={`About ${units === 'imperial' ? '0.5 fl oz per lb' : '33 ml per kg'} at ${formatWeight(profile.weightKg, units)}, kept within the usual range for ${profile.sex === 'male' ? 'men' : 'women'}`}
              value={formatVolume(baseMl, units)}
            />
            <GoalLine
              label={isToday ? 'Extra for today’s exercise' : 'Extra for the day’s exercise'}
              hint={
                day.activities.length
                  ? `${day.activeMinutes} min logged ${isToday ? 'today' : 'that day'}, to replace some of the sweat`
                  : 'Log a workout and this goes up for the day'
              }
              value={`+${formatVolume(exerciseMl, units)}`}
            />
            <Divider />
            <GoalLine label={isToday ? 'Today’s goal' : `Goal for ${dayName}`} value={formatVolume(goal, units)} strong />
            <Text variant="caption" color="textTertiary">
              This counts drinks only. Food supplies roughly a fifth of the water you take in, so it is not included.
            </Text>
          </>
        )}
        <Button testID="water-change-goal" title="Change goal" variant="secondary" size="md" onPress={() => router.push('/settings/goals' as never)} />
      </Card>

      <DrinkPickSheet
        visible={pickQuery !== null}
        initialQuery={pickQuery ?? ''}
        glassMl={glassMl}
        units={units}
        yours={yours}
        onPick={(food) => pick(food, pickFrom)}
        onEntered={enterCalories}
        where={mealOnDay(drinkMeal(now), date, todayDate)}
        onClose={() => setPickQuery(null)}
      />
      <PresetSheet visible={editing} onClose={() => setEditing(false)} presets={settings.waterPresets} units={units} />
    </Screen>
  );
}

function GoalLine({ label, hint, value, strong }: { label: string; hint?: string; value: string; strong?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant={strong ? 'title' : 'bodyStrong'}>{label}</Text>
        {hint ? (
          <Text variant="caption" color="textSecondary">
            {hint}
          </Text>
        ) : null}
      </View>
      <Text variant={strong ? 'numM' : 'title'} tabular color="text">
        {value}
      </Text>
    </View>
  );
}

/** A preset field: what it shows, and the stored ml it was filled from (null for a new field). */
type PresetField = { shown: number | null; ml: number | null };

function PresetSheet({ visible, onClose, presets, units }: { visible: boolean; onClose: () => void; presets: number[]; units: 'metric' | 'imperial' }) {
  const { spacing } = useTheme();
  const toDisplay = (ml: number) => Math.round(volumeValue(ml, units));
  const fieldsFor = (list: number[]): PresetField[] => list.map((ml) => ({ shown: toDisplay(ml), ml }));
  const [fields, setFields] = useState<PresetField[]>(() => fieldsFor(presets));
  const [error, setError] = useState<string | null>(null);
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setFields(fieldsFor(presets));
      setError(null);
    }
  }
  const unit = volumeUnit(units);
  const save = () => {
    // Untouched fields keep their stored ml, so an imperial save does not shift 250 ml to 237 ml.
    const ml = normalizePresets(fields.map((f) => keepOrConvert(f.shown, f.ml, toDisplay, (v) => volumeToMl(v, units))));
    if (ml.length === 0) {
      // Inline, not a toast: a toast would sit behind the sheet's native modal.
      haptic.warn();
      setError(`Keep at least one size between ${formatVolume(MIN_PRESET_ML, units)} and ${formatVolume(MAX_PRESET_ML, units)}`);
      return;
    }
    useStore.getState().setSettings({ waterPresets: ml });
    onClose();
    toast('Glass sizes saved');
  };
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Glass sizes"
      footer={
        <View style={{ gap: spacing.sm }}>
          {error ? (
            <Text testID="water-presets-error" variant="caption" color="danger" align="center">
              {error}
            </Text>
          ) : null}
          <Button testID="water-presets-save" title="Save sizes" onPress={save} />
        </View>
      }>
      <Text variant="body" color="textSecondary">
        These are the one-tap buttons. Leave a field empty to remove it. Between {formatVolume(MIN_PRESET_ML, units)} and {formatVolume(MAX_PRESET_ML, units)}.
      </Text>
      {fields.map((f, i) => (
        <NumberField
          key={i}
          testID={`water-preset-${i}`}
          label={`Size ${i + 1}`}
          suffix={unit}
          decimals={0}
          value={f.shown}
          onChange={(n) => {
            setError(null);
            setFields((cur) => cur.map((x, j) => (j === i ? { ...x, shown: n } : x)));
          }}
        />
      ))}
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        {fields.length < 6 ? (
          <Button
            testID="water-presets-add"
            title="Add a size"
            variant="secondary"
            size="md"
            style={{ flex: 1 }}
            onPress={() => setFields((cur) => [...cur, { shown: null, ml: null }])}
          />
        ) : null}
        <Button
          testID="water-presets-reset"
          title="Reset"
          variant="ghost"
          size="md"
          style={{ flex: 1 }}
          onPress={() => {
            setError(null);
            setFields(fieldsFor(DEFAULT_SETTINGS.waterPresets));
          }}
        />
      </View>
    </Sheet>
  );
}

export default function WaterRoute() {
  return (
    <RequireProfile>
      <WaterScreen />
    </RequireProfile>
  );
}

