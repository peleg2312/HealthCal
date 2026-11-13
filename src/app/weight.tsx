import { Info, Plus } from 'lucide-react-native';
import React, { useState } from 'react';
import { View } from 'react-native';

import { diffDays, formatDayLabel, formatShortDate } from '@/lib/dates';
import { isPlausibleBodyFat, projectedGoalDate } from '@/lib/energy';
import { formatWeight, weightToKg, weightUnit, weightValue } from '@/lib/units';
import { deleteWeightRecord, saveWeightRecord } from '@/features/trackers/actions';
import { DayStepper, Figure, Note, RequireProfile } from '@/features/trackers/components';
import { findByDate, keepOrConvert, weightChartData, weightStats, type WeightRange } from '@/features/trackers/helpers';
import { useToday } from '@/store/clock';
import { useProfile, useWeightSeries } from '@/store/selectors';
import { useTheme } from '@/theme';
import type { ISODate, UnitSystem, WeightEntry } from '@/types';
import {
  Button,
  Card,
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

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function WeightScreen() {
  const { colors, spacing } = useTheme();
  const profile = useProfile();
  const units = profile.units;
  const series = useWeightSeries();
  const [range, setRange] = useState<WeightRange>('3m');
  const [sheetDate, setSheetDate] = useState<ISODate | null>(null);
  const [showAll, setShowAll] = useState(false);
  const end = useToday();
  const unit = weightUnit(units);

  const empty = series.entries.length === 0;
  const stats = empty ? null : weightStats(series.trend, series.startKg ?? 0, series.weeklyRateKg, profile.targetWeightKg);
  const chart = weightChartData(series.trend, range, end, (kg) => weightValue(kg, units));
  const target = profile.targetWeightKg;
  const projected = stats && target && stats.weeklyKg !== null ? projectedGoalDate(stats.trendKg, target, stats.weeklyKg) : null;
  const latest = series.latest;

  const history = [...series.entries].reverse();
  const shown = showAll ? history : history.slice(0, 14);

  const footer = <Button testID="weight-log" title="Log weigh-in" icon={<Plus size={20} color={colors.onPrimary} />} onPress={() => setSheetDate(end)} />;

  return (
    <Screen header={<Header title="Weight" subtitle={target ? `Target ${formatWeight(target, units)}` : undefined} />} footer={footer} backdrop={colors.weight} testID="weight-screen">
      {empty || !stats ? (
        <Card>
          <EmptyState
            emoji="⚖️"
            title="Start your weight trend"
            message="Weigh yourself in the morning, after the bathroom and before breakfast. Day-to-day jumps are mostly water, so the app draws a smoothed trend that shows where your weight is really heading."
          />
        </Card>
      ) : (
        <>
          <Card style={{ gap: spacing.md }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: spacing.md }}>
              <View>
                <Text variant="overline" color="textSecondary">
                  TREND WEIGHT
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
                  <Text testID="weight-trend" variant="numXL" tabular color="weight">
                    {weightValue(stats.trendKg, units).toFixed(1)}
                  </Text>
                  <Text variant="title" color="textSecondary">
                    {unit}
                  </Text>
                </View>
              </View>
              {latest ? (
                <View style={{ alignItems: 'flex-end' }}>
                  <Text variant="caption" color="textSecondary">
                    Scale, {latest.date === end ? 'today' : formatShortDate(latest.date)}
                  </Text>
                  <Text variant="title" tabular>
                    {fixedWeight(latest.kg, units)}
                  </Text>
                </View>
              ) : null}
            </View>
            <Segmented options={RANGES} value={range} onChange={setRange} />
            <LineChart
              line={chart.line}
              dots={chart.dots}
              color={colors.weight}
              goal={target ? weightValue(target, units) : undefined}
              height={200}
              xLabels={chart.labels}
              formatY={(n) => n.toFixed(units === 'imperial' ? 0 : 1)}
            />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg }}>
              <Legend swatch={<View style={{ width: 16, height: 3, borderRadius: 2, backgroundColor: colors.weight }} />} label="Trend" />
              <Legend swatch={<View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.textTertiary }} />} label="Weigh-ins" />
              {target ? (
                <Legend swatch={<View style={{ width: 16, borderTopWidth: 2, borderStyle: 'dashed', borderColor: colors.success }} />} label="Target" />
              ) : null}
            </View>
          </Card>

          <Card style={{ gap: spacing.lg }}>
            <View style={{ flexDirection: 'row', gap: spacing.md }}>
              <Figure
                testID="weight-rate"
                value={stats.weeklyKg === null ? '–' : signed(stats.weeklyKg, units, units === 'imperial' ? 1 : 2)}
                unit={stats.weeklyKg === null ? undefined : `${unit}/week`}
                label={
                  stats.weeklyKg !== null
                    ? 'Per week, last 3 weeks'
                    : latest && diffDays(latest.date, end) > 10
                      ? 'Per week (weigh in to update)'
                      : 'Per week (needs more weigh-ins)'
                }
              />
              <Figure value={signed(stats.totalChangeKg, units)} unit={unit} label={`Since ${formatShortDate(series.entries[0].date)}`} />
            </View>
            <Divider />
            <View style={{ flexDirection: 'row', gap: spacing.md }}>
              <Figure
                value={stats.toTargetKg === null ? '–' : Math.abs(weightValue(stats.toTargetKg, units)) < 0.05 ? '0' : Math.abs(weightValue(stats.toTargetKg, units)).toFixed(1)}
                unit={stats.toTargetKg === null ? undefined : unit}
                label={stats.toTargetKg === null ? 'No target set' : stats.toTargetKg < 0 ? 'Above target' : stats.toTargetKg > 0 ? 'Below target' : 'At target'}
              />
              <Figure
                testID="weight-projected"
                value={projected ? `${MONTHS[projected.getMonth()]} ${projected.getDate()}` : '–'}
                unit={projected && String(projected.getFullYear()) !== end.slice(0, 4) ? String(projected.getFullYear()) : undefined}
                label={projected ? 'Projected at this rate' : target ? 'No projection at this rate' : 'Set a target to project'}
              />
            </View>
          </Card>

          <Card tone="alt" style={{ gap: spacing.sm }}>
            <Note icon={<Info size={14} color={colors.textTertiary} />}>
              Why the trend differs from the scale: a day’s weight can swing by a kilo or more with water, salt, carbs and digestion. The trend averages
              recent weigh-ins (most weight on the last few weeks), so a single high or low reading barely moves it. Watch the trend, not the daily number.
            </Note>
          </Card>

          <SectionTitle title="History" action={history.length > 14 ? (showAll ? 'Show less' : `Show all ${history.length}`) : undefined} onAction={() => setShowAll((v) => !v)} />
          <Card padding={spacing.md}>
            {shown.map((e, i) => {
              const prev = history[history.indexOf(e) + 1];
              const delta = prev ? e.kg - prev.kg : null;
              return (
                <React.Fragment key={e.id}>
                  {i > 0 ? <Divider /> : null}
                  <ListRow
                    testID={`weight-row-${i}`}
                    title={formatDayLabel(e.date)}
                    subtitle={[isPlausibleBodyFat(e.bodyFatPct) ? `${e.bodyFatPct}% body fat` : null, delta !== null ? `${signed(delta, units)} ${unit} vs previous` : null].filter(Boolean).join(' · ') || undefined}
                    value={fixedWeight(e.kg, units)}
                    onPress={() => setSheetDate(e.date)}
                  />
                </React.Fragment>
              );
            })}
          </Card>
        </>
      )}

      <WeighInSheet date={sheetDate} onDate={setSheetDate} onClose={() => setSheetDate(null)} entries={series.entries} units={units} fallbackKg={latest?.kg ?? profile.weightKg} />
    </Screen>
  );
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
  const [error, setError] = useState<string | null>(null);
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
    if (weight === null || weight <= 0) return setError('Enter your weight');
    // An untouched prefilled field keeps the stored kg instead of a value rounded through lb.
    const kg = keepOrConvert(weight, existing ? existing.kg : fallbackKg, display, (v) => weightToKg(v, units)) ?? 0;
    if (kg < 20 || kg > 400) return setError(`That looks off. Enter a weight between ${formatWeight(20, units, 0)} and ${formatWeight(400, units, 0)}.`);
    if (fat !== null && !isPlausibleBodyFat(fat)) return setError('Body fat should be between 3 and 60%');
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
      <NumberField
        testID="weight-input"
        label="Weight"
        suffix={unit}
        value={weight}
        onChange={(n) => {
          setWeight(n);
          setError(null);
        }}
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
        error={error}
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

