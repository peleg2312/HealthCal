import { router } from 'expo-router';
import { Cloud, CloudOff, LogOut, RefreshCw, ShieldCheck, Smartphone, Trash2 } from 'lucide-react-native';
import React, { useState } from 'react';
import { View } from 'react-native';

import { Group, IconTile } from '@/features/settings/components';
import { timeAgo } from '@/features/settings/format';
import { deleteAccount, signOut, useAuth } from '@/services/auth';
import { cancelAllReminders } from '@/services/notifications';
import { isBackendConfigured } from '@/services/supabase';
import { syncNow, useSyncState } from '@/services/sync';
import { pendingChanges, useStore } from '@/store';
import { useTheme } from '@/theme';
import { Button, Card, ConfirmSheet, Header, ListRow, Screen, Sheet, Text, toast } from '@/ui';

export default function AccountScreen() {
  const session = useAuth((s) => s.session);
  return (
    <Screen header={<Header title="Account and sync" />}>{session ? <SignedIn email={session.user.email ?? 'Signed in'} /> : <SignedOut />}</Screen>
  );
}

function Benefit({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  const { spacing } = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' }}>
      {icon}
      <View style={{ flex: 1 }}>
        <Text variant="bodyStrong">{title}</Text>
        <Text variant="caption" color="textSecondary">
          {text}
        </Text>
      </View>
    </View>
  );
}

function SignedOut() {
  const { colors, spacing } = useTheme();
  const sessionLost = useAuth((s) => s.sessionLost);
  const pending = useStore(pendingChanges);
  if (sessionLost && isBackendConfigured) {
    return (
      <>
        <Card testID="account-session-lost">
          <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center' }}>
            <IconTile color={colors.warning}>
              <CloudOff size={20} color={colors.warning} />
            </IconTile>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text variant="title">Signed out of your account</Text>
              <Text variant="caption" color="textSecondary">
                The session ended, it may have expired or been signed out on another device.
              </Text>
            </View>
          </View>
          <Text variant="body" color="textSecondary" style={{ marginTop: spacing.md }}>
            Your entries are safe on this device{pending > 0 ? `, including ${pending} change${pending === 1 ? '' : 's'} not uploaded yet` : ''}, but nothing new is
            being backed up. Sign in again to resume sync.
          </Text>
          <Button
            testID="account-sign-in-again"
            title="Sign in again"
            style={{ marginTop: spacing.md }}
            onPress={() => router.push('/auth?mode=signin' as never)}
          />
        </Card>
      </>
    );
  }
  return (
    <>
      <Card>
        <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center', marginBottom: spacing.md }}>
          <IconTile color={colors.warning}>
            <Smartphone size={20} color={colors.warning} />
          </IconTile>
          <View style={{ flex: 1 }}>
            <Text variant="title">On this device only</Text>
            <Text variant="caption" color="textSecondary">
              Everything works without an account. Your data stays on this device until you choose otherwise.
            </Text>
          </View>
        </View>
      </Card>

      <Card>
        <Text variant="h3" style={{ marginBottom: spacing.md }}>
          What a free account adds
        </Text>
        <View style={{ gap: spacing.lg }}>
          <Benefit
            icon={<Cloud size={20} color={colors.water} />}
            title="Backup"
            text="A lost or replaced phone does not take your history with it."
          />
          <Benefit
            icon={<RefreshCw size={20} color={colors.primary} />}
            title="Sync across devices"
            text="Log on your phone, review on the web. Changes merge automatically."
          />
          <Benefit
            icon={<ShieldCheck size={20} color={colors.weight} />}
            title="Yours to take or delete"
            text="Export everything any time, and delete the account with one confirmation."
          />
        </View>
      </Card>

      {isBackendConfigured ? (
        <View style={{ gap: spacing.sm }}>
          <Button testID="account-signup" title="Create an account" onPress={() => router.push('/auth?mode=signup' as never)} />
          <Button testID="account-signin" title="I already have an account" variant="secondary" onPress={() => router.push('/auth?mode=signin' as never)} />
          <Text variant="caption" color="textTertiary" align="center">
            What you have logged so far is uploaded to the new account.
          </Text>
        </View>
      ) : (
        <Card tone="alt">
          <Text variant="bodyStrong">Accounts are not set up in this build</Text>
          <Text variant="caption" color="textSecondary" style={{ marginTop: 4 }}>
            You can still keep a copy of everything: export a backup from Your data and import it on another device.
          </Text>
          <Button title="Go to Your data" variant="secondary" size="md" style={{ marginTop: spacing.md }} onPress={() => router.push('/settings/data')} />
        </Card>
      )}
    </>
  );
}

function SignedIn({ email }: { email: string }) {
  const { colors, spacing } = useTheme();
  const sync = useSyncState();
  const lastSyncedAt = useStore((s) => s.lastSyncedAt);
  const pending = useStore(pendingChanges);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState<'signout' | 'delete' | null>(null);
  /** Message from a sign-out that stopped because changes are not backed up. */
  const [signOutBlocked, setSignOutBlocked] = useState<string | null>(null);

  const when = timeAgo(sync.lastRunAt ?? lastSyncedAt);
  const status =
    sync.status === 'syncing'
      ? 'Syncing now'
      : sync.status === 'offline'
        ? 'Offline. Changes upload when you are back online.'
        : sync.status === 'error'
          ? `Sync paused: ${sync.error ?? 'unknown error'}`
          : when
            ? `Last synced ${when}`
            : 'Not synced yet';

  const doSignOut = async (discardPending = false) => {
    setConfirmSignOut(false);
    setSignOutBlocked(null);
    setBusy('signout');
    const res = await signOut({ discardPending });
    setBusy(null);
    if (!res.ok) {
      // Nothing was removed: offer to try again or to sign out anyway.
      setSignOutBlocked(res.message);
      return;
    }
    await cancelAllReminders();
    router.replace('/welcome');
  };

  const doDelete = async () => {
    setConfirmDelete(false);
    setBusy('delete');
    const res = await deleteAccount();
    setBusy(null);
    if (!res.ok) {
      toast(res.message);
      return;
    }
    await cancelAllReminders();
    router.replace('/welcome');
  };

  return (
    <>
      <Card>
        <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center' }}>
          <IconTile color={sync.status === 'idle' ? colors.success : colors.warning}>
            {sync.status === 'offline' ? <CloudOff size={20} color={colors.warning} /> : <Cloud size={20} color={sync.status === 'idle' ? colors.success : colors.warning} />}
          </IconTile>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text variant="title" numberOfLines={1} testID="account-email">
              {email}
            </Text>
            <Text variant="caption" color={sync.status === 'error' ? 'warning' : 'textSecondary'}>
              {status}
            </Text>
          </View>
        </View>
        <Text variant="caption" color="textSecondary" style={{ marginTop: spacing.md }}>
          {pending === 0 ? 'Everything on this device is backed up.' : `${pending} change${pending === 1 ? '' : 's'} waiting to upload.`}
        </Text>
        {sync.rejected > 0 ? (
          <Text variant="caption" color="warning" style={{ marginTop: spacing.xs }} testID="account-sync-rejected">
            {sync.rejected === 1 ? '1 item was not accepted by the server.' : `${sync.rejected} items were not accepted by the server.`} {sync.rejected === 1 ? 'It is' : 'They are'} safe on this
            device and will be tried again. Everything else is backed up.
          </Text>
        ) : null}
        <Button
          testID="account-sync-now"
          title="Sync now"
          variant="secondary"
          size="md"
          loading={sync.status === 'syncing'}
          icon={<RefreshCw size={18} color={colors.text} />}
          style={{ marginTop: spacing.md }}
          onPress={() => void syncNow().then(() => useSyncState.getState().status === 'idle' && toast('Synced'))}
        />
      </Card>

      <Group title="Session">
        <ListRow
          testID="account-sign-out"
          title="Sign out"
          subtitle="Removes your data from this device. It stays in your account."
          left={
            <IconTile color={colors.textSecondary}>
              <LogOut size={20} color={colors.textSecondary} />
            </IconTile>
          }
          onPress={() => setConfirmSignOut(true)}
        />
      </Group>

      <Group title="Delete" footer="Want a copy first? Export a backup from Your data before deleting.">
        <ListRow
          testID="account-delete"
          title="Delete account"
          subtitle="Erases your account and everything in it"
          left={
            <IconTile color={colors.danger}>
              <Trash2 size={20} color={colors.danger} />
            </IconTile>
          }
          onPress={() => setConfirmDelete(true)}
        />
      </Group>

      {busy ? (
        <Text variant="caption" color="textSecondary" align="center">
          {busy === 'signout' ? 'Uploading the last changes and signing out' : 'Deleting your account'}
        </Text>
      ) : null}

      <ConfirmSheet
        visible={confirmSignOut}
        title="Sign out?"
        message={
          pending > 0
            ? `${pending} change${pending === 1 ? ' has' : 's have'} not reached your account yet. HealthCal will try to upload ${pending === 1 ? 'it' : 'them'} first; if you are offline ${pending === 1 ? 'it' : 'they'} will be lost. Your data is then removed from this device and comes back when you sign in again.`
            : 'Your data is removed from this device and stays safe in your account. Sign in again to get it back.'
        }
        confirmLabel="Sign out"
        destructive={pending > 0}
        onConfirm={() => void doSignOut()}
        onCancel={() => setConfirmSignOut(false)}
      />
      <Sheet
        visible={signOutBlocked !== null}
        onClose={() => setSignOutBlocked(null)}
        title="Changes not backed up"
        footer={
          <View style={{ gap: 10 }}>
            <Button testID="account-sign-out-retry" title="Try again" onPress={() => void doSignOut()} />
            <Button testID="account-sign-out-anyway" title="Sign out anyway" variant="danger" onPress={() => void doSignOut(true)} />
            <Button testID="account-sign-out-keep" title="Stay signed in" variant="ghost" onPress={() => setSignOutBlocked(null)} />
          </View>
        }>
        <Text variant="body" color="textSecondary">
          {signOutBlocked}
        </Text>
      </Sheet>
      <ConfirmSheet
        visible={confirmDelete}
        title="Delete your account?"
        message={
          'This permanently erases your account and everything stored with it: every food, activity, weight, water, sleep and fasting entry, your custom foods and saved meals, your profile, goals and settings. It also removes the data from this device and turns off reminders. This cannot be undone.'
        }
        confirmLabel="Delete account and data"
        destructive
        onConfirm={() => void doDelete()}
        onCancel={() => setConfirmDelete(false)}
      />
    </>
  );
}
