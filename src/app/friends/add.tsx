import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { ChevronDown, ChevronUp, Copy, Info, Share as ShareIcon } from 'lucide-react-native';
import React, { useCallback, useState } from 'react';
import { View } from 'react-native';

import { Loading, useNarrow } from '@/features/friends/components';
import { inviteFromParams, invitePath } from '@/features/friends/link';
import { clearPendingInvite, savePendingInvite } from '@/features/friends/pendingInvite';
import { QrCode } from '@/features/friends/QrCode';
import { copyText, inviteLink, pasteText, shareInvite } from '@/features/friends/share';
import { formatCode, isCompleteCode, normalizeCode } from '@/features/friends/summary';
import { outcomeMessage } from '@/features/friends/week';
import {
  ADD_SUBTITLE,
  CODE_LABEL,
  CODE_PLACEHOLDER,
  CODE_PLACEHOLDER_SHORT,
  COPY,
  DECLINED_NOTE,
  HELP,
  INVITE_NOTE,
  NOBODY_SEARCHES,
  OR_THEIR_CODE,
  PASTE,
  QR_LABEL,
  SHARE_INVITE,
  YOUR_INVITE,
} from '@/features/friends/words';
import { refreshFriends, requestFriend, useFriends } from '@/services/friends';
import { fonts, useLargeText, useTheme } from '@/theme';
import { Button, Card, CupKey, DECORATIVE, EmptyState, goBack, Header, Screen, SectionTitle, Text, TextField, toast, useGrownText } from '@/ui';

/**
 * Your invite, first: the QR code of your invite link beside your code, large, then Share invite link and Copy.
 * A friend next to you points their phone's camera at the code (the app's own camera reads barcodes only, so
 * there is no scanner here); one far away gets the link.
 */
function YourInvite({ code }: { code: string }) {
  const { colors, spacing } = useTheme();
  const narrow = useNarrow();
  const large = useLargeText();
  const c = normalizeCode(code);
  const qr = narrow ? 112 : 128;
  const big = narrow ? 30 : 34;
  return (
    <Card testID="friends-add-invite">
      <Text variant="overline" color="textSecondary" accessibilityRole="header" {...({ 'aria-level': 2 } as object)}>
        {YOUR_INVITE}
      </Text>
      <View style={{ flexDirection: large ? 'column' : 'row', alignItems: large ? 'flex-start' : 'center', gap: spacing.lg, marginTop: spacing.md }}>
        <QrCode testID="friends-add-qr" value={inviteLink(c)} size={qr} label={QR_LABEL} />
        {/* The code with its Copy under it, beside the QR code; Share invite link takes the card's width below. */}
        <View style={{ gap: spacing.sm, alignItems: 'flex-start' }}>
          <Text testID="friends-add-code" selectable accessibilityLabel={`Your invite code: ${c.split('').join(' ')}`} style={{ fontFamily: fonts.extrabold, fontSize: big, lineHeight: big + 8, letterSpacing: 1, color: colors.text, fontVariant: ['tabular-nums'] }}>
            {`${c.slice(0, 4)}\n${c.slice(4)}`}
          </Text>
          <Button
            testID="friends-add-copy"
            title={COPY}
            variant="secondary"
            size="sm"
            full={false}
            accessibilityLabel={`${COPY} code ${formatCode(c)}`}
            icon={<Copy color={colors.text} />}
            onPress={() => void copyText(formatCode(c), 'Code copied')}
          />
        </View>
      </View>
      <Button testID="friends-add-share" title={SHARE_INVITE} variant="secondary" size="md" style={{ marginTop: spacing.lg }} icon={<ShareIcon color={colors.text} />} onPress={() => void shareInvite(c)} />
      <Text variant="body" color="textSecondary" style={{ marginTop: spacing.md }}>
        {INVITE_NOTE}
      </Text>
    </Card>
  );
}

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
  const [helpOpen, setHelpOpen] = useState(false);
  const narrow = useNarrow();
  const grown = useGrownText();
  const shortPlaceholder = narrow || grown;
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
  const header = <Header title="Add a friend" subtitle={ADD_SUBTITLE} close onBack={goBackToFriends} />;

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
      {overview?.me ? <YourInvite code={overview.me.code} /> : null}

      {needsSetup && !result ? (
        <Card tone="alt" testID="friends-add-needs-setup">
          <Text variant="bodyStrong">Turn on friends first</Text>
          <Text variant="body" color="textSecondary" style={{ marginTop: spacing.xs }}>
            Choose the name friends see and what you share. {code ? `The code ${formatCode(code)} is kept for you.` : ''}
          </Text>
        </Card>
      ) : null}

      <View style={{ gap: spacing.md }}>
        <SectionTitle title={OR_THEIR_CODE} />
        <TextField
          testID="friends-add-input"
          label={CODE_LABEL}
          value={formatCode(code)}
          onChangeText={(t) => {
            setCode(normalizeCode(t));
            setResult(null);
          }}
          placeholder={shortPlaceholder ? CODE_PLACEHOLDER_SHORT : CODE_PLACEHOLDER}
          autoCapitalize="characters"
          autoCorrect={false}
          autoComplete="off"
          spellCheck={false}
          maxLength={9}
          returnKeyType="send"
          onSubmitEditing={() => void send()}
          error={lookalike ? 'Codes never use I, L, O, 0 or 1. Check the letters.' : null}
          hint={complete ? 'Ready to send' : `${code.length} of 8 characters`}
          right={<Button testID="friends-add-paste" title={PASTE} variant="ghost" size="sm" full={false} accessibilityLabel={`${PASTE} a code`} onPress={() => void paste()} />}
        />
      </View>

      {result ? (
        <Card testID="friends-add-result" accessibilityLiveRegion="polite">
          <View style={{ flexDirection: 'row', gap: spacing.md }}>
            {/* The title says the outcome; the mark only decorates it: the done mark (a small filled ink cup, never a check, which means only a day on budget) or the ink info mark. */}
            <View style={{ width: 22, alignItems: 'center', paddingTop: result.good ? 5 : 0 }} {...DECORATIVE}>
              {result.good ? <CupKey color={colors.text} size={12} /> : <Info size={22} color={colors.warningInk} strokeWidth={1.9} />}
            </View>
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

      {/* The rarer facts, folded under Help. */}
      <View style={{ gap: spacing.sm }}>
        <Button
          testID="friends-add-help"
          title={HELP}
          variant="ghost"
          size="sm"
          full={false}
          expanded={helpOpen}
          style={{ alignSelf: 'flex-start' }}
          icon={helpOpen ? <ChevronUp color={colors.actionInk} /> : <ChevronDown color={colors.actionInk} />}
          onPress={() => setHelpOpen((o) => !o)}
        />
        {helpOpen ? (
          <View style={{ gap: spacing.sm }} testID="friends-add-help-text">
            <Text variant="body" color="textSecondary">
              {NOBODY_SEARCHES}
            </Text>
            <Text variant="body" color="textSecondary" testID="friends-add-declined-note">
              {DECLINED_NOTE}
            </Text>
          </View>
        ) : null}
      </View>
    </Screen>
  );
}
