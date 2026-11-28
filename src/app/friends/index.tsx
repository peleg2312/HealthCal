import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { RefreshCw, Settings, Users } from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import { Platform, RefreshControl, View } from 'react-native';

import { CheersList, IncomingRequests, InviteCard, Loading, OutgoingRequests } from '@/features/friends/components';
import { markFriendsSeen } from '@/features/friends/attention';
import type { FeedItem } from '@/features/friends/contract';
import { feedByDay, feedKey, friendsWithNew, localFeed, newTodayCount } from '@/features/friends/feed';
import { FeedDayCard, FeedRow, PeopleRow, RecentTitle } from '@/features/friends/FeedParts';
import { readFeedSeen, writeFeedSeen } from '@/features/friends/feedSeen';
import { FriendMealSheet, type OpenMeal } from '@/features/friends/FriendMealSheet';
import { inviteFromParams, invitePath } from '@/features/friends/link';
import { buildSharedMeal, ownMealsByRef } from '@/features/friends/meals';
import { mealsOverview } from '@/features/friends/overview';
import { SetupForm } from '@/features/friends/SetupForm';
import { copyText, shareInvite } from '@/features/friends/share';
import { useShowMealStep } from '@/features/friends/ShowMeal';
import { showShortcutMeal } from '@/features/friends/showNow';
import { formatCode, ownWorkoutsByRef, WORKOUT_WINDOW_DAYS } from '@/features/friends/summary';
import { cheerCaption } from '@/features/friends/week';
import {
  CHEERS_TITLE,
  cheerWhat,
  FEED_EMPTY,
  FEED_EMPTY_TITLE,
  FEED_EMPTY_WORKOUTS,
  feedNewsLine,
  MENU_SHOW_LINE,
  SCREEN_SUBTITLE,
  SCREEN_SUBTITLE_WORKOUTS,
  SCREEN_TITLE,
  SETTINGS_OPEN,
  showShortcutTitle,
  SIGNED_OUT_LINE,
} from '@/features/friends/words';
import { timeAgo } from '@/features/settings/format';
import { addDays } from '@/lib/dates';
import { mealForTime } from '@/lib/nutrition';
import { cheerFriend, cheerMeal, refreshFriends, removeFriend, respondToRequest, undoDecline, useFriends, type FriendRequest } from '@/services/friends';
import { useNow, useToday } from '@/store/clock';
import { useLive, useProfile } from '@/store/selectors';
import { useTheme } from '@/theme';
import type { FoodEntry, ISODate, MealType } from '@/types';
import { Button, Card, EmptyState, goBack, Header, IconButton, ListRow, Screen, SectionTitle, Sheet, Text, toast } from '@/ui';

/** The diary menu's own show step, in a sheet of its own, for the shortcut's meal. */
function ShowNowSheet({ meal, date, entries, onClose }: { meal: MealType | null; date: ISODate; entries: FoodEntry[]; onClose: () => void }) {
  const show = useShowMealStep({ open: !!meal, meal, date, entries, onClose });
  return (
    <Sheet visible={!!meal && !!show.body} onClose={onClose} title={show.title} subtitle={show.subtitle} footer={show.footer}>
      {show.body}
    </Sheet>
  );
}

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
  const foodEntries = useLive('foodEntries');

  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [cheersOpen, setCheersOpen] = useState(false);
  // The shortcut's show step, for the meal it named when tapped (the meal of the hour can turn while it is open).
  const [showFor, setShowFor] = useState<MealType | null>(null);
  const todayEntries = foodEntries.filter((e) => e.date === today);
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
  const shown = localFeed({ feed, today, seeMeals: !!me?.mealsAllowed && !!me?.mealSettings.see, friends });
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
  const newIds = friendsWithNew(shown, seenBefore ?? null);
  const days = feedByDay(shown);
  // The header's news: today's items not seen at the last look (read once as the screen opened).
  const newToday = newTodayCount(shown, seenBefore ?? null, today);

  // "Show today's lunch to friends": the meal of the hour while it has food, is not shown yet and someone can be picked.
  const hourMeal = mealForTime(now);
  const shortcut = showShortcutMeal({
    mealsAllowed: !!me?.mealsAllowed,
    pickable: friends.filter((f) => f.shareMeals).length,
    meal: hourMeal,
    hasFood: buildSharedMeal({ entries: todayEntries, day: today, meal: hourMeal, showKcal: false }).length > 0,
    shownNow: myMeals.some((m) => m.day === today && m.meal === hourMeal),
  });

  // Cheers name a workout or a meal by the reference friends saw; map it back with the same key.
  const shareKey = me?.shareKey ?? '';
  const since = addDays(today, -(2 * WORKOUT_WINDOW_DAYS + 7));
  const ownWorkouts = ownWorkoutsByRef(activities.filter((a) => a.date >= since), shareKey);
  const ownMeals = ownMealsByRef(shareKey, today);
  for (const m of myMeals) ownMeals.set(m.ref, { day: m.day, meal: m.meal });
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

  // Once friends are on, the line under the title is news ("3 friends · 2 new today"); before, what the screen holds.
  const subtitle = status === 'ready' && me ? feedNewsLine(friends.length, newToday) : mealWords ? SCREEN_SUBTITLE : SCREEN_SUBTITLE_WORKOUTS;
  const header = <Header title={SCREEN_TITLE} subtitle={subtitle} right={headerRight} />;
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
  const units = profile.units;
  const openAdd = () => router.push('/friends/add' as never);
  const openMeal_ = (item: Extract<FeedItem, { kind: 'meal' }>, adding: boolean) => setOpenMeal({ meal: { owner: item, meal: item, cheered: item.cheered }, adding });

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

      {/* What needs an answer first, then the people (Invite last), then the feed by day with the cheers beside its title. */}
      {incoming.length ? <IncomingRequests requests={incoming} busy={busy} onAccept={accept} onDecline={decline} /> : null}

      {friends.length ? (
        <PeopleRow people={friends} newIds={newIds} onOpen={(id) => router.push(`/friends/friend?id=${encodeURIComponent(id)}` as never)} onAdd={openAdd} />
      ) : (
        <InviteCard code={me.code} sharing={me.sharing} onShare={() => void shareInvite(me.code)} onCopy={copyCode} onEnter={openAdd} />
      )}

      {/* A shared "Together this week" card belongs here, under the people and above the feed. */}

      {friends.length && shortcut ? (
        <Card padding={0} testID="friends-show-now-card">
          <ListRow
            testID="friends-show-now"
            style={{ paddingHorizontal: spacing.lg }}
            title={showShortcutTitle(shortcut)}
            subtitle={MENU_SHOW_LINE}
            left={<Users size={20} color={colors.text} />}
            onPress={() => setShowFor(shortcut)}
          />
        </Card>
      ) : null}

      {friends.length ? (
        <View style={{ gap: spacing.md }}>
          <RecentTitle cheers={cheers.length} onCheers={() => setCheersOpen(true)} />
          {days.length ? (
            <View testID="friends-feed" style={{ gap: spacing.lg }}>
              {days.map((d) => (
                <FeedDayCard key={d.day} day={d} today={today} testID={`friends-feed-day-${d.day}`}>
                  {(item) => {
                    // Stable test ids by place: the n-th meal and the n-th workout of the whole feed.
                    const nth = shown.slice(0, shown.indexOf(item)).filter((x) => x.kind === item.kind).length;
                    return item.kind === 'meal' ? (
                      <FeedRow
                        item={item}
                        units={units}
                        testID={`friends-feed-meal-${nth}`}
                        onOpen={() => openMeal_(item, false)}
                        onAdd={() => openMeal_(item, true)}
                        onCheer={() => void cheerItem(item)}
                      />
                    ) : (
                      <FeedRow
                        item={item}
                        units={units}
                        testID={`friends-feed-workout-${nth}`}
                        onOpen={() => router.push(`/friends/friend?id=${encodeURIComponent(item.userId)}` as never)}
                        onCheer={() => void cheerItem(item)}
                      />
                    );
                  }}
                </FeedDayCard>
              ))}
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

      <Sheet visible={cheersOpen} onClose={() => setCheersOpen(false)} title={CHEERS_TITLE}>
        <CheersList cheers={cheers} describe={(c) => describe(c.ref)} when={(c) => cheerCaption(c.ref, timeAgo(c.createdAt, now))} />
      </Sheet>
      <ShowNowSheet meal={showFor} date={today} entries={todayEntries} onClose={() => setShowFor(null)} />
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
