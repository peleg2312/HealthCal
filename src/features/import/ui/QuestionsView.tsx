import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import React from 'react';
import { View } from 'react-native';

import { useTheme } from '@/theme';
import type { ISODate } from '@/types';
import { Card, Chip, Divider, IconButton, PressableScale, Text } from '@/ui';

import { clockTime, dayLabel, localDay } from './format';
import { setAnswers, setDayShift, shiftedWorkouts, useImportSession } from './session';
import { deviceTimeZone, zoneLabel } from './timeZones';

/**
 * What the files cannot say for themselves: a CSV's distance unit and time
 * zone, and the date of an old FIT file whose clock was never set.
 */
export function QuestionsView({ todayDate, hour12, onChangeZone }: { todayDate: ISODate; hour12: boolean; onChangeZone: (which: 'csv' | 'fit') => void }) {
  const { spacing } = useTheme();
  const csvFiles = useImportSession((s) => s.csvFiles);
  const systemTimeFiles = useImportSession((s) => s.systemTimeFiles);
  const answers = useImportSession((s) => s.answers);
  const device = deviceTimeZone();
  const zoneText = (z: string | null) => (z ? zoneLabel(z) : device ? `${zoneLabel(device)}, this device` : 'this device’s time zone');

  return (
    <View style={{ gap: spacing.lg }} testID="import-questions">
      <View style={{ gap: spacing.sm }}>
        <Text variant="h1">{csvFiles.length ? (systemTimeFiles.length ? 'A few things to check' : 'Two things to check') : 'Check the day'}</Text>
        <Text variant="body" color="textSecondary">
          {csvFiles.length
            ? 'Garmin’s activities list does not say which units or time zone it uses. Check these so distances and days come out right.'
            : 'This file needs a little help to land on the right day.'}
        </Text>
      </View>

      {csvFiles.length ? (
        <Card style={{ gap: spacing.md }} testID="import-csv-questions">
          <Text variant="overline" numberOfLines={2}>
            {csvFiles.join(', ')}
          </Text>
          <View style={{ gap: spacing.sm }}>
            <Text variant="title">Distances in {csvFiles.length > 1 ? 'these files' : 'this file'} are in</Text>
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <Chip label="Kilometres" selected={answers.distanceUnit === 'km'} onPress={() => setAnswers({ distanceUnit: 'km' })} testID="import-unit-km" />
              <Chip label="Miles" selected={answers.distanceUnit === 'mi'} onPress={() => setAnswers({ distanceUnit: 'mi' })} testID="import-unit-mi" />
            </View>
            <Text variant="caption" color="textSecondary">
              The same as the units in your Garmin Connect account settings when you exported.
            </Text>
          </View>
          <Divider />
          <ZoneLine title={`Times in ${csvFiles.length > 1 ? 'these files' : 'this file'} are local time in`} value={zoneText(answers.csvTimeZone)} onChange={() => onChangeZone('csv')} testID="import-csv-zone" />
          <Text variant="caption" color="textSecondary">
            Change this only if you exported while travelling or your workouts were in another zone. A wrong zone moves every workout by whole hours.
          </Text>
        </Card>
      ) : null}

      {systemTimeFiles.length ? <SystemTimeCard files={systemTimeFiles} todayDate={todayDate} hour12={hour12} zone={zoneText(answers.fitTimeZone)} onChangeZone={() => onChangeZone('fit')} /> : null}
    </View>
  );
}

function ZoneLine({ title, value, onChange, testID }: { title: string; value: string; onChange: () => void; testID: string }) {
  const { spacing } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="title">{title}</Text>
        <Text variant="body" color="textSecondary" testID={`${testID}-value`}>
          {value}
        </Text>
      </View>
      <PressableScale testID={`${testID}-change`} accessibilityLabel={`Change time zone, now ${value}`} onPress={onChange} hitSlop={8} style={{ minHeight: 44, justifyContent: 'center', paddingLeft: spacing.md }}>
        <Text variant="label" color="text" style={{ textDecorationLine: 'underline' }}>
          Change
        </Text>
      </PressableScale>
    </View>
  );
}

/** An old FIT file whose clock was never set: show the start it got and let the person correct the zone and the day. */
function SystemTimeCard({ files, todayDate, hour12, zone, onChangeZone }: { files: string[]; todayDate: ISODate; hour12: boolean; zone: string; onChangeZone: () => void }) {
  const { colors, spacing } = useTheme();
  const shifts = useImportSession((s) => s.dayShift);
  const batches = useImportSession((s) => s.batches);
  const all = shiftedWorkouts(batches, shifts);
  return (
    <Card style={{ gap: spacing.md }} testID="import-fit-questions">
      <Text variant="title">When was this recorded?</Text>
      <Text variant="body" color="textSecondary">
        The watch’s clock was not set, so the start comes from its own time. Check the day before importing.
      </Text>
      {files.map((file) => {
        const first = all.find((w) => w.fileName === file || w.fileName.startsWith(`${file}/`));
        if (!first) return null;
        const shift = shifts[file] ?? 0;
        const day = localDay(first);
        return (
          <View key={file} style={{ gap: spacing.sm }}>
            <Text variant="overline" numberOfLines={1}>
              {file}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
              <IconButton accessibilityLabel="One day earlier" testID="import-fit-day-prev" onPress={() => setDayShift(file, shift - 1)}>
                <ChevronLeft size={20} color={colors.text} strokeWidth={2.2} />
              </IconButton>
              <View style={{ flex: 1, alignItems: 'center' }}>
                <Text variant="bodyStrong" testID="import-fit-day">
                  {dayLabel(day, todayDate)}
                </Text>
                <Text variant="caption" color="textSecondary">
                  Started at {clockTime(first, hour12)}
                </Text>
              </View>
              <IconButton accessibilityLabel="One day later" testID="import-fit-day-next" disabled={day >= todayDate} onPress={() => setDayShift(file, shift + 1)}>
                <ChevronRight size={20} color={colors.text} strokeWidth={2.2} />
              </IconButton>
            </View>
          </View>
        );
      })}
      <Divider />
      <ZoneLine title="Its clock showed local time in" value={zone} onChange={onChangeZone} testID="import-fit-zone" />
    </Card>
  );
}
