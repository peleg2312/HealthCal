import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { RefreshCw, UserPlus } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform, RefreshControl, View } from 'react-native';

import { CheersList, FriendCard, IncomingRequests, InviteCard, Loading, OutgoingRequests } from '@/features/friends/components';
import { markFriendsSeen } from '@/features/friends/attention';
import { inviteFromParams, invitePath } from '@/features/friends/link';
import { SetupForm } from '@/features/friends/SetupForm';
import { copyText, shareInvite } from '@/features/friends/share';
import { FriendSheet, SettingsSheet } from '@/features/friends/sheets';
import { formatCode, ownWorkoutsByRef, WORKOUT_WINDOW_DAYS } from '@/features/friends/summary';
import { cheerCaption, cheerTarget } from '@/features/friends/week';
import { timeAgo } from '@/features/settings/format';
import { addDays } from '@/lib/dates';
import { cheerFriend, leaveSocial, refreshFriends, removeFriend, respondToRequest, undoDecline, useFriends, type Friend, type FriendRequest } from '@/services/friends';
import { useNow, useToday } from '@/store/clock';
import { useLive, useProfile } from '@/store/selectors';
import { useTheme } from '@/theme';
import { Button, Card, ConfirmSheet, EmptyState, Header, IconButton, Screen, SectionTitle, Text, toast } from '@/ui';

export default function FriendsScreen() {
  const { colors, spacing } = useTheme();
  // ?invite= from the add screen's "Turn on friends" (an old link may still say ?code=).
  const invite = inviteFromParams(useLocalSearchParams<{ invite?: string; code?: string }>());
  const status = useFriends((s) => s.status);
  const overview = useFriends((s) => s.overview);
  const error = useFriends((s) => s.error);
  const profile = useProfile();
  const today = useToday();
  const now = useNow();
  const activities = useLive('activities');

  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<Friend | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);

  // Fresh numbers every time the screen comes into view.
  useFocusEffect(
    useCallback(() => {
      void refreshFriends();
    }, []),
  );

  const me = overview?.me ?? null;
  // What this screen shows is no longer new: the count on the tab headers' Friends button clears.
  const cheersShown = status === 'ready' && me ? overview?.cheers.length ?? 0 : -1;
  useEffect(() => {
    if (cheersShown >= 0) markFriendsSeen();
  }, [cheersShown]);
  // Cheers name the workout by the reference friends saw; map it back with the same key.
  const shareKey = me?.shareKey ?? '';
  // A cheer can only be for a workout that was shared (the last two weeks) and is shown for two weeks, so older ones need no reference.
  const ownWorkouts = useMemo(() => {
    const since = addDays(today, -(2 * WORKOUT_WINDOW_DAYS + 7));
    return ownWorkoutsByRef(activities.filter((a) => a.date >= since), shareKey);
  }, [activities, shareKey, today]);
  const open = overview?.friends.find((f) => f.userId === openId) ?? null;

  const pull = async () => {
    setRefreshing(true);
    await refreshFriends();
    setRefreshing(false);
  };

  const cheer = async (friend: Friend, ref: string) => {
    const res = await cheerFriend(friend.userId, ref);
    if (!res.ok) toast(res.message);
  };

  const accept = async (r: FriendRequest) => {
    setBusy(r.userId);
    const res = await respondToRequest(r.userId, true);
    setBusy(null);
    toast(res.ok ? `You and ${r.displayName} are now friends` : res.message);
  };
  const decline = async (r: FriendRequest) => {
    setBusy(r.userId);
    const res = await respondToRequest(r.userId, false);
    setBusy(null);
    if (!res.ok) {
      toast(res.message);
      return;
    }
    // Undo is offered for a moment (the server allows it for 15 minutes); after that,
    // entering their code is the way back, which the Add screen says.
    toast(`Declined. ${r.displayName} is not told.`, {
      label: 'Undo',
      onPress: () =>
        void undoDecline(r.userId).then((u) => toast(u.ok ? `The request from ${r.displayName} is back` : u.message)),
    });
  };
  const takeBack = async (r: FriendRequest) => {
    setBusy(r.userId);
    const res = await removeFriend(r.userId);
    setBusy(null);
    toast(res.ok ? `Request to ${r.displayName} taken back` : res.message);
  };
  const remove = async (f: Friend) => {
    setConfirmRemove(null);
    const res = await removeFriend(f.userId);
    toast(res.ok ? `${f.displayName} is no longer a friend. Cheers between you were removed too.` : res.message);
  };
  const leave = async () => {
    setConfirmLeave(false);
    setSettingsOpen(false);
    const res = await leaveSocial();
    toast(res.ok ? 'Friends turned off. Your card, friendships and cheers were removed.' : res.message);
  };

  // One action in the header: adding someone. Friends settings live on the invite card.
  const headerRight = me ? (
    <IconButton testID="friends-add-open" accessibilityLabel="Add a friend" onPress={() => router.push('/friends/add' as never)}>
      <UserPlus size={20} color={colors.text} strokeWidth={1.9} />
    </IconButton>
  ) : null;

  const header = <Header title="Friends" subtitle="Workouts and cheers" right={headerRight} />;
  const scrollProps = Platform.OS === 'web' ? undefined : { refreshControl: <RefreshControl refreshing={refreshing} onRefresh={pull} tintColor={colors.textSecondary} /> };

  // ------------------------------------------------ states without a card
  if (status === 'unavailable') {
    return (
      <Screen header={header} testID="friends-screen">
        <Card testID="friends-unavailable">
          <EmptyState
            title="Friends need an account"
            message="This version of HealthCal has no accounts, so friends are not available. Everything else works on this device."
          />
        </Card>
      </Screen>
    );
  }
  if (status === 'signed-out') {
    return (
      <Screen header={header} testID="friends-screen">
        <Card testID="friends-signed-out">
          <EmptyState
            title="Friends need an account"
            message="Add friends with a code and see each other's training week: active minutes, streak and workouts. Your calories, weight and food always stay private."
            action="Create a free account"
            onAction={() => router.push('/auth?mode=signup')}
          />
          <Button testID="friends-sign-in" title="I have an account" variant="ghost" size="md" onPress={() => router.push('/auth?mode=signin')} />
        </Card>
      </Screen>
    );
  }
  if (!overview) {
    if (status === 'error') {
      return (
        <Screen header={header} testID="friends-screen">
          <Card testID="friends-error">
            <EmptyState title="Friends did not load" message={error ?? 'Something went wrong. Try again.'} action="Try again" onAction={() => void refreshFriends()} />
          </Card>
        </Screen>
      );
    }
    return (
      <Screen header={header} testID="friends-screen">
        <Loading />
      </Screen>
    );
  }

  if (!me) {
    return (
      <SetupForm
        header={header}
        defaultName={profile.name}
        onDone={() => {
          // Arrived from an invite link before turning friends on: go on to add that person.
          if (invite) router.replace(invitePath(invite) as never);
        }}
      />
    );
  }

  // ------------------------------------------------ the full screen
  const { friends, incoming, outgoing, cheers } = overview;
  return (
    <Screen header={header} testID="friends-screen" scrollProps={scrollProps}>

      {status === 'error' ? (
        <Card tone="alt" testID="friends-error-banner">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <Text variant="label" color="text" style={{ flex: 1 }}>
              {error ?? 'Friends did not refresh.'} Showing what was loaded before.
            </Text>
            <Button testID="friends-retry" title="Retry" variant="secondary" size="sm" full={false} icon={<RefreshCw size={16} color={colors.text} strokeWidth={2.2} />} onPress={() => void refreshFriends()} />
          </View>
        </Card>
      ) : null}

      <InviteCard code={me.code} sharing={me.sharing} onSettings={() => setSettingsOpen(true)} onShare={() => void shareInvite(me.code)} onCopy={() => void copyText(formatCode(me.code), 'Code copied')} />

      {incoming.length ? <IncomingRequests requests={incoming} busy={busy} onAccept={accept} onDecline={decline} /> : null}

      {friends.length ? (
        <View style={{ gap: spacing.md }}>
          <SectionTitle title="This week" action={friends.length === 1 ? '1 friend' : `${friends.length} friends`} />
          {friends.map((f) => (
            <FriendCard key={f.userId} friend={f} today={today} units={profile.units} onOpen={() => setOpenId(f.userId)} onCheer={(ref) => void cheer(f, ref)} />
          ))}
        </View>
      ) : (
        <Card testID="friends-empty">
          <EmptyState
            title="No friends yet"
            message="Share your code, or enter a friend's. Once they accept, their week shows here: active minutes, streak and workouts to cheer."
            action="Add a friend"
            onAction={() => router.push('/friends/add' as never)}
          />
        </Card>
      )}

      {outgoing.length ? (
        <View style={{ gap: spacing.md }}>
          <SectionTitle title="Waiting" />
          <OutgoingRequests requests={outgoing} busy={busy} onCancel={takeBack} />
        </View>
      ) : null}

      {cheers.length ? (
        <View style={{ gap: spacing.md }}>
          <SectionTitle title="Cheers for you" />
          <CheersList cheers={cheers} describe={(c) => cheerTarget(c.ref, ownWorkouts, today)} when={(c) => cheerCaption(c.ref, timeAgo(c.createdAt, now))} />
        </View>
      ) : null}

      <FriendSheet
        friend={open}
        today={today}
        units={profile.units}
        onClose={() => setOpenId(null)}
        onCheer={(f, ref) => void cheer(f, ref)}
        onRemove={(f) => {
          setOpenId(null);
          setConfirmRemove(f);
        }}
      />
      {settingsOpen ? (
        <SettingsSheet
          me={me}
          visible
          onClose={() => setSettingsOpen(false)}
          onLeave={() => {
            setSettingsOpen(false);
            setConfirmLeave(true);
          }}
        />
      ) : null}
      <ConfirmSheet
        visible={!!confirmRemove}
        title={`Remove ${confirmRemove?.displayName ?? 'this friend'}?`}
        message="You stop seeing each other's week, and the cheers between you are removed. They are not told, and you can add each other again with a code."
        confirmLabel="Remove friend"
        destructive
        onConfirm={() => confirmRemove && void remove(confirmRemove)}
        onCancel={() => setConfirmRemove(null)}
      />
      <ConfirmSheet
        visible={confirmLeave}
        title="Turn friends off?"
        message="This removes your card and code, every friendship and every cheer, for you and for them. It cannot be undone, though you can turn friends on again later with a new code."
        confirmLabel="Turn friends off"
        destructive
        onConfirm={() => void leave()}
        onCancel={() => setConfirmLeave(false)}
      />
    </Screen>
  );
}
