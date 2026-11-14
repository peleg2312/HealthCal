import { Redirect, router, useFocusEffect } from 'expo-router';
import { CloudOff, Download, RefreshCw, ShieldAlert } from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { cancelAccountSwitch, confirmAccountSwitch, retryRestore, signOut, useAuth } from '@/services/auth';
import { useStore } from '@/store';
import { useTheme } from '@/theme';
import { Button, Screen, Sheet, Text, toast } from '@/ui';

import { waitForRestore } from './afterSignIn';
import { FadeIn, Note } from './components';
import { signInOutcome } from './outcome';

/**
 * Shown right after a sign-in (or a password reset) until it is clear where the
 * person belongs. Waits for the first sync, asks before another account's
 * unsynced changes would be discarded, and never sends someone into onboarding
 * when their account's plan simply could not be loaded yet.
 */
export function SignInGate({ onCancelled, waitFirst = true }: { onCancelled: () => void; waitFirst?: boolean }) {
  const [settled, setSettled] = useState(!waitFirst);
  const session = useAuth((s) => !!s.session);
  const restoring = useAuth((s) => s.restoring);
  const restoreFailed = useAuth((s) => s.restoreFailed);
  const switchBlocked = useAuth((s) => s.switchBlocked);
  const onboarded = useStore((s) => !!s.profile?.onboardedAt);

  useEffect(() => {
    if (!waitFirst) return;
    let alive = true;
    void waitForRestore().then(() => alive && setSettled(true));
    return () => {
      alive = false;
    };
  }, [waitFirst]);

  const outcome = signInOutcome({ signedIn: session, restoring: restoring || !settled, restoreFailed, switchBlocked, onboarded });

  useEffect(() => {
    if (outcome === 'cancelled') onCancelled();
  }, [outcome, onCancelled]);

  if (outcome === 'home') return <Redirect href="/" />;
  if (outcome === 'onboarding') return <Redirect href="/onboarding" />;
  if (outcome === 'restoreFailed') return <RestoreFailed />;
  if (outcome === 'switchBlocked') return <SwitchBlocked count={switchBlocked ?? 0} />;
  return <Restoring />;
}

function Restoring() {
  const { colors, spacing } = useTheme();
  return (
    <Screen testID="auth-restoring" contentStyle={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center', gap: spacing.lg }}>
      <ActivityIndicator color={colors.primary} />
      <Text variant="body" color="textSecondary" align="center">
        Signed in. Bringing your plan and logs to this device...
      </Text>
    </Screen>
  );
}

/** The first sync did not complete and no plan is on this device. */
export function RestoreFailed() {
  const { colors, spacing } = useTheme();
  const [busy, setBusy] = useState(false);
  const retry = async () => {
    setBusy(true);
    await retryRestore();
    setBusy(false);
    if (useAuth.getState().restoreFailed) toast('Still could not reach your account. Check your connection.');
  };
  const other = async () => {
    setBusy(true);
    const r = await signOut();
    setBusy(false);
    if (!r.ok) return toast(r.message);
    router.replace('/welcome');
  };
  return (
    <Screen
      testID="auth-restore-failed"
      contentStyle={{ flexGrow: 1, justifyContent: 'center', gap: spacing.xxl }}
      footer={
        <View style={{ gap: spacing.sm }}>
          <Button title="Try again" testID="auth-restore-retry" loading={busy} icon={<RefreshCw size={18} color={colors.onPrimary} />} onPress={retry} />
          <Button title="Use a different account" variant="ghost" size="md" testID="auth-restore-signout" disabled={busy} onPress={other} />
        </View>
      }>
      <View style={{ alignItems: 'center' }}>
        <View style={{ width: 80, height: 80, alignItems: 'center', justifyContent: 'center' }}>
          <CloudOff size={40} color={colors.warningInk} strokeWidth={1.6} />
        </View>
      </View>
      <FadeIn style={{ gap: spacing.sm }}>
        <Text variant="h1" align="center" accessibilityRole="header">
          Signed in, but your data could not be loaded yet
        </Text>
        <Text variant="body" color="textSecondary" align="center">
          Your account may already have a plan and logs. Set-up waits until they have loaded, so nothing of yours is replaced. Check your connection and try
          again.
        </Text>
      </FadeIn>
    </Screen>
  );
}

/** Signing in would erase another account's changes that were never backed up: ask first. */
function SwitchBlocked({ count }: { count: number }) {
  const { colors, spacing } = useTheme();
  const [busy, setBusy] = useState<null | 'keep' | 'discard'>(null);
  // Hidden while the person is exporting on the data screen, shown again on return.
  const [away, setAway] = useState(false);
  useFocusEffect(useCallback(() => setAway(false), []));
  const changes = `${count} ${count === 1 ? 'change' : 'changes'}`;

  return (
    <Screen testID="auth-switch-blocked" contentStyle={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center', gap: spacing.lg }}>
      <ShieldAlert size={36} color={colors.warningInk} />
      <Text variant="body" color="textSecondary" align="center">
        Sign-in paused. Nothing on this device has been changed.
      </Text>
      <Sheet visible={!away} onClose={() => undefined} title="Changes from another account">
        <Text variant="body" color="textSecondary" testID="switch-blocked-message">
          {`This device holds ${changes} from a different account that ${count === 1 ? 'was' : 'were'} never backed up. Continuing with this account removes ${count === 1 ? 'it' : 'them'} from this device for good.`}
        </Text>
        <Note icon={<Download size={18} color={colors.textSecondary} />}>
          <Text variant="caption" color="textSecondary">
            To keep a copy, export a backup first from Profile, Your data.
          </Text>
          <Button
            title="Export them first"
            variant="ghost"
            size="sm"
            full={false}
            testID="switch-blocked-export"
            style={{ alignSelf: 'flex-start', marginLeft: -12 }}
            onPress={() => {
              setAway(true);
              router.push('/settings/data');
            }}
          />
        </Note>
        <View style={{ gap: spacing.sm, paddingTop: spacing.sm }}>
          <Button
            title="Keep them and cancel sign-in"
            testID="switch-blocked-keep"
            loading={busy === 'keep'}
            disabled={busy !== null}
            onPress={async () => {
              setBusy('keep');
              await cancelAccountSwitch();
              setBusy(null);
            }}
          />
          <Button
            title="Discard and continue"
            variant="danger"
            testID="switch-blocked-discard"
            loading={busy === 'discard'}
            disabled={busy !== null}
            onPress={async () => {
              setBusy('discard');
              await confirmAccountSwitch();
              setBusy(null);
            }}
          />
        </View>
      </Sheet>
    </Screen>
  );
}
