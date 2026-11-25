import { router } from 'expo-router';
import { Cloud, CloudOff, CreditCard, Info, KeyRound, LogOut, RefreshCw, Shield, Smartphone, Trash2 } from 'lucide-react-native';
import React, { useState } from 'react';
import { useWindowDimensions, View } from 'react-native';

import { authDemo, demoEmail, syncDemo } from '@/features/auth/demo';
import { returnScreenOpen } from '@/features/auth/google';
import { GoogleButton } from '@/features/auth/GoogleButton';
import { lastWordsTogether } from '@/features/auth/lines';
import { syncMark, syncPendingLine, syncStatusLine } from '@/features/auth/syncRow';
import { useGoogleSignIn } from '@/features/auth/useGoogleSignIn';
import { ACCOUNT_UPLOAD_LINE, SIGN_IN, signInMethodLine } from '@/features/auth/words';
import { Note } from '@/features/onboarding/components';
import { deleteAccountWithPlan, sendAddPassword } from '@/features/plan/account';
import { needsPassword } from '@/features/plan/accountRules';
import { usePlan } from '@/features/plan/cache';
import { PLAN_ROUTE } from '@/features/plan/channel';
import { openManage } from '@/features/plan/checkout';
import { PlanGlyph } from '@/features/plan/PlanGlyph';
import { PlanRow } from '@/features/plan/PlanRow';
import { canManageHere, holdsPlus, planVisible } from '@/features/plan/view';
import { ADD_PASSWORD_HINT, ADD_PASSWORD_LABEL, DELETE_ANYWAY_LABEL, DELETE_PLAN_LINE, MANAGE_LABEL, RELEASED_LINE } from '@/features/plan/words';
import { Group, IconTile, InitialsAvatar } from '@/features/settings/components';
import { breakableEmail, timeAgo } from '@/features/settings/format';
import { signOut, useAuth } from '@/services/auth';
import { cancelAllReminders } from '@/services/notifications';
import { isBackendConfigured } from '@/services/supabase';
import { syncNow, useSyncState } from '@/services/sync';
import { pendingChanges, useStore } from '@/store';
import { useNow } from '@/store/clock';
import { fonts, MAX_CONTENT_WIDTH, useTheme } from '@/theme';
import { Button, Card, ConfirmSheet, CupKey, DECORATIVE, Divider, Header, ListRow, Screen, Sheet, Text, toast } from '@/ui';

/** The words of the delete confirmation: what is erased. With a plan held, the plan's line stands over them, set apart. */
const DELETE_ERASES =
  'This permanently erases your account and everything stored with it: every food, activity, weight, water, sleep and fasting entry, your custom foods and saved meals, your profile, goals and settings. It also removes the data from this device and turns off reminders. This cannot be undone.';

/** The sync button's width, so the row does not jump while its title gives way to the spinner. */
const SYNC_BUTTON_W = 116;
/** The least room the sync status needs beside the button before the button goes under it. */
const SYNC_STATUS_MIN = 160;

export default function AccountScreen() {
  const session = useAuth((s) => s.session);
  // A test build's picture of the signed-in view, with no backend (src/features/auth/demo.ts); never in a release.
  const demo = authDemo() === 'signed-in' && !session;
  // The line under the title says how this account signs in.
  const subtitle = session ? signInMethodLine(session.user.identities) : demo ? signInMethodLine([{ provider: 'google' }]) : 'Not signed in';
  return (
    <Screen header={<Header title="Account and sync" subtitle={subtitle} />}>{session || demo ? <SignedIn email={session?.user.email ?? (demo ? demoEmail() : 'Signed in')} /> : <SignedOut />}</Screen>
  );
}

function Benefit({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  const { spacing } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        gap: spacing.md,
        alignItems: 'flex-start',
      }}>
      <View {...DECORATIVE}>{icon}</View>
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
  // The same Google way in as welcome and sign-in: on a phone it ends with a session and the sign-in screen's gate takes over.
  const google = useGoogleSignIn({
    onSignedIn: () => !returnScreenOpen() && router.push('/auth?mode=google' as never),
  });
  const accounts = isBackendConfigured || authDemo() !== null;
  if (sessionLost && isBackendConfigured) {
    return (
      <>
        <Card testID="account-session-lost">
          <View
            style={{
              flexDirection: 'row',
              gap: spacing.md,
              alignItems: 'center',
            }}>
            <IconTile color={colors.warningInk} keep>
              <CloudOff size={20} color={colors.warningInk} />
            </IconTile>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text variant="title">Signed out of your account</Text>
              <Text variant="caption" color="textSecondary">
                The session ended, it may have expired or been signed out on another device.
              </Text>
            </View>
          </View>
          <Text variant="body" color="textSecondary" style={{ marginTop: spacing.md }}>
            Your entries are safe on this device
            {pending > 0 ? `, including ${pending} change${pending === 1 ? '' : 's'} not uploaded yet` : ''}, but nothing new is being backed up. Sign in again to resume sync.
          </Text>
          <Button testID="account-sign-in-again" title="Sign in again" style={{ marginTop: spacing.md }} onPress={() => router.push('/auth?mode=signin' as never)} />
        </Card>
      </>
    );
  }
  return (
    <>
      <Card>
        <View
          style={{
            flexDirection: 'row',
            gap: spacing.md,
            alignItems: 'center',
          }}>
          <IconTile color={colors.warningInk} keep>
            <Smartphone size={20} color={colors.warningInk} />
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
          <Benefit icon={<Cloud size={20} color={colors.textSecondary} strokeWidth={1.9} />} title="Backup" text="A lost or replaced phone does not take your history with it." />
          <Benefit
            icon={<RefreshCw size={20} color={colors.textSecondary} strokeWidth={1.9} />}
            title="Sync across devices"
            text="Log on your phone, review on the web. Changes merge automatically."
          />
          <Benefit
            icon={<Shield size={20} color={colors.textSecondary} strokeWidth={1.9} />}
            title="Yours to take or delete"
            text="Export everything any time, and delete the account with one confirmation."
          />
        </View>
      </Card>

      {accounts ? (
        // Drawn once this visit knows whether Google is offered, so its button never pushes the others down under a finger.
        google.ready ? (
          <View style={{ gap: spacing.sm }}>
            <Button testID="account-signup" title="Create an account" onPress={() => router.push('/auth?mode=signup' as never)} />
            {/* Never the primary: between the two, as wide and as tall as they are. */}
            {google.shown ? <GoogleButton testID="account-google" onPress={google.press} busy={google.busy} /> : null}
            {google.error ? (
              <Note tone="neutral" surface="card" testID="account-google-error" icon={<Info size={18} color={colors.text} />}>
                <Text variant="caption" color="textSecondary" accessibilityLiveRegion="polite">
                  {google.error}
                </Text>
              </Note>
            ) : null}
            {google.notice ? (
              <Note tone="neutral" testID="account-google-off" icon={<Info size={18} color={colors.textSecondary} />}>
                <Text variant="caption" color="textSecondary" accessibilityLiveRegion="polite">
                  {google.notice}
                </Text>
              </Note>
            ) : null}
            {/* One name for one action: "Sign in", as welcome and the form say it. */}
            <Button testID="account-signin" title={SIGN_IN} variant="secondary" onPress={() => router.push('/auth?mode=signin' as never)} />
            <Text variant="caption" color="textTertiary" align="center" accessibilityLabel={ACCOUNT_UPLOAD_LINE}>
              {lastWordsTogether(ACCOUNT_UPLOAD_LINE)}
            </Text>
          </View>
        ) : null
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
  const { width } = useWindowDimensions();
  const name = useStore((s) => s.profile?.name ?? '');
  const liveSync = useSyncState();
  const lastSyncedAt = useStore((s) => s.lastSyncedAt);
  const livePending = useStore(pendingChanges);
  // A test build's picture of the sync row in one of its states (src/features/auth/syncRow.ts); never in a release.
  const demoSync = syncDemo();
  const sync = demoSync ? { ...liveSync, status: demoSync.status, error: demoSync.error } : liveSync;
  const pending = demoSync ? demoSync.pending : livePending;
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState<'signout' | 'delete' | null>(null);
  /** Ending the plan did not work, so the account was kept: why, and whether "Delete anyway" is offered. */
  const [deleteBlocked, setDeleteBlocked] = useState<{
    message: string;
    offerForce: boolean;
  } | null>(null);
  const [passwordBusy, setPasswordBusy] = useState(false);
  const user = useAuth((s) => s.session?.user ?? null);
  const plan = usePlan();
  const showPlan = planVisible(plan);
  const holds = holdsPlus(plan);
  /** Message from a sign-out that stopped because changes are not backed up. */
  const [signOutBlocked, setSignOutBlocked] = useState<string | null>(null);

  // "Last synced 3 min ago" moves on while the screen stays open (never the render's own clock).
  const now = useNow();
  const when = demoSync ? demoSync.when : timeAgo(sync.lastRunAt ?? lastSyncedAt, now);
  const status = syncStatusLine(sync.status, sync.error, when);
  // The key says what the words say: done, waiting or stopped.
  const mark = syncMark({ status: sync.status, pending, synced: !!when });

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

  // With a plan held, the plan is ended first (no further charge) and the account goes only then.
  const doDelete = async (force = false) => {
    setConfirmDelete(false);
    setDeleteBlocked(null);
    setBusy('delete');
    const res = await deleteAccountWithPlan({ force });
    setBusy(null);
    if (res.kind === 'blocked') {
      setDeleteBlocked({ message: res.message, offerForce: res.offerForce });
      return;
    }
    if (res.kind === 'failed') {
      toast(res.message);
      return;
    }
    await cancelAllReminders();
    router.replace('/welcome');
    if (res.released) toast(RELEASED_LINE);
  };

  const addPassword = async () => {
    if (!user?.email || passwordBusy) return;
    setPasswordBusy(true);
    const r = await sendAddPassword(user.email);
    setPasswordBusy(false);
    toast(r.message);
  };

  // The card's inner width: the status keeps at least SYNC_STATUS_MIN beside the button, or the button goes under it, full width.
  const inner = Math.min(width, MAX_CONTENT_WIDTH) - 2 * spacing.xl - 2 * spacing.lg;
  const stacked = inner < SYNC_STATUS_MIN + spacing.md + SYNC_BUTTON_W;
  const KEY = 9;

  return (
    <>
      <Card testID="account-card">
        {/* Who: your tile and your address. A long address wraps at its @ and dots rather than losing its end. */}
        <View
          style={{
            flexDirection: 'row',
            gap: spacing.md,
            alignItems: 'center',
          }}>
          <InitialsAvatar name={name} size={48} />
          <Text variant="body" numberOfLines={3} testID="account-email" accessibilityLabel={email} style={{ flex: 1, minWidth: 0, fontFamily: fonts.semibold }}>
            {breakableEmail(email)}
          </Text>
        </View>
        <View style={{ marginVertical: spacing.md }}>
          <Divider />
        </View>
        {/*
          Sync in one row: a key for the state (a mark, never the words' colour), what it is, and the one action.
          The key is filled ink only when nothing waits and the last sync succeeded, an ink outline while
          changes wait or a sync runs, and amber only when sync is paused or the device is offline.
        */}
        <View
          style={{
            flexDirection: stacked ? 'column' : 'row',
            alignItems: stacked ? 'stretch' : 'center',
            gap: spacing.md,
          }}>
          <View
            style={{
              flex: stacked ? undefined : 1,
              minWidth: 0,
              flexDirection: 'row',
              gap: spacing.sm,
            }}>
            {/* The key sits on the first line of the status (a 17 px caption line). */}
            <View style={{ height: 17, justifyContent: 'center' }}>
              <CupKey size={KEY} variant={mark === 'waiting' ? 'outline' : 'filled'} color={mark === 'stopped' ? colors.warning : colors.success} />
            </View>
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              {/* Both lines keep their last two words together: beside the button the column is narrow, and no line ends on one word alone. */}
              <Text variant="caption" color={sync.status === 'error' ? 'warningInk' : 'text'} testID="account-sync-status" accessibilityLiveRegion="polite" accessibilityLabel={status}>
                {lastWordsTogether(status)}
              </Text>
              <Text variant="caption" color="textSecondary" testID="account-sync-pending" accessibilityLabel={syncPendingLine(pending)}>
                {lastWordsTogether(syncPendingLine(pending))}
              </Text>
            </View>
          </View>
          <Button
            testID="account-sync-now"
            title="Sync now"
            variant="secondary"
            size="sm"
            full={stacked}
            loading={sync.status === 'syncing'}
            icon={<RefreshCw size={16} color={colors.text} />}
            style={stacked ? undefined : { width: SYNC_BUTTON_W }}
            onPress={() => void syncNow().then(() => useSyncState.getState().status === 'idle' && toast('Synced'))}
          />
        </View>
        {sync.rejected > 0 ? (
          <Text variant="caption" color="warningInk" style={{ marginTop: spacing.sm, marginLeft: KEY + spacing.sm }} testID="account-sync-rejected">
            {sync.rejected === 1 ? '1 item was not accepted by the server.' : `${sync.rejected} items were not accepted by the server.`} {sync.rejected === 1 ? 'It is' : 'They are'} safe on this
            device and will be tried again. Everything else is backed up.
          </Text>
        ) : null}
      </Card>

      {showPlan ? (
        <Group title="Plan">
          <PlanRow testID="account-plan" />
          {holds ? (
            <ListRow
              testID="account-plan-manage"
              title={MANAGE_LABEL}
              subtitle={canManageHere(plan) ? "On the payment company's page" : 'Where the plan was bought'}
              left={
                <IconTile color={colors.textSecondary}>
                  <CreditCard size={20} color={colors.textSecondary} />
                </IconTile>
              }
              onPress={() => {
                if (!canManageHere(plan)) {
                  router.push(PLAN_ROUTE as never);
                  return;
                }
                void openManage().then((r) => {
                  if (!r.ok) toast(r.message);
                });
              }}
            />
          ) : null}
        </Group>
      ) : null}

      <Group title="Session">
        {needsPassword(user) ? (
          <ListRow
            testID="account-add-password"
            title={ADD_PASSWORD_LABEL}
            subtitle={passwordBusy ? 'Sending the link' : ADD_PASSWORD_HINT}
            left={
              <IconTile color={colors.textSecondary}>
                <KeyRound size={20} color={colors.textSecondary} />
              </IconTile>
            }
            onPress={() => void addPassword()}
          />
        ) : null}
        <ListRow
          testID="account-sign-out"
          title="Sign out"
          subtitle="Clears this device, not your account"
          left={
            <IconTile color={colors.textSecondary}>
              <LogOut size={20} color={colors.textSecondary} />
            </IconTile>
          }
          onPress={() => setConfirmSignOut(true)}
        />
      </Group>

      <Group title="Delete" footer="Want a copy first? Export it from Your data.">
        <ListRow
          testID="account-delete"
          title="Delete account"
          subtitle="Erases the account and its data"
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
      {holds ? (
        // With a plan held, what happens to it comes first and is set apart, not buried in the paragraph. The buttons are ConfirmSheet's own.
        <Sheet
          visible={confirmDelete}
          onClose={() => setConfirmDelete(false)}
          title="Delete your account?"
          footer={
            <View style={{ gap: 10 }}>
              <Button testID="confirm-yes" title="Delete account and data" variant="danger" onPress={() => void doDelete()} />
              <Button testID="confirm-no" title="Cancel" variant="secondary" onPress={() => setConfirmDelete(false)} />
            </View>
          }>
          <View style={{ gap: spacing.md }}>
            <Card tone="alt" padding={14} testID="account-delete-plan">
              <View
                style={{
                  flexDirection: 'row',
                  gap: spacing.md,
                  alignItems: 'flex-start',
                }}>
                <View style={{ height: 21, justifyContent: 'center' }}>
                  <PlanGlyph size={20} color={colors.text} />
                </View>
                <Text variant="bodyStrong" style={{ flex: 1 }}>
                  {DELETE_PLAN_LINE}
                </Text>
              </View>
            </Card>
            <Text variant="body" color="textSecondary">
              {DELETE_ERASES}
            </Text>
          </View>
        </Sheet>
      ) : (
        <ConfirmSheet
          visible={confirmDelete}
          title="Delete your account?"
          message={DELETE_ERASES}
          confirmLabel="Delete account and data"
          destructive
          onConfirm={() => void doDelete()}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
      <Sheet
        visible={deleteBlocked !== null}
        onClose={() => setDeleteBlocked(null)}
        title="Account not deleted"
        footer={
          <View style={{ gap: 10 }}>
            <Button testID="account-delete-retry" title="Try again" onPress={() => void doDelete()} />
            {deleteBlocked?.offerForce ? <Button testID="account-delete-anyway" title={DELETE_ANYWAY_LABEL} variant="danger" onPress={() => void doDelete(true)} /> : null}
            <Button testID="account-delete-keep" title="Keep the account" variant="ghost" onPress={() => setDeleteBlocked(null)} />
          </View>
        }>
        <Text variant="body" color="textSecondary" testID="account-delete-blocked">
          {deleteBlocked?.message}
        </Text>
      </Sheet>
    </>
  );
}
