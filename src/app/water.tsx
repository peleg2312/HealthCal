import { router, useLocalSearchParams } from 'expo-router';
import { Check, GlassWater, Info, Trash2 } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { useWindowDimensions, View } from 'react-native';

import { today, toISODate, weekdayShort } from '@/lib/dates';
import { BEVERAGE_LABELS, baseWaterGoalMl, effectiveMl, exerciseWaterMl, glassesLeft, HYDRATION_FACTOR } from '@/lib/hydration';
import { formatVolume, formatWeight, volumeToMl, volumeUnit, volumeValue } from '@/lib/units';
import { useNow, useToday } from '@/store/clock';
import { DEFAULT_SETTINGS, useStore } from '@/store';
import { useDay, useDays, useLive, useProfile } from '@/store/selectors';
import { Note, RequireProfile, splitUnit, Tile } from '@/features/trackers/components';
import { dayTitle, resolveDateParam } from '@/features/trackers/dateParam';
import { keepOrConvert, MAX_PRESET_ML, MIN_PRESET_ML, normalizePresets } from '@/features/trackers/helpers';
import { FadeRow, useLeavingRows } from '@/features/food/rowMotion';
import { href } from '@/features/food/helpers';
import { logDrink, removeDrink } from '@/features/food/log';
import { customFoodIndex, resolveFood } from '@/features/food/usuals';
import { ENTERED, type DrinkChoice } from '@/features/drinks/choices';
import { DrinkChoices } from '@/features/drinks/DrinkChoices';
import { DrinkPickSheet } from '@/features/drinks/DrinkPickSheet';
import { loadDrinkMemory, rememberDrinkChoice, useDrinkMemory } from '@/features/drinks/memory';
import { livePartner, noticeLine, pickedFood, planDrink, rememberedChoice, sameDrinkInDiary, selectChoice, selectFood, waterRowCaption } from '@/features/drinks/rules';
import { leftLitreDecimals, shownMl, volumeNumber, volumeUnitFor, waterLeftMl } from '@/features/today/volume';
import { useTheme } from '@/theme';
import type { Beverage, Food, WaterEntry } from '@/types';
import {
  AnimatedList,
  AnimatedNumber,
  BarChart,
  Button,
  Card,
  Chip,
  ChipRow,
  CupKey,
  Divider,
  EmptyState,
  FadeUp,
  haptic,
  Header,
  IconButton,
  MiniCup,
  NumberField,
  PressableScale,
  Screen,
  SectionTitle,
  Sheet,
  Text,
  toast,
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
 * The glass tiles in even rows: as many a row as fit at 72 px or more, spread over as few rows as
 * that needs and balanced, so four glasses on a 320 px phone are two and two rather than three and
 * one stretched across the screen. A short last row is padded (-1) so every tile keeps one width.
 */
function tileRows(count: number, screenW: number): number[][] {
  const content = Math.min(screenW, 560) - 40;
  const fit = Math.max(1, Math.floor((content + 8) / (72 + 8)));
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
  const [celebrate, setCelebrate] = useState(false);
  const [showAllLog, setShowAllLog] = useState(false);
  // "Water only" (the same drink already in the diary): off by default, off again after each log and on any change.
  const [waterOnly, setWaterOnly] = useState(false);
  // The drink sheet, open with its first search ("juice" for Other juice).
  const [pickQuery, setPickQuery] = useState<string | null>(null);
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
  const glassMl = settings.waterPresets.includes(250) ? 250 : (settings.waterPresets[1] ?? settings.waterPresets[0] ?? 250);

  // What the next tap logs for the kind: the choice remembered on this device, else the kind's default (Water: none).
  const customById = customFoodIndex(customFoods);
  const resolve = (f: Food) => resolveFood(f, customById);
  const selected = rememberedChoice(memory, beverage, resolve);
  const picked = pickedFood(selected, memory, beverage, resolve);
  // The same food already in the diary within 3 hours: said before the tap, with "Water only".
  const sameEntry = selected?.food ? sameDrinkInDiary(foodEntries, waterRecords, selected.food.id, date, now.toISOString()) : null;
  const waterOnlyOn = waterOnly && !!sameEntry;
  const customMl = custom && custom > 0 ? volumeToMl(custom, units) : 0;
  // The words before the tap, from the same plan the tap writes (clock from useNow, never read while rendering).
  const shownPlan = (ml: number, amount: 'glass' | 'custom') => planDrink({ kind: beverage, drink: selected, ml, date, now, today: todayDate, units, waterOnly: waterOnlyOn, amount });
  const line = beverage === 'water' ? '' : customMl > 0 && customMl <= 5000 ? shownPlan(customMl, 'custom').line : shownPlan(glassMl, 'glass').line;

  const add = (ml: number, amount: 'glass' | 'custom' = 'glass') => {
    if (!(ml > 0)) return;
    // Crossing the goal is marked by the vessel itself (its onReached adds the success haptic).
    logDrink(planDrink({ kind: beverage, drink: selected, ml, date, now: new Date(), today: today(), units, waterOnly: waterOnlyOn, amount }));
    setWaterOnly(false);
  };

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
  const enterCalories = (amountShown: number, kcal: number) => {
    const ml = volumeToMl(amountShown, units);
    if (ml > 5000) {
      toast(`Add up to ${formatVolume(5000, units)} at a time`);
      return;
    }
    setPickQuery(null);
    logDrink(planDrink({ kind: beverage, drink: { id: ENTERED, food: null }, ml, kcal, date, now: new Date(), today: today(), units, amount: 'custom' }));
    setWaterOnly(false);
  };

  // The level crossed the goal while the screen is open: the vessel settles and flashes its brim,
  // and this adds the haptic and, with Celebrations on, one calm card under the cup.
  const onReached = () => {
    haptic.success();
    if (settings.celebrations) setCelebrate(true);
  };


  const allEntries = [...day.waterEntries].reverse();
  const entries = showAllLog ? allEntries : allEntries.slice(0, 6);
  // A removed drink fades where it is before the rows below glide up into its place.
  const rows = useLeavingRows(entries);
  const extraParts = splitUnit(formatVolume(Math.max(0, shownMl(consumed, units) - shownMl(goal, units)), units));

  const baseMl = baseWaterGoalMl(profile.weightKg, profile.sex);
  const exerciseMl = exerciseWaterMl(day.activities);
  const override = !!(profile.waterGoalMlOverride && profile.waterGoalMlOverride > 0);

  const bars = week.map((d, i) => ({
    label: d.date === todayDate ? 'Today' : weekdayShort(d.date),
    value: volumeValue(d.waterMl, units),
    color: colors.water,
  }));
  const daysMet = week.filter((d) => d.waterMl >= d.waterGoalMl && d.waterGoalMl > 0).length;

  return (
    <Screen header={<Header title="Water" subtitle={isToday ? 'Today' : dayTitle(date)} />} backdrop={colors.water} testID="water-screen">
      <Card padding={18} style={{ gap: spacing.lg }} testID="water-hero">
        <Vessel
          value={consumed}
          max={goal}
          goalKind="reach"
          onReached={onReached}
          memoryKey={`water-${date}`}
          color={colors.water}
          width={narrow ? 76 : 96}
          height={220}
          labelGap={narrow ? 14 : 18}
          // Labels that meet at some level keep 8 px between them, at every value.
          labelSpacing={8}
          accessibilityLabel={`${formatVolume(consumed, units)} of ${formatVolume(goal, units)}`}
          labels={[
            {
              key: 'goal',
              at: goal,
              height: 20,
              content: (
                <Text variant="caption" color="textSecondary" numberOfLines={1}>
                  {`Goal ${formatVolume(goal, units)}`}
                </Text>
              ),
            },
            {
              key: 'percent',
              at: (Math.min(consumed, goal) + goal) / 2,
              height: 72,
              content: (
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
              ),
            },
            {
              key: 'drunk',
              at: Math.min(consumed, goal),
              height: 24,
              tick: consumed > 0 ? colors.rim : undefined,
              content: (
                <AnimatedNumber
                  variant="numM"
                  numberOfLines={1}
                  style={{ fontSize: 17, lineHeight: 22 }}
                  testID="water-consumed"
                  value={consumed}
                  format={(ml) => volumeNumber(ml, consumed, units)}
                  accessibilityLabel={`${formatVolume(consumed, units)} drunk`}>
                  <Text variant="unit">{` ${volumeUnitFor(consumed, units)}`}</Text>
                  <Text variant="body" color="textSecondary" style={{ fontSize: 14 }}>
                    {'  drunk'}
                  </Text>
                </AnimatedNumber>
              ),
            },
          ]}
        />

        {/* The goal is the cup's top label; under the cup only what is left (or the extra), said once. */}
        <View style={{ gap: 2 }}>
          {reached ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Check size={18} color={colors.text} strokeWidth={2.2} />
              <Text testID="water-goal-reached" variant="bodyStrong">
                {isToday ? 'Goal reached for today' : `Goal reached on ${dayName}`}
              </Text>
            </View>
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
              <AnimatedNumber testID="water-left" variant="numL" value={left} format={(ml) => volumeNumber(ml, left, units, leftLitreDecimals(left))} accessibilityLabel={`${formatVolume(left, units)} left to drink`} />
              <Text variant="unit" style={{ fontSize: 15 }}>
                {`${volumeUnitFor(left, units)} left to drink`}
              </Text>
            </View>
          )}
          {reached && extraParts.value === '0' ? null : (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }} testID="water-glasses">
              <CupKey color={colors.water} />
              <Text variant="caption" color="textSecondary" style={{ flexShrink: 1 }}>
                {reached ? `${extraParts.value} ${extraParts.unit} past the goal` : `About ${glassesLeft(left, glassMl)} × ${formatVolume(glassMl, units)} to go`}
              </Text>
            </View>
          )}
        </View>
      </Card>

      {/* A one-off acknowledgement; it leaves if intake drops back under the goal. */}
      {celebrate && reached ? <Celebration isToday={isToday} onDone={() => setCelebrate(false)} /> : null}

      <SectionTitle title="Add a drink" action="Edit sizes" onAction={() => setEditing(true)} />
      <ChipRow>
        {BEVERAGES.map((b) => (
          <Chip
            key={b}
            testID={`water-beverage-${b}`}
            label={BEVERAGE_LABELS[b].label}
            selected={beverage === b}
            onPress={() => chooseKind(b)}
          />
        ))}
      </ChipRow>
      {beverage === 'water' ? null : (
        <DrinkChoices
          kind={beverage}
          selected={selected}
          picked={picked}
          glassMl={glassMl}
          units={units}
          line={line}
          notice={sameEntry && selected?.food ? noticeLine(sameEntry) : null}
          waterOnly={waterOnlyOn}
          onChoose={choose}
          onPicked={choosePicked}
          onOpenPick={(q) => setPickQuery(q)}
          onWaterOnly={setWaterOnly}
        />
      )}
      <View style={{ gap: spacing.sm }}>
        {tileRows(settings.waterPresets.length, screenW).map((row, r) => (
          <View key={r} style={{ flexDirection: 'row', gap: spacing.sm }}>
            {row.map((i) => {
              if (i < 0) return <View key={`pad-${r}-${i}`} style={{ flex: 1 }} />;
              const ml = settings.waterPresets[i];
              const tilePlan = shownPlan(ml, 'glass');
              return (
                <Tile
                  key={`${ml}-${i}`}
                  testID={`water-add-${i}`}
                  accessibilityLabel={tilePlan.label}
                  title={formatVolume(ml, units)}
                  subtitle={tilePlan.tile ?? (i === 0 ? 'Small' : undefined)}
                  icon={<GlassWater size={Math.min(26, 16 + i * 3)} color={colors.water} strokeWidth={1.9} />}
                  onPress={() => add(ml)}
                />
              );
            })}
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-end' }}>
        <NumberField
          testID="water-custom-input"
          style={{ flex: 1 }}
          placeholder="Other amount"
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
          onPress={() => {
            if (!custom) return;
            const ml = volumeToMl(custom, units);
            if (ml > 5000) {
              toast(`Add up to ${formatVolume(5000, units)} at a time`);
              return;
            }
            add(ml, 'custom');
            setCustom(null);
          }}
        />
      </View>
      <Note icon={<Info size={14} color={colors.textSecondary} />}>{factorLine(beverage)}</Note>

      <SectionTitle
        title={isToday ? 'Today’s log' : `Log for ${dayName}`}
        action={allEntries.length > 6 ? (showAllLog ? 'Show less' : `Show all ${allEntries.length}`) : undefined}
        onAction={() => setShowAllLog((v) => !v)}
      />
      <Card padding={rows.length ? spacing.md : spacing.lg}>
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
            // A drink whose calories are in the diary: the row opens that entry (the one place to change its amount).
            const partner = livePartner(e, foodEntries);
            const title = `${formatVolume(e.ml, units)} ${BEVERAGE_LABELS[e.beverage].label.toLowerCase()}`;
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
                  {partner ? (
                    <Text testID={`water-entry-kcal-${i}`} variant="caption" color="textSecondary" numberOfLines={2}>
                      {waterRowCaption(partner, e.date)}
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
                      accessibilityLabel={`${title}, ${waterRowCaption(partner, e.date).replace(' · ', ', ')}. Edit in diary`}
                      onPress={() => router.push(href('/food/detail', { entryId: partner.id, meal: partner.meal, date: partner.date }) as never)}
                      style={{ ...rowStyle, flex: 1, minWidth: 0 }}>
                      {text}
                    </PressableScale>
                  ) : (
                    <View style={{ ...rowStyle, flex: 1, minWidth: 0 }}>{text}</View>
                  )}
                  <IconButton
                    testID={`water-delete-${i}`}
                    accessibilityLabel={`Delete ${formatVolume(e.ml, units)}, ${loggedLabel(e)}`}
                    tone="clear"
                    size={44}
                    onPress={() => removeDrink(e)}>
                    <Trash2 size={18} color={colors.textSecondary} strokeWidth={1.9} />
                  </IconButton>
                </View>
              </FadeRow>
            );
          })}
          </AnimatedList>
        )}
      </Card>

      <SectionTitle title={isToday ? 'Last 7 days' : `7 days to ${dayTitle(date)}`} />
      <Card style={{ gap: spacing.md }}>
        <Text variant="caption" color="textSecondary">
          {week.some((d) => d.waterMl > 0) ? `Goal met on ${daysMet} of 7 days.` : 'Bars fill in as you log drinks.'} Dashed line: the goal.
        </Text>
        <BarChart
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
        onPick={(food) => {
          choosePicked(food);
          setPickQuery(null);
        }}
        onEntered={enterCalories}
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

/**
 * The goal reached, said once under the cup: no spring, no bounce. It fades up
 * with the kit's FadeUp (instant under reduced motion) and is only shown with
 * Celebrations on in Profile. The vessel's brim line and flash carry the moment.
 */
function Celebration({ isToday, onDone }: { isToday: boolean; onDone: () => void }) {
  const { colors, spacing } = useTheme();
  return (
    <FadeUp>
      <Card testID="water-celebration" style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <MiniCup progress={1} goalKind="reach" animate={false} color={colors.water} />
        <View style={{ flex: 1 }}>
          <Text variant="title">Anything more is a bonus</Text>
          <Text variant="caption" color="textSecondary">
            {isToday ? 'The goal is met for today. Drink to thirst from here.' : 'The goal was met for the day.'}
          </Text>
        </View>
        <IconButton testID="water-celebration-dismiss" accessibilityLabel="Dismiss" tone="clear" size={44} onPress={onDone}>
          <Check size={18} color={colors.textSecondary} />
        </IconButton>
      </Card>
    </FadeUp>
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

