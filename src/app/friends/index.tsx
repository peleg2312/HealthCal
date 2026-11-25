import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { RefreshCw, Settings } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform, RefreshControl, View } from 'react-native';

import { CheersList, IncomingRequests, InviteCard, Loading, OutgoingRequests } from '@/features/friends/components';
import { markFriendsSeen } from '@/features/friends/attention';
import type { FeedItem } from '@/features/friends/contract';
import { feedKey, friendsWithNew, localFeed } from '@/features/friends/feed';
import { AboutYouCard, CheersLine, FeedWorkoutCard, itemRole, listRole, PeopleRow } from '@/features/friends/FeedParts';
import { readFeedSeen, writeFeedSeen } from '@/features/friends/feedSeen';
import { FriendMealSheet, type OpenMeal } from '@/features/friends/FriendMealSheet';
import { inviteFromParams, invitePath } from '@/features/friends/link';
import { FeedMealCard } from '@/features/friends/MealCard';
import { ownMealsByRef } from '@/features/friends/meals';
import { mealsOverview } from '@/features/friends/overview';
import { SetupForm } from '@/features/friends/SetupForm';
import { copyText, shareInvite } from '@/features/friends/share';
import { formatCode, ownWorkoutsByRef, WORKOUT_WINDOW_DAYS } from '@/features/friends/summary';
import { cheerCaption } from '@/features/friends/week';
import {
  aboutYouLine,
  CHEERS_TITLE,
  cheersSummary,
  cheerWhat,
  FEED_EMPTY,
  FEED_EMPTY_TITLE,
  FEED_EMPTY_WORKOUTS,
  RECENT,
  RECENT_SPAN,
  SCREEN_SUBTITLE,
  SCREEN_SUBTITLE_WORKOUTS,
  SCREEN_TITLE,
  SETTINGS_OPEN,
  SIGNED_OUT_LINE,
} from '@/features/friends/words';
import { timeAgo } from '@/features/settings/format';
import { addDays } from '@/lib/dates';
import { cheerFriend, cheerMeal, refreshFriends, removeFriend, respondToRequest, undoDecline, useFriends, type FriendRequest } from '@/services/friends';
import { useNow, useToday } from '@/store/clock';
import { useLive, useProfile } from '@/store/selectors';
import { useTheme } from '@/theme';
import { Button, Card, EmptyState, goBack, Header, IconButton, Screen, SectionTitle, Sheet, Text, toast } from '@/ui';

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
  const [cheersOpen, setCheersOpen] = useState(false);
  const [openMeal, setOpenMeal] = useState<{ meal: OpenMeal; adding: boolean } | null>(null);
  // What the feed held at the last look, read once as the screen opens (before this look is written).
  const [seenBefore, setSeenBefore] = useState<Set<string> | null | undefined>(undefined);
  useEffect(() => {
    void readFeedSeen().then(setSeenBefore);
  }, []);

  // Fresh numbers every time the screen comes into view.
  useFocusEffect(
    useCallback(() => {
      void refreshFriends();
    }, []),
  );

  // mealWords: meals are named only where they work for this person (never on a server without them, nor under 18).
  const { me, friends, feed, myMeals, mealWords } = mealsOverview(overview);
  const shown = useMemo(() => localFeed({ feed, today, seeMeals: !!me?.mealsAllowed && !!me?.mealSettings.see, friends }), [feed, today, me, friends]);
  // What this screen shows is no longer new: the count on the tab headers' Friends button clears, and the feed's keys are kept for the next look.
  const ready = status === 'ready' && !!me;
  const cheersShown = ready ? (overview?.cheers.length ?? 0) : -1;
  useEffect(() => {
    if (cheersShown >= 0) markFriendsSeen();
  }, [cheersShown]);
  const feedKeys = shown.map(feedKey).join('|');
  useEffect(() => {
    if (ready && seenBefore !== undefined) writeFeedSeen(feedKeys ? feedKeys.split('|') : []);
  }, [ready, seenBefore, feedKeys]);
  const newIds = useMemo(() => friendsWithNew(shown, seenBefore ?? null), [shown, seenBefore]);

  // Cheers name a workout or a meal by the reference friends saw; map it back with the same key.
  const shareKey = me?.shareKey ?? '';
  const ownWorkouts = useMemo(() => {
    const since = addDays(today, -(2 * WORKOUT_WINDOW_DAYS + 7));
    return ownWorkoutsByRef(activities.filter((a) => a.date >= since), shareKey);
  }, [activities, shareKey, today]);
  const ownMeals = useMemo(() => {
    const byRef = ownMealsByRef(shareKey, today);
    for (const m of myMeals) byRef.set(m.ref, { day: m.day, meal: m.meal });
    return byRef;
  }, [shareKey, today, myMeals]);
  const describe = (ref: string) => cheerWhat(ref, { workouts: ownWorkouts, meals: ownMeals }, today);

  const pull = async () => {
    setRefreshing(true);
    await refreshFriends();
    setRefreshing(false);
  };

  const cheerItem = async (item: FeedItem) => {
    const res = item.kind === 'meal' ? await cheerMeal(item.userId, item.ref) : await cheerFriend(item.userId, item.ref);
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
      onPress: () => void undoDecline(r.userId).then((u) => toast(u.ok ? `The request from ${r.displayName} is back` : u.message)),
    });
  };
  const takeBack = async (r: FriendRequest) => {
    setBusy(r.userId);
    const res = await removeFriend(r.userId);
    setBusy(null);
    toast(res.ok ? `Request to ${r.displayName} taken back` : res.message);
  };

  // One action in the header: Friends settings and privacy. Adding someone is the last cup of the people row.
  const headerRight = me ? (
    <IconButton testID="friends-settings-open" accessibilityLabel={SETTINGS_OPEN} onPress={() => router.push('/friends/settings' as never)}>
      <Settings size={20} color={colors.text} strokeWidth={1.9} />
    </IconButton>
  ) : null;

  const header = <Header title={SCREEN_TITLE} subtitle={mealWords ? SCREEN_SUBTITLE : SCREEN_SUBTITLE_WORKOUTS} right={headerRight} />;
  const scrollProps = Platform.OS === 'web' ? undefined : { refreshControl: <RefreshControl refreshing={refreshing} onRefresh={pull} tintColor={colors.textSecondary} /> };

  // ------------------------------------------------ states without a card
  if (status === 'unavailable') {
    return (
      <Screen header={header} testID="friends-screen">
        <Card testID="friends-unavailable">
          {/* Two lines and the one thing left to do here: go back to the day. */}
          <EmptyState title="Friends need an account" message="This version has no accounts. Everything else works on this device." action="Back to Today" actionTestID="friends-back-today" onAction={() => goBack('/')} />
        </Card>
      </Screen>
    );
  }
  if (status === 'signed-out') {
    return (
      <Screen header={header} testID="friends-screen">
        <Card testID="friends-signed-out">
          {/* Two lines and one action: the account screen also signs in ("Already have an account?"). */}
          <EmptyState title="Friends need an account" message={SIGNED_OUT_LINE} action="Create a free account" actionTestID="friends-create-account" onAction={() => router.push('/auth?mode=signup')} />
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
        meals={mealWords}
        onDone={() => {
          // Arrived from an invite link before turning friends on: go on to add that person.
          if (invite) router.replace(invitePath(invite) as never);
        }}
      />
    );
  }

  // ------------------------------------------------ the full screen
  const { incoming, outgoing, cheers } = overview;
  const copyCode = () => void copyText(formatCode(me.code), 'Code copied');
  const viewerNames = [...new Set(myMeals.flatMap((m) => m.viewers.map((v) => v.displayName)))];
  const units = profile.units;

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

      {/* What needs an answer first, then the people, the cheers in one line, and the feed. */}
      {incoming.length ? <IncomingRequests requests={incoming} busy={busy} onAccept={accept} onDecline={decline} /> : null}

      {friends.length ? (
        <PeopleRow people={friends} newIds={newIds} onOpen={(id) => router.push(`/friends/friend?id=${encodeURIComponent(id)}` as never)} onAdd={() => router.push('/friends/add' as never)} />
      ) : (
        <>
          <InviteCard code={me.code} sharing={me.sharing} onShare={() => void shareInvite(me.code)} onCopy={copyCode} />
          <Card testID="friends-empty">
            <EmptyState title="No friends yet" message="Share your code or enter a friend's. What they show you appears here once they accept." action="Add a friend" onAction={() => router.push('/friends/add' as never)} />
          </Card>
        </>
      )}

      {cheers.length ? <CheersLine count={cheers.length} summary={cheersSummary(cheers, (c) => describe(c.ref))} onPress={() => setCheersOpen(true)} /> : null}

      {friends.length ? (
        <View style={{ gap: spacing.md }}>
          <SectionTitle title={RECENT} action={RECENT_SPAN} />
          {shown.length ? (
            <View {...listRole} testID="friends-feed" style={{ gap: spacing.lg }}>
              {shown.map((item, i) => {
                const key = feedKey(item);
                // Stable test ids by place: the n-th meal and the n-th workout of the feed.
                const nth = shown.slice(0, i).filter((x) => x.kind === item.kind).length;
                return (
                  <View key={key} {...itemRole}>
                    {item.kind === 'meal' ? (
                      <FeedMealCard
                        testID={`friends-feed-meal-${nth}`}
                        name={item.displayName}
                        avatar={item.avatar}
                        meal={item.meal}
                        day={item.day}
                        today={today}
                        items={item.items}
                        showKcal={item.showKcal}
                        cheered={item.cheered}
                        onOpen={() => setOpenMeal({ meal: { owner: item, meal: item, cheered: item.cheered }, adding: false })}
                        onAdd={() => setOpenMeal({ meal: { owner: item, meal: item, cheered: item.cheered }, adding: true })}
                        onCheer={() => void cheerItem(item)}
                      />
                    ) : (
                      <FeedWorkoutCard testID={`friends-feed-workout-${nth}`} item={item} today={today} units={units} onCheer={() => void cheerItem(item)} />
                    )}
                  </View>
                );
              })}
            </View>
          ) : (
            <Card testID="friends-feed-empty">
              <EmptyState title={FEED_EMPTY_TITLE} message={mealWords ? FEED_EMPTY : FEED_EMPTY_WORKOUTS} action={me.mealsAllowed ? 'Show a meal from the diary' : undefined} onAction={me.mealsAllowed ? () => router.push('/diary' as never) : undefined} />
            </Card>
          )}
        </View>
      ) : null}

      {outgoing.length ? (
        <View style={{ gap: spacing.md }}>
          <SectionTitle title="Waiting" />
          <OutgoingRequests requests={outgoing} busy={busy} onCancel={takeBack} />
        </View>
      ) : null}

      {friends.length ? <AboutYouCard line={aboutYouLine(me.sharing, myMeals.length, viewerNames, me.mealsAllowed)} code={me.code} onPrivacy={() => router.push('/friends/settings' as never)} onCopy={copyCode} /> : null}

      <Sheet visible={cheersOpen} onClose={() => setCheersOpen(false)} title={CHEERS_TITLE}>
        <CheersList cheers={cheers} describe={(c) => describe(c.ref)} when={(c) => cheerCaption(c.ref, timeAgo(c.createdAt, now))} />
      </Sheet>
      <FriendMealSheet
        open={openMeal?.meal ?? null}
        startAdding={!!openMeal?.adding}
        onClose={() => setOpenMeal(null)}
        onCheer={(o) => {
          const item = shown.find((i) => i.kind === 'meal' && i.userId === o.owner.userId && i.ref === o.meal.ref);
          if (item) void cheerItem(item);
          setOpenMeal((cur) => (cur ? { ...cur, meal: { ...cur.meal, cheered: true } } : cur));
        }}
      />
    </Screen>
  );
}
