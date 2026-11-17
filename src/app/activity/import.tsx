import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { FlatList, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { entriesToSave, netChange } from '@/features/import';
import { ActivitySheet } from '@/features/import/ui/ActivitySheet';
import { DoneView, doneTitle } from '@/features/import/ui/DoneView';
import { countRows, fileNotes, filterRows, paceSetsEffort, workouts, type RowFilter } from '@/features/import/ui/format';
import { useHealthSync } from '@/features/health-sync/store';
import { pickGarminFiles } from '@/features/import/ui/pickFiles';
import { QuestionsView, questionsTitle } from '@/features/import/ui/QuestionsView';
import { ReadingView } from '@/features/import/ui/ReadingView';
import { FileNotes, ListControls, SummaryCard, TextLink } from '@/features/import/ui/ReviewHeader';
import {
  cancelImport,
  commitImport,
  confirmAnswers,
  extrasPart,
  leaveImport,
  pickActivity,
  replaceHandLogged,
  resetImport,
  restoreDeleted,
  selectAll,
  setAnswers,
  setEstimateIntensity,
  sleepNightCount,
  sleepPlanOf,
  startWithFiles,
  stepDayCount,
  toggleRow,
  useImportSession,
} from '@/features/import/ui/session';
import { StartView } from '@/features/import/ui/StartView';
import { TimeZoneSheet } from '@/features/import/ui/TimeZoneSheet';
import { deviceTimeZone, zoneLabel } from '@/features/import/ui/timeZones';
import { WorkoutRow } from '@/features/import/ui/WorkoutRow';
import { prefers12h } from '@/features/settings/components';
import { startOfWeek } from '@/lib/dates';
import { ViewerBlockedError } from '@/services/viewer';
import { formatNumber } from '@/lib/units';
import { useStore } from '@/store';
import { useToday } from '@/store/clock';
import { useProfile } from '@/store/selectors';
import { useTheme } from '@/theme';
import { Button, Card, Divider, EmptyState, Header, Screen, Text, toast } from '@/ui';

/** /activity/import: bring in workouts from files: Garmin Connect's exports, or the Health app's export (workouts, steps and sleep). */
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
  const systemTimeFiles = useImportSession((s) => s.systemTimeFiles);
  const answers = useImportSession((s) => s.answers);
  const result = useImportSession((s) => s.result);
  const exports = useImportSession((s) => s.exports);
  const sleepRecords = useStore((s) => s.sleep);
  const handled = useHealthSync((s) => s.handled);

  const [picking, setPicking] = useState(false);
  const [filter, setFilter] = useState<RowFilter>('all');
  const [choosing, setChoosing] = useState<string | null>(null);
  const [zoneFor, setZoneFor] = useState<'csv' | 'fit' | null>(null);

  // Every visit starts fresh. Leaving (X, back, another screen) stops a read under way and drops what it read: nothing is saved but by Import.
  useEffect(() => {
    resetImport();
    return () => leaveImport();
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
    } catch (e) {
      toast(e instanceof ViewerBlockedError ? e.message : 'The files could not be opened. Try again.');
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
  // A Health export's own notes (steps to save, a session listed once, a rest left out) are information: under the list, so the workouts to check come first.
  const infoOnly = (n: (typeof notes)[number]) => n.errors.length === 0 && n.warnings.length > 0 && n.warnings.every((w) => w.code.startsWith('apple-'));
  const topNotes = notes.filter((n) => !infoOnly(n));
  const bottomNotes = notes.filter(infoOnly);
  // Days of steps a Health export read here would save with the import (0: none).
  const stepDays = stepDayCount(exports);
  // Nights a Health export read here would write to the sleep log with the import (0: none; a hand-entered or better night stays).
  const nights = sleepNightCount(sleepPlanOf(exports, Object.values(sleepRecords), handled));
  const stepsPart = extrasPart(stepDays, nights);
  const extras = stepDays > 0 || nights > 0;
  const estimateRows = rows.filter((r) => r.entry && !r.entry.measured && r.status !== 'already-imported' && r.status !== 'duplicate-in-file');
  const estimates = estimateRows.length;
  const paced = estimateRows.filter((r) => paceSetsEffort(r)).length;
  const choosingRow = rows.find((r) => r.key === choosing) ?? null;
  const device = deviceTimeZone();
  const csvLine = csvFiles.length
    ? `CSV read in ${answers.distanceUnit === 'km' ? 'kilometres' : 'miles'}, times in ${answers.csvTimeZone ? zoneLabel(answers.csvTimeZone) : device ? zoneLabel(device) : 'this device’s zone'}.`
    : null;

  // The share read is on the screen beside the cup, once; the header only says what is happening.
  const readingLine = progress?.share !== undefined ? 'Reading the export' : 'Reading the files';
  // The short line under the title says where in the import you are.
  const subtitle =
    phase === 'review' && batches.length
      ? batches.length === 1
        ? batches[0].name
        : `${batches.length} files`
      : phase === 'questions'
        ? questionsTitle(csvFiles.length, systemTimeFiles.length)
        : phase === 'done' && result
          ? doneTitle(result.entries, result.previous, result.undone, result.steps?.days ?? 0, result.sleep?.nights ?? 0)
          : phase === 'reading'
            ? readingLine
            : 'Garmin files or Health export';
  const header = <Header title="Import workouts" close subtitle={subtitle} />;

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
    const dayCount = new Set(toSave.map((e) => e.date)).size;
    // Nothing to import (no workouts, or every one already in HealthCal) and no steps or nights: the one useful action is other files.
    const footer =
      (nothing || allLocked) && !extras ? (
        <Button testID="import-choose-again" title="Choose other files" onPress={() => void choose()} loading={picking} />
      ) : (
        <View style={{ gap: spacing.sm }}>
          <Text variant="caption" color="textSecondary" align="center" testID="import-footer-line">
            {/* The kcal is the summary's large number; the footer says only where it goes (and an update's change, which the summary does not show), and the steps that go in with it. */}
            {toSave.length
              ? `${updating && addedKcal <= 0 ? `Changes the budget by ${addedKcal < 0 ? '−' : '+'}${formatNumber(Math.abs(addedKcal))} kcal, across ` : 'Goes to '}${dayCount === 1 ? 'one day' : `${dayCount} days`}${stepsPart ? `, with ${stepsPart}` : ''}`
              : extras
                ? nothing || allLocked
                  ? nights && !stepDays
                    ? 'Nights go to your sleep log.'
                    : `Steps show on Train and are never added to your calories.${nights ? ' Nights go to your sleep log.' : ''}`
                  : `No workouts ticked: only the ${stepDays && nights ? 'steps and sleep are' : nights ? 'sleep is' : 'steps are'} saved.`
                : 'Tick the workouts to import.'}
          </Text>
          <Button
            testID="import-submit"
            title={
              toSave.length
                ? updating === toSave.length
                  ? `Update ${workouts(updating)}`
                  : `Import ${workouts(toSave.length)}`
                : stepDays && nights
                  ? 'Save steps and sleep'
                  : extras
                    ? `Save ${stepsPart}`
                    : 'Nothing to import'
            }
            disabled={!toSave.length && !extras}
            onPress={commitImport}
          />
        </View>
      );
    return (
      <Screen scroll={false} header={header} footer={footer} testID="import-screen">
        {nothing ? (
          <ScrollView contentContainerStyle={{ gap: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xxl }} showsVerticalScrollIndicator={false}>
            <Card testID="import-nothing">
              <EmptyState
                title="No workouts in these files"
                message={
                  extras
                    ? `The ${stepDays && nights ? 'steps and sleep' : nights ? 'sleep' : 'steps'} in them can still be saved. The notes below say more for each file.`
                    : 'The notes below say why for each file.'
                }
              />
            </Card>
            <FileNotes notes={notes} />
            {extras ? (
              <View style={{ alignItems: 'flex-start' }}>
                <TextLink testID="import-other-files" label="Choose other files" onPress={() => void choose()} />
              </View>
            ) : null}
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
                <FileNotes notes={topNotes} />
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
                  paced={paced}
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
              allLocked && !bottomNotes.length && !extras ? undefined : (
                <View style={{ paddingTop: spacing.lg, gap: spacing.lg }}>
                  <FileNotes notes={bottomNotes} />
                  {allLocked && !extras ? null : (
                    <View style={{ alignItems: 'flex-start' }}>
                      <TextLink testID="import-other-files" label="Choose other files" onPress={() => void choose()} />
                    </View>
                  )}
                </View>
              )
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
) : phase === 'reading' && progress?.share !== undefined ? (
      <Button testID="import-cancel" title="Cancel" variant="secondary" onPress={cancelImport} />
    ) : phase === 'questions' ? (
      <Button testID="import-continue" title="Continue" onPress={() => void confirmAnswers()} />
    ) : phase === 'done' && result ? (
      result.undone ? undefined : (
        <Button
          testID="import-see-train"
          title={!result.entries.length && result.sleep && !result.steps ? 'See your sleep log' : 'See them in Train'}
          onPress={() => {
            // Steps only: this week's card, where today's steps show. Sleep only: the sleep log.
            if (!result.entries.length) return router.replace((result.sleep && !result.steps ? '/sleep' : '/train') as never);
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
      {phase === 'done' && result ? <DoneView entries={result.entries} previous={result.previous} undone={result.undone} stepsDays={result.steps?.days ?? 0} nights={result.sleep?.nights ?? 0} todayDate={todayDate} onStartOver={resetImport} /> : null}
      {sheets}
    </Screen>
  );
}

function RowDivider() {
  return <Divider inset={34} />;
}
