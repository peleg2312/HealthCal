import { useLocalSearchParams } from 'expo-router';
import { ChevronDown, ChevronUp, Moon, Plus } from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { formatDayLabel, fromISODate, weekdayShort } from '@/lib/dates';
import { deleteSleep, saveSleep } from '@/features/trackers/actions';
import { dayTitle, resolveDateParam } from '@/features/trackers/dateParam';
import { DayStepper, Explain, ExplainText, Figure, FIGURE_INSIDE, HistoryItem, HistoryList, HistoryRow, RequireProfile, spokenFigure } from '@/features/trackers/components';
import { findByDate, formatHours, hoursFigure, hoursSpoken, QUALITY_LABELS, SLEEP_RANGE, sleepSummary } from '@/features/trackers/helpers';
import { sleepChartLabel } from '@/features/progress/chartWords';
import { sleepFromLine, stagesLine } from '@/features/trackers/sleepSource';
import { useToday } from '@/store/clock';
import { useLive } from '@/store/selectors';
import { useTheme } from '@/theme';
import type { ISODate, SleepEntry, SleepQuality } from '@/types';
import { BarChart, Button, Card, Chip, CupKey, Divider, EmptyState, Header, Screen, SectionTitle, Segmented, Sheet, Stepper, Text } from '@/ui';

type Window = '7' | '30';
const QUALITIES: SleepQuality[] = [1, 2, 3, 4, 5];

/** 7.25 -> '7 h 15' + 'min', 7 -> '7' + 'h': a duration as a figure and its unit, the way Progress and Today draw sleep too. */
const hm = hoursFigure;

function QualityDots({ quality, size = 10 }: { quality: number; size?: number }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 4 }} accessibilityLabel={`Quality ${quality} of 5`}>
      {QUALITIES.map((q) => (
        <CupKey key={q} size={size} color={q <= quality ? colors.sleep : colors.borderStrong} variant={q <= quality ? 'filled' : 'outline'} />
      ))}
    </View>
  );
}

/** History row: its rating and where it came from, "Good sleep · From Garmin Connect". */
function historySubtitle(e: SleepEntry): string | undefined {
  const parts = [e.quality ? `${QUALITY_LABELS[e.quality]} sleep` : null, sleepFromLine(e)].filter(Boolean);
  return parts.length ? parts.join(' · ') : undefined;
}

/** Where a synced night came from and its stages; nothing for a night entered by hand. */
function SyncedNight({ night }: { night: SleepEntry }) {
  const from = sleepFromLine(night);
  if (!from) return null;
  const stages = stagesLine(night.stages);
  return (
    <View style={{ gap: 4 }}>
      <Text variant="label" color="textSecondary" testID="sleep-last-night-from">
        {from}
      </Text>
      {stages ? (
        // One element, its units in full ("Deep 1 hour 10 minutes"), as the figures above it.
        <View {...spokenFigure(stages)}>
          <View {...FIGURE_INSIDE}>
            <Text variant="caption" color="textSecondary" testID="sleep-last-night-stages">
              {stages}
            </Text>
          </View>
        </View>
      ) : null}
      <Text variant="caption" color="textSecondary">
        Time awake and time in bed are not counted as sleep.
      </Text>
    </View>
  );
}

function HoursBig({ hours, testID }: { hours: number; testID?: string }) {
  const mins = Math.round(hours * 60);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return (
    // One element to a screen reader, its units in full ("7 hours 15 minutes"), never "7 h 15 min".
    <View testID={testID} {...spokenFigure(hoursSpoken(hours))}>
    <View {...FIGURE_INSIDE} style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
      <Text variant="numXL" tabular>
        {h}
      </Text>
      <Text variant="unit" style={{ fontSize: 15 }}>
        h
      </Text>
      {m > 0 ? (
        <>
          <Text variant="numXL" tabular style={{ marginLeft: 6 }}>
            {m}
          </Text>
          <Text variant="unit" style={{ fontSize: 15 }}>
            min
          </Text>
        </>
      ) : null}
    </View>
    </View>
  );
}

function SleepScreen() {
  const { colors, spacing } = useTheme();
  const entries = useLive('sleep');
  const [win, setWin] = useState<Window>('7');
  const [sheetDate, setSheetDate] = useState<ISODate | null>(null);
  const [showAll, setShowAll] = useState(false);
  const todayDate = useToday();
  const params = useLocalSearchParams<{ date?: string; log?: string }>();
  // Opened from a past day on Today (?date=), the screen shows and logs that day's night.
  const end = resolveDateParam(params.date, todayDate);
  // ?log=1 (the morning page's "Add"): open the sheet for this night once, so one tap logs it.
  const logOpened = useRef(false);
  useEffect(() => {
    if (params.log !== '1' || logOpened.current) return;
    logOpened.current = true;
    setSheetDate(end);
  }, [params.log, end]);
  const isToday = end === todayDate;
  const lastNight = findByDate(entries, end);
  const days = win === '7' ? 7 : 30;
  const summary = sleepSummary(entries, days, end);
  const allNights = [...entries].sort((a, b) => b.date.localeCompare(a.date));
  const history = showAll ? allNights : allNights.slice(0, 14);

  const bars = summary.series.map((d, i) => ({
    label: days === 7 ? (d.date === todayDate ? 'Today' : weekdayShort(d.date)) : i % 5 === 4 || i === days - 1 ? String(fromISODate(d.date).getDate()) : '',
    value: d.hours,
    color: colors.sleep,
  }));

  // Under the chart: what the shading is, then what is missing and the average rating, each a sentence of its own.
  const chartNote = [
    'Shaded: 7 to 9 hours.',
    summary.nights < days ? `${days - summary.nights} of ${days} nights not logged.` : null,
    // "quality good." held together, so a wrapped note never ends on one word alone.
    summary.avgQuality !== null ? `Average quality\u00A0${QUALITY_LABELS[Math.round(summary.avgQuality) as SleepQuality].toLowerCase().replace(/ /g, '\u00A0')}.` : null,
  ].filter((x): x is string => !!x);

  const footer = <Button testID="sleep-log" title={lastNight ? (isToday ? 'Log sleep' : 'Edit this night') : isToday ? 'Log last night' : 'Log this night'} icon={<Plus size={20} color={colors.onPrimary} />} onPress={() => setSheetDate(end)} />;

  return (
    <Screen header={<Header title="Sleep" subtitle={isToday ? 'Last night' : dayTitle(end)} />} footer={footer} backdrop={colors.sleep} testID="sleep-screen">
      {entries.length === 0 ? (
        <Card>
          <EmptyState
            emoji="🌙"
            title="See how you sleep"
            message="Log how long you slept and how it felt. After a few nights your average shows here."
          />
        </Card>
      ) : (
        <>
          <Card style={{ gap: spacing.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <CupKey color={colors.sleep} />
              <Text variant="overline">{isToday ? 'Last night' : `Night before ${dayTitle(end)}`}</Text>
            </View>
            {lastNight ? (
              <>
                <HoursBig hours={lastNight.hours} testID="sleep-last-night" />
                {lastNight.quality ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <QualityDots quality={lastNight.quality} />
                    <Text variant="label" color="textSecondary">
                      {QUALITY_LABELS[lastNight.quality]} sleep
                    </Text>
                  </View>
                ) : null}
                <SyncedNight night={lastNight} />
              </>
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Moon size={20} color={colors.sleep} />
                <Text variant="body" color="textSecondary">
                  Not logged yet. Use the button below to add it.
                </Text>
              </View>
            )}
          </Card>

          <Card style={{ gap: spacing.md }}>
            <Segmented
              testID="sleep-window"
              options={[
                { value: '7', label: '7 days' },
                { value: '30', label: '30 days' },
              ]}
              value={win}
              onChange={setWin}
            />
            {/* Three in a row; on a narrow phone the third goes under the first, so "6 h 56 min" keeps its unit beside it. */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing.md, rowGap: spacing.md }}>
              <Figure basis={92} testID="sleep-average" value={summary.avgHours !== null ? hm(summary.avgHours).value : '–'} unit={summary.avgHours !== null ? hm(summary.avgHours).unit : undefined} label="Average a night" />
              <Figure
                basis={92}
                testID="sleep-in-range"
                value={`${summary.inRange}/${summary.nights}`}
                unit="nights"
                label="Within 7–9 h"
                spoken={`${summary.inRange} of ${summary.nights} ${summary.nights === 1 ? 'night' : 'nights'} within 7 to 9 hours`}
              />
              <Figure
                basis={92}
                value={summary.spreadHours !== null ? (summary.spreadHours < 1 ? `±${Math.round(summary.spreadHours * 60)}` : `±${hm(summary.spreadHours).value}`) : '–'}
                unit={summary.spreadHours !== null ? (summary.spreadHours < 1 ? 'min' : hm(summary.spreadHours).unit) : undefined}
                label="Night to night"
              />
            </View>
            <BarChart
              accessibilityLabel={sleepChartLabel(summary.series, todayDate)}
              data={bars}
              color={colors.sleep}
              band={{ from: SLEEP_RANGE[0], to: SLEEP_RANGE[1] }}
              height={160}
              formatValue={(n) => `${n.toFixed(1)}`}
            />
            {/* The unit in words ("7 to 9 hours"); a note of more than one sentence is reading text, at the body size. */}
            <Text variant={chartNote.length > 1 ? 'body' : 'caption'} color="textSecondary" testID="sleep-chart-note">
              {chartNote.join(' ')}
            </Text>
            <Explain label="Why 7 to 9 hours" testID="sleep-help" style={{ marginTop: -spacing.xs, marginBottom: -spacing.sm }}>
              <ExplainText>
                Most adults need 7 to 9 hours (American Academy of Sleep Medicine). A steady schedule matters too: a smaller night-to-night spread usually means steadier energy and
                appetite.
              </ExplainText>
            </Explain>
          </Card>

          <SectionTitle title="History" testID="sleep-history" />
          <Card padding={spacing.md}>
            {/* A list on the web (a ul of li), each night one item with its divider. */}
            <HistoryList testID="sleep-history-list">
              {history.map((e, i) => (
                <HistoryItem key={e.id}>
                  {i > 0 ? <Divider /> : null}
                  <HistoryRow
                    testID={`sleep-row-${i}`}
                    title={formatDayLabel(e.date)}
                    subtitle={historySubtitle(e)}
                    value={formatHours(e.hours)}
                    onPress={() => setSheetDate(e.date)}
                  />
                </HistoryItem>
              ))}
            </HistoryList>
          </Card>
          {/* More than 14 nights: the rest open under the list, where it ends (the testID is the one SectionTitle gave it). */}
          {allNights.length > 14 ? (
            <Button
              testID="section-sleep-history-action"
              title={showAll ? 'Show less' : `Show all ${allNights.length}`}
              // The visible words first; the open state is the button's own (aria-expanded on the web).
              accessibilityLabel={showAll ? 'Show less' : `Show all ${allNights.length} nights`}
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

      <SleepSheet date={sheetDate} onDate={setSheetDate} onClose={() => setSheetDate(null)} entries={entries} />
    </Screen>
  );
}

function SleepSheet({ date, onDate, onClose, entries }: { date: ISODate | null; onDate: (d: ISODate) => void; onClose: () => void; entries: SleepEntry[] }) {
  const { spacing } = useTheme();
  const existing = date ? findByDate(entries, date) : undefined;
  const from = existing ? sleepFromLine(existing) : null;
  const [hours, setHours] = useState(7.5);
  // A new night starts at "Okay"; a synced night the person has not rated starts with none.
  const [quality, setQuality] = useState<SleepQuality | null>(3);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const key = date ? `${date}:${existing?.id ?? 'new'}` : null;
  if (key !== loadedFor) {
    setLoadedFor(key);
    setHours(existing?.hours ?? 7.5);
    setQuality(existing ? (existing.quality ?? null) : 3);
  }
  return (
    <Sheet
      visible={date !== null}
      onClose={onClose}
      title={existing ? 'Edit night' : 'Log sleep'}
      footer={
        <View style={{ gap: 8 }}>
          <Button
            testID="sleep-save"
            title={existing ? 'Update night' : 'Save night'}
            onPress={() => {
              if (!date) return;
              saveSleep(date, hours, quality);
              onClose();
            }}
          />
          {existing ? (
            <Button
              testID="sleep-delete"
              title="Delete this night"
              variant="ghost"
              onPress={() => {
                deleteSleep(existing);
                onClose();
              }}
            />
          ) : null}
        </View>
      }>
      {existing && from ? (
        // Two sentences: reading text, at the body size.
        <Text variant="body" color="textSecondary" testID="sleep-sheet-from">
          {`${from}. A rating keeps it synced; a new time makes it yours.`}
        </Text>
      ) : null}
      <Text variant="label" color="textSecondary">
        Woke up on
      </Text>
      {date ? <DayStepper date={date} onChange={onDate} testID="sleep-date" /> : null}
      <Text variant="label" color="textSecondary" style={{ marginTop: spacing.sm }}>
        Time asleep
      </Text>
      <View style={{ alignItems: 'center' }}>
        <Stepper label="hours slept" value={hours} onChange={setHours} step={0.25} min={0} max={16} format={formatHours} />
      </View>
      <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
        {[6, 7, 7.5, 8, 9].map((h) => (
          // "7.5 h", not "7 h 30 min": the five then fit one line at 320 px rather than leaving "9 h" alone on a second.
          <Chip key={h} testID={`sleep-hours-${h}`} label={`${h} h`} selected={hours === h} onPress={() => setHours(h)} />
        ))}
      </View>
      <Text variant="label" color="textSecondary" style={{ marginTop: spacing.sm }}>
        How did it feel?
      </Text>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {QUALITIES.map((q) => (
          // Tapping the chosen one again clears it: a night does not need a rating.
          <Chip key={q} testID={`sleep-quality-${q}`} label={QUALITY_LABELS[q]} selected={quality === q} onPress={() => setQuality(quality === q ? null : q)} style={{ flex: 1, paddingHorizontal: 4, justifyContent: 'center' }} />
        ))}
      </View>
    </Sheet>
  );
}

export default function SleepRoute() {
  return (
    <RequireProfile>
      <SleepScreen />
    </RequireProfile>
  );
}
