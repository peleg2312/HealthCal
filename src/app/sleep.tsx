import { useLocalSearchParams } from 'expo-router';
import { Info, Moon, Plus } from 'lucide-react-native';
import React, { useState } from 'react';
import { View } from 'react-native';

import { formatDayLabel, fromISODate, weekdayShort } from '@/lib/dates';
import { deleteSleep, saveSleep } from '@/features/trackers/actions';
import { dayTitle, resolveDateParam } from '@/features/trackers/dateParam';
import { DayStepper, Figure, Note, RequireProfile } from '@/features/trackers/components';
import { findByDate, formatHours, QUALITY_LABELS, SLEEP_RANGE, sleepSummary } from '@/features/trackers/helpers';
import { useToday } from '@/store/clock';
import { useLive } from '@/store/selectors';
import { useTheme } from '@/theme';
import type { ISODate, SleepEntry } from '@/types';
import { BarChart, Button, Card, Chip, Divider, EmptyState, Header, ListRow, Screen, SectionTitle, Segmented, Sheet, Stepper, Text } from '@/ui';

type Window = '7' | '30';
const QUALITIES: SleepEntry['quality'][] = [1, 2, 3, 4, 5];

/** 7.25 -> '7 h 15' + 'min', 7 -> '7' + 'h': a duration as a figure and its unit, read the way every other duration in the app is. */
function hm(hours: number): { value: string; unit: string } {
  const mins = Math.round(hours * 60);
  return mins % 60 === 0 ? { value: String(mins / 60), unit: 'h' } : { value: `${Math.floor(mins / 60)} h ${mins % 60}`, unit: 'min' };
}

function QualityDots({ quality, size = 10 }: { quality: number; size?: number }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 4 }} accessibilityLabel={`Quality ${quality} of 5`}>
      {QUALITIES.map((q) => (
        <View key={q} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: q <= quality ? colors.sleep : colors.track }} />
      ))}
    </View>
  );
}

function HoursBig({ hours, testID }: { hours: number; testID?: string }) {
  const mins = Math.round(hours * 60);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return (
    <View testID={testID} style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
      <Text variant="numXL" tabular color="sleep">
        {h}
      </Text>
      <Text variant="title" color="textSecondary">
        h
      </Text>
      {m > 0 ? (
        <>
          <Text variant="numXL" tabular color="sleep" style={{ marginLeft: 6 }}>
            {m}
          </Text>
          <Text variant="title" color="textSecondary">
            min
          </Text>
        </>
      ) : null}
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
  const params = useLocalSearchParams<{ date?: string }>();
  // Opened from a past day on Today (?date=), the screen shows and logs that day's night.
  const end = resolveDateParam(params.date, todayDate);
  const isToday = end === todayDate;
  const lastNight = findByDate(entries, end);
  const days = win === '7' ? 7 : 30;
  const summary = sleepSummary(entries, days, end);
  const allNights = [...entries].sort((a, b) => b.date.localeCompare(a.date));
  const history = showAll ? allNights : allNights.slice(0, 14);

  const bars = summary.series.map((d, i) => ({
    label: days === 7 ? (d.date === todayDate ? 'Today' : weekdayShort(d.date)) : i % 5 === 4 || i === days - 1 ? String(fromISODate(d.date).getDate()) : '',
    value: d.hours,
    color: d.hours >= SLEEP_RANGE[0] && d.hours <= SLEEP_RANGE[1] ? colors.sleep : `${colors.sleep}77`,
  }));

  const footer = <Button testID="sleep-log" title={lastNight ? (isToday ? 'Log sleep' : 'Edit this night') : isToday ? 'Log last night' : 'Log this night'} icon={<Plus size={20} color={colors.onPrimary} />} onPress={() => setSheetDate(end)} />;

  return (
    <Screen header={<Header title="Sleep" subtitle={isToday ? undefined : dayTitle(end)} />} footer={footer} backdrop={colors.sleep} testID="sleep-screen">
      {entries.length === 0 ? (
        <Card>
          <EmptyState
            emoji="🌙"
            title="See how you sleep"
            message="Log how long you slept and how it felt. After a few nights you will see your average and how often you land in the 7 to 9 hour range."
          />
        </Card>
      ) : (
        <>
          <Card style={{ gap: spacing.sm }}>
            <Text variant="overline" color="textSecondary">
              {isToday ? 'LAST NIGHT' : `NIGHT BEFORE ${dayTitle(end).toUpperCase()}`}
            </Text>
            {lastNight ? (
              <>
                <HoursBig hours={lastNight.hours} testID="sleep-last-night" />
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <QualityDots quality={lastNight.quality} />
                  <Text variant="label" color="textSecondary">
                    {QUALITY_LABELS[lastNight.quality]} sleep
                  </Text>
                </View>
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
              options={[
                { value: '7', label: '7 days' },
                { value: '30', label: '30 days' },
              ]}
              value={win}
              onChange={setWin}
            />
            <View style={{ flexDirection: 'row', gap: spacing.md }}>
              <Figure testID="sleep-average" value={summary.avgHours !== null ? hm(summary.avgHours).value : '–'} unit={summary.avgHours !== null ? hm(summary.avgHours).unit : undefined} label="Average a night" />
              <Figure testID="sleep-in-range" value={`${summary.inRange}/${summary.nights}`} unit="nights" label="Within 7–9 h" />
              <Figure
                value={summary.spreadHours !== null ? (summary.spreadHours < 1 ? `±${Math.round(summary.spreadHours * 60)}` : `±${hm(summary.spreadHours).value}`) : '–'}
                unit={summary.spreadHours !== null ? (summary.spreadHours < 1 ? 'min' : hm(summary.spreadHours).unit) : undefined}
                label="Night to night"
              />
            </View>
            <BarChart data={bars} color={colors.sleep} goal={SLEEP_RANGE[0]} height={160} formatValue={(n) => `${n.toFixed(1)}`} />
            <Text variant="caption" color="textSecondary">
              {[
                'Brighter bars are nights within 7 to 9 hours; the dashed line marks 7 hours.',
                summary.nights < days ? `${days - summary.nights} of ${days} nights not logged.` : null,
                summary.avgQuality !== null ? `Average quality: ${QUALITY_LABELS[Math.round(summary.avgQuality) as SleepEntry['quality']].toLowerCase()}.` : null,
              ]
                .filter(Boolean)
                .join(' ')}
            </Text>
          </Card>

          <Card tone="alt">
            <Note icon={<Info size={14} color={colors.textTertiary} />}>
              Most adults need 7 to 9 hours (American Academy of Sleep Medicine). A steady schedule matters too: a smaller night-to-night spread usually means steadier energy and appetite.
            </Note>
          </Card>

          <SectionTitle
            title="History"
            testID="sleep-history"
            action={allNights.length > 14 ? (showAll ? 'Show less' : `Show all ${allNights.length}`) : undefined}
            onAction={() => setShowAll((v) => !v)}
          />
          <Card padding={spacing.md}>
            {history.map((e, i) => (
              <React.Fragment key={e.id}>
                {i > 0 ? <Divider /> : null}
                <ListRow
                  testID={`sleep-row-${i}`}
                  title={formatDayLabel(e.date)}
                  subtitle={`${QUALITY_LABELS[e.quality]} sleep`}
                  value={formatHours(e.hours)}
                  onPress={() => setSheetDate(e.date)}
                />
              </React.Fragment>
            ))}
          </Card>
        </>
      )}

      <SleepSheet date={sheetDate} onDate={setSheetDate} onClose={() => setSheetDate(null)} entries={entries} />
    </Screen>
  );
}

function SleepSheet({ date, onDate, onClose, entries }: { date: ISODate | null; onDate: (d: ISODate) => void; onClose: () => void; entries: SleepEntry[] }) {
  const { spacing } = useTheme();
  const existing = date ? findByDate(entries, date) : undefined;
  const [hours, setHours] = useState(7.5);
  const [quality, setQuality] = useState<SleepEntry['quality']>(3);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const key = date ? `${date}:${existing?.id ?? 'new'}` : null;
  if (key !== loadedFor) {
    setLoadedFor(key);
    setHours(existing?.hours ?? 7.5);
    setQuality(existing?.quality ?? 3);
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
          <Chip key={h} testID={`sleep-hours-${h}`} label={formatHours(h)} selected={hours === h} onPress={() => setHours(h)} />
        ))}
      </View>
      <Text variant="label" color="textSecondary" style={{ marginTop: spacing.sm }}>
        How did it feel?
      </Text>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {QUALITIES.map((q) => (
          <Chip key={q} testID={`sleep-quality-${q}`} label={QUALITY_LABELS[q]} selected={quality === q} onPress={() => setQuality(q)} style={{ flex: 1, paddingHorizontal: 4, justifyContent: 'center', height: 44 }} />
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
