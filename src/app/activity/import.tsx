import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { FlatList, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { entriesToSave, netChange } from '@/features/import';
import { ActivitySheet } from '@/features/import/ui/ActivitySheet';
import { DoneView } from '@/features/import/ui/DoneView';
import { countRows, fileNotes, filterRows, workouts, type RowFilter } from '@/features/import/ui/format';
import { pickGarminFiles } from '@/features/import/ui/pickFiles';
import { QuestionsView } from '@/features/import/ui/QuestionsView';
import { ReadingView } from '@/features/import/ui/ReadingView';
import { FileNotes, ListControls, SummaryCard, TextLink } from '@/features/import/ui/ReviewHeader';
import {
  commitImport,
  confirmAnswers,
  pickActivity,
  replaceHandLogged,
  resetImport,
  restoreDeleted,
  selectAll,
  setAnswers,
  setEstimateIntensity,
  startWithFiles,
  toggleRow,
  useImportSession,
} from '@/features/import/ui/session';
import { StartView } from '@/features/import/ui/StartView';
import { TimeZoneSheet } from '@/features/import/ui/TimeZoneSheet';
import { deviceTimeZone, zoneLabel } from '@/features/import/ui/timeZones';
import { WorkoutRow } from '@/features/import/ui/WorkoutRow';
import { prefers12h } from '@/features/settings/components';
import { startOfWeek } from '@/lib/dates';
import { formatNumber } from '@/lib/units';
import { useToday } from '@/store/clock';
import { useProfile } from '@/store/selectors';
import { useTheme } from '@/theme';
import { Button, Card, Divider, EmptyState, Header, Screen, Text, toast } from '@/ui';

/** /activity/import: bring workouts exported from Garmin Connect into the app. */
export default function ImportScreen() {
  const { spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const profile = useProfile();
  const todayDate = useToday();
  const hour12 = prefers12h(profile.units);

  const phase = useImportSession((s) => s.phase);
  const progress = useImportSession((s) => s.progress);
  const failed = useImportSession((s) => s.failed);
  const rows = useImportSession((s) => s.rows);
  const batches = useImportSession((s) => s.batches);
  const csvFiles = useImportSession((s) => s.csvFiles);
  const answers = useImportSession((s) => s.answers);
  const result = useImportSession((s) => s.result);

  const [picking, setPicking] = useState(false);
  const [filter, setFilter] = useState<RowFilter>('all');
  const [choosing, setChoosing] = useState<string | null>(null);
  const [zoneFor, setZoneFor] = useState<'csv' | 'fit' | null>(null);

  // Every visit starts fresh; the picked bytes are dropped when the screen closes.
  useEffect(() => {
    resetImport();
    return () => resetImport();
  }, []);

  const choose = async () => {
    setPicking(true);
    try {
      const picked = await pickGarminFiles();
      if (!picked) return;
      if (!picked.files.length) {
        useImportSession.setState({ failed: picked.failed });
        return;
      }
      setFilter('all');
      await startWithFiles(picked.files, picked.failed);
    } catch {
      toast('The files could not be opened. Try again.');
    } finally {
      setPicking(false);
    }
  };

  const counts = countRows(rows);
  const toSave = entriesToSave(rows);
  // An update changes a day by the difference from what is stored, not by its full figure.
  const addedKcal = Math.round(rows.filter((r) => r.selected).reduce((s, r) => s + netChange(r).kcalNet, 0));
  const updating = rows.filter((r) => r.selected && r.status === 'update').length;
  const visible = filterRows(rows, filter);
  const notes = fileNotes(batches, rows.map((r) => r.workout));
  const estimates = rows.filter((r) => r.entry && !r.entry.measured && r.status !== 'already-imported' && r.status !== 'duplicate-in-file').length;
  const choosingRow = rows.find((r) => r.key === choosing) ?? null;
  const device = deviceTimeZone();
  const csvLine = csvFiles.length
    ? `CSV read in ${answers.distanceUnit === 'km' ? 'kilometres' : 'miles'}, times in ${answers.csvTimeZone ? zoneLabel(answers.csvTimeZone) : device ? zoneLabel(device) : 'this device’s zone'}.`
    : null;

  const header = <Header title="Import from Garmin" subtitle={phase === 'review' && batches.length ? (batches.length === 1 ? batches[0].name : `${batches.length} files`) : undefined} />;

  const sheets = (
    <>
      <ActivitySheet row={choosingRow} rows={rows} onClose={() => setChoosing(null)} onPick={pickActivity} />
      <TimeZoneSheet
        visible={zoneFor !== null}
        value={zoneFor === 'fit' ? answers.fitTimeZone : answers.csvTimeZone}
        onClose={() => setZoneFor(null)}
        onPick={(z) => setAnswers(zoneFor === 'fit' ? { fitTimeZone: z } : { csvTimeZone: z })}
      />
    </>
  );

  if (phase === 'review') {
    const nothing = rows.length === 0;
    const allLocked = !nothing && counts.locked === counts.total;
    const footer = nothing ? (
      <Button testID="import-choose-again" title="Choose other files" onPress={() => void choose()} loading={picking} />
    ) : (
      <View style={{ gap: spacing.sm }}>
        <Text variant="caption" color="textSecondary" align="center" testID="import-footer-line">
          {toSave.length
            ? `${updating ? 'Changes the budget by ' : ''}${addedKcal < 0 ? '−' : '+'}${formatNumber(Math.abs(addedKcal))} kcal above resting, across ${new Set(toSave.map((e) => e.date)).size === 1 ? 'one day' : `${new Set(toSave.map((e) => e.date)).size} days`}`
            : allLocked
              ? 'Everything in these files is already in HealthCal.'
              : 'Tick the workouts to import.'}
        </Text>
        <Button
          testID="import-submit"
          title={!toSave.length ? 'Nothing to import' : updating === toSave.length ? `Update ${workouts(updating)}` : `Import ${workouts(toSave.length)}`} disabled={!toSave.length} onPress={commitImport} />
      </View>
    );
    return (
      <Screen scroll={false} header={header} footer={footer} testID="import-screen">
        {nothing ? (
          <ScrollView contentContainerStyle={{ gap: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xxl }} showsVerticalScrollIndicator={false}>
            <Card testID="import-nothing">
              <EmptyState
                title="No workouts in these files"
                message="Nothing here could be imported. The notes below say why for each file. Garmin’s Export Original, TCX, GPX and the Activities list CSV all work."
              />
            </Card>
            <FileNotes notes={notes} />
          </ScrollView>
        ) : (
          <FlatList
            testID="import-list"
            data={visible}
            keyExtractor={(r) => r.key}
            initialNumToRender={12}
            maxToRenderPerBatch={16}
            windowSize={9}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingTop: spacing.sm, paddingBottom: spacing.xxl + insets.bottom }}
            ItemSeparatorComponent={RowDivider}
            ListHeaderComponent={
              <View style={{ gap: spacing.lg, paddingBottom: spacing.sm }}>
                <SummaryCard counts={counts} addedKcal={addedKcal} csvLine={csvLine} onChangeCsv={() => useImportSession.setState({ phase: 'questions' })} />
                <FileNotes notes={notes} />
                {counts.deletedBefore > 1 ? (
                  <Card tone="alt" style={{ gap: spacing.xs }}>
                    <Text variant="body" color="text">
                      {workouts(counts.deletedBefore)} were imported before and then deleted.
                    </Text>
                    <TextLink testID="import-restore-all" label="Restore them all" onPress={() => restoreDeleted(rows.filter((r) => r.match?.deleted).map((r) => r.key))} />
                  </Card>
                ) : null}
                <ListControls
                  counts={counts}
                  filter={filter}
                  onFilter={setFilter}
                  onSelectAll={selectAll}
                  estimates={estimates}
                  intensity={answers.estimateIntensity}
                  onIntensity={setEstimateIntensity}
                />
              </View>
            }
            ListEmptyComponent={
              <Text variant="body" color="textSecondary" style={{ paddingVertical: spacing.lg }}>
                No workouts in this view.
              </Text>
            }
            ListFooterComponent={
              <View style={{ paddingTop: spacing.lg, alignItems: 'flex-start' }}>
                <TextLink testID="import-other-files" label="Choose other files" onPress={() => void choose()} />
              </View>
            }
            renderItem={({ item }) => (
              <WorkoutRow row={item} units={profile.units} hour12={hour12} todayDate={todayDate} onToggle={toggleRow} onChoose={setChoosing} onRestore={(k) => restoreDeleted([k])} onReplace={replaceHandLogged} />
            )}
          />
        )}
        {sheets}
      </Screen>
    );
  }

  const footer =
    phase === 'start' ? (
      <Button testID="import-choose-files" title="Choose files" onPress={() => void choose()} loading={picking} />
    ) : phase === 'questions' ? (
      <Button testID="import-continue" title="Continue" onPress={() => void confirmAnswers()} />
    ) : phase === 'done' && result ? (
      result.undone ? undefined : (
        <Button
          testID="import-see-train"
          title="See them in Train"
          onPress={() => {
            const newest = result.entries.reduce((m, e) => (e.date > m ? e.date : m), result.entries[0].date);
            router.replace(`/train?week=${startOfWeek(newest)}` as never);
          }}
        />
      )
    ) : undefined;

  return (
    <Screen header={header} footer={footer} testID="import-screen">
      {phase === 'start' ? <StartView failed={failed} /> : null}
      {phase === 'reading' ? <ReadingView progress={progress} /> : null}
      {phase === 'questions' ? <QuestionsView todayDate={todayDate} hour12={hour12} onChangeZone={setZoneFor} /> : null}
      {phase === 'done' && result ? <DoneView entries={result.entries} previous={result.previous} undone={result.undone} todayDate={todayDate} onStartOver={resetImport} /> : null}
      {sheets}
    </Screen>
  );
}

function RowDivider() {
  return <Divider inset={34} />;
}
