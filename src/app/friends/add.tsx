import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { CircleCheck, ClipboardPaste, Info } from 'lucide-react-native';
import React, { useCallback, useState } from 'react';
import { View } from 'react-native';

import { Loading } from '@/features/friends/components';
import { inviteFromParams, invitePath } from '@/features/friends/link';
import { clearPendingInvite, savePendingInvite } from '@/features/friends/pendingInvite';
import { pasteText } from '@/features/friends/share';
import { formatCode, isCompleteCode, normalizeCode } from '@/features/friends/summary';
import { outcomeMessage } from '@/features/friends/week';
import { refreshFriends, requestFriend, useFriends } from '@/services/friends';
import { useTheme } from '@/theme';
import { Button, Card, EmptyState, goBack, Header, IconButton, Screen, Text, TextField, toast } from '@/ui';

type Result = { title: string; message: string; good: boolean; outcome: string } | null;

export default function AddFriendScreen() {
  const { colors, spacing } = useTheme();
  // ?invite= (links made before it was renamed carry ?code=, which still works).
  const params = useLocalSearchParams<{ invite?: string; code?: string }>();
  const linked = inviteFromParams(params);
  const [code, setCode] = useState(linked);
  const [lastParam, setLastParam] = useState(linked);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<Result>(null);
  const status = useFriends((s) => s.status);
  const overview = useFriends((s) => s.overview);

  // A second invite link opened while this screen is already showing.
  if (linked !== lastParam) {
    setLastParam(linked);
    if (linked) {
      setCode(linked);
      setResult(null);
    }
  }

  useFocusEffect(
    useCallback(() => {
      if (useFriends.getState().status !== 'ready') void refreshFriends();
    }, []),
  );

  const complete = isCompleteCode(code);
  // Codes are drawn from an alphabet without look-alikes, so one of these is a typo.
  const lookalike = /[ILO01]/.test(code);
  const goBackToFriends = () => (router.canGoBack() ? router.back() : router.replace('/friends' as never));
  const header = <Header title="Add a friend" subtitle="By code or invite link" close onBack={goBackToFriends} />;

  const send = async () => {
    if (!complete) return;
    setSending(true);
    setResult(null);
    const res = await requestFriend(code);
    setSending(false);
    if (!res.ok) {
      setResult({ title: res.reason === 'offline' ? 'No connection' : 'Not sent', message: res.message, good: false, outcome: res.reason });
      return;
    }
    setResult({ ...outcomeMessage(res.value.outcome, res.value.displayName), outcome: res.value.outcome });
    // A code kept through sign-up has done its job.
    void clearPendingInvite();
  };

  const paste = async () => {
    const text = normalizeCode(await pasteText());
    if (text) {
      setCode(text);
      setResult(null);
    } else toast('Nothing to paste. Copy the code first.');
  };

  if (status === 'unavailable' || status === 'signed-out') {
    return (
      <Screen header={header} testID="friends-add-screen">
        <Card testID={status === 'unavailable' ? 'friends-unavailable' : 'friends-signed-out'}>
          <EmptyState
            title="Friends need an account"
            message={
              status === 'unavailable'
                ? 'This version has no accounts. Everything else works on this device.'
                : isCompleteCode(code)
                  ? `Once you are signed in, this opens again with ${formatCode(code)} filled in.`
                  : 'Sign in or create a free account, then add your friend here.'
            }
            action={status === 'signed-out' ? 'Create a free account' : 'Back to Today'}
            actionTestID={status === 'signed-out' ? 'friends-create-account' : 'friends-back-today'}
            onAction={() => {
              if (status !== 'signed-out') return goBack('/');
              // Keep the code through sign-up and setup; afterwards this screen opens again with it filled in.
              if (isCompleteCode(code)) void savePendingInvite(code);
              router.push('/auth?mode=signup');
            }}
          />
        </Card>
      </Screen>
    );
  }

  const needsSetup = (status === 'ready' && !!overview && !overview.me) || result?.outcome === 'setup_needed';
  if (!overview && (status === 'idle' || status === 'loading')) {
    return (
      <Screen header={header} testID="friends-add-screen">
        <Loading label="Checking your account" />
      </Screen>
    );
  }

  return (
    <Screen
      header={header}
      testID="friends-add-screen"
      footer={
        needsSetup ? (
          <Button testID="friends-add-setup" title="Turn on friends" onPress={() => router.replace(invitePath(code, '/friends') as never)} />
        ) : result?.good ? (
          <Button testID="friends-add-done" title="See your friends" onPress={() => router.replace('/friends' as never)} />
        ) : (
          <Button testID="friends-add-send" title="Send request" disabled={!complete} loading={sending} onPress={() => void send()} />
        )
      }>
      <Text variant="body" color="textSecondary">
        Enter the 8-character code from their Friends screen.
      </Text>

      {needsSetup && !result ? (
        <Card tone="alt" testID="friends-add-needs-setup">
          <Text variant="bodyStrong">Turn on friends first</Text>
          <Text variant="body" color="textSecondary" style={{ marginTop: spacing.xs }}>
            Choose the name friends see and what you share. {code ? `The code ${formatCode(code)} is kept for you.` : ''}
          </Text>
        </Card>
      ) : null}

      <TextField
        testID="friends-add-input"
        label="Friend's code"
        value={formatCode(code)}
        onChangeText={(t) => {
          setCode(normalizeCode(t));
          setResult(null);
        }}
        placeholder="ABCD 2345"
        autoCapitalize="characters"
        autoCorrect={false}
        autoComplete="off"
        spellCheck={false}
        maxLength={9}
        returnKeyType="send"
        onSubmitEditing={() => void send()}
        error={lookalike ? 'Codes never use I, L, O, 0 or 1. Check the letters.' : null}
        hint={complete ? 'Ready to send' : `${code.length} of 8 characters`}
        right={
          <IconButton testID="friends-add-paste" tone="clear" size={36} accessibilityLabel="Paste a code" onPress={() => void paste()}>
            <ClipboardPaste size={20} color={colors.textSecondary} strokeWidth={1.9} />
          </IconButton>
        }
      />

      {result ? (
        <Card testID="friends-add-result" accessibilityLiveRegion="polite">
          <View style={{ flexDirection: 'row', gap: spacing.md }}>
            {result.good ? <CircleCheck size={22} color={colors.success} strokeWidth={2} /> : <Info size={22} color={colors.warningInk} strokeWidth={2} />}
            <View style={{ flex: 1, gap: 4 }}>
              <Text variant="h3" testID={`friends-add-outcome-${result.outcome.replace(/_/g, '-')}`}>
                {result.title}
              </Text>
              <Text variant="body" color="textSecondary">
                {result.message}
              </Text>
            </View>
          </View>
        </Card>
      ) : null}

      {/* The rarer facts sit under the field, one line each. */}
      <View style={{ gap: spacing.sm }}>
        <Text variant="caption" color="textSecondary">
          Nobody can find you by searching.
        </Text>
        <Text variant="caption" color="textSecondary" testID="friends-add-declined-note">
          Declined someone? Their code adds them back. They were never told.
        </Text>
      </View>
    </Screen>
  );
}
