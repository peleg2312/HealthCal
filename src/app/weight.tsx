import { ChevronDown, ChevronUp, Plus } from 'lucide-react-native';
import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { clockTime } from '@/features/import/ui/format';
import { resolveDateParam } from '@/features/trackers/dateParam';
import { diffDays, formatDayLabel, formatShortDate } from '@/lib/dates';
import { isPlausibleBodyFat, projectedGoalDate } from '@/lib/energy';
import { weightChartLabel } from '@/features/progress/chartWords';
import { trendMonthParts, weeklyRateText } from '@/features/progress/goalDate';
import { formatWeight, weightToKg, weightUnit, weightValue } from '@/lib/units';
import { applyWeighInToTargets, deleteWeightRecord, saveWeightRecord } from '@/features/trackers/actions';
import { DayStepper, Explain, ExplainText, Figure, RequireProfile } from '@/features/trackers/components';
import { findByDate, keepOrConvert, targetsBehind, weightChartData, weightStats, type WeightRange } from '@/features/trackers/helpers';
import { isSyncedWeighIn, weighInFromLine } from '@/features/trackers/weighInSource';
import { useToday } from '@/store/clock';
import { useProfile, useWeightSeries } from '@/store/selectors';
import { useTheme } from '@/theme';
import type { ISODate, UnitSystem, WeightEntry } from '@/types';
import {
  Button,
  Card,
  CupKey,
  Divider,
  EmptyState,
  Header,
  LineChart,
  ListRow,
  NumberField,
  Screen,
  SectionTitle,
  Segmented,
  Sheet,
  Text,
} from '@/ui';

const RANGES: { value: WeightRange; label: string }[] = [
  { value: '1m', label: '1 month' },
  { value: '3m', label: '3 months' },
  { value: 'all', label: 'All' },
];

function signed(kg: number, units: UnitSystem, digits = 1): string {
  const v = weightValue(kg, units);
  const s = Math.abs(v) < 0.05 ? '0' : `${v > 0 ? '+' : '−'}${Math.abs(v).toFixed(digits)}`;
  return s;
}

/** Weights always with one decimal so a column of them lines up. */
function fixedWeight(kg: number, units: UnitSystem): string {
  return `${weightValue(kg, units).toFixed(1)} ${weightUnit(units)}`;
}

function WeightScreen() {
  const { colors, spacing } = useTheme();
  const profile = useProfile();
  const units = profile.units;
  const series = useWeightSeries();
  const [range, setRange] = useState<WeightRange>('3m');
  const end = useToday();
  // Opened for a past day (?date=): the weigh-in sheet starts on that day.
  const params = useLocalSearchParams<{ date?: string; log?: string }>();
  const [sheetDate, setSheetDate] = useState<ISODate | null>(() => {
    const asked = resolveDateParam(params.date, end);
    return params.date && asked !== end ? asked : null;
  });
  // ?log=1 (the morning page's "Weigh in"): open the weigh-in sheet for today once, so one tap logs it.
  const logOpened = useRef(false);
  useEffect(() => {
    if (params.log !== '1' || logOpened.current) return;
    logOpened.current = true;
    setSheetDate(end);
  }, [params.log, end]);
  const [showAll, setShowAll] = useState(false);
  const unit = weightUnit(units);

  const empty = series.entries.length === 0;
  const stats = empty ? null : weightStats(series.trend, series.startKg ?? 0, series.weeklyRateKg, profile.targetWeightKg);
  const chart = weightChartData(series.trend, range, end, (kg) => weightValue(kg, units));
  const target = profile.targetWeightKg;
  // The trend's date, from today's date (never the clock in a render), said as a month: the plan's date is in Goals.
  const projected = stats && target && stats.weeklyKg !== null ? projectedGoalDate(stats.trendKg, target, stats.weeklyKg, new Date(`${end}T12:00:00`)) : null;
  const projectedParts = projected ? trendMonthParts(projected) : null;
  const latest = series.latest;

  // The newest weigh-in came from a health store and the targets do not use it yet: one tap applies it (a sync never does).
  const behind = targetsBehind(profile, series.entries);

  const history = [...series.entries].reverse();
  const shown = showAll ? history : history.slice(0, 14);

  const footer = <Button testID="weight-log" title="Log weigh-in" icon={<Plus size={20} color={colors.onPrimary} />} onPress={() => setSheetDate(end)} />;

  return (
    <Screen header={<Header title="Weight" subtitle={target ? `Goal ${formatWeight(target, units)}` : 'Trend and weigh-ins'} />} footer={footer} backdrop={colors.weight} testID="weight-screen">
      {empty || !stats ? (
        <Card>
          <EmptyState
            emoji="⚖️"
            title="Start your weight trend"
            message="Weigh in each morning before breakfast. Daily jumps are mostly water, so a smoothed trend shows where you are heading."
          />
        </Card>
      ) : (
        <>
          <Card style={{ gap: spacing.md }}>
            {/* The scale reading sits beside the trend, and goes under it, still at the right, when a three-digit weight leaves no room. */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', columnGap: spacing.md, rowGap: spacing.xs }}>
              <View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <CupKey color={colors.weight} />
                  <Text variant="overline">Trend weight</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
                  <Text testID="weight-trend" variant="numXL" tabular>
                    {weightValue(stats.trendKg, units).toFixed(1)}
                  </Text>
                  <Text variant="unit" style={{ fontSize: 15 }}>
                    {unit}
                  </Text>
                </View>
              </View>
              {latest ? (
                <View style={{ alignItems: 'flex-end', marginLeft: 'auto' }}>
                  <Text variant="caption" color="textSecondary">
                    Scale, {latest.date === end ? 'today' : formatShortDate(latest.date)}
                  </Text>
                  <Text variant="numM" tabular>
                    {fixedWeight(latest.kg, units)}
                  </Text>
                </View>
              ) : null}
            </View>
            <Segmented testID="weight-range" options={RANGES} value={range} onChange={setRange} />
            <View accessible accessibilityRole="image" accessibilityLabel={weightChartLabel(series.trend, range, end, units, target)}>
            <LineChart
              line={chart.line}
              dots={chart.dots}
              color={colors.weight}
              goal={target ? weightValue(target, units) : undefined}
              height={200}
              xLabels={chart.labels}
              formatY={(n) => (Number.isInteger(n) ? String(n) : n.toFixed(1))}
            />
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg }}>
              <Legend swatch={<View style={{ width: 16, height: 2, borderRadius: 1, backgroundColor: colors.weight }} />} label="Trend" />
              <Legend swatch={<CupKey color={colors.textTertiary} size={7} />} label="Weigh-ins" />
              {target ? (
                <Legend swatch={<View style={{ width: 16, borderTopWidth: 2, borderStyle: 'dashed', borderColor: colors.borderStrong }} />} label="Goal" />
              ) : null}
            </View>
            <Explain label="Why the trend differs from the scale" testID="weight-trend-help" style={{ marginTop: -spacing.xs, marginBottom: -spacing.sm }}>
              <ExplainText>
                A day’s weight can swing by {units === 'imperial' ? 'two pounds' : 'a kilo'} or more with water, salt, carbs and digestion. The trend averages recent weigh-ins (most
                weight on the last few weeks), so a single high or low reading barely moves it. Watch the trend, not the daily number.
              </ExplainText>
            </Explain>
          </Card>

          {behind ? (
            <Card testID="weight-targets-behind" style={{ gap: spacing.md }}>
              <Text variant="body" color="textSecondary" testID="weight-targets-behind-text">
                {targetsBehindText(behind, profile, units)}
              </Text>
              <Button
                testID="weight-use-latest"
                title="Use it for targets"
                variant="secondary"
                size="sm"
                full={false}
                style={{ alignSelf: 'flex-start' }}
                onPress={() => applyWeighInToTargets(behind.latest)}
              />
            </Card>
          ) : null}

          <Card style={{ gap: spacing.lg }}>
            <View style={{ flexDirection: 'row', gap: spacing.md }}>
              <Figure
                testID="weight-rate"
                value={stats.weeklyKg === null ? '–' : weeklyRateText(stats.weeklyKg, units).replace(` ${unit} a week`, '')}
                unit={stats.weeklyKg === null ? undefined : `${unit} a week`}
                label={
                  stats.weeklyKg !== null
                    ? 'Trend, last 3 weeks'
                    : latest && diffDays(latest.date, end) > 10
                      ? 'A week (weigh in to update)'
                      : 'A week (needs more weigh-ins)'
                }
              />
              <Figure value={signed(stats.totalChangeKg, units)} unit={unit} label={`Since ${formatShortDate(series.entries[0].date)}`} />
            </View>
            <Divider />
            <View style={{ flexDirection: 'row', gap: spacing.md }}>
              <Figure
                value={stats.toTargetKg === null ? '–' : Math.abs(weightValue(stats.toTargetKg, units)) < 0.05 ? '0' : Math.abs(weightValue(stats.toTargetKg, units)).toFixed(1)}
                unit={stats.toTargetKg === null ? undefined : unit}
                label={stats.toTargetKg === null ? 'No goal set' : stats.toTargetKg < 0 ? 'Above goal' : stats.toTargetKg > 0 ? 'Below goal' : 'At goal'}
              />
              <Figure
                testID="weight-projected"
                value={projectedParts ? projectedParts.month : '–'}
                unit={projectedParts ? projectedParts.year : undefined}
                label={projected && target ? 'Goal, at your current trend' : target ? 'Not toward your goal at this trend' : 'Set a goal weight to see a date'}
              />
            </View>
          </Card>

          <SectionTitle title="History" />
          <Card padding={spacing.md}>
            {shown.map((e, i) => {
              const prev = history[history.indexOf(e) + 1];
              // From the rounded weights on screen, so the difference matches what the two rows show.
              const shown = (kg: number) => Math.round(weightValue(kg, units) * 10) / 10;
              const delta = prev ? shown(e.kg) - shown(prev.kg) : null;
              return (
                <React.Fragment key={e.id}>
                  {i > 0 ? <Divider /> : null}
                  <ListRow
                    testID={`weight-row-${i}`}
                    title={formatDayLabel(e.date)}
                    subtitle={[
                      delta !== null ? `${Math.abs(delta) < 0.05 ? '0' : `${delta > 0 ? '+' : '−'}${Math.abs(delta).toFixed(1)}`} ${unit} vs previous` : null,
                      isPlausibleBodyFat(e.bodyFatPct) ? `${e.bodyFatPct}% body fat` : null,
                      weighInFromLine(e)?.replace(/^From /, 'from ') ?? null,
                    ]
                      .filter(Boolean)
                      // The change first and where it came from last: at 320 px a long line is shortened at the source, never the change.
                      // Each part stays whole ("20.8% body fat"), so a long line breaks only between them.
                      .map((part) => (part as string).replace(/ /g, '\u00A0'))
                      .join(' · ') || undefined}
                    value={fixedWeight(e.kg, units)}
                    onPress={() => setSheetDate(e.date)}
                  />
                </React.Fragment>
              );
            })}
          </Card>
          {/* More than 14 weigh-ins: the rest open under the list, where it ends (the testID is the one SectionTitle gave it). */}
          {history.length > 14 ? (
            <Button
              testID="section-history-action"
              title={showAll ? 'Show less' : `Show all ${history.length}`}
              accessibilityLabel={showAll ? 'Show fewer weigh-ins' : `Show all ${history.length} weigh-ins`}
              variant="ghost"
              size="sm"
              full={false}
              icon={showAll ? <ChevronUp size={16} color={colors.primaryInk} strokeWidth={2.2} /> : <ChevronDown size={16} color={colors.primaryInk} strokeWidth={2.2} />}
              onPress={() => setShowAll((v) => !v)}
              style={{ alignSelf: 'center', marginTop: -spacing.xs }}
            />
          ) : null}
        </>
      )}

      <WeighInSheet date={sheetDate} onDate={setSheetDate} onClose={() => setSheetDate(null)} entries={series.entries} units={units} fallbackKg={latest?.kg ?? profile.weightKg} />
    </Screen>
  );
}

/**
 * "Your targets use 84.0 kg. Your latest weigh-in, from Garmin Connect on Nov 18, is 82.4 kg."
 * With body fat: "… is 82.4 kg with 18.2% body fat."
 */
function targetsBehindText(
  behind: NonNullable<ReturnType<typeof targetsBehind>>,
  profile: { weightKg: number; bodyFatPct?: number | null },
  units: UnitSystem,
): string {
  const from = weighInFromLine(behind.latest)?.replace(/^From /, 'from ') ?? 'from your health app';
  // One decimal on both sides; a profile without body fat leaves the clause out.
  const fat = behind.bodyFatPct !== undefined ? ` with ${behind.bodyFatPct.toFixed(1)}% body fat` : '';
  const ownFat = behind.bodyFatPct !== undefined && typeof profile.bodyFatPct === 'number' ? ` and ${profile.bodyFatPct.toFixed(1)}% body fat` : '';
  return `Your targets use ${fixedWeight(profile.weightKg, units)}${ownFat}. Your latest weigh-in, ${from} on ${formatShortDate(behind.latest.date)}, is ${fixedWeight(behind.kg, units)}${fat}.`;
}

function Legend({ swatch, label }: { swatch: React.ReactNode; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      {swatch}
      <Text variant="caption" color="textSecondary">
        {label}
      </Text>
    </View>
  );
}

function WeighInSheet({
  date,
  onDate,
  onClose,
  entries,
  units,
  fallbackKg,
}: {
  date: ISODate | null;
  onDate: (d: ISODate) => void;
  onClose: () => void;
  entries: WeightEntry[];
  units: UnitSystem;
  fallbackKg: number;
}) {
  const existing = date ? findByDate(entries, date) : undefined;
  const display = (kg: number) => Math.round(weightValue(kg, units) * 10) / 10;
  const [weight, setWeight] = useState<number | null>(null);
  const [fat, setFat] = useState<number | null>(null);
  // Each error shows under the field it is about.
  const [error, setError] = useState<{ field: 'weight' | 'fat'; message: string } | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  // Load the record for the chosen date whenever the date (or its record) changes.
  const key = date ? `${date}:${existing?.id ?? 'new'}` : null;
  if (key !== loadedFor) {
    setLoadedFor(key);
    setWeight(existing ? display(existing.kg) : date ? display(fallbackKg) : null);
    setFat(existing?.bodyFatPct ?? null);
    setError(null);
  }
  const unit = weightUnit(units);

  const save = () => {
    if (!date) return;
    if (weight === null || weight <= 0) return setError({ field: 'weight', message: 'Enter your weight' });
    // An untouched prefilled field keeps the stored kg instead of a value rounded through lb.
    const kg = keepOrConvert(weight, existing ? existing.kg : fallbackKg, display, (v) => weightToKg(v, units)) ?? 0;
    if (kg < 20 || kg > 400) return setError({ field: 'weight', message: `That looks off. Enter a weight between ${formatWeight(20, units, 0)} and ${formatWeight(400, units, 0)}.` });
    if (fat !== null && !isPlausibleBodyFat(fat)) return setError({ field: 'fat', message: 'Body fat should be between 3 and 60%' });
    saveWeightRecord(date, { kg: Math.round(kg * 100) / 100, ...(fat !== null ? { bodyFatPct: fat } : existing?.bodyFatPct !== undefined ? { bodyFatPct: undefined } : {}) });
    onClose();
  };

  return (
    <Sheet
      visible={date !== null}
      onClose={onClose}
      title={existing ? 'Edit weigh-in' : 'Log weigh-in'}
      footer={
        <View style={{ gap: 8 }}>
          <Button testID="weight-save" title={existing ? 'Update weigh-in' : 'Save weigh-in'} onPress={save} />
          {existing ? (
            <Button
              testID="weight-delete"
              title="Delete this weigh-in"
              variant="ghost"
              onPress={() => {
                deleteWeightRecord(existing);
                onClose();
              }}
            />
          ) : null}
        </View>
      }>
      {date ? <DayStepper date={date} onChange={onDate} testID="weight-date" /> : null}
      {existing && isSyncedWeighIn(existing) ? (
        <Text variant="caption" color="textSecondary" testID="weight-synced-note">
          {weighInFromLine(existing)}
          {existing.measuredAt && Number.isFinite(Date.parse(existing.measuredAt)) ? ` at ${clockTime({ startUtc: existing.measuredAt }, units === 'imperial')}` : ''}. Changing the weight or
          body fat makes it yours, and sync leaves it alone after that.
        </Text>
      ) : null}
      <NumberField
        testID="weight-input"
        label="Weight"
        suffix={unit}
        value={weight}
        onChange={(n) => {
          setWeight(n);
          setError(null);
        }}
        error={error?.field === 'weight' ? error.message : null}
        autoFocus
        selectTextOnFocus
      />
      <NumberField
        testID="weight-bodyfat-input"
        label="Body fat (optional)"
        suffix="%"
        placeholder="From a smart scale or tape estimate"
        value={fat}
        onChange={(n) => {
          setFat(n);
          setError(null);
        }}
        error={error?.field === 'fat' ? error.message : null}
        hint={existing ? 'One weigh-in per day. Saving replaces this day’s entry.' : 'One weigh-in per day. A second one for the same day updates it.'}
      />
    </Sheet>
  );
}

export default function WeightRoute() {
  return (
    <RequireProfile>
      <WeightScreen />
    </RequireProfile>
  );
}

