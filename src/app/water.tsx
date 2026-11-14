import { router, useLocalSearchParams } from 'expo-router';
import { Check, GlassWater, Info, Trash2 } from 'lucide-react-native';
import React, { useState } from 'react';
import { useWindowDimensions, View } from 'react-native';

import { toISODate, weekdayShort } from '@/lib/dates';
import { nowISO } from '@/lib/id';
import { BEVERAGE_LABELS, baseWaterGoalMl, effectiveMl, exerciseWaterMl, glassesLeft, HYDRATION_FACTOR } from '@/lib/hydration';
import { formatVolume, formatWeight, volumeToMl, volumeUnit, volumeValue } from '@/lib/units';
import { useToday } from '@/store/clock';
import { DEFAULT_SETTINGS, useStore } from '@/store';
import { useDay, useDays, useProfile } from '@/store/selectors';
import { Figure, Note, RequireProfile, splitUnit, Tile } from '@/features/trackers/components';
import { dayTitle, resolveDateParam } from '@/features/trackers/dateParam';
import { keepOrConvert, MAX_PRESET_ML, MIN_PRESET_ML, normalizePresets } from '@/features/trackers/helpers';
import { leftLitreDecimals, shownMl, volumeNumber, volumeUnitFor, waterLeftMl } from '@/features/today/volume';
import { useTheme } from '@/theme';
import type { Beverage, WaterEntry } from '@/types';
import {
  AnimatedItem,
  AnimatedList,
  AnimatedNumber,
  BarChart,
  Button,
  Card,
  Chip,
  ChipRow,
  Divider,
  EmptyState,
  FadeUp,
  haptic,
  Header,
  IconButton,
  MiniCup,
  NumberField,
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

/** One line on drinks that count less, built from the factors so it never drifts from the maths. */
function factorLine(): string {
  const less = BEVERAGES.filter((b) => HYDRATION_FACTOR[b] < 1)
    .map((b) => `${BEVERAGE_LABELS[b].label.toLowerCase()} ${Math.round(HYDRATION_FACTOR[b] * 100)}%`)
    .join(', ');
  return `Some drinks count slightly less toward your goal: ${less}. Water, tea and sports drinks count in full.`;
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

  const consumed = day.waterMl;
  const goal = day.waterGoalMl;
  // Left is the goal as shown minus the amount as shown, so the two printed parts add up to it.
  const left = waterLeftMl(consumed, goal, units);
  const reached = goal > 0 && consumed >= goal;
  const progress = goal > 0 ? consumed / goal : 0;
  const glassMl = settings.waterPresets.includes(250) ? 250 : (settings.waterPresets[1] ?? settings.waterPresets[0] ?? 250);

  const add = (ml: number) => {
    if (!(ml > 0)) return;
    const store = useStore.getState();
    const entry = store.upsert('water', { date, ml: Math.round(ml), beverage, loggedAt: nowISO() });
    // Crossing the goal is marked by the vessel itself (its onReached adds the success haptic).
    haptic.tap();
    const label = beverage === 'water' ? '' : ` of ${BEVERAGE_LABELS[beverage].label.toLowerCase()}`;
    toast(`Added ${formatVolume(ml, units)}${label}`, {
      label: 'Undo',
      tint: 'water',
      onPress: () => useStore.getState().remove('water', entry.id),
    });
  };

  const removeEntry = (e: WaterEntry) => {
    useStore.getState().remove('water', e.id);
    haptic.tap();
    toast(`Removed ${formatVolume(e.ml, units)}`, { label: 'Undo', tint: 'water', onPress: () => useStore.getState().restore('water', e.id) });
  };

  // The level crossed the goal while the screen is open: the vessel settles and flashes its brim,
  // and this adds the haptic and, with Celebrations on, one calm card under the cup.
  const onReached = () => {
    haptic.success();
    if (settings.celebrations) setCelebrate(true);
  };


  const allEntries = [...day.waterEntries].reverse();
  const entries = showAllLog ? allEntries : allEntries.slice(0, 6);
  const goalParts = splitUnit(formatVolume(goal, units));
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

        <View style={{ flexDirection: 'row', alignSelf: 'stretch', borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md }}>
          <Figure value={goalParts.value} unit={goalParts.unit} label="Goal" />
          {reached ? (
            <Figure value={extraParts.value} unit={extraParts.unit} label={isToday ? 'Extra today' : 'Extra'} color="water" />
          ) : (
            <Figure value={String(glassesLeft(left, glassMl))} label={`× ${formatVolume(glassMl, units)} to go`} color="water" />
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
            onPress={() => setBeverage(b)}
          />
        ))}
      </ChipRow>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        {settings.waterPresets.map((ml, i) => (
          <Tile
            key={`${ml}-${i}`}
            testID={`water-add-${i}`}
            accessibilityLabel={`Add ${formatVolume(ml, units)} of ${BEVERAGE_LABELS[beverage].label.toLowerCase()}`}
            title={formatVolume(ml, units)}
            subtitle={i === 0 ? 'Small' : undefined}
            icon={<GlassWater size={Math.min(26, 16 + i * 3)} color={colors.water} strokeWidth={1.9} />}
            onPress={() => add(ml)}
          />
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
          disabled={!(custom && custom > 0)}
          onPress={() => {
            if (!custom) return;
            const ml = volumeToMl(custom, units);
            if (ml > 5000) {
              toast(`Add up to ${formatVolume(5000, units)} at a time`);
              return;
            }
            add(ml);
            setCustom(null);
          }}
        />
      </View>
      <Note icon={<Info size={14} color={colors.textSecondary} />}>{factorLine()}</Note>

      <SectionTitle
        title={isToday ? 'Today’s log' : `Log for ${dayName}`}
        action={allEntries.length > 6 ? (showAllLog ? 'Show less' : `Show all ${allEntries.length}`) : undefined}
        onAction={() => setShowAllLog((v) => !v)}
      />
      <Card padding={entries.length ? spacing.md : spacing.lg}>
        {entries.length === 0 ? (
          <EmptyState
            emoji="💧"
            title={isToday ? 'Nothing logged yet' : `Nothing logged for ${dayName}`}
            message={isToday ? 'Tap a glass size above and each drink shows up here.' : 'Tap a glass size above to add what you drank that day.'}
          />
        ) : (
          <AnimatedList key={date}>
          {entries.map((e, i) => {
            const counts = Math.round(effectiveMl(e.ml, e.beverage));
            return (
              <AnimatedItem key={e.id}>
                {i > 0 ? <Divider inset={36} /> : null}
                <View testID={`water-entry-${i}`} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 56, paddingVertical: 6 }}>
                  <View style={{ width: 24, alignItems: 'center' }}>
                    <Text style={{ fontSize: 17, lineHeight: 24 }}>{BEVERAGE_LABELS[e.beverage].emoji}</Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text variant="bodyStrong" tabular>
                      {formatVolume(e.ml, units)} {BEVERAGE_LABELS[e.beverage].label.toLowerCase()}
                    </Text>
                    <Text variant="caption" color="textSecondary">
                      {loggedLabel(e)}
                      {counts !== e.ml ? ` · counts as ${formatVolume(counts, units)}` : ''}
                    </Text>
                  </View>
                  <IconButton
                    testID={`water-delete-${i}`}
                    accessibilityLabel={`Delete ${formatVolume(e.ml, units)}, ${loggedLabel(e)}`}
                    tone="clear"
                    size={44}
                    onPress={() => removeEntry(e)}>
                    <Trash2 size={18} color={colors.textSecondary} strokeWidth={1.9} />
                  </IconButton>
                </View>
              </AnimatedItem>
            );
          })}
          </AnimatedList>
        )}
      </Card>

      <SectionTitle title={isToday ? 'Last 7 days' : `7 days to ${dayTitle(date)}`} />
      <Card style={{ gap: spacing.md }}>
        <Text variant="caption" color="textSecondary">
          {week.some((d) => d.waterMl > 0) ? `Goal met on ${daysMet} of 7 days.` : 'Bars fill in as you log drinks.'} Dashed line: {isToday ? 'today’s' : 'the day’s'} goal of {formatVolume(goal, units).replace(/ /g, '\u00A0')}.
        </Text>
        <BarChart
          data={bars}
          color={colors.water}
          goal={volumeValue(goal, units)}
          goalKind="reach"
          highlightIndex={bars.length - 1}
          openIndex={isToday ? bars.length - 1 : undefined}
          formatValue={(n) => (units === 'imperial' ? `${Math.round(n)}` : n >= 1000 ? `${(n / 1000).toFixed(1)} L` : `${Math.round(n)}`)}
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

