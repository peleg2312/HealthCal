import { router } from 'expo-router';
import { Check, GlassWater, Info, Trash2 } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { Animated, View } from 'react-native';

import { today, weekdayShort } from '@/lib/dates';
import { nowISO } from '@/lib/id';
import { BEVERAGE_LABELS, baseWaterGoalMl, effectiveMl, exerciseWaterMl, glassesLeft, HYDRATION_FACTOR } from '@/lib/hydration';
import { formatVolume, formatWeight, volumeToMl, volumeUnit, volumeValue } from '@/lib/units';
import { DEFAULT_SETTINGS, useStore } from '@/store';
import { useDay, useDays, useProfile } from '@/store/selectors';
import { Figure, Note, RequireProfile, splitUnit, Tile, WaterWave } from '@/features/trackers/components';
import { crossedGoal, MAX_PRESET_ML, MIN_PRESET_ML, normalizePresets } from '@/features/trackers/helpers';
import { useTheme } from '@/theme';
import type { Beverage, WaterEntry } from '@/types';
import {
  Avatar,
  BarChart,
  Button,
  Card,
  Chip,
  ChipRow,
  Divider,
  EmptyState,
  haptic,
  Header,
  IconButton,
  NumberField,
  Screen,
  SectionTitle,
  Sheet,
  Text,
  toast,
} from '@/ui';

const BEVERAGES = Object.keys(BEVERAGE_LABELS) as Beverage[];

function clockTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** One line on drinks that count less, built from the factors so it never drifts from the maths. */
function factorLine(): string {
  const less = BEVERAGES.filter((b) => HYDRATION_FACTOR[b] < 1)
    .map((b) => `${BEVERAGE_LABELS[b].label.toLowerCase()} ${Math.round(HYDRATION_FACTOR[b] * 100)}%`)
    .join(', ');
  return `Some drinks count slightly less toward your goal: ${less}. Water, tea and sports drinks count in full.`;
}

function WaterScreen() {
  const { colors, spacing, radius } = useTheme();
  const profile = useProfile();
  const settings = useStore((s) => s.settings);
  const units = profile.units;
  const date = today();
  const day = useDay(date);
  const week = useDays(7, date);
  const [beverage, setBeverage] = useState<Beverage>('water');
  const [custom, setCustom] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  const [showAllLog, setShowAllLog] = useState(false);

  const consumed = day.waterMl;
  const goal = day.waterGoalMl;
  const left = day.waterRemainingMl;
  const reached = goal > 0 && consumed >= goal;
  const progress = goal > 0 ? consumed / goal : 0;
  const glassMl = settings.waterPresets.includes(250) ? 250 : (settings.waterPresets[1] ?? settings.waterPresets[0] ?? 250);

  const add = (ml: number) => {
    if (!(ml > 0)) return;
    const store = useStore.getState();
    const before = consumed;
    const entry = store.upsert('water', { date, ml: Math.round(ml), beverage, loggedAt: nowISO() });
    const after = before + effectiveMl(ml, beverage);
    if (crossedGoal(before, after, goal) && settings.celebrations) {
      haptic.success();
      setCelebrate(true);
    } else {
      haptic.tap();
    }
    const label = beverage === 'water' ? '' : ` of ${BEVERAGE_LABELS[beverage].label.toLowerCase()}`;
    toast(`Added ${formatVolume(ml, units)}${label}`, {
      label: 'Undo',
      onPress: () => useStore.getState().remove('water', entry.id),
    });
  };

  const removeEntry = (e: WaterEntry) => {
    useStore.getState().remove('water', e.id);
    haptic.tap();
    toast(`Removed ${formatVolume(e.ml, units)}`, { label: 'Undo', onPress: () => useStore.getState().restore('water', e.id) });
  };


  const allEntries = [...day.waterEntries].reverse();
  const entries = showAllLog ? allEntries : allEntries.slice(0, 6);
  const consumedParts = splitUnit(formatVolume(consumed, units));
  const goalParts = splitUnit(formatVolume(goal, units));
  const leftParts = splitUnit(formatVolume(left, units));

  const baseMl = baseWaterGoalMl(profile.weightKg, profile.sex);
  const exerciseMl = exerciseWaterMl(day.activities);
  const override = !!(profile.waterGoalMlOverride && profile.waterGoalMlOverride > 0);

  const bars = week.map((d, i) => ({
    label: i === week.length - 1 ? 'Today' : weekdayShort(d.date),
    value: volumeValue(d.waterMl, units),
    color: d.waterMl >= d.waterGoalMl ? colors.water : `${colors.water}99`,
  }));
  const daysMet = week.filter((d) => d.waterMl >= d.waterGoalMl && d.waterGoalMl > 0).length;

  return (
    <Screen header={<Header title="Water" subtitle="Today" />} testID="water-screen">
      <Card padding={spacing.xl} style={{ alignItems: 'center', gap: spacing.lg }}>
        <WaterWave progress={progress} size={224}>
          <View style={{ alignItems: 'center', backgroundColor: `${colors.surface}CC`, borderRadius: radius.lg, paddingHorizontal: 16, paddingVertical: 6 }}>
            <Text testID="water-percent" variant="numXL" tabular>
              {Math.round(progress * 100)}%
            </Text>
            <Text variant="caption" color="textSecondary">
              of today’s goal
            </Text>
          </View>
        </WaterWave>

        {reached ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Check size={18} color={colors.success} />
            <Text testID="water-goal-reached" variant="bodyStrong" color="success">
              Goal reached for today
            </Text>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
            <Text testID="water-left" variant="numL" tabular color="water">
              {leftParts.value}
            </Text>
            <Text variant="title" color="textSecondary">
              {leftParts.unit} left to drink
            </Text>
          </View>
        )}

        <View style={{ flexDirection: 'row', alignSelf: 'stretch', borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.lg }}>
          <Figure testID="water-consumed" align="center" value={consumedParts.value} unit={consumedParts.unit} label="Drunk" />
          <Figure align="center" value={goalParts.value} unit={goalParts.unit} label="Goal" />
          {reached ? (
            <Figure align="center" value={splitUnit(formatVolume(consumed - goal, units)).value} unit={splitUnit(formatVolume(consumed - goal, units)).unit} label="Extra today" color="water" />
          ) : (
            <Figure align="center" value={String(glassesLeft(left, glassMl))} label={`× ${formatVolume(glassMl, units)} to go`} color="water" />
          )}
        </View>
      </Card>

      {/* A one-off acknowledgement; it leaves if intake drops back under the goal. */}
      {celebrate && reached ? <Celebration onDone={() => setCelebrate(false)} /> : null}

      <SectionTitle title="Add a drink" action="Edit sizes" onAction={() => setEditing(true)} />
      <ChipRow>
        {BEVERAGES.map((b) => (
          <Chip
            key={b}
            testID={`water-beverage-${b}`}
            label={`${BEVERAGE_LABELS[b].emoji} ${BEVERAGE_LABELS[b].label}`}
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
            icon={<GlassWater size={Math.min(28, 16 + i * 3)} color={colors.water} />}
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
      <Note icon={<Info size={14} color={colors.textTertiary} />}>{factorLine()}</Note>

      <SectionTitle
        title="Today’s log"
        action={allEntries.length > 6 ? (showAllLog ? 'Show less' : `Show all ${allEntries.length}`) : undefined}
        onAction={() => setShowAllLog((v) => !v)}
      />
      <Card padding={entries.length ? spacing.md : spacing.lg}>
        {entries.length === 0 ? (
          <EmptyState emoji="💧" title="Nothing logged yet" message="Tap a glass size above and each drink shows up here." />
        ) : (
          entries.map((e, i) => {
            const counts = Math.round(effectiveMl(e.ml, e.beverage));
            return (
              <React.Fragment key={e.id}>
                {i > 0 ? <Divider inset={56} /> : null}
                <View testID={`water-entry-${i}`} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 56, paddingVertical: 6 }}>
                  <Avatar emoji={BEVERAGE_LABELS[e.beverage].emoji} color={colors.water} size={40} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text variant="bodyStrong" tabular>
                      {formatVolume(e.ml, units)} {BEVERAGE_LABELS[e.beverage].label.toLowerCase()}
                    </Text>
                    <Text variant="caption" color="textSecondary">
                      {clockTime(e.loggedAt)}
                      {counts !== e.ml ? ` · counts as ${formatVolume(counts, units)}` : ''}
                    </Text>
                  </View>
                  <IconButton
                    testID={`water-delete-${i}`}
                    accessibilityLabel={`Delete ${formatVolume(e.ml, units)} at ${clockTime(e.loggedAt)}`}
                    tone="clear"
                    size={44}
                    onPress={() => removeEntry(e)}>
                    <Trash2 size={18} color={colors.textTertiary} />
                  </IconButton>
                </View>
              </React.Fragment>
            );
          })
        )}
      </Card>

      <SectionTitle title="Last 7 days" />
      <Card style={{ gap: spacing.md }}>
        <Text variant="caption" color="textSecondary">
          {week.some((d) => d.waterMl > 0) ? `Goal met on ${daysMet} of 7 days.` : 'Bars fill in as you log drinks.'} Dashed line: today’s goal of {formatVolume(goal, units)}.
        </Text>
        <BarChart
          data={bars}
          color={colors.water}
          goal={volumeValue(goal, units)}
          highlightIndex={bars.length - 1}
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
              hint={`About 33 ml per kg at ${formatWeight(profile.weightKg, units)}, kept within the usual range for ${profile.sex === 'male' ? 'men' : 'women'}`}
              value={formatVolume(baseMl, units)}
            />
            <GoalLine
              label="Extra for today’s exercise"
              hint={day.activities.length ? `${day.activeMinutes} min logged today, to replace some of the sweat` : 'Log a workout and this goes up for the day'}
              value={`+${formatVolume(exerciseMl, units)}`}
            />
            <Divider />
            <GoalLine label="Today’s goal" value={formatVolume(goal, units)} strong />
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
      <Text variant={strong ? 'numM' : 'title'} tabular color={strong ? 'water' : 'text'}>
        {value}
      </Text>
    </View>
  );
}

function Celebration({ onDone }: { onDone: () => void }) {
  const { colors, spacing } = useTheme();
  const [anim] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.spring(anim, { toValue: 1, speed: 12, bounciness: 8, useNativeDriver: false }).start();
  }, [anim]);
  return (
    <Animated.View style={{ opacity: anim, transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) }] }}>
      <Card
        testID="water-celebration"
        gradient={[`${colors.water}33`, `${colors.success}22`]}
        style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <Text style={{ fontSize: 30, lineHeight: 38 }}>🌊</Text>
        <View style={{ flex: 1 }}>
          <Text variant="title">That’s your water goal for today</Text>
          <Text variant="caption" color="textSecondary">
            Nicely done. Anything more is a bonus, not a requirement.
          </Text>
        </View>
        <IconButton accessibilityLabel="Dismiss" tone="clear" size={44} onPress={onDone}>
          <Check size={18} color={colors.textSecondary} />
        </IconButton>
      </Card>
    </Animated.View>
  );
}

function PresetSheet({ visible, onClose, presets, units }: { visible: boolean; onClose: () => void; presets: number[]; units: 'metric' | 'imperial' }) {
  const toDisplay = (ml: number) => Math.round(volumeValue(ml, units));
  const [values, setValues] = useState<(number | null)[]>(() => presets.map(toDisplay));
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) setValues(presets.map(toDisplay));
  }
  const unit = volumeUnit(units);
  const save = () => {
    const ml = normalizePresets(values.map((v) => (v === null ? null : volumeToMl(v, units))));
    if (ml.length === 0) {
      toast('Keep at least one size');
      return;
    }
    useStore.getState().setSettings({ waterPresets: ml });
    toast('Glass sizes saved');
    onClose();
  };
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Glass sizes"
      footer={<Button testID="water-presets-save" title="Save sizes" onPress={save} />}>
      <Text variant="body" color="textSecondary">
        These are the one-tap buttons. Leave a field empty to remove it. Between {formatVolume(MIN_PRESET_ML, units)} and {formatVolume(MAX_PRESET_ML, units)}.
      </Text>
      {values.map((v, i) => (
        <NumberField
          key={i}
          testID={`water-preset-${i}`}
          label={`Size ${i + 1}`}
          suffix={unit}
          decimals={0}
          value={v}
          onChange={(n) => setValues((cur) => cur.map((x, j) => (j === i ? n : x)))}
        />
      ))}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {values.length < 6 ? (
          <Button title="Add a size" variant="secondary" size="md" style={{ flex: 1 }} onPress={() => setValues((cur) => [...cur, null])} />
        ) : null}
        <Button
          title="Reset"
          variant="ghost"
          size="md"
          style={{ flex: 1 }}
          onPress={() => setValues(DEFAULT_SETTINGS.waterPresets.map(toDisplay))}
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

