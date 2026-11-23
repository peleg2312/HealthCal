import { router } from 'expo-router';
import { Activity, Archive, Droplets, FileUp, Scale, Trash2, Utensils } from 'lucide-react-native';
import React, { useState } from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';

import { Group, IconTile } from '@/features/settings/components';
import { applyLastBackupProfile, exportData, pickAndImportBackup, type ExportKind, type ImportResult } from '@/services/export';
import { signOut, useAuth } from '@/services/auth';
import { cancelAllReminders } from '@/services/notifications';
import { useStore } from '@/store';
import { useLive } from '@/store/selectors';
import { useTheme } from '@/theme';
import { Card, ConfirmSheet, Header, ListRow, Screen, Text, toast } from '@/ui';

export default function DataScreen() {
  const { colors, spacing } = useTheme();
  const food = useLive('foodEntries');
  const activities = useLive('activities');
  const weights = useLive('weights');
  const water = useLive('water');
  const sleep = useLive('sleep');
  const customFoods = useLive('customFoods');
  const signedIn = useAuth((s) => !!s.session);
  const onboarded = useStore((s) => !!s.profile?.onboardedAt);
  const [busy, setBusy] = useState<ExportKind | 'import' | null>(null);
  const [confirmErase, setConfirmErase] = useState(false);
  /** An import whose backup profile was not applied because this device has a newer one. */
  const [askProfile, setAskProfile] = useState<Extract<ImportResult, { ok: true }> | null>(null);

  const verb = Platform.OS === 'web' ? 'Downloaded' : 'Exported';

  const run = async (kind: ExportKind) => {
    setBusy(kind);
    const res = await exportData(kind);
    setBusy(null);
    if (res.ok) toast(`${verb} ${res.fileName}`);
    else toast(res.message);
  };

  const runImport = async () => {
    setBusy('import');
    const res = await pickAndImportBackup();
    setBusy(null);
    if (!res.ok) {
      if (!res.canceled) toast(res.message);
      return;
    }
    if (res.profileSkipped) {
      setAskProfile(res);
      return;
    }
    toast(importMessage(res));
  };

  const answerProfile = (useBackup: boolean) => {
    const first = askProfile;
    setAskProfile(null);
    if (!first) return;
    if (!useBackup) {
      toast(importMessage(first));
      return;
    }
    const res = applyLastBackupProfile();
    toast(res.ok ? importMessage({ ...res, added: first.added, updated: first.updated, skipped: first.skipped }) : res.message);
  };

  const erase = async () => {
    setConfirmErase(false);
    await cancelAllReminders();
    // Signed in, erasing this device means signing out: otherwise the next sync would bring everything back.
    // The person chose to erase this device, so changes that never reached the account go too (the sheet says so).
    if (signedIn) {
      const res = await signOut({ discardPending: true });
      if (!res.ok) {
        toast(res.message);
        return;
      }
    } else useStore.getState().resetAll();
    router.replace('/welcome');
  };

  const spinner = (k: ExportKind | 'import') => (busy === k ? <ActivityIndicator color={colors.textSecondary} /> : undefined);
  const count = (n: number, one: string, many: string) => `${n.toLocaleString()} ${n === 1 ? one : many}`;
  const fileAction = Platform.OS === 'web' ? 'Download' : 'Share';

  return (
    <Screen header={<Header title="Your data" subtitle="Export, import or erase" />}>
      <Card tone="alt">
        <Text variant="bodyStrong">It is yours</Text>
        <Text variant="caption" color="textSecondary" style={{ marginTop: 4 }}>
          {count(food.length, 'food entry', 'food entries')}, {count(activities.length, 'activity', 'activities')}, {count(weights.length, 'weigh-in', 'weigh-ins')},{' '}
          {count(water.length, 'drink', 'drinks')}, {count(sleep.length, 'night', 'nights')} of sleep and {count(customFoods.length, 'custom food', 'custom foods')}.
          Take all of it with you at any time.
        </Text>
      </Card>

      <Group title="Full backup" footer="One JSON file with every entry, your profile, goals and settings. Import it here or on another device. The coach chat is kept on this phone and is not in the export.">
        <ListRow
          testID="data-export-backup"
          title="Export everything"
          subtitle={`${fileAction} a JSON backup`}
          left={
            <IconTile color={colors.primary}>
              <Archive size={20} color={colors.primary} />
            </IconTile>
          }
          right={spinner('backup')}
          onPress={() => void run('backup')}
        />
        <ListRow
          testID="data-import"
          title="Import a backup"
          subtitle="Merges by entry; the newer version of each entry is kept"
          left={
            <IconTile color={colors.water}>
              <FileUp size={20} color={colors.water} />
            </IconTile>
          }
          right={spinner('import')}
          onPress={() => void runImport()}
        />
        {/* Workouts need a profile (their calories come from it): before setup only a backup can be restored here. */}
        {onboarded ? (
          <ListRow
            testID="data-import-garmin"
            title="Import from Garmin"
            subtitle="Workouts from FIT, TCX, GPX or the Activities CSV"
            left={
              <IconTile color={colors.exercise}>
                <Activity size={20} color={colors.exercise} />
              </IconTile>
            }
            onPress={() => router.push('/activity/import')}
          />
        ) : null}
      </Group>

      <Group title="Spreadsheets (CSV)" footer="Opens in Excel, Numbers or Google Sheets. Values are metric with the unit in each column name.">
        <ListRow
          testID="data-export-food"
          title="Food diary"
          subtitle={count(food.length, 'entry', 'entries')}
          left={
            <IconTile color={colors.calories}>
              <Utensils size={20} color={colors.calories} />
            </IconTile>
          }
          right={spinner('food')}
          onPress={() => void run('food')}
        />
        <ListRow
          testID="data-export-activities"
          title="Activities"
          subtitle={count(activities.length, 'session', 'sessions')}
          left={
            <IconTile color={colors.exercise}>
              <Activity size={20} color={colors.exercise} />
            </IconTile>
          }
          right={spinner('activities')}
          onPress={() => void run('activities')}
        />
        <ListRow
          testID="data-export-weight"
          title="Weight and measurements"
          subtitle={count(weights.length, 'weigh-in', 'weigh-ins')}
          left={
            <IconTile color={colors.weight}>
              <Scale size={20} color={colors.weight} />
            </IconTile>
          }
          right={spinner('weight')}
          onPress={() => void run('weight')}
        />
        <ListRow
          testID="data-export-water"
          title="Water"
          subtitle={count(water.length, 'drink', 'drinks')}
          left={
            <IconTile color={colors.water}>
              <Droplets size={20} color={colors.water} />
            </IconTile>
          }
          right={spinner('water')}
          onPress={() => void run('water')}
        />
      </Group>

      <Group title="Erase">
        <ListRow
          testID="data-erase"
          title="Erase all data on this device"
          subtitle="Start over with an empty app"
          left={
            <IconTile color={colors.danger}>
              <Trash2 size={20} color={colors.danger} />
            </IconTile>
          }
          onPress={() => setConfirmErase(true)}
        />
      </Group>
      <View style={{ height: spacing.sm }} />

      <ConfirmSheet
        visible={confirmErase}
        title="Erase everything on this device?"
        message={`This removes every food, activity, weight, water, sleep and fasting entry, your custom foods, saved meals, the coach chat and the coach's agreement, profile, goals and settings from this device, and turns off reminders. ${
          signedIn
            ? 'You will also be signed out, and changes that have not been uploaded yet are lost. Your account is not affected: the synced copy stays there and returns when you sign in again. To remove it everywhere, delete your account instead.'
            : 'Without an account there is no other copy, so export a backup first if you might want it later.'
        }`}
        confirmLabel="Erase this device"
        destructive
        onConfirm={() => void erase()}
        onCancel={() => setConfirmErase(false)}
      />
      <ConfirmSheet
        visible={askProfile !== null}
        title="Use the profile and goals from this backup?"
        message={`The entries are merged. This device has a newer profile than the backup, so your current profile, goals and settings were kept. Use the ones from the backup instead?`}
        confirmLabel="Use the backup's profile"
        cancelLabel="Keep my current profile"
        onConfirm={() => answerProfile(true)}
        onCancel={() => answerProfile(false)}
      />
    </Screen>
  );
}

/** Result line for an import: what was merged, whether the profile was restored, and anything skipped. */
function importMessage(res: Extract<ImportResult, { ok: true }>): string {
  const total = res.added + res.updated;
  const skipped = res.skipped > 0 ? ` ${res.skipped} damaged ${res.skipped === 1 ? 'entry was' : 'entries were'} left out.` : '';
  const profile = res.profileRestored ? ' Profile and goals restored from the backup.' : res.profileSkipped ? ' Your current profile and goals were kept.' : '';
  if (total === 0) return `Backup read. Everything in it was already here.${profile}${skipped}`;
  const parts = [res.added > 0 ? `${res.added} new` : '', res.updated > 0 ? `${res.updated} updated` : ''].filter(Boolean).join(' and ');
  return `Imported ${parts} ${total === 1 ? 'entry' : 'entries'}.${profile}${skipped}`;
}
