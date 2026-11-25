import { ChevronDown, ChevronUp, Plus } from 'lucide-react-native';
import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Platform, View, type TextInput } from 'react-native';

import { clockTime } from '@/features/import/ui/format';
import { besideFits, keepsDesign } from '@/features/layout/grownFit';
import { MeasureWidth, SizeProbe, useMeasureKey } from '@/features/today/MeasureWidth';
import { resolveDateParam } from '@/features/trackers/dateParam';
import { addDays, diffDays, formatDayLabel, formatShortDate } from '@/lib/dates';
import { isPlausibleBodyFat, projectedGoalDate } from '@/lib/energy';
import { weightChartLabel } from '@/features/progress/chartWords';
import { trendMonthParts, weeklyRateText } from '@/features/progress/goalDate';
import { formatWeight, weightToKg, weightUnit, weightValue } from '@/lib/units';
import { applyWeighInToTargets, deleteWeightRecord, saveWeightRecord } from '@/features/trackers/actions';
import { DayStepper, Explain, ExplainText, Figure, HistoryItem, HistoryList, HistoryRow, RequireProfile } from '@/features/trackers/components';
import { bodyFatText, findByDate, keepOrConvert, targetsBehind, weightChartData, weightRangePoints, weightRangeSummary, weightStats, weightText, type WeightRange } from '@/features/trackers/helpers';
import { RangeChips } from '@/features/trackers/RangeChips';
import { heldDayWords, heldReadout, heldShortDay, rangeFigures, risingWeekNote } from '@/features/trackers/weightWords';
import { isSyncedWeighIn, weighInFromLine } from '@/features/trackers/weighInSource';
import { useToday } from '@/store/clock';
import { useProfile, useWeightSeries } from '@/store/selectors';
import { fonts, useLargeText, useTextGrowth, useTheme, useVeryLargeText } from '@/theme';
import type { ISODate, UnitSystem, WeightEntry } from '@/types';
import {
  Button,
  Card,
  CupKey,
  Divider,
  EmptyState,
  Header,
  LineChart,
  NumberField,
  numberTextProblem,
  Screen,
  SectionTitle,
  Sheet,
  Text,
} from '@/ui';

function signed(kg: number, units: UnitSystem, digits = 1): string {
  const v = weightValue(kg, units);
  const s = Math.abs(v) < 0.05 ? '0' : `${v > 0 ? '+' : '−'}${Math.abs(v).toFixed(digits)}`;
  return s;
}

/** Weights always with one decimal so a column of them lines up, the goal's included ("Goal 74.0 kg"). */
const fixedWeight = weightText;

function WeightScreen() {
  const { colors, spacing } = useTheme();
  const bigText = useLargeText();
  // History: each weight beside its day as designed, under it with very large text; through the common steps (text
  // grown in size, under VERY_LARGE_TEXT) beside while the widest day or part of a row's line and the widest weight,
  // measured as drawn, fit the row with the chevron (`besideFits`), under it only where they do not. At the designed
  // size nothing is measured.
  const veryLarge = useVeryLargeText();
  const fit = useTextGrowth() > 1 && !veryLarge;
  const measureKey = useMeasureKey();
  const [historyW, setHistoryW] = useState(0);
  const [historyWordsW, setHistoryWordsW] = useState(0);
  const [historyValueW, setHistoryValueW] = useState(0);
  const profile = useProfile();
  const units = profile.units;
  const series = useWeightSeries();
  const [range, setRange] = useState<WeightRange>('3m');
  // The point held on the chart (a finger, or the arrow keys on the web): its index in the range's days.
  const [held, setHeld] = useState<number | null>(null);
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
  // The range's days (the chart's line, one point a day) and what they hold, for the line under the chips.
  const rangeDays = weightRangePoints(series.trend, range, end);
  const figures = (() => {
    const summary = weightRangeSummary(series.trend, range, end);
    return summary ? rangeFigures(summary, range, units) : null;
  })();
  const heldPoint = held !== null ? rangeDays[held] : undefined;
  const readout = heldPoint ? heldReadout(heldPoint, end, units) : null;
  const dayAt = (x: number) => rangeDays.find((p) => p.date === addDays(rangeDays[0]?.date ?? end, x));
  const target = profile.targetWeightKg;
  // The trend's date, from today's date (never the clock in a render), said as a month: the plan's date is in Goals.
  const projected = stats && target && stats.weeklyKg !== null ? projectedGoalDate(stats.trendKg, target, stats.weeklyKg, new Date(`${end}T12:00:00`)) : null;
  const projectedParts = projected ? trendMonthParts(projected) : null;
  const latest = series.latest;
  // A rising week gets context and a next step (never a verdict, never amber).
  const rising = risingWeekNote(series.trend, end, units, target);

  // The newest weigh-in came from a health store and the targets do not use it yet: one tap applies it (a sync never does).
  const behind = targetsBehind(profile, series.entries);

  const history = [...series.entries].reverse();
  const shown = showAll ? history : history.slice(0, 14);
  // Each shown weigh-in as its row draws it: the day, its line's parts and the weight.
  const historyRows = shown.map((e) => {
    const prev = history[history.indexOf(e) + 1];
    // From the rounded weights on screen, so the difference matches what the two rows show.
    const rounded = (kg: number) => Math.round(weightValue(kg, units) * 10) / 10;
    const delta = prev ? rounded(e.kg) - rounded(prev.kg) : null;
    const parts = [
      delta !== null ? `${Math.abs(delta) < 0.05 ? '0' : `${delta > 0 ? '+' : '−'}${Math.abs(delta).toFixed(1)}`} ${unit} vs previous` : null,
      isPlausibleBodyFat(e.bodyFatPct) ? `${bodyFatText(e.bodyFatPct)} body fat` : null,
      weighInFromLine(e)?.replace(/^From /, 'from ') ?? null,
    ].filter((part): part is string => !!part);
    return { e, title: formatDayLabel(e.date), parts, value: fixedWeight(e.kg, units) };
  });
  // The Card's 12 px padding each side; the value and the chevron 12 apart, the chevron 18 wide.
  const valueBeside = fit ? keepsDesign(besideFits([historyWordsW, historyValueW, 18], historyW - 2 * spacing.md, spacing.md)) : undefined;

  const footer = <Button testID="weight-log" title="Log weigh-in" icon={<Plus size={20} color={colors.onPrimary} />} onPress={() => setSheetDate(end)} />;

  return (
    <Screen header={<Header title="Weight" subtitle={target ? `Goal ${fixedWeight(target, units)}` : 'Trend and weigh-ins'} />} footer={footer} backdrop={colors.weight} testID="weight-screen">
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
                  {/* While a point is held, the figures are that day's: its trend here, its weigh-in at the right. */}
                  <Text variant="overline" testID="weight-trend-label">
                    {heldPoint ? `Trend, ${heldShortDay(heldPoint.date, end)}` : 'Trend weight'}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
                  <Text testID="weight-trend" variant="numXL" tabular>
                    {weightValue(heldPoint ? heldPoint.trend : stats.trendKg, units).toFixed(1)}
                  </Text>
                  <Text variant="unit" style={{ fontSize: 15 }}>
                    {unit}
                  </Text>
                </View>
              </View>
              {heldPoint && readout ? (
                <View style={{ alignItems: 'flex-end', marginLeft: 'auto' }}>
                  <Text variant="caption" color="textSecondary" testID="weight-scale-label">
                    {readout.scale ? `Scale, ${heldShortDay(heldPoint.date, end)}` : `No weigh-in, ${heldShortDay(heldPoint.date, end)}`}
                  </Text>
                  <Text variant="numM" tabular testID="weight-scale">
                    {readout.scale ?? '–'}
                  </Text>
                </View>
              ) : latest ? (
                <View style={{ alignItems: 'flex-end', marginLeft: 'auto' }}>
                  <Text variant="caption" color="textSecondary" testID="weight-scale-label">
                    Scale, {latest.date === end ? 'today' : formatShortDate(latest.date)}
                  </Text>
                  <Text variant="numM" tabular testID="weight-scale">
                    {fixedWeight(latest.kg, units)}
                  </Text>
                </View>
              ) : null}
            </View>
            {/* Press and hold (or drag) on the chart, or its arrow keys on the web: the figures above read that day. */}
            <View testID="weight-chart">
              <LineChart
                key={range}
                accessibilityLabel={weightChartLabel(series.trend, range, end, units, target)}
                line={chart.line}
                dots={chart.dots}
                ringDots
                color={colors.weight}
                goal={target ? weightValue(target, units) : undefined}
                height={200}
                xLabels={chart.labels}
                formatY={(n) => (Number.isInteger(n) ? String(n) : n.toFixed(1))}
                formatPoint={(p) => heldDayWords(dayAt(p.x)?.date ?? end, end)}
                pointSpoken={(p) => {
                  const day = dayAt(p.x);
                  return day ? heldReadout(day, end, units).spoken : '';
                }}
                onActiveChange={setHeld}
              />
            </View>
            {/* The range, under the chart where the thumb is; the figures under it follow it. */}
            <RangeChips
              value={range}
              onChange={(r) => {
                setHeld(null);
                setRange(r);
              }}
            />
            {figures ? (
              <View testID="weight-range-figures" style={{ flexDirection: 'row', gap: spacing.md }}>
                <Figure testID="weight-range-average" value={figures.average} unit={figures.unit} label={figures.averageLabel} />
                {figures.spread ? (
                  <Figure testID="weight-range-spread" value={figures.spread} unit={figures.unit} label={figures.spreadLabel} spoken={figures.spreadSpoken ?? undefined} />
                ) : null}
              </View>
            ) : null}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg }}>
              <Legend swatch={<View style={{ width: 16, height: 2, borderRadius: 1, backgroundColor: colors.weight }} />} label="Trend" />
              <Legend swatch={<CupKey color={colors.textTertiary} size={7} />} label="Weigh-ins" />
              {target ? (
                <Legend swatch={<View style={{ width: 16, borderTopWidth: 2, borderStyle: 'dashed', borderColor: colors.dashEdge }} />} label="Goal" />
              ) : null}
            </View>
            <Explain label="Why the trend differs from the scale" labelShort="Why the trend differs" testID="weight-trend-help" style={{ marginTop: -spacing.xs, marginBottom: -spacing.sm }}>
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
                title="Use it for my target"
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
            {rising ? (
              <>
                <Divider />
                <View testID="weight-rising-note" style={{ gap: spacing.xs }}>
                  <Text variant="body" color="textSecondary">
                    {rising.line}
                  </Text>
                  <Text variant="body" color="textSecondary" testID="weight-rising-step">
                    {rising.step}
                  </Text>
                </View>
              </>
            ) : null}
          </Card>

          <SectionTitle title="History" />
          <Card padding={spacing.md}>
            {/* Unseen, and only while measuring: the card's width, the widest day or line part, the widest weight. */}
            {fit ? <SizeProbe key={`${measureKey}-history`} onSize={(w) => setHistoryW(Math.floor(w))} /> : null}
            {fit ? (
              <MeasureWidth key={`${measureKey}-history-words`} onWidth={setHistoryWordsW}>
                <View style={{ alignItems: 'flex-start' }}>
                  {historyRows.map((r) => (
                    <React.Fragment key={r.e.id}>
                      <Text variant="bodyStrong" style={{ fontFamily: fonts.semibold }}>
                        {r.title}
                      </Text>
                      {r.parts.map((part) => (
                        <Text key={part} variant="caption">
                          {part}
                        </Text>
                      ))}
                    </React.Fragment>
                  ))}
                </View>
              </MeasureWidth>
            ) : null}
            {fit ? (
              <MeasureWidth key={`${measureKey}-history-values`} onWidth={setHistoryValueW}>
                <View style={{ alignItems: 'flex-start' }}>
                  {historyRows.map((r) => (
                    <Text key={r.e.id} variant="label">
                      {r.value}
                    </Text>
                  ))}
                </View>
              </MeasureWidth>
            ) : null}
            {/* A list on the web (a ul of li), each weigh-in one item with its divider. */}
            <HistoryList testID="weight-history-list">
              {historyRows.map(({ e, title, parts, value }, i) => (
                <HistoryItem key={e.id}>
                  {i > 0 ? <Divider /> : null}
                  <HistoryRow
                    testID={`weight-row-${i}`}
                    title={title}
                    subtitle={
                      parts
                        // The change first and where it came from last: at 320 px a long line is shortened at the source, never the change.
                        // Each part stays whole ("21% body fat"), so a long line breaks only between them; at large
                        // text with the weight under the day a part may break between its words, never inside one
                        // (beside it, every part was measured to fit whole).
                        .map((part) => (bigText && valueBeside !== true ? part : part.replace(/ /g, '\u00A0')))
                        .join(' · ') || undefined
                    }
                    value={value}
                    valueBeside={valueBeside}
                    onPress={() => setSheetDate(e.date)}
                  />
                </HistoryItem>
              ))}
            </HistoryList>
          </Card>
          {/* More than 14 weigh-ins: the rest open under the list, where it ends (the testID is the one SectionTitle gave it). */}
          {history.length > 14 ? (
            <Button
              testID="section-history-action"
              title={showAll ? 'Show less' : `Show all ${history.length}`}
              // The visible words first; the open state is the button's own (aria-expanded on the web).
              accessibilityLabel={showAll ? 'Show less' : `Show all ${history.length} weigh-ins`}
              expanded={showAll}
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
 * "Your target uses 84.0 kg. Your latest weigh-in, from Garmin Connect on Nov 18, is 82.4 kg."
 * With body fat: "… is 82.4 kg with 18% body fat."
 */
function targetsBehindText(
  behind: NonNullable<ReturnType<typeof targetsBehind>>,
  profile: { weightKg: number; bodyFatPct?: number | null },
  units: UnitSystem,
): string {
  const from = weighInFromLine(behind.latest)?.replace(/^From /, 'from ') ?? 'from your health app';
  // Body fat as everywhere, a whole percent; in tenths only when the two readings would show the same figure,
  // so the sentence never sets "18%" against "18%". A profile without body fat leaves the clause out.
  const own = typeof profile.bodyFatPct === 'number' ? profile.bodyFatPct : null;
  const tenths = behind.bodyFatPct !== undefined && own !== null && Math.round(behind.bodyFatPct) === Math.round(own);
  const fat = behind.bodyFatPct !== undefined ? ` with ${bodyFatText(behind.bodyFatPct, tenths)} body fat` : '';
  const ownFat = behind.bodyFatPct !== undefined && own !== null ? ` and ${bodyFatText(own, tenths)} body fat` : '';
  // "Target" is the daily calorie number only, so it is named in the singular.
  return `Your target uses ${fixedWeight(profile.weightKg, units)}${ownFat}. Your latest weigh-in, ${from} on ${formatShortDate(behind.latest.date)}, is ${fixedWeight(behind.kg, units)}${fat}.`;
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
  // What was typed in each field: a refused minus leaves the value empty while the field still shows it, so Save
  // waits with the field's own words rather than pass over it (an empty body fat would save without it).
  const [weightTyped, setWeightTyped] = useState('');
  const [fatTyped, setFatTyped] = useState('');
  const weightProblem = weight === null ? numberTextProblem(weightTyped) : null;
  const fatProblem = fat === null ? numberTextProblem(fatTyped) : null;
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
  // The weight field takes the focus as the sheet opens. On the web it is focused from this effect, once
  // the sheet is open; the kit `Sheet` notes what had the focus before ("Log weigh-in", or the row tapped)
  // before its children mount, so closing it by Escape or the backdrop gives the focus back there (an
  // autoFocus would do the same now; this effect predates that). Natively the field keeps its autoFocus.
  const weightRef = useRef<React.ComponentRef<typeof TextInput>>(null);
  const open = date !== null;
  useEffect(() => {
    if (open && Platform.OS === 'web') weightRef.current?.focus();
  }, [open]);
  // A changed value is not dropped without asking (the backdrop, a drag, Escape, back).
  const changed = date !== null && (weight !== (existing ? display(existing.kg) : display(fallbackKg)) || fat !== (existing?.bodyFatPct ?? null) || !!weightProblem || !!fatProblem);

  const save = () => {
    if (!date) return;
    if (weightProblem) return setError({ field: 'weight', message: weightProblem });
    if (weight === null || weight <= 0) return setError({ field: 'weight', message: 'Enter your weight' });
    if (fatProblem) return setError({ field: 'fat', message: fatProblem });
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
      unsaved={changed ? 'Discard this weigh-in?' : null}
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
        onChange={(n, t) => {
          setWeight(n);
          setWeightTyped(t);
          setError(null);
        }}
        error={error?.field === 'weight' ? error.message : null}
        ref={weightRef}
        autoFocus={Platform.OS !== 'web'}
        selectTextOnFocus
      />
      <NumberField
        testID="weight-bodyfat-input"
        label="Body fat (optional)"
        suffix="%"
        placeholder="From a smart scale or tape estimate"
        value={fat}
        onChange={(n, t) => {
          setFat(n);
          setFatTyped(t);
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

